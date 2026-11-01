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
