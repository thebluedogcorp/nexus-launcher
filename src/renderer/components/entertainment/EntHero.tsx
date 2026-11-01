// v5.0.0 — EntHero: a cinematic cycling hero banner for the Entertainment mode.
// Pulls trending (movies + tv), auto-advances every 8s, shows backdrop + title
// + overview + Play Trailer / More Info actions.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { tmdbImg, formatRating, type TmdbItem } from "../../lib/tmdb-types";

interface HeroProps {
  items: TmdbItem[];
  loading: boolean;
  onOpen: (mediaType: "movie" | "tv", id: number) => void;
  onWatch: (mediaType: "movie" | "tv", id: number, title: string) => void;
  onBackToSplash: () => void;
}

const HERO_COUNT = 5;

export function EntHero({ items, loading, onOpen, onWatch, onBackToSplash }: HeroProps) {
  const heroes = items.filter(i => i.backdropPath && i.overview).slice(0, HERO_COUNT);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (heroes.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % heroes.length), 8000);
    return () => clearInterval(t);
  }, [heroes.length]);

  // Clamp idx if heroes shrank.
  useEffect(() => {
    if (idx > heroes.length - 1) setIdx(0);
  }, [heroes.length, idx]);

  if (loading) {
    return <div className="ent-hero ent-hero-loading" />;
  }

  if (heroes.length === 0) {
    return (
      <div className="ent-hero ent-hero-empty">
        <Icon.Film size={40} />
        <p>No trending content available right now.</p>
      </div>
    );
  }

  const cur = heroes[idx];
  const backdrop = tmdbImg(cur.backdropPath, "w1280") ?? tmdbImg(cur.backdropPath, "original");
  const mediaType = cur.mediaType;

  return (
    <div className="ent-hero">
      {/* Crossfade backdrop layers */}
      <div className="ent-hero-bg">
        {heroes.map((h, i) => (
          <img
            key={h.id}
            src={tmdbImg(h.backdropPath, "w1280") ?? tmdbImg(h.backdropPath, "original")}
            alt={h.title}
            className={i === idx ? "ent-hero-bg-img active" : "ent-hero-bg-img"}
          />
        ))}
      </div>
      <div className="ent-hero-scrim" />
      <div className="ent-hero-scrim-r" />

      <div className="ent-hero-content">
        <div className="ent-hero-badges">
          <span className="ent-badge ent-badge-ent">
            <Icon.Film size={11} /> Trending Now
          </span>
          {cur.rating > 0 && (
            <span className="ent-badge ent-badge-star">
              <Icon.Star size={11} filled /> {formatRating(cur.rating)}
            </span>
          )}
          <span className="ent-badge ent-badge-meta">
            {mediaType === "tv" ? "TV Series" : "Movie"} · {cur.year}
          </span>
        </div>

        <h1 className="ent-hero-title">{cur.title}</h1>
        <p className="ent-hero-overview">{cur.overview}</p>

        <div className="ent-hero-actions">
          <button className="ent-btn ent-btn-primary" onClick={() => onWatch(mediaType, cur.id, cur.title)}>
            <Icon.Play size={16} /> Watch Now
          </button>
          <button className="ent-btn ent-btn-ghost" onClick={() => onOpen(mediaType, cur.id)}>
            <Icon.Info size={16} /> More Info
          </button>
        </div>

        {heroes.length > 1 && (
          <div className="ent-hero-dots">
            <button className="ent-dot-btn" onClick={() => setIdx(i => (i - 1 + heroes.length) % heroes.length)} aria-label="Previous">
              <Icon.Chevron size={14} />
            </button>
            <div className="ent-dots">
              {heroes.map((h, i) => (
                <button
                  key={h.id}
                  className={i === idx ? "ent-dot active" : "ent-dot"}
                  onClick={() => setIdx(i)}
                  aria-label={`Go to ${h.title}`}
                />
              ))}
            </div>
            <button className="ent-dot-btn" onClick={() => setIdx(i => (i + 1) % heroes.length)} aria-label="Next">
              <Icon.Chevron size={14} />
            </button>
          </div>
        )}
      </div>

      <button className="ent-hero-switch" onClick={onBackToSplash} title="Switch mode">
        <Icon.Chevron size={12} /> Switch mode
      </button>
    </div>
  );
}
