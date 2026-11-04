// v5.0.0 — TMDB (The Movie Database) service for the Entertainment mode.
// All TMDB requests run in the MAIN process (Node) — the renderer never
// talks to TMDB directly, so the CSP doesn't need to allow api.themoviedb.org
// in connect-src. Images (image.tmdb.org) load in the renderer under the
// existing https: img-src; trailers embed via the existing YouTube frame-src.

const TMDB_KEY = "f71458d399e1eb9bdbfdc1c3318f5f75";
const BASE = "https://api.themoviedb.org/3";

interface TmdbPage {
  page: number;
  results: TmdbMovieRaw[];
  total_pages: number;
  total_results: number;
}

interface TmdbMultiPage {
  page: number;
  results: TmdbMultiRaw[];
  total_pages: number;
  total_results: number;
}

interface TmdbMovieRaw {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string;
  genre_ids?: number[];
  media_type?: string;
}

interface TmdbMultiRaw {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
}

/** Core fetch — appends the API key + language, throws on HTTP errors. */
async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", TMDB_KEY);
  // Prefer English releases (original titles for foreign films) + adult filter off.
  url.searchParams.set("language", "en-US");
  url.searchParams.set("include_adult", "false");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/** Normalize a raw TMDB movie into the shape the renderer expects. */
function normalize(m: TmdbMovieRaw) {
  return {
    id: m.id,
    title: m.title,
    overview: m.overview ?? "",
    posterPath: m.poster_path,
    backdropPath: m.backdrop_path,
    rating: Math.round((m.vote_average ?? 0) * 10) / 10,
    year: m.release_date ? m.release_date.slice(0, 4) : "",
    genreIds: m.genre_ids ?? [],
    mediaType: "movie" as const,
  };
}

/** Normalize a multi/search result (movie or tv) into a unified item. */
function normalizeMulti(m: TmdbMultiRaw): TmdbItem {
  const isTv = m.media_type === "tv" || (!m.title && !!m.name);
  const title = isTv ? (m.name ?? m.original_name ?? "Untitled") : (m.title ?? m.original_title ?? "Untitled");
  const date = isTv ? m.first_air_date : m.release_date;
  return {
    id: m.id,
    title,
    overview: m.overview ?? "",
    posterPath: m.poster_path ?? null,
    backdropPath: m.backdrop_path ?? null,
    rating: Math.round((m.vote_average ?? 0) * 10) / 10,
    year: date ? date.slice(0, 4) : "",
    genreIds: m.genre_ids ?? [],
    mediaType: isTv ? "tv" : "movie",
  };
}

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

/** Unified item (movie or tv) used by the browse/search UI. */
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

// ─── Endpoints ─────────────────────────────────────────────────────────────

export async function tmdbTrending(): Promise<TmdbMovie[]> {
  const d = await tmdb<TmdbPage>("/trending/movie/week");
  return d.results.filter(m => m.title).map(normalize);
}

/** Trending across movies AND tv (for the hero + first carousel). */
export async function tmdbTrendingAll(): Promise<TmdbItem[]> {
  const d = await tmdb<TmdbMultiPage>("/trending/all/week");
  return d.results
    .filter(m => (m.media_type === "movie" || m.media_type === "tv") && (m.poster_path || m.backdrop_path))
    .map(normalizeMulti);
}

export async function tmdbPopular(page = 1): Promise<TmdbMovie[]> {
  const d = await tmdb<TmdbPage>("/movie/popular", { page: String(page) });
  return d.results.map(normalize);
}

export async function tmdbTopRated(page = 1): Promise<TmdbMovie[]> {
  const d = await tmdb<TmdbPage>("/movie/top_rated", { page: String(page) });
  return d.results.map(normalize);
}

export async function tmdbNowPlaying(page = 1): Promise<TmdbMovie[]> {
  const d = await tmdb<TmdbPage>("/movie/now_playing", { page: String(page) });
  return d.results.map(normalize);
}

/** Popular TV series — returns unified items with mediaType: "tv". */
export async function tmdbPopularTv(page = 1): Promise<TmdbItem[]> {
  const d = await tmdb<TmdbMultiPage>("/tv/popular", { page: String(page) });
  return d.results.map(m => normalizeMulti({ ...m, media_type: "tv" }));
}

/** Top-rated TV series. */
export async function tmdbTopRatedTv(page = 1): Promise<TmdbItem[]> {
  const d = await tmdb<TmdbMultiPage>("/tv/top_rated", { page: String(page) });
  return d.results.map(m => normalizeMulti({ ...m, media_type: "tv" }));
}

export async function tmdbByGenre(genreId: number, page = 1): Promise<TmdbMovie[]> {
  const d = await tmdb<TmdbPage>("/discover/movie", {
    with_genres: String(genreId),
    sort_by: "popularity.desc",
    "vote_count.gte": "200",
    page: String(page),
  });
  return d.results.map(normalize);
}

/** Discover TV by genre — v6.0.0 Entertainment browse. */
export async function tmdbByGenreTv(genreId: number, page = 1): Promise<TmdbItem[]> {
  const d = await tmdb<TmdbMultiPage>("/discover/tv", {
    with_genres: String(genreId),
    sort_by: "popularity.desc",
    "vote_count.gte": "100",
    page: String(page),
  });
  return d.results.map(m => normalizeMulti({ ...m, media_type: "tv" }));
}

/** Recommendations ("More like this") for a movie or TV show. */
export async function tmdbRecommendations(mediaType: "movie" | "tv", id: number): Promise<TmdbItem[]> {
  const d = await tmdb<TmdbMultiPage>(`/${mediaType}/${id}/recommendations`);
  return (d.results ?? [])
    .filter(m => m.poster_path || m.backdrop_path)
    .map(m => normalizeMulti({ ...m, media_type: mediaType }));
}

export async function tmdbSearch(query: string): Promise<TmdbMovie[]> {
  if (!query.trim()) return [];
  const d = await tmdb<TmdbPage>("/search/movie", { query: query.trim() });
  return d.results.filter(m => m.title).map(normalize);
}

/** Multi-search across movies + tv (filters out person results + no-poster). */
export async function tmdbSearchMulti(query: string): Promise<TmdbItem[]> {
  if (!query.trim()) return [];
  const d = await tmdb<TmdbMultiPage>("/search/multi", { query: query.trim() });
  return d.results
    .filter(m => (m.media_type === "movie" || m.media_type === "tv") && !!m.poster_path)
    .map(normalizeMulti);
}

export interface TmdbWatchProvider {
  providerId: number;
  providerName: string;
  logoPath: string | null;
}

export interface TmdbMovieDetails extends TmdbMovie {
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

/** Pick the best YouTube trailer key from a TMDB videos list. */
function pickTrailer(
  vids: Array<{ key: string; site: string; type: string; official: boolean }>,
): string | null {
  const yt = vids.filter(v => v.site === "YouTube");
  if (!yt.length) return null;
  return (
    yt.find(v => v.type === "Trailer" && v.official) ??
    yt.find(v => v.type === "Trailer") ??
    yt.find(v => v.official) ??
    yt[0]
  )?.key ?? null;
}

export async function tmdbDetails(id: number): Promise<TmdbMovieDetails> {
  interface RawDetails extends TmdbMovieRaw {
    tagline: string | null;
    runtime: number | null;
    status: string | null;
    homepage: string | null;
    imdb_id: string | null;
    genres: Array<{ id: number; name: string }>;
    videos?: { results: Array<{ key: string; name: string; site: string; type: string; official: boolean }> };
    credits?: {
      cast: Array<{ id: number; name: string; character: string; profile_path: string | null }>;
      crew: Array<{ id: number; name: string; job: string }>;
    };
    "watch/providers"?: {
      results?: Record<string, {
        link?: string;
        flatrate?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
        rent?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
        buy?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      }>;
    };
  }
  const m = await tmdb<RawDetails>(`/movie/${id}`, {
    append_to_response: "videos,credits,watch/providers",
  });
  const trailer = pickTrailer(m.videos?.results ?? []);
  const director = m.credits?.crew?.find(c => c.job === "Director")?.name ?? null;
  const usProviders = m["watch/providers"]?.results?.US;
  const allProviders = [
    ...(usProviders?.flatrate ?? []),
    ...(usProviders?.rent ?? []),
    ...(usProviders?.buy ?? []),
  ];
  const providers: TmdbWatchProvider[] | null = allProviders.length
    ? Array.from(new Map(allProviders.map(p => [p.provider_id, {
        providerId: p.provider_id,
        providerName: p.provider_name,
        logoPath: p.logo_path,
      }])).values())
    : null;
  return {
    ...normalize(m),
    tagline: m.tagline ?? null,
    runtime: m.runtime ?? null,
    status: m.status ?? null,
    homepage: m.homepage ?? null,
    imdbId: m.imdb_id ?? null,
    genres: m.genres ?? [],
    cast: (m.credits?.cast ?? []).slice(0, 15).map(c => ({
      id: c.id, name: c.name, character: c.character, profilePath: c.profile_path,
    })),
    director,
    trailerKey: trailer,
    providers,
    providerLink: usProviders?.link ?? null,
    numberOfSeasons: null,
    numberOfEpisodes: null,
  };
}

/** TV details — unified shape so the renderer's detail dialog handles both. */
export async function tmdbDetailsTv(id: number): Promise<TmdbMovieDetails> {
  interface RawTvDetails {
    id: number;
    name: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    vote_average: number;
    first_air_date: string;
    tagline: string | null;
    status: string | null;
    homepage: string | null;
    number_of_seasons: number;
    number_of_episodes: number;
    episode_run_time: number[];
    genres: Array<{ id: number; name: string }>;
    videos?: { results: Array<{ key: string; name: string; site: string; type: string; official: boolean }> };
    credits?: {
      cast: Array<{ id: number; name: string; character: string; profile_path: string | null }>;
      crew: Array<{ id: number; name: string; job: string }>;
    };
    "watch/providers"?: {
      results?: Record<string, {
        link?: string;
        flatrate?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
        rent?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
        buy?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      }>;
    };
  }
  const m = await tmdb<RawTvDetails>(`/tv/${id}`, {
    append_to_response: "videos,credits,watch/providers",
  });
  const trailer = pickTrailer(m.videos?.results ?? []);
  const usProviders = m["watch/providers"]?.results?.US;
  const allProviders = [
    ...(usProviders?.flatrate ?? []),
    ...(usProviders?.rent ?? []),
    ...(usProviders?.buy ?? []),
  ];
  const providers: TmdbWatchProvider[] | null = allProviders.length
    ? Array.from(new Map(allProviders.map(p => [p.provider_id, {
        providerId: p.provider_id,
        providerName: p.provider_name,
        logoPath: p.logo_path,
      }])).values())
    : null;
  const runtime = m.episode_run_time?.length ? m.episode_run_time[0] : null;
  return {
    id: m.id,
    title: m.name,
    overview: m.overview ?? "",
    posterPath: m.poster_path,
    backdropPath: m.backdrop_path,
    rating: Math.round((m.vote_average ?? 0) * 10) / 10,
    year: m.first_air_date ? m.first_air_date.slice(0, 4) : "",
    genreIds: [],
    mediaType: "movie", // shape-compatible (renderer overrides label via mediaType param)
    tagline: m.tagline ?? null,
    runtime,
    status: m.status ?? null,
    homepage: m.homepage ?? null,
    imdbId: null,
    genres: m.genres ?? [],
    cast: (m.credits?.cast ?? []).slice(0, 15).map(c => ({
      id: c.id, name: c.name, character: c.character, profilePath: c.profile_path,
    })),
    director: null,
    trailerKey: trailer,
    providers,
    providerLink: usProviders?.link ?? null,
    numberOfSeasons: m.number_of_seasons ?? null,
    numberOfEpisodes: m.number_of_episodes ?? null,
  };
}

/** Unified details dispatcher — the renderer calls this with mediaType + id. */
export async function tmdbDetailsAny(mediaType: "movie" | "tv", id: number): Promise<TmdbMovieDetails> {
  return mediaType === "tv" ? tmdbDetailsTv(id) : tmdbDetails(id);
}

// ─── v8.0.0 — Season episodes (series detail "Episodes" tab) ────────────────

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

/** Fetch the full episode list for a TV season. v8.0.0. */
export async function tmdbSeasonEpisodes(tvId: number, seasonNumber: number): Promise<TmdbSeason> {
  interface RawSeason {
    id: number;
    name: string;
    overview: string;
    poster_path: string | null;
    season_number: number;
    air_date: string | null;
    episodes: Array<{
      id: number;
      name: string;
      overview: string;
      episode_number: number;
      season_number: number;
      still_path: string | null;
      runtime: number | null;
      air_date: string | null;
      vote_average: number;
    }>;
  }
  const s = Math.max(0, seasonNumber);
  const m = await tmdb<RawSeason>(`/tv/${tvId}/season/${s}`);
  return {
    seasonNumber: m.season_number ?? s,
    name: m.name ?? `Season ${s}`,
    overview: m.overview ?? "",
    posterPath: m.poster_path ?? null,
    episodes: (m.episodes ?? []).map(e => ({
      id: e.id,
      episodeNumber: e.episode_number,
      seasonNumber: e.season_number,
      name: e.name || `Episode ${e.episode_number}`,
      overview: e.overview ?? "",
      stillPath: e.still_path ?? null,
      runtime: e.runtime ?? null,
      airDate: e.air_date ?? null,
      rating: Math.round((e.vote_average ?? 0) * 10) / 10,
    })),
  };
}

// ─── v8.0.0 — Upcoming movies (home "Coming Soon" rail) ─────────────────────

export async function tmdbUpcoming(page = 1): Promise<TmdbMovie[]> {
  const d = await tmdb<TmdbPage>("/movie/upcoming", { page: String(page) });
  return d.results.filter(m => m.title).map(normalize);
}

// ─── v8.0.0 — Discover with filters (enhanced search) ───────────────────────

export interface DiscoverFilters {
  mediaType: "movie" | "tv";
  genreIds?: number[];
  yearFrom?: number | null;
  yearTo?: number | null;
  minRating?: number | null;
  sortBy?: "popularity.desc" | "vote_average.desc" | "primary_release_date.desc" | "release_date.desc" | "original_title.asc";
}

/**
 * Filtered discovery across movies or TV. Supports multiple genres, year range,
 * minimum vote-average, and sort order. v8.0.0 powers the enhanced search.
 */
export async function tmdbDiscover(filters: DiscoverFilters, page = 1): Promise<TmdbItem[]> {
  const params: Record<string, string> = {
    sort_by: filters.sortBy ?? "popularity.desc",
    "vote_count.gte": filters.minRating ? "300" : "150",
    page: String(page),
  };
  if (filters.genreIds && filters.genreIds.length > 0) {
    params.with_genres = filters.genreIds.join(",");
  }
  if (filters.minRating) {
    params["vote_average.gte"] = String(filters.minRating);
  }
  const path = filters.mediaType === "tv" ? "/discover/tv" : "/discover/movie";
  if (filters.mediaType === "movie") {
    if (filters.yearFrom) params["primary_release_date.gte"] = `${filters.yearFrom}-01-01`;
    if (filters.yearTo) params["primary_release_date.lte"] = `${filters.yearTo}-12-31`;
  } else {
    if (filters.yearFrom) params["first_air_date.gte"] = `${filters.yearFrom}-01-01`;
    if (filters.yearTo) params["first_air_date.lte"] = `${filters.yearTo}-12-31`;
  }
  const d = await tmdb<TmdbMultiPage>(path, params);
  return d.results
    .map(m => normalizeMulti({ ...m, media_type: filters.mediaType }))
    .filter(m => m.posterPath || m.backdropPath);
}

// ─── v8.0.0 — Person search (cast/crew in universal search) ─────────────────

export interface TmdbPerson {
  id: number;
  name: string;
  profilePath: string | null;
  knownFor: string;
  knownForIds: Array<{ mediaType: "movie" | "tv"; id: number; title: string; posterPath: string | null }>;
}

/** Multi-search returning person results too (the search view shows a People row). v8.0.0. */
export async function tmdbSearchPeople(query: string): Promise<TmdbPerson[]> {
  if (!query.trim()) return [];
  interface RawPerson {
    id: number;
    name: string;
    profile_path: string | null;
    known_for_department: string;
    known_for?: Array<{
      id: number;
      media_type?: string;
      title?: string;
      name?: string;
      poster_path?: string | null;
    }>;
  }
  const d = await tmdb<{ results: Array<RawPerson & { media_type?: string }> }>("/search/multi", { query: query.trim() });
  return (d.results ?? [])
    .filter(m => m.media_type === "person")
    .slice(0, 12)
    .map(p => ({
      id: p.id,
      name: p.name,
      profilePath: p.profile_path ?? null,
      knownFor: p.known_for_department || "Acting",
      knownForIds: (p.known_for ?? [])
        .filter(k => k.media_type === "movie" || k.media_type === "tv")
        .slice(0, 6)
        .map(k => ({
          mediaType: (k.media_type === "tv" ? "tv" : "movie") as "movie" | "tv",
          id: k.id,
          title: k.title ?? k.name ?? "Untitled",
          posterPath: k.poster_path ?? null,
        })),
    }));
}

// ─── v9.0.0 — Anime (dedicated tab; TMDB keyword 210024 = "anime") ──────────

/** Popular anime series (TMDB keyword "anime" on TV, sorted by popularity). */
export async function tmdbAnimeTv(page = 1): Promise<TmdbItem[]> {
  const d = await tmdb<TmdbMultiPage>("/discover/tv", {
    with_keywords: "210024",
    sort_by: "popularity.desc",
    "vote_count.gte": "20",
    page: String(page),
  });
  return d.results.map(m => normalizeMulti({ ...m, media_type: "tv" }));
}

/** Top-rated anime series. */
export async function tmdbAnimeTopRated(): Promise<TmdbItem[]> {
  const d = await tmdb<TmdbMultiPage>("/discover/tv", {
    with_keywords: "210024",
    sort_by: "vote_average.desc",
    "vote_count.gte": "200",
    page: "1",
  });
  return d.results.map(m => normalizeMulti({ ...m, media_type: "tv" }));
}

/** Anime movies (Japanese animation: genre 16 + original language ja). */
export async function tmdbAnimeMovies(page = 1): Promise<TmdbItem[]> {
  const d = await tmdb<TmdbMultiPage>("/discover/movie", {
    with_genres: "16",
    with_original_language: "ja",
    sort_by: "popularity.desc",
    "vote_count.gte": "50",
    page: String(page),
  });
  return d.results.map(m => normalizeMulti({ ...m, media_type: "movie" }));
}
