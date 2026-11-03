// v6.0.0 — EntHome: the NEXUS TV home screen. Cinematic hero (Apple TV+ style)
// + Continue Watching rail (local progress) + six browse rails.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { EntHero } from "./EntHero";
import { EntLandscapeCard, Rail } from "./EntRails";
import type { WatchPayload } from "./EntPlayer";
import { asItems, asMovies, type TmdbItem, type TmdbMovie, type TmdbMediaType } from "../../lib/tmdb-types";
import { getContinue, removeFromContinue, type ContinueEntry } from "../../lib/ent-store";

interface HomeProps {
  progressTick: number;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  onWatch: (payload: WatchPayload) => void;
  inList: (mediaType: TmdbMediaType, id: number) => boolean;
  onToggleList: (item: TmdbItem) => void;
}

export function EntHome({ progressTick, onOpen, onWatch, inList, onToggleList }: HomeProps) {
  // Browse data
  const [trending, setTrending] = useState<TmdbItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<TmdbMovie[]>([]);
  const [popular, setPopular] = useState<TmdbMovie[]>([]);
  const [popularTv, setPopularTv] = useState<TmdbItem[]>([]);
  const [topRated, setTopRated] = useState<TmdbMovie[]>([]);
  const [topRatedTv, setTopRatedTv] = useState<TmdbItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, np, pop, ptv, tr, trtv] = await Promise.all([
        window.nexus.tmdbTrendingAll(),
        window.nexus.tmdbNowPlaying(),
        window.nexus.tmdbPopular(),
        window.nexus.tmdbPopularTv(),
        window.nexus.tmdbTopRated(),
        window.nexus.tmdbTopRatedTv(),
      ]);
      if (cancelled) return;
      setTrending(asItems(t));
      setNowPlaying(asMovies(np));
      setPopular(asMovies(pop));
      setPopularTv(asItems(ptv));
      setTopRated(asMovies(tr));
      setTopRatedTv(asItems(trtv));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Continue Watching entries (re-read whenever the player saves progress).
  const [cont, setCont] = useState<ContinueEntry[]>([]);
  useEffect(() => {
    setCont(getContinue().slice(0, 12));
  }, [progressTick]);

  return (
    <div className="ent-home">
      <EntHero
        items={trending.slice(0, 10)}
        loading={loading}
        onOpen={onOpen}
        onWatch={(mt, id, title, backdropPath, posterPath) => onWatch({ mediaType: mt, id, title, backdropPath, posterPath })}
        inList={inList}
        onToggleList={onToggleList}
      />

      <div className="ent-rails">
        {cont.length > 0 && (
          <section className="ent-rail">
            <div className="ent-rail-head">
              <h2 className="ent-rail-title">Continue Watching</h2>
              <span className="ent-rail-count">{cont.length}</span>
            </div>
            <div className="ent-rail-track">
              {cont.map(e => (
                <EntLandscapeCard
                  key={`${e.mediaType}-${e.id}`}
                  item={e}
                  forceMediaType={e.mediaType}
                  onOpen={() => onWatch({
                    mediaType: e.mediaType,
                    id: e.id,
                    title: e.title,
                    posterPath: e.posterPath,
                    backdropPath: e.backdropPath,
                    season: e.season,
                    episode: e.episode,
                  })}
                  progress={e.progress}
                  subLabel={e.mediaType === "tv" ? `S${e.season} · E${e.episode}` : "Resume"}
                  onRemove={() => { removeFromContinue(e.mediaType, e.id); setCont(getContinue().slice(0, 12)); }}
                />
              ))}
            </div>
          </section>
        )}

        <Rail title="Trending This Week" items={trending} loading={loading} onOpen={onOpen} />
        <Rail title="Now Playing in Theaters" items={nowPlaying} forceMediaType="movie" loading={loading} onOpen={onOpen} />
        <Rail title="Popular Movies" items={popular} forceMediaType="movie" loading={loading} onOpen={onOpen} />
        <Rail title="Popular Series" items={popularTv} forceMediaType="tv" loading={loading} onOpen={onOpen} />
        <Rail title="Top Rated Movies" items={topRated} forceMediaType="movie" loading={loading} onOpen={onOpen} />
        <Rail title="Top Rated Series" items={topRatedTv} forceMediaType="tv" loading={loading} onOpen={onOpen} />

        {/* Brand strip */}
        <div className="ent-brandstrip">
          <Icon.Sparkles size={14} />
          <span>Thousands of films &amp; series — indexed against TMDB, streamed via CineSrc, progress saved locally on this PC.</span>
        </div>
      </div>
    </div>
  );
}
