// v7.2.0 — Entertainment user data stores: ratings, reviews, collections, stats.
// All persist locally (localStorage). Extends ent-store (list/continue/history).

import type { TmdbMediaType } from "./tmdb-types";

// ─── User Ratings (1-10 per title) ──────────────────────────────────────────
const RATINGS_KEY = "nx-ent-ratings";

export function getRating(mediaType: TmdbMediaType, id: number): number {
  try {
    const all = JSON.parse(localStorage.getItem(RATINGS_KEY) || "{}") as Record<string, number>;
    return all[`${mediaType}-${id}`] ?? 0;
  } catch { return 0; }
}

export function setRating(mediaType: TmdbMediaType, id: number, rating: number): void {
  try {
    const all = JSON.parse(localStorage.getItem(RATINGS_KEY) || "{}") as Record<string, number>;
    const key = `${mediaType}-${id}`;
    if (rating <= 0) delete all[key];
    else all[key] = Math.max(1, Math.min(10, Math.round(rating)));
    localStorage.setItem(RATINGS_KEY, JSON.stringify(all));
  } catch { /* non-fatal */ }
}

export function getAllRatings(): Array<{ mediaType: TmdbMediaType; id: number; rating: number }> {
  try {
    const all = JSON.parse(localStorage.getItem(RATINGS_KEY) || "{}") as Record<string, number>;
    return Object.entries(all).map(([k, rating]) => {
      const [mediaType, id] = k.split("-") as [TmdbMediaType, string];
      return { mediaType, id: Number(id), rating };
    });
  } catch { return []; }
}

// ─── Reviews / Notes (per title) ────────────────────────────────────────────
const REVIEWS_KEY = "nx-ent-reviews";

export interface Review {
  mediaType: TmdbMediaType;
  id: number;
  title: string;
  text: string;
  updatedAt: number;
}

export function getReview(mediaType: TmdbMediaType, id: number): Review | null {
  try {
    const all = JSON.parse(localStorage.getItem(REVIEWS_KEY) || "{}") as Record<string, Review>;
    return all[`${mediaType}-${id}`] ?? null;
  } catch { return null; }
}

export function setReview(r: Omit<Review, "updatedAt">): void {
  try {
    const all = JSON.parse(localStorage.getItem(REVIEWS_KEY) || "{}") as Record<string, Review>;
    all[`${r.mediaType}-${r.id}`] = { ...r, updatedAt: Date.now() };
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(all));
  } catch { /* non-fatal */ }
}

export function deleteReview(mediaType: TmdbMediaType, id: number): void {
  try {
    const all = JSON.parse(localStorage.getItem(REVIEWS_KEY) || "{}") as Record<string, Review>;
    delete all[`${mediaType}-${id}`];
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(all));
  } catch { /* non-fatal */ }
}

export function getAllReviews(): Review[] {
  try {
    const all = JSON.parse(localStorage.getItem(REVIEWS_KEY) || "{}") as Record<string, Review>;
    return Object.values(all).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

// ─── Custom Collections (user playlists) ────────────────────────────────────
const COLLECTIONS_KEY = "nx-ent-collections";

export interface Collection {
  id: string;
  name: string;
  description: string;
  items: Array<{ mediaType: TmdbMediaType; id: number; title: string; posterPath: string | null }>;
  createdAt: number;
  updatedAt: number;
}

export function getCollections(): Collection[] {
  try {
    const all = JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || "[]") as Collection[];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export function createCollection(name: string, description = ""): Collection {
  const all = getCollections();
  const c: Collection = {
    id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "Untitled Collection",
    description,
    items: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  all.unshift(c);
  try { localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(all)); } catch { /* non-fatal */ }
  return c;
}

export function deleteCollection(id: string): void {
  const all = getCollections().filter(c => c.id !== id);
  try { localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(all)); } catch { /* non-fatal */ }
}

export function addToCollection(collectionId: string, item: { mediaType: TmdbMediaType; id: number; title: string; posterPath: string | null }): void {
  const all = getCollections();
  const c = all.find(c => c.id === collectionId);
  if (!c) return;
  if (!c.items.some(i => i.mediaType === item.mediaType && i.id === item.id)) {
    c.items.push(item);
    c.updatedAt = Date.now();
    try { localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(all)); } catch { /* non-fatal */ }
  }
}

export function removeFromCollection(collectionId: string, mediaType: TmdbMediaType, id: number): void {
  const all = getCollections();
  const c = all.find(c => c.id === collectionId);
  if (!c) return;
  c.items = c.items.filter(i => !(i.mediaType === mediaType && i.id === id));
  c.updatedAt = Date.now();
  try { localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(all)); } catch { /* non-fatal */ }
}

// ─── Statistics ─────────────────────────────────────────────────────────────
export interface EntStats {
  myListCount: number;
  continueCount: number;
  historyCount: number;
  ratedCount: number;
  reviewedCount: number;
  collectionsCount: number;
  collectionItemsCount: number;
  avgRating: number;
  topGenres: Array<{ genre: string; count: number }>;
}

export function getStats(genreCatalog: Array<{ id: number; name: string }>): EntStats {
  const ratings = getAllRatings();
  const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length : 0;
  // Count genres from history (approximation — uses the genre catalog)
  return {
    myListCount: 0, // set by caller from getList()
    continueCount: 0,
    historyCount: 0,
    ratedCount: ratings.length,
    reviewedCount: getAllReviews().length,
    collectionsCount: getCollections().length,
    collectionItemsCount: getCollections().reduce((s, c) => s + c.items.length, 0),
    avgRating: Math.round(avgRating * 10) / 10,
    topGenres: [],
  };
}

// ─── Watch streak (consecutive days with watch activity) ────────────────────
const STREAK_KEY = "nx-ent-streak";

export function getStreak(): { current: number; longest: number; lastWatchDay: string } {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY) || '{"current":0,"longest":0,"lastWatchDay":""}');
  } catch { return { current: 0, longest: 0, lastWatchDay: "" }; }
}

export function recordWatchDay(): { current: number; longest: number } {
  const today = new Date().toISOString().slice(0, 10);
  const s = getStreak();
  if (s.lastWatchDay === today) return { current: s.current, longest: s.longest };
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const current = s.lastWatchDay === yesterday ? s.current + 1 : 1;
  const longest = Math.max(s.longest, current);
  const next = { current, longest, lastWatchDay: today };
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(next)); } catch { /* non-fatal */ }
  return { current, longest };
}

// ─── v8.0.0 — Watched set (mark titles as watched/unwatched) ────────────────
const WATCHED_KEY = "nx-ent-watched";

export function isWatched(mediaType: TmdbMediaType, id: number): boolean {
  try {
    const all = JSON.parse(localStorage.getItem(WATCHED_KEY) || "{}") as Record<string, true>;
    return !!all[`${mediaType}-${id}`];
  } catch { return false; }
}

export function setWatched(mediaType: TmdbMediaType, id: number, watched: boolean): void {
  try {
    const all = JSON.parse(localStorage.getItem(WATCHED_KEY) || "{}") as Record<string, true>;
    const key = `${mediaType}-${id}`;
    if (watched) all[key] = true;
    else delete all[key];
    localStorage.setItem(WATCHED_KEY, JSON.stringify(all));
  } catch { /* non-fatal */ }
}

export function getWatchedKeys(): Array<{ mediaType: TmdbMediaType; id: number }> {
  try {
    const all = JSON.parse(localStorage.getItem(WATCHED_KEY) || "{}") as Record<string, true>;
    return Object.keys(all).map(k => {
      const [mediaType, id] = k.split("-") as [TmdbMediaType, string];
      return { mediaType, id: Number(id) };
    });
  } catch { return []; }
}

// ─── v8.0.0 — Hidden titles (hide from recommendations) ─────────────────────
const HIDDEN_KEY = "nx-ent-hidden";

export function isHidden(mediaType: TmdbMediaType, id: number): boolean {
  try {
    const all = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "{}") as Record<string, true>;
    return !!all[`${mediaType}-${id}`];
  } catch { return false; }
}

export function setHidden(mediaType: TmdbMediaType, id: number, hidden: boolean): void {
  try {
    const all = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "{}") as Record<string, true>;
    const key = `${mediaType}-${id}`;
    if (hidden) all[key] = true;
    else delete all[key];
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(all));
  } catch { /* non-fatal */ }
}

/** Filter a list of items, dropping hidden + (optionally) watched titles. */
export function filterHidden<T extends { mediaType: TmdbMediaType; id: number }>(
  items: T[],
  opts: { dropWatched?: boolean } = {},
): T[] {
  return items.filter(i => !isHidden(i.mediaType, i.id) && (!opts.dropWatched || !isWatched(i.mediaType, i.id)));
}

// ─── v8.0.0 — Search history (recent queries) ───────────────────────────────
const SEARCH_HISTORY_KEY = "nx-ent-search-history";
const MAX_HISTORY = 8;

export function getSearchHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]") as string[];
  } catch { return []; }
}

export function addSearchHistory(query: string): void {
  const q = query.trim();
  if (!q) return;
  const all = getSearchHistory().filter(x => x.toLowerCase() !== q.toLowerCase());
  all.unshift(q);
  try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(all.slice(0, MAX_HISTORY))); } catch { /* non-fatal */ }
}

export function clearSearchHistory(): void {
  try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch { /* non-fatal */ }
}

// ─── v8.0.0 — In-app Notifications store ────────────────────────────────────
const NOTIFICATIONS_KEY = "nx-ent-notifications";
const MAX_NOTIFS = 50;

export interface EntNotification {
  id: string;
  kind: "new-episode" | "streak" | "recommendation" | "info";
  title: string;
  body: string;
  /** Optional deep link: which title to open. */
  target?: { mediaType: TmdbMediaType; id: number };
  createdAt: number;
  read: boolean;
}

export function getNotifications(): EntNotification[] {
  try {
    return (JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || "[]") as EntNotification[])
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

export function addNotification(n: Omit<EntNotification, "id" | "createdAt" | "read">): void {
  const all = getNotifications();
  // Dedupe by title within the last 24h.
  const dayAgo = Date.now() - 86400000;
  if (all.some(x => x.title === n.title && x.createdAt > dayAgo)) return;
  all.unshift({ ...n, id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now(), read: false });
  try { localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all.slice(0, MAX_NOTIFS))); } catch { /* non-fatal */ }
}

export function markNotificationRead(id: string): void {
  const all = getNotifications();
  const n = all.find(x => x.id === id);
  if (n) { n.read = true; try { localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all)); } catch { /* non-fatal */ } }
}

export function markAllNotificationsRead(): void {
  const all = getNotifications().map(n => ({ ...n, read: true }));
  try { localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all)); } catch { /* non-fatal */ }
}

export function clearNotifications(): void {
  try { localStorage.removeItem(NOTIFICATIONS_KEY); } catch { /* non-fatal */ }
}

export function unreadNotificationCount(): number {
  return getNotifications().filter(n => !n.read).length;
}

// ─── v8.0.0 — Per-episode watched tracking (series Episodes tab) ────────────
const EP_WATCHED_KEY = "nx-ent-ep-watched";

export function epKey(mediaType: TmdbMediaType, id: number, season: number, episode: number): string {
  return `${mediaType}-${id}-S${season}-E${episode}`;
}

export function isEpisodeWatched(mediaType: TmdbMediaType, id: number, season: number, episode: number): boolean {
  try {
    const all = JSON.parse(localStorage.getItem(EP_WATCHED_KEY) || "{}") as Record<string, true>;
    return !!all[epKey(mediaType, id, season, episode)];
  } catch { return false; }
}

export function setEpisodeWatched(mediaType: TmdbMediaType, id: number, season: number, episode: number, watched: boolean): void {
  try {
    const all = JSON.parse(localStorage.getItem(EP_WATCHED_KEY) || "{}") as Record<string, true>;
    const k = epKey(mediaType, id, season, episode);
    if (watched) all[k] = true;
    else delete all[k];
    localStorage.setItem(EP_WATCHED_KEY, JSON.stringify(all));
  } catch { /* non-fatal */ }
}

/** Count how many episodes of a given season are marked watched. */
export function countSeasonWatched(mediaType: TmdbMediaType, id: number, season: number, episodeCount: number): number {
  let n = 0;
  for (let e = 1; e <= episodeCount; e++) if (isEpisodeWatched(mediaType, id, season, e)) n++;
  return n;
}

// ─── v9.0.0 — Profile (display name + member since) ─────────────────────────
const PROFILE_KEY = "nx-ent-profile";

export interface EntProfile {
  name: string;
  memberSince: number;
}

export function getProfile(): EntProfile {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null") as EntProfile | null;
    if (p?.name) return p;
  } catch { /* fallthrough */ }
  // First run — stamp the member-since date.
  const fresh: EntProfile = { name: "Viewer", memberSince: Date.now() };
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(fresh)); } catch { /* non-fatal */ }
  return fresh;
}

export function setProfileName(name: string): void {
  const p = getProfile();
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...p, name: name.trim().slice(0, 24) || "Viewer" })); } catch { /* non-fatal */ }
}
