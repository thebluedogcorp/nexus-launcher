import { useEffect, useState, useRef } from "react";
import type { Game } from "@shared/types";
import { Icon } from "./Icons";
import { platformColor, platformLabel, relativeTime, formatPlaytime } from "../lib/helpers";

interface Props {
  games: Game[];
  onPlay: (g: Game) => void;
  onOpen: (id: number) => void;
}

/**
 * Auto-rotating hero spotlight carousel — Epic Games style.
 * Shows the top games (favorites first, then most recently played) as full-bleed
 * banner images with a gradient overlay, title, metadata, and Play / Details CTAs.
 */
export function HeroCarousel({ games, onPlay, onOpen }: Props) {
  const featured = pickFeatured(games);
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clamp index if the featured list shrinks.
  useEffect(() => {
    if (idx > featured.length - 1) setIdx(0);
  }, [featured.length, idx]);

  // Auto-rotate every 6s, pause on hover.
  const startTimer = () => {
    stopTimer();
    if (featured.length > 1) {
      timerRef.current = setInterval(() => {
        setIdx((p) => (p + 1) % featured.length);
      }, 6000);
    }
  };
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => {
    startTimer();
    return stopTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featured.length]);

  if (featured.length === 0) {
    return <div className="hero-skeleton shimmer" />;
  }

  const current = featured[idx];

  const go = (delta: number) => {
    setIdx((p) => (p + delta + featured.length) % featured.length);
    stopTimer();
    startTimer();
  };

  return (
    <div className="hero-wrap" onMouseEnter={stopTimer} onMouseLeave={startTimer}>
      <div className="hero">
        {featured.map((g, i) => (
          <div key={g.id} className={i === idx ? "hero-slide active" : "hero-slide"}>
            <div
              className="hero-bg"
              style={{
                backgroundImage: g.bannerImage
                  ? `url(${g.bannerImage})`
                  : g.coverImage
                    ? `url(${g.coverImage})`
                    : `radial-gradient(circle at 30% 20%, ${pickGradient(g.title)}, #050505)`,
              }}
            />
            <div className="hero-overlay" />
            <div className="hero-content">
              <div className="hero-eyebrow">
                <span className="pulse" />
                {g.favorite ? "Featured · Favorite" : "Featured · In your library"}
              </div>
              <h1 className="hero-title">{g.title}</h1>
              <div className="hero-meta">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: platformColor(g.platform) }} />
                  {platformLabel(g.platform)}
                </span>
                <span className="dot" />
                {g.developer && <span>{g.developer}</span>}
                {g.rating !== null && (
                  <>
                    <span className="dot" />
                    <span className="hero-rating">
                      <Icon.Star size={13} filled /> {g.rating.toFixed(1)}
                    </span>
                  </>
                )}
                {g.playtimeSec > 0 && (
                  <>
                    <span className="dot" />
                    <span>{formatPlaytime(g.playtimeSec)} played</span>
                  </>
                )}
                {g.lastPlayedAt && (
                  <>
                    <span className="dot" />
                    <span>Last played {relativeTime(g.lastPlayedAt)}</span>
                  </>
                )}
              </div>
              <div className="hero-actions">
                <button className="hero-play" onClick={() => onPlay(g)}>
                  <Icon.Play size={16} /> Play Now
                </button>
                <button className="hero-details" onClick={() => onOpen(g.id)}>
                  <Icon.Info size={16} /> Details
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Arrows */}
        {featured.length > 1 && (
          <>
            <button className="hero-arrow left" onClick={() => go(-1)} title="Previous">
              <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.Chevron size={18} /></span>
            </button>
            <button className="hero-arrow right" onClick={() => go(1)} title="Next">
              <Icon.Chevron size={18} />
            </button>
          </>
        )}

        {/* Dots */}
        {featured.length > 1 && (
          <div className="hero-dots">
            {featured.map((_, i) => (
              <button
                key={i}
                className={i === idx ? "hero-dot active" : "hero-dot"}
                onClick={() => { setIdx(i); stopTimer(); startTimer(); }}
                title={`Slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Pick the 5 most compelling games for the spotlight. */
function pickFeatured(games: Game[]): Game[] {
  const withArt = games.filter((g) => g.bannerImage || g.coverImage);
  const pool = withArt.length >= 5 ? withArt : games;
  return [...pool]
    .sort((a, b) => {
      // Favorites first, then most-played, then highest rating.
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      if (a.playtimeSec !== b.playtimeSec) return b.playtimeSec - a.playtimeSec;
      const ra = a.rating ?? 0;
      const rb = b.rating ?? 0;
      return rb - ra;
    })
    .slice(0, 5);
}

function pickGradient(title: string): string {
  const palettes = [
    "#0f766e", "#15803d", "#9a3412", "#86198f", "#be123c", "#047857", "#155e75",
  ];
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}
