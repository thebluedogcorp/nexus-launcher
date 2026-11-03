// v6.0.0 — EntHero: Apple TV+ style cinematic hero (reference image 2).
// Full-bleed art bleeding right, deep left gradient blend, huge condensed
// uppercase Oswald title, kicker chip, meta + genre badges, 2-line synopsis,
// Watch Now / Watch Trailer / More Info / My List CTAs, pagination dots,
// auto-advance 8s. v6.6.0 — Watch Trailer button + modal.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { tmdbImg, formatRating, MOVIE_GENRES, TV_GENRES, type TmdbItem, type TmdbMediaType } from "../../lib/tmdb-types";
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

function genreNames(item: TmdbItem): string[] {
  const catalog = item.mediaType === "tv" ? TV_GENRES : MOVIE_GENRES;
  return (item.genreIds ?? [])
    .map(gid => catalog.find(g => g.id === gid)?.name)
    .filter((n): n is string => !!n)
    .slice(0, 3);
}

export function EntHero({ items, loading, onOpen, onWatch, inList, onToggleList }: HeroProps) {
  const heroes = items.filter(i => i.backdropPath && i.overview).slice(0, HERO_COUNT);
  const [idx, setIdx] = useState(0);
  const [trailerFor, setTrailerFor] = useState<{ mt: TmdbMediaType; id: number; title: string } | null>(null);

  useEffect(() => {
    if (heroes.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % heroes.length), 8000);
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
  const genres = genreNames(cur);
  const listed = inList(mt, cur.id);

  return (
    <div className="ent-hero">
      {/* Crossfading art layers */}
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
        <div className="ent-hero-kicker">
          <span className="ent-kicker-brand">NEXUS TV</span>
          <span className="ent-kicker-sep" />
          <span>{mt === "tv" ? "Series" : "Film"}</span>
        </div>

        <h1 className="ent-hero-title">{cur.title}</h1>

        <div className="ent-hero-meta">
          {cur.rating > 0 && (
            <span className="ent-hm"><Icon.Star size={11} filled /> {formatRating(cur.rating)}</span>
          )}
          {cur.year && <span className="ent-hm">{cur.year}</span>}
          {genres.slice(0, 2).map(g => <span className="ent-hm badge" key={g}>{g}</span>)}
        </div>

        <p className="ent-hero-desc">{cur.overview}</p>

        <div className="ent-hero-cta">
          <button className="ent-cta primary" onClick={() => onWatch(mt, cur.id, cur.title, cur.backdropPath, cur.posterPath)}>
            <Icon.Play size={16} /> Watch Now
          </button>
          <button className="ent-cta ghost" onClick={() => setTrailerFor({ mt, id: cur.id, title: cur.title })}>
            <Icon.Film size={15} /> Watch Trailer
          </button>
          <button className="ent-cta ghost" onClick={() => onOpen(mt, cur.id)}>
            <Icon.Info size={15} /> More Info
          </button>
          <button
            className={listed ? "ent-cta ghost listed" : "ent-cta ghost"}
            onClick={() => onToggleList(cur)}
            title={listed ? "Remove from My List" : "Add to My List"}
          >
            <Icon.Bookmark size={15} filled={listed} /> {listed ? "In My List" : "My List"}
          </button>
        </div>
      </div>

      {/* Pagination dots (image 2) */}
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

      {/* Manual prev/next arrows (v6.2.0) */}
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
          {/* Up-next preview chip */}
          <div className="ent-hero-next" aria-hidden="true">
            <span className="ent-hero-next-label">Up Next</span>
            <span className="ent-hero-next-title">{heroes[(idx + 1) % heroes.length].title}</span>
          </div>
        </>
      )}

      {/* Watch Trailer modal (v6.6.0) */}
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
