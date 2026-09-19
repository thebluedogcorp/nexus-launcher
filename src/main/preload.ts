// Preload script — exposes a minimal, typed `window.nexus` API to the renderer.
//
// All filesystem / registry / network access stays in the main process; the
// renderer only talks through these IPC channels. contextIsolation stays ON
// and nodeIntegration stays OFF for security.

import { contextBridge, ipcRenderer } from "electron";
import type {
  DetectedGame,
  Game,
  LauncherSettings,
  MetadataResult,
  ScanSummary,
  Stats,
} from "@shared/types";
import type { StoreGame, StoreSortKey } from "@shared/store-catalog";

// Download entry — mirrors src/main/downloads/manager.ts DownloadEntry.
export interface DownloadEntry {
  key: string;
  gameId: string;
  gameTitle: string;
  sourceId: string;
  sourceLabel: string;
  coverImage?: string;
  totalBytes: number;
  downloadedBytes: number;
  status: "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled";
  speedBps: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
  installPath?: string;
  libraryGameId?: number;
}

const api = {
  // Games
  listGames: (opts?: {
    platform?: string;
    favOnly?: boolean;
    query?: string;
    showHidden?: boolean;
    sort?: "recent" | "name" | "playtime" | "rating";
  }) => ipcRenderer.invoke("games:list", opts) as Promise<Game[]>,
  getGame: (id: number) => ipcRenderer.invoke("games:get", id) as Promise<Game | null>,
  addGame: (input: {
    title: string;
    platform?: Game["platform"];
    executable?: string | null;
    installDir?: string | null;
    launchCommand?: string | null;
    sizeBytes?: number | null;
    autoPatch?: boolean;
  }) => ipcRenderer.invoke("games:add", input) as Promise<Game>,
  updateGame: (id: number, patch: Record<string, unknown>) =>
    ipcRenderer.invoke("games:update", id, patch) as Promise<Game | null>,
  deleteGame: (id: number) => ipcRenderer.invoke("games:delete", id) as Promise<boolean>,
  launchGame: (id: number) =>
    ipcRenderer.invoke("games:launch", id) as Promise<{
      ok: boolean;
      message: string;
      startedAt: string;
    }>,
  patchMetadata: (id: number, query?: string) =>
    ipcRenderer.invoke("games:patchMetadata", id, query) as Promise<Game | null>,
  patchAllMetadata: () =>
    ipcRenderer.invoke("games:patchAll") as Promise<{ patched: number; attempted: number }>,
  onPatchProgress: (cb: (p: { gameId: number; title: string; current: number; total: number }) => void) => {
    const listener = (_e: unknown, p: { gameId: number; title: string; current: number; total: number }) => cb(p);
    ipcRenderer.on("patch:progress", listener);
    return () => ipcRenderer.removeListener("patch:progress", listener);
  },
  onPatchGameUpdated: (cb: (p: { game: Game }) => void) => {
    const listener = (_e: unknown, p: { game: Game }) => cb(p);
    ipcRenderer.on("patch:gameUpdated", listener);
    return () => ipcRenderer.removeListener("patch:gameUpdated", listener);
  },
  onPatchDone: (cb: (p: { patched: number; attempted: number }) => void) => {
    const listener = (_e: unknown, p: { patched: number; attempted: number }) => cb(p);
    ipcRenderer.on("patch:done", listener);
    return () => ipcRenderer.removeListener("patch:done", listener);
  },

  // Auto-update
  checkForUpdates: () =>
    ipcRenderer.invoke("updater:check") as Promise<{
      ok: boolean;
      message: string;
      updateAvailable?: boolean;
      version?: string;
      releaseUrl?: string;
      downloadUrl?: string;
      downloadSize?: number;
    }>,
  downloadAndInstallUpdate: (downloadUrl: string, expectedSize?: number) =>
    ipcRenderer.invoke("updater:downloadAndInstall", downloadUrl, expectedSize) as Promise<{
      ok: boolean;
      message: string;
      installerPath?: string;
    }>,
  onUpdateProgress: (cb: (p: { bytesDownloaded: number; totalBytes: number; percent: number }) => void) => {
    const listener = (_e: unknown, p: { bytesDownloaded: number; totalBytes: number; percent: number }) => cb(p);
    ipcRenderer.on("updater:progress", listener);
    return () => ipcRenderer.removeListener("updater:progress", listener);
  },
  openExternal: (url: string) =>
    ipcRenderer.invoke("shell:openExternal", url) as Promise<{ ok: boolean; message?: string }>,
  openPath: (path: string) =>
    ipcRenderer.invoke("shell:openPath", path) as Promise<{ ok: boolean; message?: string }>,
  // Native file/folder pickers (return real filesystem paths)
  pickFile: (opts?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke("dialog:pickFile", opts) as Promise<{ ok: boolean; path: string | null; error?: string }>,
  pickFolder: (opts?: { title?: string }) =>
    ipcRenderer.invoke("dialog:pickFolder", opts) as Promise<{ ok: boolean; path: string | null; error?: string }>,
  // v2.0 Features
  exportLibrary: () => ipcRenderer.invoke("games:export") as Promise<string>,
  importLibrary: (json: string) => ipcRenderer.invoke("games:import", json) as Promise<{ imported: number; skipped: number }>,
  checkMissingGames: () => ipcRenderer.invoke("games:checkMissing") as Promise<Array<{ id: number; title: string; installDir: string | null; executable: string | null }>>,
  getDetailedStats: () => ipcRenderer.invoke("games:detailedStats") as Promise<{
    totalGames: number; totalPlaytimeSec: number; totalLaunches: number; totalSizeBytes: number;
    avgRating: number | null; favorites: number; hidden: number;
    byPlatform: Record<string, number>; byStatus: Record<string, number>; byGenre: Record<string, number>;
    topPlayed: Array<{ id: number; title: string; playtimeSec: number }>;
    recentlyPlayed: Array<{ id: number; title: string; lastPlayedAt: string | null }>;
    recentlyAdded: Array<{ id: number; title: string; createdAt: string }>;
    largestGames: Array<{ id: number; title: string; sizeBytes: number | null }>;
    neverPlayed: number; completionRate: number;
  }>,
  recordSession: (gameId: number, minutes: number) => ipcRenderer.invoke("games:recordSession", gameId, minutes) as Promise<boolean>,
  // Collections
  listCollections: () => ipcRenderer.invoke("collections:list") as Promise<Array<{ id: number; name: string; color: string; gameCount: number }>>,
  createCollection: (name: string, color: string) => ipcRenderer.invoke("collections:create", name, color) as Promise<{ id: number; name: string; color: string; gameCount: number }>,
  addGameToCollection: (collectionId: number, gameId: number) => ipcRenderer.invoke("collections:addGame", collectionId, gameId) as Promise<boolean>,
  removeGameFromCollection: (collectionId: number, gameId: number) => ipcRenderer.invoke("collections:removeGame", collectionId, gameId) as Promise<boolean>,
  deleteCollection: (id: number) => ipcRenderer.invoke("collections:delete", id) as Promise<boolean>,
  // Achievements
  getAchievements: () => ipcRenderer.invoke("achievements:list") as Promise<Array<{ id: string; name: string; description: string; icon: string; unlockedAt: string | null; progress: number; maxProgress: number }>>,
  checkAchievements: () => ipcRenderer.invoke("achievements:check") as Promise<{ newlyUnlocked: string[] }>,

  // Scan
  runScan: (platforms?: Game["platform"][]) =>
    ipcRenderer.invoke("scan:run", platforms, "scan:progress") as Promise<ScanSummary>,
  onScanProgress: (cb: (p: { platform: string; label: string }) => void) => {
    const listener = (_e: unknown, p: { platform: string; label: string }) => cb(p);
    ipcRenderer.on("scan:progress", listener);
    return () => ipcRenderer.removeListener("scan:progress", listener);
  },
  importDetected: (items: DetectedGame[]) =>
    ipcRenderer.invoke("scan:import", items) as Promise<Game[]>,
  scanFilesystem: (customPaths: string[]) =>
    ipcRenderer.invoke("scan:filesystem", customPaths) as Promise<{
      detected: DetectedGame[];
      totalFound: number;
      skipped: number;
      errors: { path: string; message: string }[];
    }>,

  // Metadata
  searchMetadata: (q: string) =>
    ipcRenderer.invoke("metadata:search", q) as Promise<MetadataResult[]>,
  // Store / Browse
  storeSearch: (q: string, page: number) =>
    ipcRenderer.invoke("store:search", q, page) as Promise<{ results: Array<Record<string, unknown>>; count: number; next: string | null }>,
  storeTrending: (page: number) =>
    ipcRenderer.invoke("store:trending", page) as Promise<{ results: Array<Record<string, unknown>>; count: number; next: string | null }>,
  storeTopRated: (page: number) =>
    ipcRenderer.invoke("store:topRated", page) as Promise<{ results: Array<Record<string, unknown>>; count: number; next: string | null }>,
  storeNewReleases: (page: number) =>
    ipcRenderer.invoke("store:newReleases", page) as Promise<{ results: Array<Record<string, unknown>>; count: number; next: string | null }>,

  // Stats & settings
  getStats: () => ipcRenderer.invoke("stats:get") as Promise<Stats>,
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<LauncherSettings>,
  setSettings: (s: Partial<LauncherSettings>) =>
    ipcRenderer.invoke("settings:set", s) as Promise<LauncherSettings>,

  // ===== NEXUS Store (curated catalog + real downloads) =====
  storeCatalog: (filters?: { query?: string; genre?: string; sort?: StoreSortKey }) =>
    ipcRenderer.invoke("store:catalog", filters) as Promise<StoreGame[]>,
  getStoreGame: (id: string) =>
    ipcRenderer.invoke("store:getGame", id) as Promise<StoreGame | null>,
  storeGenres: () => ipcRenderer.invoke("store:genres") as Promise<string[]>,
  pickInstallDir: () =>
    ipcRenderer.invoke("store:pickInstallDir") as Promise<{ ok: boolean; path: string | null; error?: string }>,

  // ===== Downloads =====
  startDownload: (gameId: string, sourceId: string, installDir?: string) =>
    ipcRenderer.invoke("downloads:start", gameId, sourceId, installDir) as Promise<DownloadEntry>,
  pauseDownload: (gameId: string, sourceId: string) =>
    ipcRenderer.invoke("downloads:pause", gameId, sourceId) as Promise<boolean>,
  resumeDownload: (gameId: string, sourceId: string) =>
    ipcRenderer.invoke("downloads:resume", gameId, sourceId) as Promise<DownloadEntry | undefined>,
  cancelDownload: (gameId: string, sourceId: string) =>
    ipcRenderer.invoke("downloads:cancel", gameId, sourceId) as Promise<boolean>,
  removeDownload: (gameId: string, sourceId: string) =>
    ipcRenderer.invoke("downloads:remove", gameId, sourceId) as Promise<boolean>,
  listDownloads: () => ipcRenderer.invoke("downloads:list") as Promise<DownloadEntry[]>,
  clearCompletedDownloads: () =>
    ipcRenderer.invoke("downloads:clearCompleted") as Promise<boolean>,
  openDownloadFolder: (gameId: string, sourceId: string) =>
    ipcRenderer.invoke("downloads:openFolder", gameId, sourceId) as Promise<{ ok: boolean; message: string }>,
  // Live event subscriptions
  onDownloadProgress: (cb: (e: DownloadEntry) => void) => {
    const l = (_e: unknown, p: DownloadEntry) => cb(p);
    ipcRenderer.on("downloads:progress", l);
    return () => ipcRenderer.removeListener("downloads:progress", l);
  },
  onDownloadComplete: (cb: (e: DownloadEntry) => void) => {
    const l = (_e: unknown, p: DownloadEntry) => cb(p);
    ipcRenderer.on("downloads:complete", l);
    return () => ipcRenderer.removeListener("downloads:complete", l);
  },
  onDownloadLibraryAdded: (cb: (p: { key: string; game: Game }) => void) => {
    const l = (_e: unknown, p: { key: string; game: Game }) => cb(p);
    ipcRenderer.on("downloads:libraryAdded", l);
    return () => ipcRenderer.removeListener("downloads:libraryAdded", l);
  },
};

contextBridge.exposeInMainWorld("nexus", api);

export type NexusApi = typeof api;
