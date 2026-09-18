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
import { searchRawg, bestMatchForTitle } from "./metadata/rawg";
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
      meta = await bestMatchForTitle(input.title);
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
      const meta = await bestMatchForTitle(title);
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

  ipcMain.handle("scan:import", (_e, items: DetectedGame[]) => importDetected(items));

  // ===== Metadata =====
  ipcMain.handle("metadata:search", (_e, q: string) => searchRawg(q, 8));

  // Patch metadata for every game that's missing a banner image (best-effort,
  // sequential to avoid hammering RAWG rate limits).
  ipcMain.handle("games:patchAll", async () => {
    const all = listGames({ showHidden: true });
    const needPatch = all.filter((g) => !g.bannerImage);
    let patched = 0;
    for (const g of needPatch.slice(0, 60)) {
      try {
        const meta = await bestMatchForTitle(g.title);
        if (!meta) continue;
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
          rawgId: meta.rawgId ?? g.rawgId,
        });
        if (updated?.bannerImage) patched++;
        // Small delay to respect RAWG's rate limit (~20 req/s, but be gentle).
        await new Promise((r) => setTimeout(r, 150));
      } catch {
        // skip this one
      }
    }
    return { patched, attempted: needPatch.length };
  });

  // ===== Stats & settings =====
  ipcMain.handle("stats:get", () => getStats());
  ipcMain.handle("settings:get", () => getAllSettings());
  ipcMain.handle("settings:set", (_e, s) => setAllSettings(s));

  // ===== Utilities =====
  ipcMain.handle("platform:info", () => null);
}

// Re-export types so the preload can share them.
export type { Game, ScanSummary };
