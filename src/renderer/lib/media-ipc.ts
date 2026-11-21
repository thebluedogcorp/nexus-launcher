// v9.3.0 (M1) — Renderer-side wrappers for the local media server.
//
// Thin async helpers around `window.nexus.media*` so renderer components
// don't sprinkle raw IPC calls everywhere. Returns typed Promises; the actual
// work (filesystem scan, streaming, DB) all happens in the main process.
//
// The protocol served by the main process is `nexus-media://` and serves ONLY
// files on the user's local disk — no third-party stream hosts.
//
// E1 — extended with libraries, per-library queries, TMDB identification,
// progress / continue-watching, and server lifecycle wrappers.

import type {
  MediaItem,
  MediaScanSummary,
  MediaScanProgress,
  MediaLibrary,
  MediaLibraryCategory,
  MediaLibraryPath,
  MediaContinueWatchingItem,
  MediaProgress,
  MediaServerConfig,
  MediaServerStatus,
  MediaServerStartResult,
  MediaTmdbCandidate,
  MediaAutoIdentifyResult,
} from "@shared/types";

/** Load the media library, optionally filtered by free-text query + dir. */
export async function loadMedia(q?: string, dir?: string): Promise<MediaItem[]> {
  const opts: { q?: string; dir?: string } = {};
  if (q && q.trim()) opts.q = q.trim();
  if (dir && dir.trim()) opts.dir = dir.trim();
  return window.nexus.mediaList(opts);
}

/**
 * Scan the configured folders (or the passed paths) for video files. The
 * returned summary tells the UI how many were found, added, updated, removed.
 */
export async function scanMedia(paths?: string[]): Promise<MediaScanSummary> {
  return window.nexus.mediaScan(paths);
}

/** Delete one media row (does NOT delete the underlying file on disk). */
export async function deleteMediaItem(id: number): Promise<boolean> {
  return window.nexus.mediaDelete(id);
}

/** Wipe every media row from the library (file scan can re-populate it). */
export async function clearAllMedia(): Promise<boolean> {
  return window.nexus.mediaClear();
}

/**
 * Returns `nexus-media://media/<id>/stream` — the stable URL the renderer
 * `<video>` element uses as its `src`. The protocol handler respects HTTP
 * Range headers so video seeking works.
 */
export async function streamUrlFor(id: number): Promise<string> {
  return window.nexus.mediaStreamUrl(id);
}

// ── E1 — Libraries ───────────────────────────────────────────────────────

export function listLibraries(): Promise<MediaLibrary[]> {
  return window.nexus.librariesList();
}
export function createLibrary(name: string, category: MediaLibraryCategory): Promise<MediaLibrary> {
  return window.nexus.librariesCreate(name, category);
}
export function deleteLibrary(id: number): Promise<boolean> {
  return window.nexus.librariesDelete(id);
}
export function addLibraryPath(libraryId: number, p: string): Promise<boolean> {
  return window.nexus.librariesAddPath(libraryId, p);
}
export function removeLibraryPath(libraryId: number, p: string): Promise<boolean> {
  return window.nexus.librariesRemovePath(libraryId, p);
}
export function listLibraryPaths(libraryId: number): Promise<MediaLibraryPath[]> {
  return window.nexus.librariesListPaths(libraryId);
}

// ── E1 — Per-library media + TV episode grouping ─────────────────────────

export function listMediaByLibrary(
  libraryId: number,
  opts?: { q?: string; sort?: "title" | "year" | "added" | "rating"; mediaType?: "movie" | "tv"; limit?: number },
): Promise<MediaItem[]> {
  return window.nexus.mediaListByLibrary(libraryId, opts);
}
export function listTvShows(libraryId: number): Promise<MediaItem[]> {
  return window.nexus.mediaListTvShows(libraryId);
}
export function listEpisodes(tvShowId: number, season?: number): Promise<MediaItem[]> {
  return window.nexus.mediaListEpisodes(tvShowId, season);
}
export function listSeasons(tvShowId: number): Promise<number[]> {
  return window.nexus.mediaListSeasons(tvShowId);
}
export function scanLibrary(libraryId: number): Promise<MediaScanSummary> {
  return window.nexus.mediaScanLibrary(libraryId);
}
export function onMediaScanProgress(cb: (p: MediaScanProgress) => void): () => void {
  return window.nexus.onMediaScanProgress(cb);
}

// ── E1 — TMDB identification (server-side; key never exposed) ────────────

export function autoIdentifyMedia(mediaId: number): Promise<MediaAutoIdentifyResult> {
  return window.nexus.mediaAutoIdentify(mediaId);
}
export function searchTmdbForMedia(query: string, mediaType?: "movie" | "tv"): Promise<MediaTmdbCandidate[]> {
  return window.nexus.mediaSearchTmdb(query, mediaType);
}
export function identifyMediaAs(mediaId: number, tmdbId: number, mediaType: "movie" | "tv"): Promise<MediaItem | null> {
  return window.nexus.mediaIdentifyAs(mediaId, tmdbId, mediaType);
}

// ── E1 — Progress + continue-watching + recently-added ────────────────────

export function recordProgress(mediaId: number, positionSec: number, durationSec?: number | null): Promise<boolean> {
  return window.nexus.mediaProgressRecord(mediaId, positionSec, durationSec ?? null);
}
export function getProgress(mediaId: number): Promise<MediaProgress | null> {
  return window.nexus.mediaProgressGet(mediaId);
}
export function listContinueWatching(limit?: number): Promise<MediaContinueWatchingItem[]> {
  return window.nexus.mediaContinueWatching(limit);
}
export function listRecentlyAdded(limit?: number): Promise<MediaItem[]> {
  return window.nexus.mediaRecentlyAdded(limit);
}

// ── E1 — Servers ──────────────────────────────────────────────────────────

export function listServerConfigs(): Promise<MediaServerConfig[]> {
  return window.nexus.serversList();
}
export function createServerConfig(name: string, port: number, libraryIds: number[], authCode?: string | null): Promise<MediaServerConfig> {
  return window.nexus.serversCreate(name, port, libraryIds, authCode ?? null);
}
export function deleteServerConfig(id: number): Promise<boolean> {
  return window.nexus.serversDelete(id);
}
export function startMediaServer(id: number): Promise<MediaServerStartResult> {
  return window.nexus.serversStart(id);
}
export function stopMediaServer(id: number): Promise<boolean> {
  return window.nexus.serversStop(id);
}
export function getMediaServerStatus(id: number): Promise<MediaServerStatus> {
  return window.nexus.serversStatus(id);
}
