// v9.1.0 — EntHindiDubView: a Hindi-language cinema hub.
// v9.2.0 — Made browse-only: the Watch/play triggers that routed Hindi TMDB
// content to the CineSrc embed have been removed. The TMDB
// `with_original_language=hi` queries are legitimate metadata browsing and
// remain. Cards now open the detail page (where the YouTube trailer is the
// only playback path).
//
// Surfaces Hindi-language cinema from TMDB:
//   1. Hindi Originals — Bollywood + Hindi-language cinema (with_original_language=hi).
//   2. Hindi Series — Hindi-language TV (with_original_language=hi).
//   3. Top-Rated Hindi Cinema — all-time greats (vote_average.desc).
//   4. Hollywood in Hindi — a curated set of blockbusters widely available
//      with Hindi dubs (browse-only — surfaces the titles; playback is the
//      user's responsibility via their own legitimate services).

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { Rail, type AnyItem } from "./EntRails";
import {
  asDetails,
  asItems,
  HINDI_DUBBED_HITS,
  type TmdbItem,
  type TmdbMediaType,
} from "../../lib/tmdb-types";

interface HindiProps {
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  inList: (mediaType: TmdbMediaType, id: number) => boolean;
  onToggleList: (item: AnyItem) => void;
}

export function EntHindiDubView({ onOpen, inList, onToggleList }: HindiProps) {
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

  const total = hindiMovies.length + hindiTv.length + hollywood.length;

  return (
    <div className="ent-page ent-hindi-page">
      <div className="ent-page-head">
        <div>
          <div className="ent-page-label"><Icon.Globe size={12} /> NEXUS TV · Language Hub</div>
          <h1 className="ent-page-title hindi">Hindi Cinema</h1>
          <p className="ent-page-sub">
            Bollywood originals, Hindi-language series, and all-time greats of Hindi cinema —
            browse-only metadata from TMDB.
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

      {/* Browse-only note */}
      <div className="ent-hindi-note">
        <Icon.Languages size={14} />
        <span>
          Browse-only: NEXUS surfaces TMDB metadata for Hindi-language cinema. Streaming was
          removed in v9.2.0 — open any title for cast, crew, episodes, and the YouTube trailer.
          A local media server arrives in v9.3.0.
        </span>
      </div>

      <div className="ent-rails">
        <Rail title="Hindi Originals" items={hindiMovies} forceMediaType="movie" loading={loading} onOpen={onOpen} onToggleList={onToggleList} inList={inList} enableHover />
        <Rail title="Hindi Series" items={hindiTv} forceMediaType="tv" loading={loading} onOpen={onOpen} onToggleList={onToggleList} inList={inList} enableHover />
        <Rail title="Top-Rated Hindi Cinema" items={hindiTop} forceMediaType="movie" loading={loading} onOpen={onOpen} onToggleList={onToggleList} inList={inList} enableHover />
        <Rail title="Hollywood in Hindi" items={hollywood} forceMediaType="movie" loading={loading} onOpen={onOpen} onToggleList={onToggleList} inList={inList} enableHover />
      </div>
    </div>
  );
}
