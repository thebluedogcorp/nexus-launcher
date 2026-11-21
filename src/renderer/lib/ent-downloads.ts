// v9.2.0 — Downloads system stubbed out.
//
// Previously this module wrote "offline packages" (JSON metadata files) to
// disk for titles the user was streaming via CineSrc. With third-party stream
// embedding removed (Entertainment is now browse-only: TMDB metadata + YouTube
// trailers), there is nothing to package for offline viewing.
//
// The exported functions are kept as no-op stubs returning sensible empty /
// false values so existing import sites (EntAccountView's Downloads manager
// UI, EntDetailPage's download buttons, EntPlayer's auto-download hook) do not
// break the build. A local media server (stream your own files) arrives in
// v9.3.0 and will replace this stub with real local-file management.
//
// All settings + entries persistence has been removed; the stubs read/write
// nothing to localStorage and never touch the filesystem via IPC.

import type { TmdbMediaType } from "./tmdb-types";

// ─── Settings (stubbed) ─────────────────────────────────────────────────────

export type DownloadQuality = "standard" | "high" | "max";

export interface DownloadSettings {
  location: string;
  quality: DownloadQuality;
  autoDownload: boolean;
  smartDownload: boolean;
}

const STUB_SETTINGS: DownloadSettings = {
  location: "",
  quality: "high",
  autoDownload: false,
  smartDownload: false,
};

/** Always returns the default stub settings. Downloads are removed in v9.2.0. */
export function getDownloadSettings(): DownloadSettings {
  return { ...STUB_SETTINGS };
}

/** No-op — downloads were removed in v9.2.0; settings are not persisted. */
export function setDownloadSettings(_patch: Partial<DownloadSettings>): void {
  /* no-op */
}

/** Returns 0 — packages are no longer written. */
export function packageSizeKB(_quality: DownloadQuality): number {
  return 0;
}

export function formatSize(kb: number): string {
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// ─── Download entries (stubbed) ─────────────────────────────────────────────

export interface DownloadEntry {
  mediaType: TmdbMediaType;
  id: number;
  title: string;
  posterPath: string | null;
  season?: number;
  episode?: number;
  quality: DownloadQuality;
  sizeKB: number;
  fileName: string;
  filePath: string;
  downloadedAt: number;
}

/** Always returns [] — no packages are tracked. */
export function getDownloads(): DownloadEntry[] {
  return [];
}

/** Always returns false — nothing is downloaded. */
export function isDownloaded(_mediaType: TmdbMediaType, _id: number, _season?: number, _episode?: number): boolean {
  return false;
}

/** No-op — nothing to remove. */
export function removeDownload(_mediaType: TmdbMediaType, _id: number, _season?: number, _episode?: number): void {
  /* no-op */
}

/** No-op — nothing to clear. */
export function clearAllDownloads(): void {
  /* no-op */
}

/**
 * Always returns null — no packages are written to disk.
 * Previously this wrote an offline JSON package for a streaming title; with
 * stream embedding removed there is nothing to package.
 */
export async function downloadOfflinePackage(_input: {
  mediaType: TmdbMediaType;
  id: number;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string;
  year?: string;
  rating?: number;
  season?: number;
  episode?: number;
}): Promise<DownloadEntry | null> {
  return null;
}

// ─── Auto / smart download hooks (stubbed) ──────────────────────────────────

/** No-op — auto-download is removed. */
export async function autoDownloadNextEpisode(_payload: {
  mediaType: "tv";
  id: number;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  nextSeason: number;
  nextEpisode: number;
}): Promise<void> {
  /* no-op */
}

/** No-op — smart-download cleanup is removed. */
export function smartDownloadCleanup(_mediaType: TmdbMediaType, _id: number, _season?: number, _episode?: number): void {
  /* no-op */
}
