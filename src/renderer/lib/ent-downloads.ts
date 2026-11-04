// v9.0.0 — Downloads system for NEXUS TV.
// Manages offline packages: user-chosen download location, quality preference,
// auto-download + smart-download toggles, and the downloads list. Offline
// packages are small JSON files (title info + artwork link + your progress)
// written to disk by the main process — CineSrc streams are embeds without
// direct video URLs, so packages are metadata-only by design (honest, no fake
// video downloads).

import type { TmdbMediaType } from "./tmdb-types";
import { getRating, getReview, isEpisodeWatched } from "./ent-userdata";
import { getContinueFor } from "./ent-store";

// ─── Settings ───────────────────────────────────────────────────────────────
const SETTINGS_KEY = "nx-ent-dl-settings";

export type DownloadQuality = "standard" | "high" | "max";

export interface DownloadSettings {
  location: string;
  quality: DownloadQuality;
  autoDownload: boolean;
  smartDownload: boolean;
}

const DEFAULT_SETTINGS: DownloadSettings = {
  location: "",
  quality: "high",
  autoDownload: false,
  smartDownload: false,
};

export function getDownloadSettings(): DownloadSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DownloadSettings>) };
  } catch { return DEFAULT_SETTINGS; }
}

export function setDownloadSettings(patch: Partial<DownloadSettings>): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...getDownloadSettings(), ...patch }));
  } catch { /* non-fatal */ }
}

/** Rough per-title package size estimate (KB) by quality — offline packages. */
export function packageSizeKB(quality: DownloadQuality): number {
  // Artwork reference + metadata + your notes. Higher quality embeds larger
  // artwork references + episode data.
  return quality === "standard" ? 24 : quality === "high" ? 48 : 96;
}

export function formatSize(kb: number): string {
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// ─── Download entries (tracked locally; files on disk in the chosen folder) ─
const ENTRIES_KEY = "nx-ent-downloads";

export interface DownloadEntry {
  mediaType: TmdbMediaType;
  id: number;
  title: string;
  posterPath: string | null;
  /** TV only. */
  season?: number;
  episode?: number;
  quality: DownloadQuality;
  sizeKB: number;
  fileName: string;
  filePath: string;
  downloadedAt: number;
}

export function getDownloads(): DownloadEntry[] {
  try {
    return (JSON.parse(localStorage.getItem(ENTRIES_KEY) || "[]") as DownloadEntry[])
      .sort((a, b) => b.downloadedAt - a.downloadedAt);
  } catch { return []; }
}

export function isDownloaded(mediaType: TmdbMediaType, id: number, season?: number, episode?: number): boolean {
  return getDownloads().some(d =>
    d.mediaType === mediaType && d.id === id &&
    (d.season ?? 0) === (season ?? 0) && (d.episode ?? 0) === (episode ?? 0),
  );
}

function saveEntries(list: DownloadEntry[]): void {
  try { localStorage.setItem(ENTRIES_KEY, JSON.stringify(list.slice(0, 200))); } catch { /* non-fatal */ }
}

export function removeDownload(mediaType: TmdbMediaType, id: number, season?: number, episode?: number): void {
  const all = getDownloads();
  const entry = all.find(d =>
    d.mediaType === mediaType && d.id === id &&
    (d.season ?? 0) === (season ?? 0) && (d.episode ?? 0) === (episode ?? 0),
  );
  if (!entry) return;
  // Delete the file on disk (best-effort).
  if (entry.filePath) void window.nexus?.downloadsRemovePackage?.(entry.filePath);
  saveEntries(all.filter(d => d !== entry));
}

export function clearAllDownloads(): void {
  for (const d of getDownloads()) {
    if (d.filePath) void window.nexus?.downloadsRemovePackage?.(d.filePath);
  }
  saveEntries([]);
}

/**
 * Download an offline package for a title (or a specific TV episode) to the
 * chosen location. Returns the new entry, or null when no location is set or
 * the write failed.
 */
export async function downloadOfflinePackage(input: {
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
  const s = getDownloadSettings();
  if (!s.location) return null;

  const isEp = input.mediaType === "tv" && input.season !== undefined && input.episode !== undefined;
  const suffix = isEp ? ` S${input.season}E${input.episode}` : "";
  const fileName = `${input.title}${suffix}`;
  const sizeKB = packageSizeKB(s.quality);

  const data = {
    kind: "nexus-offline-package",
    version: 1,
    savedAt: new Date().toISOString(),
    title: {
      mediaType: input.mediaType,
      id: input.id,
      name: input.title,
      year: input.year ?? "",
      rating: input.rating ?? 0,
      overview: input.overview ?? "",
      season: input.season ?? null,
      episode: input.episode ?? null,
      posterUrl: input.posterPath ? `https://image.tmdb.org/t/p/w500${input.posterPath}` : null,
      backdropUrl: input.backdropPath ? `https://image.tmdb.org/t/p/w1280${input.backdropPath}` : null,
      tmdbUrl: `https://www.themoviedb.org/${input.mediaType}/${input.id}`,
    },
    yourData: {
      rating: getRating(input.mediaType, input.id) || null,
      review: getReview(input.mediaType, input.id)?.text ?? null,
      continue: getContinueFor(input.mediaType, input.id),
      episodeWatched: isEp ? isEpisodeWatched(input.mediaType, input.id, input.season!, input.episode!) : null,
    },
  };

  const r = await window.nexus.downloadsSavePackage(s.location, { fileName, data });
  if (!r || !("ok" in r) || !r.ok || !r.path) return null;

  const entry: DownloadEntry = {
    mediaType: input.mediaType,
    id: input.id,
    title: input.title,
    posterPath: input.posterPath ?? null,
    season: input.season,
    episode: input.episode,
    quality: s.quality,
    sizeKB,
    fileName,
    filePath: r.path,
    downloadedAt: Date.now(),
  };
  const all = getDownloads().filter(d =>
    !(d.mediaType === entry.mediaType && d.id === entry.id &&
      (d.season ?? 0) === (entry.season ?? 0) && (d.episode ?? 0) === (entry.episode ?? 0)),
  );
  all.unshift(entry);
  saveEntries(all);
  return entry;
}

// ─── Auto / smart download hooks ────────────────────────────────────────────

/**
 * Auto-download: when enabled, called after an episode finishes — packages the
 * next episode so it's ready offline.
 */
export async function autoDownloadNextEpisode(payload: {
  mediaType: "tv";
  id: number;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  nextSeason: number;
  nextEpisode: number;
}): Promise<void> {
  const s = getDownloadSettings();
  if (!s.autoDownload || !s.location) return;
  await downloadOfflinePackage({
    mediaType: "tv",
    id: payload.id,
    title: payload.title,
    posterPath: payload.posterPath,
    backdropPath: payload.backdropPath,
    season: payload.nextSeason,
    episode: payload.nextEpisode,
  });
}

/**
 * Smart download: when enabled, called when an episode is marked watched —
 * removes its offline package to free up space.
 */
export function smartDownloadCleanup(mediaType: TmdbMediaType, id: number, season?: number, episode?: number): void {
  const s = getDownloadSettings();
  if (!s.smartDownload) return;
  removeDownload(mediaType, id, season, episode);
}
