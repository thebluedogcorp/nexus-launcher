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

  // Metadata
  searchMetadata: (q: string) =>
    ipcRenderer.invoke("metadata:search", q) as Promise<MetadataResult[]>,

  // Stats & settings
  getStats: () => ipcRenderer.invoke("stats:get") as Promise<Stats>,
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<LauncherSettings>,
  setSettings: (s: Partial<LauncherSettings>) =>
    ipcRenderer.invoke("settings:set", s) as Promise<LauncherSettings>,
};

contextBridge.exposeInMainWorld("nexus", api);

export type NexusApi = typeof api;
