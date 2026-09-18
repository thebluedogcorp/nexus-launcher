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
} from "./db";
import { runScan } from "./detectors";
import { launchGame } from "./launchers";
import { searchRawg } from "./metadata/rawg";
import { fetchAggregated } from "./metadata/aggregator";
import type {
  DetectedGame,
  Game,
  MetadataResult,
  PlatformId,
  ScanSummary,
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
    if (result.ok) recordLaunch(id, 30);
    return result;
  });

  ipcMain.handle(
    "games:patchMetadata",
    async (_e, id: number, query?: string) => {
      const game = getGame(id);
      if (!game) return null;
      const title = query?.trim() || game.title;
      const meta = await fetchAggregated(title, game.steamAppId, game.rawgId);
      if (!meta) return null;
      return updateGame(id, {
        coverImage: meta.coverImage ?? game.coverImage,
        bannerImage: meta.bannerImage ?? game.bannerImage,
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
    const needPatch = all.filter((g) => !g.bannerImage);
    const result = await patchGamesInBackground(needPatch.slice(0, 60));
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
      const meta = await fetchAggregated(g.title, g.steamAppId, g.rawgId);
      if (!meta) {
        await new Promise((r) => setTimeout(r, 120));
        continue;
      }
      const updated = updateGame(g.id, {
        coverImage: meta.coverImage ?? g.coverImage,
        bannerImage: meta.bannerImage ?? g.bannerImage,
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
