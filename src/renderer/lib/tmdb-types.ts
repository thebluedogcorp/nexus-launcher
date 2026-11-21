// Renderer-side TMDB types + helpers.
// The actual TMDB fetches happen in the MAIN process (src/main/tmdb.ts) and
// arrive via window.nexus.tmdb* IPC. These types mirror the main-process
// shapes so the renderer can stay typed.
//
// v9.2.0 — Third-party stream embedding (CineSrc / 2Embed / VidSrc) and the
// associated StreamSource / StreamLanguage types and URL builders have been
// removed. Entertainment is now browse-only: TMDB metadata + YouTube trailers.
// A local media server (stream your own files) arrives in v9.3.0.

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

// ─── v8.0.0 — Episode / Season (series detail "Episodes" tab) ───────────────

export interface TmdbEpisode {
  id: number;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview: string;
  stillPath: string | null;
  runtime: number | null;
  airDate: string | null;
  rating: number;
}

export interface TmdbSeason {
  seasonNumber: number;
  name: string;
  overview: string;
  posterPath: string | null;
  episodes: TmdbEpisode[];
}

export interface TmdbPerson {
  id: number;
  name: string;
  profilePath: string | null;
  knownFor: string;
  knownForIds: Array<{ mediaType: TmdbMediaType; id: number; title: string; posterPath: string | null }>;
}

/** Narrow + cast a tmdb:seasonEpisodes IPC result (or null). */
export function asSeason(r: unknown): TmdbSeason | null {
  if (isTmdbError(r) || typeof r !== "object" || r === null) return null;
  return r as TmdbSeason;
}

/** Narrow + cast a tmdb:searchPeople IPC result (or []). */
export function asPeople(r: unknown): TmdbPerson[] {
  if (isTmdbError(r) || !Array.isArray(r)) return [];
  return r as TmdbPerson[];
}

/** Format an episode air date (YYYY-MM-DD) into a readable form. */
export function formatAirDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
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

/** True if the title was released within the last ~18 months (a "NEW" badge). */
export function isNewRelease(year: string | undefined): boolean {
  if (!year) return false;
  const y = parseInt(year, 10);
  if (isNaN(y)) return false;
  const now = new Date();
  return y >= now.getFullYear() - 1;
}

/**
 * Curated list of popular Hollywood / international titles widely available
 * with Hindi dubs. TMDB IDs are stable; the Hindi-language cinema hub fetches
 * full details (poster/title) per id at view-open time. Used by the
 * "Hollywood in Hindi" rail in the Hindi Dub hub (browse-only — surfaces
 * titles likely to have Hindi dubs on legitimate services).
 */
export const HINDI_DUBBED_HITS: ReadonlyArray<{ id: number; title: string }> = [
  { id: 299534, title: "Avengers: Endgame" },
  { id: 299536, title: "Avengers: Infinity War" },
  { id: 24428, title: "The Avengers" },
  { id: 1726, title: "Iron Man" },
  { id: 284054, title: "Black Panther" },
  { id: 271110, title: "Captain America: Civil War" },
  { id: 118340, title: "Guardians of the Galaxy" },
  { id: 19995, title: "Avatar" },
  { id: 76600, title: "Avatar: The Way of Water" },
  { id: 138843, title: "Furious 7" },
  { id: 337401, title: "F9: The Fast Saga" },
  { id: 293660, title: "Jurassic World" },
  { id: 82856, title: "Jurassic World Dominion" },
  { id: 603, title: "The Matrix" },
  { id: 155, title: "The Dark Knight" },
  { id: 49047, title: "Aquaman" },
  { id: 72190, title: "Wonder Woman" },
  { id: 497698, title: "Black Widow" },
];

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
