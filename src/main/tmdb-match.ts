// E1 — TMDB identification for local media rows.
//
// Bridges the user's media table to the existing server-side TMDB service
// (src/main/tmdb.ts). The TMDB API key stays server-side — it's never sent
// to the renderer. The renderer asks "auto-identify this media row" /
// "search TMDB for this title" / "identify this row as TMDB id X" through
// IPC; this module does the work in the main process.
//
// Strategy:
//   • autoIdentifyMedia(mediaId) — parse the row's title + year + season/
//     episode, call tmdbSearchMulti (or tmdbSearch for movies-only), pick the
//     best match by normalized title similarity + year, and only WRITE the
//     metadata when confidence is high. Low-confidence → return candidates
//     so the UI can prompt the user to pick.
//   • searchTmdbForMedia(query, mediaType) — return candidate results for
//     the manual identification picker.
//   • identifyMediaAs(mediaId, tmdbId, mediaType) — fetch full details +
//     write metadata. For TV, also fetch tmdbSeasonEpisodes for available
//     seasons so the UI can map episode rows.

import type {
  MediaItem,
  MediaTmdbCandidate,
  MediaAutoIdentifyResult,
} from "@shared/types";
import {
  getMedia,
  upsertMediaMetadata,
  listEpisodes,
  listSeasons,
  findEpisode,
} from "./db";
import {
  tmdbSearchMulti,
  tmdbSearch,
  tmdbDetailsAny,
  tmdbSeasonEpisodes,
  type TmdbItem,
  type TmdbMovieDetails,
} from "./tmdb";

// Confidence threshold above which auto-identification commits the match
// without prompting. Tuned to be conservative — false positives are worse
// than false negatives here (the user can always pick manually).
const AUTO_COMMIT_THRESHOLD = 0.82;

/** Levenshtein distance, scaled to [0, 1] similarity. */
function titleSimilarity(a: string, b: string): number {
  const A = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const B = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!A || !B) return 0;
  if (A === B) return 1;
  // Standard DP Levenshtein.
  const m = A.length;
  const n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}

/** Convert a TMDB multi-search result item into a candidate. */
function itemToCandidate(m: TmdbItem): MediaTmdbCandidate {
  return {
    tmdbId: m.id,
    mediaType: m.mediaType,
    title: m.title,
    year: m.year,
    overview: m.overview,
    posterPath: m.posterPath,
    rating: m.rating,
  };
}

/**
 * Auto-identify a media row. For TV episode rows, the show row is what gets
 * identified (the row's tvShowId points at it). For movies + TV shows, the
 * row itself is identified.
 *
 * Returns:
 *   - { matched: true, confidence, applied } when a high-confidence match
 *     was found and committed.
 *   - { matched: false, confidence, candidates } when no confident match
 *     was found — the UI shows the candidates for the user to pick.
 */
export async function autoIdentifyMedia(mediaId: number): Promise<MediaAutoIdentifyResult> {
  const row = getMedia(mediaId);
  if (!row) {
    return { matched: false, confidence: 0, applied: null, candidates: [] };
  }

  // If the row is an episode, identify the show row instead. Episodes inherit
  // the show's tmdbId.
  let targetRow: MediaItem = row;
  if (row.tvShowId && row.mediaType === "tv") {
    const show = getMedia(row.tvShowId);
    if (show) targetRow = show;
  }

  // Skip if locked.
  if (targetRow.locked) {
    return { matched: false, confidence: 0, applied: targetRow, candidates: [] };
  }

  const query = targetRow.title.trim();
  if (!query) {
    return { matched: false, confidence: 0, applied: targetRow, candidates: [] };
  }

  // Search TMDB multi (movies + tv). For a TV library, prefer tv matches;
  // for a movies library, prefer movie matches — but we accept either.
  let results: TmdbItem[] = [];
  try {
    results = await tmdbSearchMulti(query);
  } catch {
    // Fall back to movies-only search if multi fails (e.g. transient error).
    try {
      const movies = await tmdbSearch(query);
      results = movies.map((m): TmdbItem => ({
        id: m.id,
        title: m.title,
        overview: m.overview,
        posterPath: m.posterPath,
        backdropPath: m.backdropPath,
        rating: m.rating,
        year: m.year,
        genreIds: m.genreIds,
        mediaType: "movie",
      }));
    } catch {
      results = [];
    }
  }

  if (results.length === 0) {
    return { matched: false, confidence: 0, applied: targetRow, candidates: [] };
  }

  // Score each result: title similarity (0..1) + year match bonus + mediaType
  // preference bonus (tv library prefers tv results, movie library prefers movies).
  const prefersTv = targetRow.mediaType === "tv";
  const targetYear = targetRow.year;
  const scored = results.map((r) => {
    let score = titleSimilarity(targetRow.title, r.title);
    if (targetYear && r.year) {
      const ry = Number(r.year);
      if (Number.isFinite(ry) && ry === targetYear) score += 0.12;
      else if (Number.isFinite(ry) && Math.abs(ry - targetYear) <= 1) score += 0.04;
    }
    if (prefersTv && r.mediaType === "tv") score += 0.05;
    if (!prefersTv && r.mediaType === "movie") score += 0.05;
    // Penalize "person" or other types — multi already filters, but be safe.
    if (r.mediaType !== "movie" && r.mediaType !== "tv") score -= 0.5;
    return { r, score: Math.max(0, Math.min(1, score)) };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const candidates = scored.slice(0, 6).map((s) => itemToCandidate(s.r));

  if (!best || best.score < AUTO_COMMIT_THRESHOLD) {
    return { matched: false, confidence: best?.score ?? 0, applied: targetRow, candidates };
  }

  // High confidence — fetch full details + commit.
  try {
    const updated = await identifyMediaAs(targetRow.id, best.r.id, best.r.mediaType);
    return {
      matched: true,
      confidence: best.score,
      applied: updated ?? targetRow,
      candidates,
    };
  } catch {
    return { matched: false, confidence: best.score, applied: targetRow, candidates };
  }
}

/** Search TMDB for candidates (manual identification picker). */
export async function searchTmdbForMedia(
  query: string,
  mediaType?: "movie" | "tv",
): Promise<MediaTmdbCandidate[]> {
  const q = (query ?? "").trim();
  if (!q) return [];
  let results: TmdbItem[] = [];
  if (mediaType === "movie") {
    const movies = await tmdbSearch(q);
    results = movies.map((m): TmdbItem => ({ ...m, mediaType: "movie" }));
  } else {
    results = await tmdbSearchMulti(q);
    if (mediaType === "tv") results = results.filter((r) => r.mediaType === "tv");
  }
  return results.slice(0, 12).map(itemToCandidate);
}

/**
 * Identify a media row as a specific TMDB id + type. Fetches full details
 * (overview, genres, runtime, rating, poster/backdrop) and writes them to
 * the row. For TV, also fetches season-episode lists from TMDB so the UI can
 * map the local episode rows to canonical episode metadata (we don't overwrite
 * the local episode rows' filePath/title — they're real files; we just
 * optionally patch their tmdbId + episode numbers to match the show).
 */
export async function identifyMediaAs(
  mediaId: number,
  tmdbId: number,
  mediaType: "movie" | "tv",
): Promise<MediaItem | null> {
  const row = getMedia(mediaId);
  if (!row) return null;

  const details: TmdbMovieDetails = await tmdbDetailsAny(mediaType, tmdbId);
  const yearNum = details.year ? Number(details.year) : null;
  const updated = upsertMediaMetadata(mediaId, {
    tmdbId: details.id,
    mediaType,
    title: details.title,            // trust TMDB's canonical title
    year: Number.isFinite(yearNum) ? yearNum : null,
    overview: details.overview,
    posterPath: details.posterPath,
    backdropPath: details.backdropPath,
    genres: (details.genres ?? []).map((g) => g.name),
    runtimeMin: details.runtime ?? null,
    rating: details.rating ?? null,
    matchedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
  if (!updated) return null;

  // For TV: also patch every episode row under this show to inherit the
  // show's tmdbId, and pull TMDB season/episode lists so we can update
  // episode numbers on local rows that had no parsed SxxExx marker.
  if (mediaType === "tv") {
    try {
      await syncTvEpisodesFromTmdb(mediaId, tmdbId);
    } catch {
      // Non-fatal — the show row is already matched; episodes just won't be
      // cross-referenced with TMDB episode numbers this pass.
    }
  }

  return getMedia(mediaId);
}

/**
 * For each season present locally (or the first 5 TMDB seasons if the local
 * show has no episodes yet), fetch the canonical TMDB episode list and
 * cross-reference. We DO NOT insert episode rows here (a row must map to a
 * real file on disk — never invented). We only patch existing episode rows'
 * tmdbId + (if missing) season/episode numbers to match the canonical order
 * when the local episode index matches the TMDB episode index.
 */
async function syncTvEpisodesFromTmdb(tvShowId: number, tmdbId: number): Promise<void> {
  const localSeasons = listSeasons(tvShowId);
  const seasonsToFetch = localSeasons.length > 0 ? localSeasons.slice(0, 10) : [1];

  for (const seasonNumber of seasonsToFetch) {
    let season;
    try {
      season = await tmdbSeasonEpisodes(tmdbId, seasonNumber);
    } catch {
      continue;
    }
    const localEps = listEpisodes(tvShowId, seasonNumber);
    if (localEps.length === 0) continue;
    // Pair local episode N with TMDB episode N (1-based). If the local row's
    // episode is null, stamp it. Otherwise trust the existing scanner parse.
    for (const ep of localEps) {
      const idx = ep.episode ?? (localEps.indexOf(ep) + 1);
      const tmdbEp = season.episodes.find((e) => e.episodeNumber === idx);
      // Inherit the show's tmdbId + use TMDB episode metadata as overview fallback.
      upsertMediaMetadata(ep.id, {
        tmdbId,
        season: ep.season ?? seasonNumber,
        episode: ep.episode ?? idx,
        overview: ep.overview || tmdbEp?.overview || null,
        title: ep.title !== tmdbEp?.name && tmdbEp?.name ? tmdbEp.name : ep.title,
        runtimeMin: ep.runtimeMin ?? tmdbEp?.runtime ?? null,
        rating: ep.rating ?? tmdbEp?.rating ?? null,
        matchedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      });
    }
  }
  void findEpisode; // (kept for future "play SxxEyy" lookups in the LAN API)
}
