// v9.3.0 (M1) — Renderer-side wrappers for the local media server.
//
// Thin async helpers around `window.nexus.media*` so renderer components
// don't sprinkle raw IPC calls everywhere. Returns typed Promises; the actual
// work (filesystem scan, streaming, DB) all happens in the main process.
//
// The protocol served by the main process is `nexus-media://` and serves ONLY
// files on the user's local disk — no third-party stream hosts.

import type { MediaItem, MediaScanSummary } from "@shared/types";

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
