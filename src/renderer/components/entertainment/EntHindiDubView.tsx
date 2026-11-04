// v9.1.0 — EntHindiDubView: a dedicated Hindi Dub hub.
//
// Surfaces titles the streaming sources most reliably serve with Hindi audio:
//   1. Hindi Originals — Bollywood + Hindi-language cinema (TMDB with_original_language=hi).
//   2. Hindi Series — Hindi-language TV (with_original_language=hi).
//   3. Top-Rated Hindi Cinema — all-time greats (vote_average.desc).
//   4. Hollywood in Hindi — a curated set of blockbusters widely available
//      with Hindi dubs on the multi-audio source (2embed ?aud=hi).
//
// Pressing Watch from this hub defaults the player to the Hindi audio source,
// so playback opens on the Hindi track when one is available. The player's
// language/source selector lets you fall back to English (CineSrc) live.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { Rail, type AnyItem } from "./EntRails";
import {
  asDetails,
  asItems,
  HINDI_DUBBED_HITS,
  type StreamLanguage,
  type TmdbItem,
  type TmdbMediaType,
} from "../../lib/tmdb-types";

interface HindiProps {
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  onWatch: (payload: {
    mediaType: TmdbMediaType;
    id: number;
    title: string;
    posterPath?: string | null;
    backdropPath?: string | null;
    /** v9.1.0 — when "hi", the player opens on the Hindi audio source. */
    defaultLanguage?: StreamLanguage;
  }) => void;
  inList: (mediaType: TmdbMediaType, id: number) => boolean;
  onToggleList: (item: AnyItem) => void;
}

export function EntHindiDubView({ onOpen, onWatch, inList, onToggleList }: HindiProps) {
  const [hindiMovies, setHindiMovies] = useState<TmdbItem[]>([]);
  const [hindiTv, setHindiTv] = useState<TmdbItem[]>([]);
  const [hindiTop, setHindiTop] = useState<TmdbItem[]>([]);
  const [hollywood, setHollywood] = useState<TmdbItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Wave 1 — the three TMDB discover rails (fast, single-endpoint each).
      const [mov, tv, top] = await Promise.all([
        window.nexus.tmdbHindiMovies(1),
        window.nexus.tmdbHindiTv(1),
        window.nexus.tmdbHindiTopRated(),
      ]);
      if (cancelled) return;
      setHindiMovies(asItems(mov));
      setHindiTv(asItems(tv));
      setHindiTop(asItems(top));
      setLoading(false);

      // Wave 2 — curated Hollywood-in-Hindi picks (per-id details fetch).
      try {
        const details = await Promise.all(
          HINDI_DUBBED_HITS.map(h => window.nexus.tmdbDetailsAny("movie", h.id)),
        );
        if (cancelled) return;
        const items: TmdbItem[] = [];
        for (const r of details) {
          const d = asDetails(r);
          if (!d || (!d.posterPath && !d.backdropPath)) continue;
          items.push({
            id: d.id,
            title: d.title,
            overview: d.overview,
            posterPath: d.posterPath,
            backdropPath: d.backdropPath,
            rating: d.rating,
            year: d.year,
            genreIds: d.genreIds,
            mediaType: "movie",
          });
        }
        setHollywood(items);
      } catch { /* non-fatal — the three discover rails still render */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cards in this hub open the player defaulted to Hindi audio.
  const watchHindi = (mt: TmdbMediaType, id: number, title: string) => {
    onWatch({ mediaType: mt, id, title, defaultLanguage: "hi" });
  };

  const total = hindiMovies.length + hindiTv.length + hollywood.length;

  return (
    <div className="ent-page ent-hindi-page">
      <div className="ent-page-head">
        <div>
          <div className="ent-page-label"><Icon.Globe size={12} /> NEXUS TV · Language Hub</div>
          <h1 className="ent-page-title hindi">Hindi Dub</h1>
          <p className="ent-page-sub">
            Bollywood originals, Hindi-language series, and Hollywood blockbusters dubbed in Hindi —
            playback opens on the Hindi audio track when available.
          </p>
        </div>
        <div className="ent-page-side">
          <Icon.Languages size={16} />
          <span>{total} titles · हिंदी</span>
        </div>
      </div>

      {/* Mood strip — quick Hindi-genre vibes */}
      <div className="ent-anime-strip">
        {["Bollywood", "Hindi Series", "Hollywood Dubbed", "All-Time Greats", "Action", "Drama"].map(m => (
          <span key={m} className="ent-anime-strip-item">{m}</span>
        ))}
      </div>

      {/* Honest "how it works" note */}
      <div className="ent-hindi-note">
        <Icon.Languages size={14} />
        <span>
          Watch opens on the Hindi audio source. If a Hindi track isn't available for a title,
          switch to <strong>English</strong> or pick another <strong>source</strong> in the player bar.
        </span>
      </div>

      <div className="ent-rails">
        <Rail title="Hindi Originals" items={hindiMovies} forceMediaType="movie" loading={loading} onOpen={onOpen} onWatch={watchHindi} onToggleList={onToggleList} inList={inList} enableHover />
        <Rail title="Hindi Series" items={hindiTv} forceMediaType="tv" loading={loading} onOpen={onOpen} onWatch={watchHindi} onToggleList={onToggleList} inList={inList} enableHover />
        <Rail title="Top-Rated Hindi Cinema" items={hindiTop} forceMediaType="movie" loading={loading} onOpen={onOpen} onWatch={watchHindi} onToggleList={onToggleList} inList={inList} enableHover />
        <Rail title="Hollywood in Hindi" items={hollywood} forceMediaType="movie" loading={loading} onOpen={onOpen} onWatch={watchHindi} onToggleList={onToggleList} inList={inList} enableHover />
      </div>
    </div>
  );
}
