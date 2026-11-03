// v6.0.0 — EntSearchView: full-page search across movies + TV.

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icons";
import { PosterGrid, type AnyItem } from "./EntRails";
import { asItems, type TmdbMediaType } from "../../lib/tmdb-types";

interface SearchProps {
  focusSignal: number;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  inList: (mediaType: TmdbMediaType, id: number) => boolean;
  onWatch?: (mt: TmdbMediaType, id: number, title: string) => void;
  onToggleList?: (item: AnyItem) => void;
}

export function EntSearchView({ focusSignal, onOpen, inList, onWatch, onToggleList }: SearchProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<AnyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount + whenever the shell signals (e.g. "/" key).
  useEffect(() => {
    inputRef.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 320);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await window.nexus.tmdbSearchMulti(debounced);
      if (cancelled) return;
      setResults(asItems(r));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [debounced]);

  const active = debounced.length >= 2;

  return (
    <div className="ent-page">
      <div className="ent-page-head">
        <div>
          <div className="ent-page-label">Search · movies &amp; series</div>
          <h1 className="ent-page-title">Find Something to Watch</h1>
        </div>
        <div className="ent-page-side">
          <Icon.Search size={16} />
          <span>{active ? `${results.length} matches` : "press / anytime"}</span>
        </div>
      </div>

      <div className="ent-searchbar">
        <Icon.Search size={18} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search movies, shows…"
          spellCheck={false}
        />
        {query && (
          <button className="ent-searchbar-clear" onClick={() => setQuery("")} aria-label="Clear">
            <Icon.Close size={15} />
          </button>
        )}
      </div>

      {active ? (
        loading ? (
          <PosterGrid items={[]} loading onOpen={onOpen} onWatch={onWatch} onToggleList={onToggleList} inList={inList} enableHover />
        ) : results.length === 0 ? (
          <div className="ent-empty">
            <Icon.Search size={34} />
            <p>No results for “{debounced}”</p>
            <span>Try a different title, or check the spelling.</span>
          </div>
        ) : (
          <PosterGrid items={results} onOpen={onOpen} inList={inList} onWatch={onWatch} onToggleList={onToggleList} enableHover />
        )
      ) : (
        <div className="ent-search-hints">
          <p>Search across thousands of films and series.</p>
          <div className="ent-search-hintchips">
            {["Dune", "Interstellar", "Breaking Bad", "The Office", "Oppenheimer"].map(s => (
              <button key={s} className="ent-chip" onClick={() => setQuery(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
