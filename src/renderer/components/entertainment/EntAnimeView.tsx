// v9.0.0 — EntAnimeView: a dedicated Anime hub.
// Popular anime series, top-rated classics, and anime movies (Japanese
// animation), each as a landscape rail with hover previews.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { Rail, Top10Rail, type AnyItem } from "./EntRails";
import { asItems, type TmdbItem, type TmdbMediaType } from "../../lib/tmdb-types";

interface AnimeProps {
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  onWatch: (payload: { mediaType: TmdbMediaType; id: number; title: string; posterPath?: string | null; backdropPath?: string | null }) => void;
  inList: (mediaType: TmdbMediaType, id: number) => boolean;
  onToggleList: (item: AnyItem) => void;
}

export function EntAnimeView({ onOpen, onWatch, inList, onToggleList }: AnimeProps) {
  const [animeTv, setAnimeTv] = useState<TmdbItem[]>([]);
  const [animeTop, setAnimeTop] = useState<TmdbItem[]>([]);
  const [animeMovies, setAnimeMovies] = useState<TmdbItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tv, top, mov] = await Promise.all([
        window.nexus.tmdbAnimeTv(1),
        window.nexus.tmdbAnimeTopRated(),
        window.nexus.tmdbAnimeMovies(1),
      ]);
      if (cancelled) return;
      setAnimeTv(asItems(tv));
      setAnimeTop(asItems(top));
      setAnimeMovies(asItems(mov));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const watchFromCard = (mt: TmdbMediaType, id: number, title: string) => {
    onWatch({ mediaType: mt, id, title });
  };

  return (
    <div className="ent-page ent-anime-page">
      <div className="ent-page-head">
        <div>
          <div className="ent-page-label"><Icon.Sparkles size={12} /> NEXUS TV · Genre Hub</div>
          <h1 className="ent-page-title anime">Anime</h1>
          <p className="ent-page-sub">
            Series and films from Japan — shōnen epics, studio classics, and hidden gems, all in one place.
          </p>
        </div>
        <div className="ent-page-side">
          <Icon.Tv size={16} />
          <span>{animeTv.length + animeMovies.length} titles</span>
        </div>
      </div>

      {/* Mood strip — quick anime vibes */}
      <div className="ent-anime-strip">
        {["Shōnen Battle", "Studio Classics", "Slice of Life", "Dark Fantasy", "Mecha", "Sports"].map(m => (
          <span key={m} className="ent-anime-strip-item">{m}</span>
        ))}
      </div>

      <div className="ent-rails">
        <Rail title="Popular Anime Series" items={animeTv} forceMediaType="tv" loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={onToggleList} inList={inList} enableHover />
        <Top10Rail title="All-Time Anime Greats" items={animeTop} forceMediaType="tv" loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={onToggleList} inList={inList} />
        <Rail title="Anime Movies" items={animeMovies} forceMediaType="movie" loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={onToggleList} inList={inList} enableHover />
      </div>
    </div>
  );
}
