// v9.0.0 — EntNewPopularView: the "New & Popular" hub (Netflix-style).
// Trending Now, New Releases, Top 10 Movies/Series, and Worth the Wait —
// everything fresh in one place.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { Rail, Top10Rail, type AnyItem } from "./EntRails";
import { asItems, asMovies, type TmdbItem, type TmdbMovie, type TmdbMediaType } from "../../lib/tmdb-types";

interface NewPopularProps {
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  onWatch: (payload: { mediaType: TmdbMediaType; id: number; title: string; posterPath?: string | null; backdropPath?: string | null }) => void;
  inList: (mediaType: TmdbMediaType, id: number) => boolean;
  onToggleList: (item: AnyItem) => void;
}

export function EntNewPopularView({ onOpen, onWatch, inList, onToggleList }: NewPopularProps) {
  const [trending, setTrending] = useState<TmdbItem[]>([]);
  const [upcoming, setUpcoming] = useState<TmdbMovie[]>([]);
  const [nowPlaying, setNowPlaying] = useState<TmdbMovie[]>([]);
  const [topMovies, setTopMovies] = useState<TmdbMovie[]>([]);
  const [topTv, setTopTv] = useState<TmdbItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, up, np, tm, ttv] = await Promise.all([
        window.nexus.tmdbTrendingAll(),
        window.nexus.tmdbUpcoming(1),
        window.nexus.tmdbNowPlaying(1),
        window.nexus.tmdbTopRated(1),
        window.nexus.tmdbTopRatedTv(1),
      ]);
      if (cancelled) return;
      setTrending(asItems(t));
      setUpcoming(asMovies(up));
      setNowPlaying(asMovies(np));
      setTopMovies(asMovies(tm));
      setTopTv(asItems(ttv));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const watchFromCard = (mt: TmdbMediaType, id: number, title: string) => {
    onWatch({ mediaType: mt, id, title });
  };

  return (
    <div className="ent-page ent-new-page">
      <div className="ent-page-head">
        <div>
          <div className="ent-page-label"><Icon.Sparkles size={12} /> NEXUS TV · Fresh</div>
          <h1 className="ent-page-title">New &amp; Popular</h1>
          <p className="ent-page-sub">What everyone's watching, what just arrived, and what's worth the wait.</p>
        </div>
        <div className="ent-page-side">
          <Icon.TrendingUp size={16} />
          <span>{trending.length + upcoming.length} fresh</span>
        </div>
      </div>

      <div className="ent-rails">
        <Rail title="Trending Now" items={trending} loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={onToggleList} inList={inList} enableHover />
        <Rail title="New Releases" items={nowPlaying} forceMediaType="movie" loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={onToggleList} inList={inList} enableHover />
        <Top10Rail title="Top 10 Movies Today" items={topMovies} forceMediaType="movie" loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={onToggleList} inList={inList} />
        <Top10Rail title="Top 10 Series Today" items={topTv} forceMediaType="tv" loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={onToggleList} inList={inList} />
        <Rail title="Worth the Wait — Coming Soon" items={upcoming} forceMediaType="movie" loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={onToggleList} inList={inList} enableHover />
      </div>
    </div>
  );
}
