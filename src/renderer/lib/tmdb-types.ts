// Renderer-side TMDB types + helpers.
// The actual TMDB fetches happen in the MAIN process (src/main/tmdb.ts) and
// arrive via window.nexus.tmdb* IPC. These types mirror the main-process
// shapes so the renderer can stay typed.

export type TmdbMediaType = "movie" | "tv";

export interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number;
  year: string;
  genreIds: number[];
  mediaType: "movie";
}

export interface TmdbItem {
  id: number;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number;
  year: string;
  genreIds: number[];
  mediaType: "movie" | "tv";
}

export interface TmdbWatchProvider {
  providerId: number;
  providerName: string;
  logoPath: string | null;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number;
  year: string;
  genreIds: number[];
  mediaType: "movie";
  tagline: string | null;
  runtime: number | null;
  status: string | null;
  genres: Array<{ id: number; name: string }>;
  cast: Array<{ id: number; name: string; character: string; profilePath: string | null }>;
  director: string | null;
  trailerKey: string | null;
  homepage: string | null;
  imdbId: string | null;
  providers: TmdbWatchProvider[] | null;
  providerLink: string | null;
  /** TV only — null for movies. Used by the player's season/episode selector. */
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
}

export interface TmdbError {
  error: string;
}

/** TMDB image URL helper. path is the TMDB poster/backdrop/profile path. */
export function tmdbImg(
  path: string | null | undefined,
  size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "w1280" | "original" = "w500",
): string | undefined {
  if (!path) return undefined;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

/** Returns true if a TMDB IPC result is an error envelope. */
export function isTmdbError(r: unknown): r is TmdbError {
  return typeof r === "object" && r !== null && "error" in r && typeof (r as { error: unknown }).error === "string";
}

/** Narrow + cast an IPC result to TmdbMovie[] (or []). */
export function asMovies(r: unknown): TmdbMovie[] {
  if (isTmdbError(r) || !Array.isArray(r)) return [];
  return r as TmdbMovie[];
}

/** Narrow + cast an IPC result to TmdbItem[] (or []). */
export function asItems(r: unknown): TmdbItem[] {
  if (isTmdbError(r) || !Array.isArray(r)) return [];
  return r as TmdbItem[];
}

/** Narrow + cast an IPC result to TmdbMovieDetails (or null). */
export function asDetails(r: unknown): TmdbMovieDetails | null {
  if (isTmdbError(r) || typeof r !== "object" || r === null) return null;
  return r as TmdbMovieDetails;
}

export function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatRating(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(1);
}

/**
 * CineSrc embed URL — cinesrc.st is a free streaming API that embeds movies &
 * TV shows by TMDB ID (no scraping; it indexes streams against TMDB IDs).
 *  - Movie: https://cinesrc.st/embed/movie/{tmdbId}
 *  - TV:    https://cinesrc.st/embed/tv/{tmdbId}?season={s}&episode={e}
 * The embed pages return 200 with no X-Frame-Options, so they iframe cleanly.
 */
export function cinesrcEmbedUrl(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season?: number,
  episode?: number,
): string {
  if (mediaType === "tv") {
    const s = Math.max(1, season ?? 1);
    const e = Math.max(1, episode ?? 1);
    return `https://cinesrc.st/embed/tv/${tmdbId}?season=${s}&episode=${e}`;
  }
  return `https://cinesrc.st/embed/movie/${tmdbId}`;
}

// ─── TMDB genre catalog (stable IDs — hardcoded, no API round-trip) ─────────

export interface GenreDef {
  id: number;
  name: string;
}

export const MOVIE_GENRES: GenreDef[] = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Sci-Fi" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
];

export const TV_GENRES: GenreDef[] = [
  { id: 10759, name: "Action & Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 9648, name: "Mystery" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10768, name: "War & Politics" },
  { id: 37, name: "Western" },
];
