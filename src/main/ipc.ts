// IPC handlers — exposes every launcher capability to the renderer via
// a secure, typed `window.nexus` API (see preload.ts).

import { ipcMain, BrowserWindow } from "electron";
import {
  listGames,
  getGame,
  createGame,
  updateGame,
  deleteGame,
  recordLaunch,
  importDetected,
  getStats,
  getAllSettings,
  setAllSettings,
  exportLibrary,
  importLibrary,
  checkMissingGames,
  getDetailedStats,
  recordSession,
  listCollections,
  createCollection,
  updateCollection,
  addGameToCollection,
  removeGameFromCollection,
  deleteCollection,
  reorderCollections,
  getGamesInCollection,
  getCollectionsForGame,
  // v4.4.0 — themes
  listThemes,
  getTheme,
  createTheme,
  updateTheme,
  deleteTheme,
  duplicateTheme,
} from "./db";
import { runScan } from "./detectors";
import { launchGame } from "./launchers";
import { searchRawg } from "./metadata/rawg";
import { fetchAggregated } from "./metadata/aggregator";
import {
  getAchievements, unlockAchievement, checkAchievements,
  // v4.5.0 — install verification (Play/Get action logic)
  verifyInstalled, verifyAllInstalled,
} from "./db";
import { fetchSteamTrailer } from "./metadata/steam-trailers";
import { resolveStoreLinks } from "./downloads/stores";
import {
  listPlugins, installPlugin, installPluginFromCode, enablePlugin, disablePlugin, removePlugin,
  readPluginEntry, markPluginError, getPluginData, setPluginData,
} from "./plugins/manager";
import type {
  DetectedGame,
  Game,
  MetadataResult,
  PlatformId,
  ScanSummary,
  AcquisitionOption,
} from "@shared/types";

export function registerIpc(): void {
  // ===== Games =====
  ipcMain.handle("games:list", (_e, opts) => listGames(opts ?? {}));
  ipcMain.handle("games:get", (_e, id: number) => getGame(id));

  ipcMain.handle("games:add", async (_e, input) => {
    // Optionally auto-patch metadata on creation.
    let meta: MetadataResult | null = null;
    if (input.autoPatch !== false && input.title) {
      meta = await fetchAggregated(input.title, input.steamAppId ?? null, null);
    }
    return createGame({
      title: input.title,
      platform: input.platform ?? "manual",
      executable: input.executable ?? null,
      installDir: input.installDir ?? null,
      launchCommand: input.launchCommand ?? null,
      coverImage: meta?.coverImage ?? null,
      bannerImage: meta?.bannerImage ?? null,
      trailerUrl: meta?.trailerUrl ?? null,
      screenshots: meta?.screenshots ?? [],
      description: meta?.description ?? null,
      developer: meta?.developer ?? null,
      publisher: meta?.publisher ?? null,
      releaseDate: meta?.releaseDate ?? null,
      rating: meta?.rating ?? null,
      ratingCount: meta?.ratingCount ?? null,
      genres: meta?.genres ?? [],
      rawgId: meta?.rawgId ?? null,
      sizeBytes: input.sizeBytes ?? null,
      source: "manual",
    });
  });

  ipcMain.handle("games:update", (_e, id: number, patch) => updateGame(id, patch));
  ipcMain.handle("games:delete", (_e, id: number) => {
    deleteGame(id);
    return true;
  });

  ipcMain.handle("games:launch", async (_e, id: number) => {
    const game = getGame(id);
    if (!game) return { ok: false, message: "Game not found", startedAt: new Date().toISOString() };
    const result = await launchGame(game);
    if (result.ok) {
      // Start real playtime tracking — the tracker monitors the game process
      // and records actual elapsed time when it exits.
      const { startTracking } = await import("./playtime/tracker");
      startTracking(id, game.title, result.pid, game.executable);
    }
    return result;
  });

  // ===== Playtime tracking =====
  ipcMain.handle("playtime:stop", async (_e, gameId: number) => {
    const { stopTracking } = await import("./playtime/tracker");
    return stopTracking(gameId);
  });

  ipcMain.handle("playtime:getActive", async () => {
    const { getActiveSessions } = await import("./playtime/tracker");
    const sessions = getActiveSessions();
    return sessions.map((s) => ({
      gameId: s.gameId,
      gameTitle: s.gameTitle,
      startedAt: s.startedAt,
      elapsedSec: Math.floor((Date.now() - s.startedAt) / 1000),
    }));
  });

  ipcMain.handle("playtime:getSessions", async (_e, gameId: number) => {
    const { getGameSessions } = await import("./playtime/tracker");
    return getGameSessions(gameId);
  });

  ipcMain.handle("playtime:getSummaries", async () => {
    const { getAllPlaytimeSummaries } = await import("./playtime/tracker");
    return getAllPlaytimeSummaries();
  });

  ipcMain.handle(
    "games:patchMetadata",
    async (_e, id: number, query?: string) => {
      const game = getGame(id);
      if (!game) return null;
      const title = query?.trim() || game.title;
      // v4.6.7 — Fetch Steam trailer FIRST (no API key needed). Now also
      // searches by TITLE when steamAppId is unknown — covers ALL games.
      let trailerUrl = game.trailerUrl;
      if (!trailerUrl) {
        const steamKey = game.steamAppId || game.title;
        const steamTrailer = await fetchSteamTrailer(steamKey);
        if (steamTrailer?.url) trailerUrl = steamTrailer.url;
      }
      const meta = await fetchAggregated(title, game.steamAppId, game.rawgId);
      // Steam trailer takes priority; RAWG clip is the fallback.
      if (!trailerUrl && meta?.trailerUrl) trailerUrl = meta.trailerUrl;
      if (!meta) return trailerUrl ? updateGame(id, { trailerUrl }) : null;
      return updateGame(id, {
        coverImage: meta.coverImage ?? game.coverImage,
        bannerImage: meta.bannerImage ?? game.bannerImage,
        trailerUrl: trailerUrl ?? game.trailerUrl,
        screenshots: meta.screenshots && meta.screenshots.length ? meta.screenshots : game.screenshots,
        description: meta.description ?? game.description,
        developer: meta.developer ?? game.developer,
        publisher: meta.publisher ?? game.publisher,
        releaseDate: meta.releaseDate ?? game.releaseDate,
        rating: meta.rating ?? game.rating,
        ratingCount: meta.ratingCount ?? game.ratingCount,
        genres: meta.genres.length ? meta.genres : game.genres,
        rawgId: meta.rawgId ?? game.rawgId,
      });
    },
  );

  // ===== Scan =====
  ipcMain.handle(
    "scan:run",
    async (
      _e,
      platforms: PlatformId[] | undefined,
      onProgressChannel?: string,
    ): Promise<ScanSummary> => {
      const summary = await runScan(platforms, (platform, label) => {
        if (onProgressChannel) {
          // Broadcast progress to every renderer window.
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(onProgressChannel, { platform, label });
          }
        }
      });
      return summary;
    },
  );

  ipcMain.handle("scan:import", async (_e, items: DetectedGame[]) => {
    const imported = importDetected(items);
    // AUTOMATIC PATCHING: kick off background metadata enrichment for the
    // freshly imported games so they get artwork without a manual step.
    if (imported.length > 0) {
      void patchGamesInBackground(imported);
    }
    return imported;
  });

  // ===== Filesystem deep scan (custom-location games) =====
  ipcMain.handle("scan:filesystem", async (_e, customPaths: string[]) => {
    try {
      const { scanFilesystem } = await import("./detectors/filesystem");
      const result = await scanFilesystem(customPaths, (path) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send("scan:progress", { platform: "filesystem", label: `Scanning ${path}…` });
        }
      });
      // Filter out games already detected by platform detectors (dedupe by title).
      const existing = listGames({ showHidden: true });
      const existingTitles = new Set(existing.map((g) => g.title.toLowerCase()));
      const existingPaths = new Set(existing.map((g) => g.installDir?.toLowerCase()).filter(Boolean));
      const newGames = result.detected.filter(
        (g) => !existingTitles.has(g.title.toLowerCase()) && !existingPaths.has((g.installDir ?? "").toLowerCase()),
      );
      return {
        detected: newGames,
        totalFound: result.detected.length,
        skipped: result.detected.length - newGames.length,
        errors: result.errors,
      };
    } catch (e) {
      return { detected: [], totalFound: 0, skipped: 0, errors: [{ path: "", message: e instanceof Error ? e.message : String(e) }] };
    }
  });

  // ===== Metadata =====
  ipcMain.handle("metadata:search", (_e, q: string) => searchRawg(q, 8));

  // Patch metadata for every game that's missing a banner image (best-effort,
  // sequential to avoid hammering RAWG rate limits). Uses the multi-source
  // aggregator (RAWG -> Steam -> PCGamingWiki).
  ipcMain.handle("games:patchAll", async () => {
    const all = listGames({ showHidden: true });
    // v4.6.0 — also patch games missing a trailer URL (so trailers auto-detect).
    const needPatch = all.filter((g) => !g.bannerImage || !g.trailerUrl);
    console.log(`[trailers] patchAll: ${all.length} total games, ${needPatch.length} need patching (no banner or no trailer)`);
    const steamGames = needPatch.filter((g) => g.steamAppId);
    console.log(`[trailers] ${steamGames.length} of those have a Steam app ID (can fetch Steam trailers without a RAWG key)`);
    const result = await patchGamesInBackground(needPatch.slice(0, 60));
    console.log(`[trailers] patchAll complete: ${result.patched} patched of ${result.attempted} attempted`);
    return { patched: result.patched, attempted: needPatch.length };
  });

  // ===== Stats & settings =====
  ipcMain.handle("stats:get", () => getStats());
  ipcMain.handle("settings:get", () => getAllSettings());
  ipcMain.handle("settings:set", (_e, s) => setAllSettings(s));

  // ===== Auto-update =====
  ipcMain.handle("updater:check", async () => {
    try {
      const { checkForUpdatesAndNotify } = await import("./updater");
      return await checkForUpdatesAndNotify();
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("updater:downloadAndInstall", async (_e, downloadUrl: string, expectedSize?: number) => {
    try {
      const { downloadAndInstallUpdate, launchInstallerAndQuit } = await import("./updater");
      const result = await downloadAndInstallUpdate(downloadUrl, expectedSize);
      if (result.ok && result.installerPath) {
        // Launch the installer and quit so it can replace the app files.
        launchInstallerAndQuit(result.installerPath);
        return { ok: true, message: result.message, installerPath: result.installerPath };
      }
      return result;
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

  // ===== Utilities =====
  ipcMain.handle("platform:info", () => null);

  // Open a URL in the user's default browser (used by the updater fallback
  // when the release assets aren't directly fetchable, e.g. private repo).
  ipcMain.handle("shell:openExternal", async (_e, url: string) => {
    try {
      const { shell } = await import("electron");
      await shell.openExternal(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

  // ===== v2.0 Features =====

  // Open a file/folder path in the OS file explorer
  ipcMain.handle("shell:openPath", async (_e, path: string) => {
    try {
      const { shell } = await import("electron");
      const result = await shell.openPath(path);
      return { ok: !result, message: result || "Opened" };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

  // Native file picker — returns the real filesystem path (unlike <input type="file">
  // which loses the path in Electron 32+). Used by Add Game + GamePage edit mode.
  ipcMain.handle("dialog:pickFile", async (_e, opts?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    try {
      const { dialog } = await import("electron");
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const result = await dialog.showOpenDialog(win!, {
        title: opts?.title ?? "Select a file",
        properties: ["openFile"],
        filters: opts?.filters ?? [
          { name: "Executables & Shortcuts", extensions: ["exe", "lnk", "bat", "cmd", "url"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, path: null };
      }
      return { ok: true, path: result.filePaths[0] };
    } catch (e) {
      return { ok: false, path: null, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // Native folder picker — for install directory selection
  ipcMain.handle("dialog:pickFolder", async (_e, opts?: { title?: string }) => {
    try {
      const { dialog } = await import("electron");
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const result = await dialog.showOpenDialog(win!, {
        title: opts?.title ?? "Select a folder",
        properties: ["openDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, path: null };
      }
      return { ok: true, path: result.filePaths[0] };
    } catch (e) {
      return { ok: false, path: null, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // Export/import library
  ipcMain.handle("games:export", () => exportLibrary());
  ipcMain.handle("games:import", (_e, json: string) => importLibrary(json));

  // Check missing games (install dir gone)
  ipcMain.handle("games:checkMissing", () => checkMissingGames());

  // Detailed stats for the dashboard
  ipcMain.handle("games:detailedStats", () => getDetailedStats());

  // Play session recording
  ipcMain.handle("games:recordSession", (_e, gameId: number, minutes: number) => {
    recordSession(gameId, minutes);
    return true;
  });

  // Collections (v4.3.0 — extended: icon/kind/pinned/sortOrder + Smart Collections)
  ipcMain.handle("collections:list", () => listCollections());
  ipcMain.handle("collections:create", (_e, input: { name: string; icon?: string; color?: string; description?: string }) => createCollection(input));
  ipcMain.handle("collections:update", (_e, id: number, patch: { name?: string; icon?: string; color?: string; description?: string; pinned?: boolean; sortOrder?: number }) => updateCollection(id, patch));
  ipcMain.handle("collections:addGame", (_e, collectionId: number, gameId: number) => { addGameToCollection(collectionId, gameId); return true; });
  ipcMain.handle("collections:removeGame", (_e, collectionId: number, gameId: number) => { removeGameFromCollection(collectionId, gameId); return true; });
  ipcMain.handle("collections:delete", (_e, id: number) => { deleteCollection(id); return true; });
  ipcMain.handle("collections:reorder", (_e, ids: number[]) => { reorderCollections(ids); return true; });
  ipcMain.handle("collections:getGames", (_e, collectionId: number) => getGamesInCollection(collectionId));
  ipcMain.handle("collections:forGame", (_e, gameId: number) => getCollectionsForGame(gameId));

  // v4.4.0 — Themes (Theme Studio)
  ipcMain.handle("themes:list", () => listThemes());
  ipcMain.handle("themes:get", (_e, id: number) => getTheme(id));
  ipcMain.handle("themes:create", (_e, name: string, config: import("../shared/theme-types").ThemeConfig) => createTheme(name, config));
  ipcMain.handle("themes:update", (_e, id: number, patch: { name?: string; config?: import("../shared/theme-types").ThemeConfig }) => updateTheme(id, patch));
  ipcMain.handle("themes:delete", (_e, id: number) => { deleteTheme(id); return true; });
  ipcMain.handle("themes:duplicate", (_e, id: number, newName: string) => duplicateTheme(id, newName));

  // ===== v4.5.x — Install verification + intelligent store-link resolution =====
  // (The download-management system was removed in v4.5.3 — the launcher now
  //  manages EXISTING games + redirects to official stores for acquisition.)
  ipcMain.handle("games:verifyInstalled", (_e, gameId: number) => verifyInstalled(gameId));
  ipcMain.handle("games:verifyAll", () => verifyAllInstalled());
  // Intelligent zero-config Get: returns the official store page(s) for a game
  // — exact app page when a platform id is known or live search finds a match,
  // else the store's search-results page.
  ipcMain.handle("sources:resolveStoreLinks", async (_e, gameId: number) => {
    const game = await getGame(gameId);
    if (!game) return [];
    try { return await resolveStoreLinks(game); } catch { return []; }
  });

  // ===== v4.7.0 — Plugins =====
  ipcMain.handle("plugins:list", () => listPlugins());
  ipcMain.handle("plugins:install", (_e, srcDir: string) => {
    try { return installPlugin(srcDir); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  });
  // v4.8.1 — Install a first-party plugin from embedded source code (no directory needed).
  ipcMain.handle("plugins:installFromCode", (_e, manifestJson: string, entryCode: string) => {
    try { return installPluginFromCode(manifestJson, entryCode); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  });
  ipcMain.handle("plugins:enable", (_e, id: string) => { enablePlugin(id); return true; });
  ipcMain.handle("plugins:disable", (_e, id: string) => { disablePlugin(id); return true; });
  ipcMain.handle("plugins:remove", (_e, id: string) => { removePlugin(id); return true; });
  ipcMain.handle("plugins:readEntry", (_e, id: string) => readPluginEntry(id));
  ipcMain.handle("plugins:markError", (_e, id: string, error: string) => { markPluginError(id, error); return true; });
  ipcMain.handle("plugins:storage:get", (_e, id: string, key: string) => getPluginData(id, key));
  ipcMain.handle("plugins:storage:set", (_e, id: string, key: string, value: unknown) => { setPluginData(id, key, value); return true; });
  ipcMain.handle("plugins:selectDir", async () => {
    const { dialog } = await import("electron");
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Select a plugin directory" });
    return result.canceled ? null : result.filePaths[0];
  });

  // v4.9.0 — Host services for plugins.
  // Plugins request network/clipboard/file access through the host so we can
  // gate them by permission + sanitize inputs (no raw Node access in renderer).
  ipcMain.handle("plugins:networkFetch", async (_e, url: string, opts?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  }) => {
    try {
      // Refuse non-http(s) schemes — prevents file://, data:, etc.
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, status: 0, body: "Only http(s) URLs are permitted." };
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 15000);
      const resp = await fetch(url, {
        method: opts?.method ?? "GET",
        headers: opts?.headers ?? {},
        body: opts?.body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const body = await resp.text();
      return { ok: true, status: resp.status, body };
    } catch (e) {
      return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("plugins:clipboardRead", async () => {
    const { clipboard } = await import("electron");
    return clipboard.readText();
  });

  ipcMain.handle("plugins:clipboardWrite", async (_e, text: string) => {
    const { clipboard } = await import("electron");
    clipboard.writeText(text);
    return true;
  });

  ipcMain.handle("plugins:showItemInFolder", async (_e, fullPath: string) => {
    try {
      const { shell } = await import("electron");
      shell.showItemInFolder(fullPath);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

  // ===== Achievements =====
  ipcMain.handle("achievements:list", () => getAchievements());
  ipcMain.handle("achievements:unlock", (_e, id: string) => {
    const newly = unlockAchievement(id);
    // Also check all achievements for any that should be unlocked
    const checked = checkAchievements();
    return { newlyUnlocked: [...(newly ? [id] : []), ...checked] };
  });
  ipcMain.handle("achievements:check", () => {
    const newlyUnlocked = checkAchievements();
    return { newlyUnlocked };
  });

}

/**
 * Background metadata enrichment — iterates games sequentially, fetches
 * artwork + details from the multi-source aggregator, and writes the merged
 * result back. Broadcasts progress to every renderer window so the UI can
 * show a live counter. Resilient: one game failing never aborts the rest.
 */
async function patchGamesInBackground(
  games: Game[],
): Promise<{ patched: number; attempted: number }> {
  let patched = 0;
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    // Broadcast progress so the renderer can show a live counter.
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("patch:progress", {
        gameId: g.id,
        title: g.title,
        current: i + 1,
        total: games.length,
      });
    }
    try {
      // v4.6.7 — Fetch Steam trailer (no key needed). Searches by title when
      // no steamAppId — covers ALL games, not just detected Steam games.
      let trailerUrl = g.trailerUrl;
      if (!trailerUrl) {
        const steamKey = g.steamAppId || g.title;
        const steamTrailer = await fetchSteamTrailer(steamKey);
        if (steamTrailer?.url) trailerUrl = steamTrailer.url;
      }
      const meta = await fetchAggregated(g.title, g.steamAppId, g.rawgId);
      // Steam trailer takes priority; RAWG clip is the fallback.
      if (!trailerUrl && meta?.trailerUrl) trailerUrl = meta.trailerUrl;
      if (!meta) {
        // Even if RAWG failed, store the Steam trailer if we got one.
        if (trailerUrl) updateGame(g.id, { trailerUrl });
        await new Promise((r) => setTimeout(r, 120));
        continue;
      }
      const updated = updateGame(g.id, {
        coverImage: meta.coverImage ?? g.coverImage,
        bannerImage: meta.bannerImage ?? g.bannerImage,
        trailerUrl: trailerUrl ?? g.trailerUrl,
        screenshots: meta.screenshots && meta.screenshots.length ? meta.screenshots : g.screenshots,
        description: meta.description ?? g.description,
        developer: meta.developer ?? g.developer,
        publisher: meta.publisher ?? g.publisher,
        releaseDate: meta.releaseDate ?? g.releaseDate,
        rating: meta.rating ?? g.rating,
        ratingCount: meta.ratingCount ?? g.ratingCount,
        genres: meta.genres.length ? meta.genres : g.genres,
        rawgId: meta.rawgId && meta.rawgId !== 0 ? meta.rawgId : g.rawgId,
      });
      if (updated?.bannerImage) patched++;
      // Notify the renderer that this game's row changed.
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("patch:gameUpdated", { game: updated });
      }
      // Gentle delay to respect rate limits.
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // skip this game; continue with the rest
    }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("patch:done", { patched, attempted: games.length });
  }
  return { patched, attempted: games.length };
}

// Exported alias so the main process entry can kick off the startup auto-patch
// without duplicating the logic.
export const patchGamesInBackgroundExport = patchGamesInBackground;

// Re-export types so the preload can share them.
export type { Game, ScanSummary };
