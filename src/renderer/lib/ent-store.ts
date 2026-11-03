// v6.0.0 — Entertainment local store: My List (watchlist) + Continue Watching.
// Both persist in localStorage (survives app restarts; scoped to the NEXUS TV
// partition). This is the "native app" advantage over a website — the app
// remembers exactly where you left off, on disk, locally.

import type { TmdbMediaType } from "./tmdb-types";

const LIST_KEY = "nx-ent-list";
const PROGRESS_KEY = "nx-ent-progress";
const MAX_LIST = 300;
const MAX_PROGRESS = 20;

export interface ListItem {
  mediaType: TmdbMediaType;
  id: number;
  title: string;
  posterPath: string | null;
  rating: number;
  year: string;
  addedAt: number;
}

export interface ContinueEntry {
  mediaType: TmdbMediaType;
  id: number;
  title: string;
  backdropPath: string | null;
  posterPath: string | null;
  /** 1 for movies. */
  season: number;
  /** 1 for movies. */
  episode: number;
  /** Estimated watch progress 0–0.95 (elapsed vs runtime while the player was open). */
  progress: number;
  updatedAt: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full / unavailable — non-fatal.
  }
}

// ─── My List ───────────────────────────────────────────────────────────────

export function getList(): ListItem[] {
  return read<ListItem[]>(LIST_KEY, []);
}

export function inList(mediaType: TmdbMediaType, id: number): boolean {
  return getList().some(i => i.mediaType === mediaType && i.id === id);
}

export function toggleList(item: Omit<ListItem, "addedAt">): boolean {
  const list = getList();
  const idx = list.findIndex(i => i.mediaType === item.mediaType && i.id === item.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    write(LIST_KEY, list);
    return false;
  }
  list.unshift({ ...item, addedAt: Date.now() });
  write(LIST_KEY, list.slice(0, MAX_LIST));
  return true;
}

export function removeFromList(mediaType: TmdbMediaType, id: number): void {
  write(LIST_KEY, getList().filter(i => !(i.mediaType === mediaType && i.id === id)));
}

// ─── Continue Watching ─────────────────────────────────────────────────────

export function getContinue(): ContinueEntry[] {
  return read<ContinueEntry[]>(PROGRESS_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getContinueFor(mediaType: TmdbMediaType, id: number): ContinueEntry | null {
  return getContinue().find(e => e.mediaType === mediaType && e.id === id) ?? null;
}

/**
 * Record (or refresh) a continue-watching entry. Called when the player
 * closes — or periodically while open. `progress` is an estimate because the
 * CineSrc iframe is cross-origin (we measure wall-clock time vs runtime).
 *
 * progress >= 0.95 → TV: auto-advance to the next episode; Movie: considered
 * finished and dropped from the row.
 */
export function recordContinue(entry: {
  mediaType: TmdbMediaType;
  id: number;
  title: string;
  backdropPath: string | null;
  posterPath: string | null;
  season: number;
  episode: number;
  progress: number;
}): void {
  const all = read<ContinueEntry[]>(PROGRESS_KEY, []);
  const idx = all.findIndex(e => e.mediaType === entry.mediaType && e.id === entry.id);
  const p = Math.min(Math.max(entry.progress, 0), 1);

  if (p >= 0.95) {
    if (entry.mediaType === "tv") {
      // Finished the episode → advance to the next one at progress 0.
      const next: ContinueEntry = {
        ...entry,
        season: entry.season,
        episode: entry.episode + 1,
        progress: 0,
        updatedAt: Date.now(),
      };
      if (idx >= 0) all[idx] = next;
      else all.push(next);
      write(PROGRESS_KEY, all.slice(0, MAX_PROGRESS));
      return;
    }
    // Movie finished → remove.
    if (idx >= 0) all.splice(idx, 1);
    write(PROGRESS_KEY, all.slice(0, MAX_PROGRESS));
    return;
  }

  const stored: ContinueEntry = { ...entry, progress: p, updatedAt: Date.now() };
  if (idx >= 0) all[idx] = stored;
  else all.push(stored);
  write(PROGRESS_KEY, all.slice(0, MAX_PROGRESS));
}

export function removeFromContinue(mediaType: TmdbMediaType, id: number): void {
  write(PROGRESS_KEY, read<ContinueEntry[]>(PROGRESS_KEY, []).filter(e => !(e.mediaType === mediaType && e.id === id)));
}

/** Estimated progress after `elapsedSec` of playback (runtime in minutes). */
export function estimateProgress(elapsedSec: number, runtimeMin: number | null): number {
  const total = (runtimeMin ?? 110) * 60; // sensible default for movies
  return Math.min(elapsedSec / Math.max(total, 60), 1);
}
