// v6.0.0 — EntBrowse: Movies / TV Shows pages with genre filter chips and
// paginated "Show More" loading (reference image 1's Load More strip).

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { PosterGrid, type AnyItem } from "./EntRails";
import {
  asItems,
  asMovies,
  MOVIE_GENRES,
  TV_GENRES,
  type GenreDef,
  type TmdbMediaType,
} from "../../lib/tmdb-types";

interface BrowseProps {
  mediaType: Extract<TmdbMediaType, "movie" | "tv">;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  inList: (mediaType: TmdbMediaType, id: number) => boolean;
  onWatch?: (mt: TmdbMediaType, id: number, title: string) => void;
  onToggleList?: (item: AnyItem) => void;
}

const PAGE_SIZE = 20;

export function EntBrowse({ mediaType, onOpen, inList, onWatch, onToggleList }: BrowseProps) {
  const genres: GenreDef[] = mediaType === "tv" ? TV_GENRES : MOVIE_GENRES;
  const isMovie = mediaType === "movie";

  const [genreId, setGenreId] = useState<number | null>(null);
  const [items, setItems] = useState<AnyItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  // Reset when the tab or genre changes.
  useEffect(() => {
    setItems([]);
    setPage(1);
    setExhausted(false);
    setLoading(true);
    let cancelled = false;
    (async () => {
      const r = genreId !== null
        ? (isMovie
            ? await window.nexus.tmdbByGenre(genreId, 1)
            : await window.nexus.tmdbByGenreTv(genreId, 1))
        : (isMovie
            ? await window.nexus.tmdbPopular(1)
            : await window.nexus.tmdbPopularTv(1));
      if (cancelled) return;
      const list = isMovie ? asMovies(r) : asItems(r);
      setItems(list);
      setExhausted(list.length < PAGE_SIZE);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mediaType, genreId, isMovie]);

  const loadMore = async () => {
    if (loadingMore || exhausted) return;
    setLoadingMore(true);
    const next = page + 1;
    const r = genreId !== null
      ? (isMovie
          ? await window.nexus.tmdbByGenre(genreId, next)
          : await window.nexus.tmdbByGenreTv(genreId, next))
      : (isMovie
          ? await window.nexus.tmdbPopular(next)
          : await window.nexus.tmdbPopularTv(next));
    const list = isMovie ? asMovies(r) : asItems(r);
    setItems(prev => [...prev, ...list.filter(n => !prev.some(p => p.id === n.id))]);
    setPage(next);
    if (list.length < PAGE_SIZE) setExhausted(true);
    setLoadingMore(false);
  };

  const heading = isMovie ? "Movies" : "TV Shows";
  const genreName = genreId !== null ? genres.find(g => g.id === genreId)?.name : null;

  return (
    <div className="ent-page">
      <div className="ent-page-head">
        <div>
          <div className="ent-page-label">Browse · NEXUS TV</div>
          <h1 className="ent-page-title">{genreName ? `${heading} · ${genreName}` : heading}</h1>
        </div>
        <div className="ent-page-side">
          <Icon.Film size={16} />
          <span>{items.length} titles</span>
        </div>
      </div>

      {/* Genre chips */}
      <div className="ent-chips">
        <button
          className={genreId === null ? "ent-chip on" : "ent-chip"}
          onClick={() => setGenreId(null)}
        >
          All
        </button>
        {genres.map(g => (
          <button
            key={g.id}
            className={genreId === g.id ? "ent-chip on" : "ent-chip"}
            onClick={() => setGenreId(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>

      <PosterGrid
        items={items}
        forceMediaType={mediaType}
        loading={loading}
        onOpen={onOpen}
        inList={inList}
        onWatch={onWatch}
        onToggleList={onToggleList}
        enableHover
      />

      {/* Load More strip (image 1) */}
      {!loading && !exhausted && (
        <div className="ent-loadmore">
          <button className="ent-loadmore-btn" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Icon.Spinner size={14} /> : <Icon.Plus size={14} />}
            {loadingMore ? "Loading…" : "Show More"}
          </button>
        </div>
      )}
      {!loading && items.length === 0 && (
        <div className="ent-empty">
          <Icon.Film size={34} />
          <p>No titles found for this genre.</p>
        </div>
      )}
    </div>
  );
}
