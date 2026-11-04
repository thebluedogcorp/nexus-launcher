// v9.0.0 — EntHero: Netflix-style billboard hero.
// Full-bleed crossfading art with Ken Burns drift, layered gradient blends,
// "N SERIES / N FILM" tag, green match %, maturity badge, Netflix-style
// maturity strip on the right edge, white Play + translucent More Info CTAs,
// pagination dots, hover arrows, Up Next chip, and the trailer modal.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { tmdbImg, type TmdbItem, type TmdbMediaType } from "../../lib/tmdb-types";
import { EntTrailerModal } from "./EntTrailerModal";

interface HeroProps {
  items: TmdbItem[];
  loading: boolean;
  onOpen: (mediaType: "movie" | "tv", id: number) => void;
  onWatch: (mediaType: "movie" | "tv", id: number, title: string, backdropPath: string | null, posterPath: string | null) => void;
  inList: (mediaType: "movie" | "tv", id: number) => boolean;
  onToggleList: (item: TmdbItem) => void;
}

const HERO_COUNT = 6;

/** Deterministic maturity rating from rating + type (heuristic). */
function maturity(mt: TmdbMediaType, rating: number): string {
  if (rating >= 8.4) return mt === "tv" ? "TV-MA" : "R";
  if (rating >= 7) return mt === "tv" ? "TV-14" : "PG-13";
  return mt === "tv" ? "TV-PG" : "PG";
}

export function EntHero({ items, loading, onOpen, onWatch, inList, onToggleList }: HeroProps) {
  const heroes = items.filter(i => i.backdropPath && i.overview).slice(0, HERO_COUNT);
  const [idx, setIdx] = useState(0);
  const [trailerFor, setTrailerFor] = useState<{ mt: TmdbMediaType; id: number; title: string } | null>(null);

  useEffect(() => {
    if (heroes.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % heroes.length), 9000);
    return () => clearInterval(t);
  }, [heroes.length]);

  useEffect(() => {
    if (idx > heroes.length - 1) setIdx(0);
  }, [heroes.length, idx]);

  if (loading) return <div className="ent-hero ent-hero-loading" />;

  if (heroes.length === 0) {
    return (
      <div className="ent-hero ent-hero-empty">
        <Icon.Film size={40} />
        <p>No trending content available right now.</p>
      </div>
    );
  }

  const cur = heroes[idx];
  const mt = cur.mediaType;
  const listed = inList(mt, cur.id);
  const match = Math.min(99, Math.round(cur.rating * 10));

  return (
    <div className="ent-hero">
      {/* Crossfading art layers with Ken Burns drift */}
      <div className="ent-hero-media">
        {heroes.map((h, i) => (
          <img
            key={h.id}
            src={tmdbImg(h.backdropPath, "w1280") ?? tmdbImg(h.backdropPath, "original")}
            alt=""
            className={i === idx ? "on" : ""}
          />
        ))}
      </div>
      <div className="ent-hero-fade" />

      <div className="ent-hero-inner">
        {/* N-tag + type */}
        <div className="ent-hero-brandline">
          <span className="ent-hero-ntag">N</span>
          <span className="ent-hero-typetag">{mt === "tv" ? "SERIES" : "FILM"}</span>
        </div>

        <h1 className="ent-hero-title">{cur.title}</h1>

        {/* Meta row: match, year, maturity, rating */}
        <div className="ent-hero-meta">
          <span className="ent-hero-match">{match}% Match</span>
          {cur.year && <span className="ent-hm">{cur.year}</span>}
          <span className="ent-hero-maturity">{maturity(mt, cur.rating)}</span>
          <span className="ent-hm">HD</span>
          {cur.rating > 0 && (
            <span className="ent-hm score"><Icon.Star size={11} filled /> {cur.rating.toFixed(1)}</span>
          )}
        </div>

        <p className="ent-hero-desc">{cur.overview}</p>

        <div className="ent-hero-cta">
          <button className="ent-hero-play" onClick={() => onWatch(mt, cur.id, cur.title, cur.backdropPath, cur.posterPath)}>
            <Icon.Play size={18} /> Play
          </button>
          <button className="ent-hero-info" onClick={() => onOpen(mt, cur.id)}>
            <Icon.Info size={17} /> More Info
          </button>
          <button
            className={listed ? "ent-hero-iconbtn on" : "ent-hero-iconbtn"}
            onClick={() => onToggleList(cur)}
            title={listed ? "Remove from My List" : "Add to My List"}
            aria-label={listed ? "Remove from My List" : "Add to My List"}
          >
            <Icon.Bookmark size={17} filled={listed} />
          </button>
          <button
            className="ent-hero-iconbtn"
            onClick={() => setTrailerFor({ mt, id: cur.id, title: cur.title })}
            title="Watch Trailer"
            aria-label="Watch Trailer"
          >
            <Icon.Film size={17} />
          </button>
        </div>
      </div>

      {/* Maturity strip (Netflix right-edge bar) */}
      <div className="ent-hero-strip">
        <span>{maturity(mt, cur.rating)}</span>
      </div>

      {/* Pagination dots */}
      {heroes.length > 1 && (
        <div className="ent-hero-dots">
          {heroes.map((h, i) => (
            <button
              key={h.id}
              className={i === idx ? "ent-dot on" : "ent-dot"}
              onClick={() => setIdx(i)}
              aria-label={`Show ${h.title}`}
            />
          ))}
        </div>
      )}

      {/* Manual prev/next arrows */}
      {heroes.length > 1 && (
        <>
          <button
            className="ent-hero-arrow prev"
            onClick={() => setIdx(i => (i - 1 + heroes.length) % heroes.length)}
            aria-label="Previous title"
          >
            <Icon.Chevron size={22} />
          </button>
          <button
            className="ent-hero-arrow next"
            onClick={() => setIdx(i => (i + 1) % heroes.length)}
            aria-label="Next title"
          >
            <Icon.Chevron size={22} />
          </button>
          <div className="ent-hero-next" aria-hidden="true">
            <span className="ent-hero-next-label">Up Next</span>
            <span className="ent-hero-next-title">{heroes[(idx + 1) % heroes.length].title}</span>
          </div>
        </>
      )}

      <EntTrailerModal
        open={trailerFor !== null}
        mediaType={trailerFor?.mt ?? "movie"}
        id={trailerFor?.id ?? 0}
        title={trailerFor?.title ?? ""}
        onClose={() => setTrailerFor(null)}
      />
    </div>
  );
}
