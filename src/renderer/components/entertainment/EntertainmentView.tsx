// v5.0.0 — EntertainmentView (NEXUS TV). An OTT-style movie + TV browse
// experience powered by TMDB. Hero banner (trending), multiple poster rails
// (now playing, popular, popular TV, top rated, top rated TV), multi-search,
// and a detail dialog with click-to-play YouTube trailers.
//
// All TMDB data arrives via window.nexus.tmdb* IPC (main-process fetches).

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icons";
import { NexusMark } from "../Logo";
import { EntHero } from "./EntHero";
import { EntCarousel } from "./EntCarousel";
import { EntDetailDialog } from "./EntDetailDialog";
import {
  asItems,
  asMovies,
  type TmdbItem,
  type TmdbMovie,
  type TmdbMediaType,
} from "../../lib/tmdb-types";

interface Props {
  onBackToSplash: () => void;
  onSwitchToGames: () => void;
}

export function EntertainmentView({ onBackToSplash, onSwitchToGames }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<{ mediaType: TmdbMediaType; id: number } | null>(null);

  // Browse data
  const [trending, setTrending] = useState<TmdbItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<TmdbMovie[]>([]);
  const [popular, setPopular] = useState<TmdbMovie[]>([]);
  const [popularTv, setPopularTv] = useState<TmdbItem[]>([]);
  const [topRated, setTopRated] = useState<TmdbMovie[]>([]);
  const [topRatedTv, setTopRatedTv] = useState<TmdbItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);

  // Search data
  const [searchResults, setSearchResults] = useState<TmdbItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Load all browse rails once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBrowseLoading(true);
      const [t, np, pop, ptv, tr, trtv] = await Promise.all([
        window.nexus.tmdbTrendingAll(),
        window.nexus.tmdbNowPlaying(),
        window.nexus.tmdbPopular(),
        window.nexus.tmdbPopularTv(),
        window.nexus.tmdbTopRated(),
        window.nexus.tmdbTopRatedTv(),
      ]);
      if (cancelled) return;
      setTrending(asItems(t));
      setNowPlaying(asMovies(np));
      setPopular(asMovies(pop));
      setPopularTv(asItems(ptv));
      setTopRated(asMovies(tr));
      setTopRatedTv(asItems(trtv));
      setBrowseLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Run multi-search when debounced query >= 2 chars.
  useEffect(() => {
    if (debounced.length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSearchLoading(true);
      const r = await window.nexus.tmdbSearchMulti(debounced);
      if (cancelled) return;
      setSearchResults(asItems(r));
      setSearchLoading(false);
    })();
    return () => { cancelled = true; };
  }, [debounced]);

  const searching = debounced.length >= 2;
  const openDetail = (mediaType: TmdbMediaType, id: number) =>
    setSelected({ mediaType, id });
  const closeDetail = () => setSelected(null);

  const heroItems = useMemo(() => trending.slice(0, 8), [trending]);

  return (
    <div className="ent-root">
      {/* Top bar */}
      <header className="ent-topbar">
        <button className="ent-topbar-back" onClick={onBackToSplash} aria-label="Back to mode selector">
          <Icon.Chevron size={18} />
        </button>
        <div className="ent-topbar-brand">
          <span className="ent-topbar-mark"><NexusMark size={22} /></span>
          <div className="ent-topbar-titles">
            <div className="ent-topbar-title">NEXUS <span className="ent-topbar-tv">TV</span></div>
            <div className="ent-topbar-sub">Films &amp; series · TMDB</div>
          </div>
        </div>

        <div className="ent-topbar-search">
          <Icon.Search size={15} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search movies, shows…"
            autoFocus
          />
          {query && (
            <button className="ent-topbar-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <Icon.Close size={14} />
            </button>
          )}
        </div>

        <button className="ent-topbar-games" onClick={onSwitchToGames} title="Switch to Games mode">
          <Icon.Gamepad size={14} /> <span>Games</span>
        </button>
      </header>

      {/* Body */}
      <main className="ent-main">
        {searching ? (
          <SearchResults
            query={debounced}
            results={searchResults}
            loading={searchLoading}
            onOpen={openDetail}
          />
        ) : (
          <>
            <EntHero
              items={heroItems}
              loading={browseLoading}
              onOpen={openDetail}
              onBackToSplash={onBackToSplash}
            />
            <div className="ent-rails">
              <EntCarousel title="Trending Now" icon={<Icon.TrendingUp size={15} />} items={trending} loading={browseLoading} onOpen={openDetail} />
              <EntCarousel title="Now Playing in Theaters" icon={<Icon.Film size={15} />} items={nowPlaying} forceMediaType="movie" loading={browseLoading} onOpen={openDetail} />
              <EntCarousel title="Popular Movies" icon={<Icon.Play size={15} />} items={popular} forceMediaType="movie" loading={browseLoading} onOpen={openDetail} />
              <EntCarousel title="Popular TV Series" icon={<Icon.Film size={15} />} items={popularTv} forceMediaType="tv" loading={browseLoading} onOpen={openDetail} />
              <EntCarousel title="Top Rated Movies" icon={<Icon.Star size={15} />} items={topRated} forceMediaType="movie" loading={browseLoading} onOpen={openDetail} />
              <EntCarousel title="Top Rated TV Series" icon={<Icon.Star size={15} />} items={topRatedTv} forceMediaType="tv" loading={browseLoading} onOpen={openDetail} />
            </div>
          </>
        )}
      </main>

      {/* Sticky footer */}
      <footer className="ent-foot">
        <div className="ent-foot-brand">
          <span className="ent-foot-mark"><NexusMark size={14} /></span>
          <strong>NEXUS TV</strong> · <span className="ent-foot-dim">Metadata by TMDB</span>
        </div>
        <div className="ent-foot-meta">
          <span><Icon.Film size={11} /> Trailer playback</span>
          <span><Icon.Play size={11} /> Movies &amp; TV</span>
          <span><Icon.Shield size={11} /> Read-only API</span>
        </div>
      </footer>

      <EntDetailDialog
        open={selected !== null}
        mediaType={selected?.mediaType ?? null}
        id={selected?.id ?? null}
        onClose={closeDetail}
        isTvHint={selected?.mediaType === "tv"}
      />
    </div>
  );
}

function SearchResults({
  query,
  results,
  loading,
  onOpen,
}: {
  query: string;
  results: TmdbItem[];
  loading: boolean;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
}) {
  return (
    <div className="ent-search">
      <div className="ent-search-head">
        <div className="ent-search-eyebrow">Search Results</div>
        <h2 className="ent-search-title">
          {loading ? "Searching…" : `${results.length} matches for “${query}”`}
        </h2>
      </div>
      {loading ? (
        <div className="ent-search-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div className="ent-poster ent-poster-skel" key={i}>
              <div className="ent-poster-img" />
              <div className="ent-poster-meta"><div className="ent-poster-title" /><div className="ent-poster-year" /></div>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="ent-search-empty">
          <Icon.Film size={36} />
          <p>No results for “{query}”</p>
          <span>Try a different title, or check the spelling.</span>
        </div>
      ) : (
        <div className="ent-search-grid">
          {results.map(r => (
            <button
              key={`${r.id}-${r.mediaType}`}
              className="ent-poster ent-poster-sm"
              onClick={() => onOpen(r.mediaType, r.id)}
              title={r.title}
            >
              <div className="ent-poster-img">
                <img src={r.posterPath ? `https://image.tmdb.org/t/p/w342${r.posterPath}` : undefined} alt={r.title} loading="lazy" />
                <div className="ent-poster-type">{r.mediaType === "tv" ? "TV" : "Film"}</div>
                <div className="ent-poster-overlay"><div className="ent-poster-play"><Icon.Play size={14} /></div></div>
              </div>
              <div className="ent-poster-meta">
                <div className="ent-poster-title">{r.title}</div>
                <div className="ent-poster-year">{r.year || "—"}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
