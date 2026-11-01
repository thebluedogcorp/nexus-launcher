// v5.0.0 — EntCarousel: a horizontal poster rail with hover-reveal info +
// scroll arrows. Also exports the EntPosterCard used by the rail and search.

import { useRef } from "react";
import { Icon } from "../Icons";
import { tmdbImg, formatRating, type TmdbItem, type TmdbMovie } from "../../lib/tmdb-types";

interface PosterCardProps {
  item: TmdbItem | TmdbMovie;
  /** Force a media type when the list endpoint is single-type (e.g. /movie/popular). */
  forceMediaType?: "movie" | "tv";
  onOpen: (mediaType: "movie" | "tv", id: number) => void;
}

export function EntPosterCard({ item, forceMediaType, onOpen }: PosterCardProps) {
  const mediaType = forceMediaType ?? item.mediaType;
  const poster = tmdbImg(item.posterPath, "w342");
  const title = item.title;
  const rating = item.rating ?? 0;

  return (
    <button
      className="ent-poster"
      onClick={() => onOpen(mediaType, item.id)}
      title={title}
    >
      <div className="ent-poster-img">
        {poster ? (
          <img src={poster} alt={title} loading="lazy" />
        ) : (
          <div className="ent-poster-placeholder"><Icon.Film size={28} /></div>
        )}
        {rating > 0 && (
          <div className="ent-poster-rating">
            <Icon.Star size={10} filled /> {formatRating(rating)}
          </div>
        )}
        <div className="ent-poster-type">{mediaType === "tv" ? "TV" : "Film"}</div>
        <div className="ent-poster-overlay">
          <div className="ent-poster-play"><Icon.Play size={16} /></div>
        </div>
      </div>
      <div className="ent-poster-meta">
        <div className="ent-poster-title">{title}</div>
        <div className="ent-poster-year">{item.year || "—"}</div>
      </div>
    </button>
  );
}

interface CarouselProps {
  title: string;
  icon: React.ReactNode;
  items: Array<TmdbItem | TmdbMovie>;
  forceMediaType?: "movie" | "tv";
  loading?: boolean;
  onOpen: (mediaType: "movie" | "tv", id: number) => void;
}

export function EntCarousel({ title, icon, items, forceMediaType, loading, onOpen }: CarouselProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.85, 760), behavior: "smooth" });
  };

  if (!loading && items.length === 0) return null;

  return (
    <section className="ent-row">
      <div className="ent-row-head">
        <span className="ent-row-bar" />
        <span className="ent-row-icon">{icon}</span>
        <h2 className="ent-row-title">{title}</h2>
        {loading && <Icon.Spinner size={12} />}
        {!loading && items.length > 0 && (
          <span className="ent-row-count">{items.length}</span>
        )}
      </div>
      <div className="ent-row-arrows">
        <button className="ent-arrow ent-arrow-l" onClick={() => scroll(-1)} aria-label="Scroll left">
          <Icon.Chevron size={16} />
        </button>
        <button className="ent-arrow ent-arrow-r" onClick={() => scroll(1)} aria-label="Scroll right">
          <Icon.Chevron size={16} />
        </button>
      </div>
      <div className="ent-row-track" ref={ref}>
        {loading
          ? Array.from({ length: 9 }).map((_, i) => (
              <div className="ent-poster ent-poster-skel" key={i}>
                <div className="ent-poster-img" />
                <div className="ent-poster-meta"><div className="ent-poster-title" /><div className="ent-poster-year" /></div>
              </div>
            ))
          : items.map((it) => (
              <EntPosterCard
                key={`${it.id}-${forceMediaType ?? it.mediaType}`}
                item={it}
                forceMediaType={forceMediaType}
                onOpen={onOpen}
              />
            ))}
      </div>
    </section>
  );
}
