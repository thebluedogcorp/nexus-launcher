// v7.2.0 — EntDiscoverView: a curated discovery page.
// Daily Pick (deterministic per day), mood-based recommendations (genre-filtered),
// decade browser, and a discovery shuffle rail. Uses existing TMDB endpoints.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { EntLandscapeCard, Rail } from "./EntRails";
import type { WatchPayload } from "./EntPlayer";
import {
  asItems, asMovies, MOVIE_GENRES, TV_GENRES,
  type TmdbItem, type TmdbMovie, type TmdbMediaType,
} from "../../lib/tmdb-types";

interface DiscoverProps {
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  onWatch: (payload: WatchPayload) => void;
}

const MOODS: Array<{ label: string; icon: React.ReactNode; movieGenres: number[]; tvGenres: number[] }> = [
  { label: "Thrilling", icon: <Icon.TrendingUp size={15} />, movieGenres: [28, 53], tvGenres: [18, 80] },
  { label: "Heartwarming", icon: <Icon.Heart size={15} />, movieGenres: [10749, 35], tvGenres: [35, 10759] },
  { label: "Mind-bending", icon: <Icon.Sparkles size={15} />, movieGenres: [878, 9648], tvGenres: [10765, 9648] },
  { label: "Epic", icon: <Icon.Film size={15} />, movieGenres: [12, 14], tvGenres: [10759, 10765] },
  { label: "Dark", icon: <Icon.Shield size={15} />, movieGenres: [27, 80], tvGenres: [80, 9648] },
];

const DECADES = ["2020s", "2010s", "2000s", "1990s", "1980s"];

export function EntDiscoverView({ onOpen, onWatch }: DiscoverProps) {
  const [daily, setDaily] = useState<TmdbItem | null>(null);
  const [moodItems, setMoodItems] = useState<TmdbItem[]>([]);
  const [activeMood, setActiveMood] = useState<number>(0);
  const [shuffleItems, setShuffleItems] = useState<TmdbItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch a big pool of trending for daily pick + shuffle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, pop, ptv] = await Promise.all([
        window.nexus.tmdbTrendingAll(),
        window.nexus.tmdbPopular(),
        window.nexus.tmdbPopularTv(),
      ]);
      if (cancelled) return;
      const pool = [...asItems(t), ...asMovies(pop).map(m => ({ ...m, mediaType: "movie" as const })), ...asItems(ptv)];
      // Daily pick — deterministic based on day of year.
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
      setDaily(pool[dayOfYear % pool.length] ?? null);
      // Shuffle items — random 12 from the pool.
      const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 12);
      setShuffleItems(shuffled);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch mood-based items when mood changes.
  useEffect(() => {
    let cancelled = false;
    const m = MOODS[activeMood];
    (async () => {
      // Fetch first movie genre for the mood.
      const r = await window.nexus.tmdbByGenre(m.movieGenres[0], 1);
      if (cancelled) return;
      setMoodItems(asMovies(r).map(mv => ({ ...mv, mediaType: "movie" as const })) as TmdbItem[]);
    })();
    return () => { cancelled = true; };
  }, [activeMood]);

  const dailyDate = new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="ent-page">
      <div className="ent-page-head">
        <div>
          <div className="ent-page-label">Discover · curated for you</div>
          <h1 className="ent-page-title">Discover</h1>
        </div>
        <div className="ent-page-side">
          <Icon.Sparkles size={16} />
          <span>{dailyDate}</span>
        </div>
      </div>

      {/* Daily Pick — big feature */}
      {daily && (
        <div className="ent-discover-daily">
          <div className="ent-discover-daily-label">
            <Icon.Sparkles size={14} /> Daily Pick
          </div>
          <div className="ent-discover-daily-card">
            <div className="ent-discover-daily-art">
              {daily.backdropPath && <img src={`https://image.tmdb.org/t/p/w780${daily.backdropPath}`} alt={daily.title} />}
              <div className="ent-discover-daily-overlay" />
            </div>
            <div className="ent-discover-daily-info">
              <span className={daily.mediaType === "tv" ? "ent-lchip tv" : "ent-lchip"}>{daily.mediaType === "tv" ? "Series" : "Film"}</span>
              <h2 className="ent-discover-daily-title">{daily.title}</h2>
              <p className="ent-discover-daily-overview">{daily.overview}</p>
              <div className="ent-discover-daily-actions">
                <button className="ent-cta primary" onClick={() => onWatch({ mediaType: daily.mediaType, id: daily.id, title: daily.title, posterPath: daily.posterPath, backdropPath: daily.backdropPath })}>
                  <Icon.Play size={15} /> Watch Now
                </button>
                <button className="ent-cta ghost" onClick={() => onOpen(daily.mediaType, daily.id)}>
                  <Icon.Info size={14} /> More Info
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mood selector */}
      <section className="ent-discover-section">
        <h2 className="ent-discover-h">Browse by Mood</h2>
        <div className="ent-mood-chips">
          {MOODS.map((m, i) => (
            <button
              key={m.label}
              className={i === activeMood ? "ent-mood-chip on" : "ent-mood-chip"}
              onClick={() => setActiveMood(i)}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        {moodItems.length > 0 && (
          <div className="ent-rail-track">
            {moodItems.slice(0, 10).map(it => (
              <EntLandscapeCard
                key={`${it.id}-${it.mediaType}`}
                item={it}
                forceMediaType={it.mediaType}
                onOpen={onOpen}
                onWatch={(mt, id, title) => onWatch({ mediaType: mt, id, title })}
              />
            ))}
          </div>
        )}
      </section>

      {/* Discovery shuffle */}
      {shuffleItems.length > 0 && (
        <Rail title="Discovery Shuffle" items={shuffleItems} onOpen={onOpen} onWatch={(mt, id, title) => onWatch({ mediaType: mt, id, title })} enableHover />
      )}

      {loading && (
        <div className="ent-empty"><Icon.Spinner size={26} /><p>Loading discovery…</p></div>
      )}
    </div>
  );
}
