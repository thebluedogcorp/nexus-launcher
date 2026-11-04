// v8.0.0 — EntSearchView: enhanced universal search.
// Features: instant suggestions dropdown, search history + clear, a filter
// panel (media type, genre multi-select, year range, min rating, sort), and a
// People row (cast/crew results with known-for titles). When filters are set
// without a query, falls back to TMDB discover (server-side filtering).

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icons";
import { PosterGrid, type AnyItem } from "./EntRails";
import {
  asItems,
  asPeople,
  tmdbImg,
  MOVIE_GENRES,
  TV_GENRES,
  type TmdbItem,
  type TmdbMediaType,
  type TmdbPerson,
} from "../../lib/tmdb-types";
import {
  getSearchHistory,
  addSearchHistory,
  clearSearchHistory,
} from "../../lib/ent-userdata";
import { imgSize } from "../../lib/ent-prefs";

interface SearchProps {
  focusSignal: number;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  inList: (mediaType: TmdbMediaType, id: number) => boolean;
  onWatch?: (mt: TmdbMediaType, id: number, title: string) => void;
  onToggleList?: (item: AnyItem) => void;
}

type MediaFilter = "all" | "movie" | "tv";
type SortKey = "relevance" | "popularity" | "rating" | "year" | "alpha";

interface Filters {
  media: MediaFilter;
  genreIds: number[];
  yearFrom: string;
  yearTo: string;
  minRating: number;
  sort: SortKey;
}

const DEFAULT_FILTERS: Filters = {
  media: "all",
  genreIds: [],
  yearFrom: "",
  yearTo: "",
  minRating: 0,
  sort: "relevance",
};

const SORT_LABELS: Record<SortKey, string> = {
  relevance: "Relevance",
  popularity: "Popularity",
  rating: "Rating",
  year: "Newest",
  alpha: "A → Z",
};

const NOW = new Date().getFullYear();

export function EntSearchView({ focusSignal, onOpen, inList, onWatch, onToggleList }: SearchProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [suggestDebounced, setSuggestDebounced] = useState("");
  const [results, setResults] = useState<TmdbItem[]>([]);
  const [people, setPeople] = useState<TmdbPerson[]>([]);
  const [suggestions, setSuggestions] = useState<TmdbItem[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [history, setHistory] = useState<string[]>(getSearchHistory());
  const inputRef = useRef<HTMLInputElement>(null);

  // Genre catalog depends on the media filter.
  const genreCatalog = filters.media === "tv" ? TV_GENRES : filters.media === "movie" ? MOVIE_GENRES : dedupeGenres();

  useEffect(() => {
    inputRef.current?.focus();
  }, [focusSignal]);

  // Faster debounce for suggestions (180ms), slower for full results (340ms).
  useEffect(() => {
    const t = setTimeout(() => setSuggestDebounced(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 340);
    return () => clearTimeout(t);
  }, [query]);

  // Instant suggestions (top 5) — only while typing, not after a full search.
  useEffect(() => {
    if (suggestDebounced.length < 2) { setSuggestions([]); return; }
    let cancelled = false;
    (async () => {
      const r = await window.nexus.tmdbSearchMulti(suggestDebounced);
      if (cancelled) return;
      setSuggestions(asItems(r).slice(0, 5));
    })();
    return () => { cancelled = true; };
  }, [suggestDebounced]);

  const filtersActive =
    filters.media !== "all" ||
    filters.genreIds.length > 0 ||
    filters.yearFrom !== "" ||
    filters.yearTo !== "" ||
    filters.minRating > 0;

  const hasQuery = debounced.length >= 2;

  // Main search / discover.
  useEffect(() => {
    if (!hasQuery && !filtersActive) {
      setResults([]); setPeople([]); setLoading(false); return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (hasQuery) {
        // Text search + people.
        const [multi, ppl] = await Promise.all([
          window.nexus.tmdbSearchMulti(debounced),
          window.nexus.tmdbSearchPeople(debounced),
        ]);
        if (cancelled) return;
        let items = asItems(multi);
        items = applyClientFilters(items, filters);
        items = applySort(items, filters.sort);
        setResults(items);
        setPeople(asPeople(ppl));
      } else {
        // No query but filters active → server-side discover.
        const mediaType: TmdbMediaType = filters.media === "tv" ? "tv" : "movie";
        const r = await window.nexus.tmdbDiscover({
          mediaType,
          genreIds: filters.genreIds.length ? filters.genreIds : undefined,
          yearFrom: filters.yearFrom ? Number(filters.yearFrom) : null,
          yearTo: filters.yearTo ? Number(filters.yearTo) : null,
          minRating: filters.minRating || null,
          sortBy: filters.sort === "popularity" ? "popularity.desc"
            : filters.sort === "rating" ? "vote_average.desc"
            : filters.sort === "year" ? "primary_release_date.desc"
            : filters.sort === "alpha" ? "original_title.asc"
            : "popularity.desc",
        });
        if (cancelled) return;
        setResults(applySort(asItems(r), filters.sort));
        setPeople([]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [debounced, filters, filtersActive, hasQuery]);

  // Record a query into history when the user submits (Enter) or picks a suggestion.
  const commitQuery = (q: string) => {
    const t = q.trim();
    if (!t) return;
    addSearchHistory(t);
    setHistory(getSearchHistory());
  };

  const active = hasQuery || filtersActive;

  const toggleGenre = (id: number) => {
    setFilters(f => ({
      ...f,
      genreIds: f.genreIds.includes(id) ? f.genreIds.filter(g => g !== id) : [...f.genreIds, id],
    }));
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  return (
    <div className="ent-page ent-search-page">
      <div className="ent-page-head">
        <div>
          <div className="ent-page-label">Search · movies, series &amp; people</div>
          <h1 className="ent-page-title">Find Something to Watch</h1>
        </div>
        <div className="ent-page-side">
          <Icon.Search size={16} />
          <span>{active ? `${results.length} matches` : "press / anytime"}</span>
        </div>
      </div>

      {/* Search bar + filter toggle */}
      <div className="ent-searchbar-row">
        <div className="ent-searchbar">
          <Icon.Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setShowSuggest(true); }}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            onKeyDown={e => { if (e.key === "Enter") { commitQuery(query); setShowSuggest(false); } }}
            placeholder="Search movies, shows, actors…"
            spellCheck={false}
          />
          {query && (
            <button className="ent-searchbar-clear" onClick={() => { setQuery(""); setResults([]); setPeople([]); }} aria-label="Clear">
              <Icon.Close size={15} />
            </button>
          )}
          <button
            className={showFilters ? "ent-searchbar-filter on" : "ent-searchbar-filter"}
            onClick={() => setShowFilters(s => !s)}
            title="Filters"
            aria-label="Toggle filters"
          >
            <Icon.Sliders size={16} />
          </button>
        </div>

        {/* Instant suggestions dropdown */}
        {showSuggest && suggestions.length > 0 && (
          <div className="ent-suggest">
            {suggestions.map(s => (
              <button
                key={`${s.mediaType}-${s.id}`}
                className="ent-suggest-item"
                onMouseDown={e => { e.preventDefault(); commitQuery(s.title); onOpen(s.mediaType, s.id); setShowSuggest(false); }}
              >
                {s.posterPath
                  ? <img src={tmdbImg(s.posterPath, imgSize("w92"))} alt="" />
                  : <span className="ent-suggest-ph"><Icon.Film size={14} /></span>}
                <span className="ent-suggest-text">
                  <span className="ent-suggest-title">{s.title}</span>
                  <span className="ent-suggest-meta">{s.mediaType === "tv" ? "Series" : "Film"}{s.year ? ` · ${s.year}` : ""}</span>
                </span>
                {s.rating > 0 && <span className="ent-suggest-rating"><Icon.Star size={11} filled /> {s.rating.toFixed(1)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter panel (collapsible) */}
      {showFilters && (
        <div className="ent-filters">
          <div className="ent-filter-group">
            <span className="ent-filter-label">Type</span>
            <div className="ent-filter-seg">
              {(["all", "movie", "tv"] as MediaFilter[]).map(m => (
                <button key={m} className={filters.media === m ? "ent-filter-seg-btn on" : "ent-filter-seg-btn"} onClick={() => setFilters(f => ({ ...f, media: m, genreIds: [] }))}>
                  {m === "all" ? "All" : m === "movie" ? "Movies" : "TV"}
                </button>
              ))}
            </div>
          </div>

          <div className="ent-filter-group">
            <span className="ent-filter-label">Genres</span>
            <div className="ent-filter-chips">
              {genreCatalog.map(g => (
                <button
                  key={g.id}
                  className={filters.genreIds.includes(g.id) ? "ent-chip on sm" : "ent-chip sm"}
                  onClick={() => toggleGenre(g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>

          <div className="ent-filter-row">
            <div className="ent-filter-group">
              <span className="ent-filter-label">From year</span>
              <input
                type="number" min={1900} max={NOW + 2}
                value={filters.yearFrom}
                onChange={e => setFilters(f => ({ ...f, yearFrom: e.target.value }))}
                placeholder="e.g. 1990"
                className="ent-filter-input"
              />
            </div>
            <div className="ent-filter-group">
              <span className="ent-filter-label">To year</span>
              <input
                type="number" min={1900} max={NOW + 2}
                value={filters.yearTo}
                onChange={e => setFilters(f => ({ ...f, yearTo: e.target.value }))}
                placeholder="e.g. 2025"
                className="ent-filter-input"
              />
            </div>
            <div className="ent-filter-group">
              <span className="ent-filter-label">Min rating</span>
              <select
                value={filters.minRating}
                onChange={e => setFilters(f => ({ ...f, minRating: Number(e.target.value) }))}
                className="ent-filter-input"
              >
                <option value={0}>Any</option>
                <option value={6}>6+ ★</option>
                <option value={7}>7+ ★</option>
                <option value={8}>8+ ★</option>
                <option value={9}>9+ ★</option>
              </select>
            </div>
            <div className="ent-filter-group">
              <span className="ent-filter-label">Sort by</span>
              <select
                value={filters.sort}
                onChange={e => setFilters(f => ({ ...f, sort: e.target.value as SortKey }))}
                className="ent-filter-input"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                  <option key={k} value={k}>{SORT_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>

          {filtersActive && (
            <button className="ent-filter-reset" onClick={resetFilters}>
              <Icon.Close size={13} /> Reset filters
            </button>
          )}
        </div>
      )}

      {/* Recent searches (when idle) */}
      {!active && history.length > 0 && (
        <div className="ent-search-history">
          <div className="ent-search-history-head">
            <span><Icon.History size={14} /> Recent searches</span>
            <button className="ent-search-history-clear" onClick={() => { clearSearchHistory(); setHistory([]); }}>
              Clear
            </button>
          </div>
          <div className="ent-search-history-chips">
            {history.map(h => (
              <button key={h} className="ent-chip" onClick={() => { setQuery(h); setShowSuggest(false); }}>
                <Icon.History size={12} /> {h}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {active ? (
        <>
          {/* People row */}
          {people.length > 0 && (
            <div className="ent-search-people">
              <div className="ent-search-people-head">
                <Icon.Users size={15} /> <span>People · {people.length}</span>
              </div>
              <div className="ent-search-people-grid">
                {people.slice(0, 8).map(p => (
                  <div key={p.id} className="ent-person-card">
                    <div className="ent-person-img">
                      {p.profilePath
                        ? <img src={tmdbImg(p.profilePath, imgSize("w185"))} alt={p.name} loading="lazy" />
                        : <div className="ent-person-ph"><Icon.Users size={22} /></div>}
                    </div>
                    <div className="ent-person-name">{p.name}</div>
                    <div className="ent-person-known">{p.knownFor}</div>
                    {p.knownForIds.length > 0 && (
                      <div className="ent-person-kf">
                        {p.knownForIds.slice(0, 4).map(k => (
                          <button
                            key={`${k.mediaType}-${k.id}`}
                            className="ent-person-kf-item"
                            onClick={() => onOpen(k.mediaType, k.id)}
                            title={k.title}
                          >
                            {k.posterPath
                              ? <img src={tmdbImg(k.posterPath, imgSize("w92"))} alt={k.title} loading="lazy" />
                              : <span className="ent-person-kf-ph"><Icon.Film size={11} /></span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Title results */}
          {loading ? (
            <PosterGrid items={[]} loading onOpen={onOpen} onWatch={onWatch} onToggleList={onToggleList} inList={inList} enableHover />
          ) : results.length === 0 ? (
            <div className="ent-empty">
              <Icon.Search size={34} />
              <p>No results{hasQuery ? ` for “${debounced}”` : " for these filters"}</p>
              <span>{hasQuery ? "Try a different title, or check the spelling." : "Try loosening your filters."}</span>
            </div>
          ) : (
            <PosterGrid items={results} onOpen={onOpen} inList={inList} onWatch={onWatch} onToggleList={onToggleList} enableHover />
          )}
        </>
      ) : history.length === 0 ? (
        <div className="ent-search-hints">
          <p>Search across thousands of films, series, and the people who make them.</p>
          <div className="ent-search-hintchips">
            {["Dune", "Interstellar", "Breaking Bad", "The Office", "Oppenheimer", "Nolan"].map(s => (
              <button key={s} className="ent-chip" onClick={() => setQuery(s)}>{s}</button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function dedupeGenres() {
  const map = new Map<number, { id: number; name: string }>();
  for (const g of [...MOVIE_GENRES, ...TV_GENRES]) if (!map.has(g.id)) map.set(g.id, g);
  return Array.from(map.values());
}

function applyClientFilters(items: TmdbItem[], f: Filters): TmdbItem[] {
  return items.filter(i => {
    if (f.media !== "all" && i.mediaType !== f.media) return false;
    if (f.genreIds.length > 0 && !f.genreIds.some(g => i.genreIds?.includes(g))) return false;
    const yr = i.year ? parseInt(i.year, 10) : 0;
    if (f.yearFrom && yr && yr < Number(f.yearFrom)) return false;
    if (f.yearTo && yr && yr > Number(f.yearTo)) return false;
    if (f.minRating && i.rating < f.minRating) return false;
    return true;
  });
}

function applySort(items: TmdbItem[], sort: SortKey): TmdbItem[] {
  const arr = [...items];
  if (sort === "rating") arr.sort((a, b) => b.rating - a.rating);
  else if (sort === "year") arr.sort((a, b) => (parseInt(b.year || "0", 10) - parseInt(a.year || "0", 10)));
  else if (sort === "alpha") arr.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === "popularity") arr.sort((a, b) => b.rating - a.rating); // proxy
  return arr;
}
