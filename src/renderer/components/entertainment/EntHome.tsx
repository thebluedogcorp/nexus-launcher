// v6.0.0 — EntHome: the NEXUS TV home screen. Cinematic hero (Apple TV+ style)
// + Continue Watching rail (local progress) + Top 10 + six browse rails.
// v6.1.0 — hover preview cards on every rail + direct Watch/List actions.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { EntHero } from "./EntHero";
import { EntLandscapeCard, Rail, Top10Rail, type AnyItem } from "./EntRails";
import type { WatchPayload } from "./EntPlayer";
import { pushToast } from "./EntToaster";
import { asItems, asMovies, tmdbImg, MOVIE_GENRES, TV_GENRES, type TmdbItem, type TmdbMovie, type TmdbMediaType } from "../../lib/tmdb-types";
import { getContinue, removeFromContinue, getHistory, clearHistory, type ContinueEntry, type HistoryEntry } from "../../lib/ent-store";

interface HomeProps {
  progressTick: number;
  historyTick: number;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  onWatch: (payload: WatchPayload) => void;
  inList: (mediaType: TmdbMediaType, id: number) => boolean;
  onToggleList: (item: TmdbItem) => void;
  /** Jump to a filtered browse view. v6.7.0. */
  onBrowseGenre?: (mediaType: "movie" | "tv", genreId: number) => void;
}

export function EntHome({ progressTick, historyTick, onOpen, onWatch, inList, onToggleList, onBrowseGenre }: HomeProps) {
  // Adapt the shell's TmdbItem-based toggle to the card's AnyItem signature.
  const toggleAny = (item: AnyItem) => {
    onToggleList({
      id: item.id,
      title: item.title,
      posterPath: item.posterPath ?? null,
      backdropPath: item.backdropPath ?? null,
      rating: item.rating ?? 0,
      year: item.year ?? "",
      overview: item.overview ?? "",
      genreIds: item.genreIds ?? [],
      mediaType: item.mediaType ?? "movie",
    } as TmdbItem);
  };
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

  // Recently Viewed history (re-read whenever a detail page is visited).
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    setHistory(getHistory().slice(0, 12));
  }, [historyTick]);
  const [histCleared, setHistCleared] = useState(false);
  const clearHist = () => { clearHistory(); setHistory([]); setHistCleared(true); pushToast("History cleared", "info", <Icon.Clock2 size={14} />); };

  // "Surprise Me" — pick a random trending title and start watching it.
  const surpriseMe = () => {
    const pool = [...trending, ...popularTv];
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    onWatch({
      mediaType: pick.mediaType,
      id: pick.id,
      title: pick.title,
      posterPath: pick.posterPath ?? null,
      backdropPath: pick.backdropPath ?? null,
    });
    pushToast(`Surprise! Playing ${pick.title}`, "success", <Icon.Sparkles size={14} />);
  };

  // Listen for the global "nx-surprise" event (triggered by the `s` shortcut).
  useEffect(() => {
    const handler = () => surpriseMe();
    window.addEventListener("nx-surprise", handler);
    return () => window.removeEventListener("nx-surprise", handler);
  }); // re-bind every render so surpriseMe closes over the latest trending pool

  // Bridge: EntRails expects onWatch(mt, id, title) → adapt to full payload.
  const watchFromCard = (mt: TmdbMediaType, id: number, title: string) => {
    const fromList = trending.find(i => i.id === id && i.mediaType === mt)
      ?? popularTv.find(i => i.id === id)
      ?? topRatedTv.find(i => i.id === id);
    onWatch({
      mediaType: mt,
      id,
      title,
      posterPath: fromList?.posterPath ?? null,
      backdropPath: fromList?.backdropPath ?? null,
    });
  };

  return (
    <div className="ent-home">
      <EntHero
        items={trending.slice(0, 10)}
        loading={loading}
        onOpen={onOpen}
        onWatch={(mt, id, title, backdropPath, posterPath) => onWatch({ mediaType: mt, id, title, backdropPath, posterPath })}
        inList={inList}
        onToggleList={toggleAny}
      />

      {/* Surprise Me bar (v6.4.0) */}
      <div className="ent-surprise-bar">
        <div className="ent-surprise-text">
          <Icon.Sparkles size={16} />
          <span>Can't decide? Let NEXUS pick something for you.</span>
        </div>
        <button className="ent-surprise-btn" onClick={surpriseMe} disabled={loading || trending.length === 0}>
          <Icon.Shuffle size={15} /> Surprise Me
        </button>
      </div>

      {/* Genre quick-filter bar (v6.7.0) — jump to filtered browse */}
      {onBrowseGenre && (
        <div className="ent-genre-bar">
          <div className="ent-genre-bar-head">
            <Icon.Tag size={14} />
            <span>Browse by genre</span>
          </div>
          <div className="ent-genre-bar-chips">
            {MOVIE_GENRES.slice(0, 8).map(g => (
              <button key={`m-${g.id}`} className="ent-genre-chip" onClick={() => onBrowseGenre("movie", g.id)}>
                {g.name}
              </button>
            ))}
            <span className="ent-genre-bar-sep" />
            {TV_GENRES.slice(0, 6).map(g => (
              <button key={`t-${g.id}`} className="ent-genre-chip tv" onClick={() => onBrowseGenre("tv", g.id)}>
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

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

        {/* Recently Viewed (v6.3.0) — portrait cards of detail-page visits */}
        {history.length > 0 && !histCleared && (
          <section className="ent-rail ent-rail-history">
            <div className="ent-rail-head">
              <h2 className="ent-rail-title"><Icon.Clock2 size={14} /> Recently Viewed</h2>
              <span className="ent-rail-count">{history.length}</span>
              <button className="ent-rail-clear" onClick={clearHist} title="Clear history" aria-label="Clear history">
                <Icon.Close size={12} /> Clear
              </button>
            </div>
            <div className="ent-rail-track">
              {history.map(h => (
                <div className="ent-lcard-wrap ent-history-card" key={`${h.mediaType}-${h.id}`}>
                  <button className="ent-lcard" onClick={() => onOpen(h.mediaType, h.id)} title={h.title}>
                    <div className="ent-lcard-media">
                      {(h.backdropPath || h.posterPath) ? (
                        <img src={tmdbImg(h.backdropPath, "w780") ?? tmdbImg(h.posterPath, "w500") ?? ""} alt={h.title} loading="lazy" />
                      ) : (
                        <div className="ent-lcard-ph"><Icon.Film size={26} /></div>
                      )}
                      <span className={h.mediaType === "tv" ? "ent-lchip tv" : "ent-lchip"}>{h.mediaType === "tv" ? "Series" : "Film"}</span>
                      <div className="ent-lcard-hover"><span className="ent-lcard-play"><Icon.Play size={18} /></span></div>
                      <div className="ent-lcard-meta">
                        <div className="ent-lcard-title">{h.title}</div>
                        <div className="ent-lcard-sub">{h.year || "—"}</div>
                      </div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Top 10 Movies (Netflix-style numbered rail) */}
        <Top10Rail
          title="Top 10 Movies Today"
          items={topRated}
          forceMediaType="movie"
          loading={loading}
          onOpen={onOpen}
          onWatch={watchFromCard}
          onToggleList={toggleAny}
          inList={inList}
        />

        <Rail title="Trending This Week" items={trending} loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={toggleAny} inList={inList} enableHover />
        <Rail title="Now Playing in Theaters" items={nowPlaying} forceMediaType="movie" loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={toggleAny} inList={inList} enableHover />
        <Rail title="Popular Movies" items={popular} forceMediaType="movie" loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={toggleAny} inList={inList} enableHover />
        <Rail title="Popular Series" items={popularTv} forceMediaType="tv" loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={toggleAny} inList={inList} enableHover />
        <Rail title="Top Rated Series" items={topRatedTv} forceMediaType="tv" loading={loading} onOpen={onOpen} onWatch={watchFromCard} onToggleList={toggleAny} inList={inList} enableHover />

        {/* Brand strip */}
        <div className="ent-brandstrip">
          <Icon.Sparkles size={14} />
          <span>Thousands of films &amp; series — indexed against TMDB, streamed via CineSrc, progress saved locally on this PC.</span>
        </div>
      </div>
    </div>
  );
}
