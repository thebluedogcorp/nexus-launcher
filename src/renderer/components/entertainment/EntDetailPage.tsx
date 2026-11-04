// v7.1.0 — EntDetailPage: completely redesigned detail/info page.
// A taller cinematic hero with a gradient-blended title block + inline
// rating ring, a tabbed info panel (Overview / Cast & Crew / Where to Watch
// / Facts), a quick-actions bar, a cast grid with character names, a
// recommendations rail, and an ambient backdrop. More immersive + cohesive.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { Rail } from "./EntRails";
import { EntTrailerModal } from "./EntTrailerModal";
import { pushToast } from "./EntToaster";
import type { WatchPayload } from "./EntPlayer";
import {
  tmdbImg,
  formatRuntime,
  formatRating,
  formatAirDate,
  asDetails,
  asItems,
  asSeason,
  type TmdbItem,
  type TmdbMediaType,
  type TmdbMovieDetails,
  type TmdbSeason,
} from "../../lib/tmdb-types";
import { getContinueFor, recordHistory } from "../../lib/ent-store";
import {
  getRating, setRating, getReview, setReview, deleteReview, getCollections, addToCollection,
  isWatched, setWatched, isHidden, setHidden,
  isEpisodeWatched, setEpisodeWatched, countSeasonWatched,
} from "../../lib/ent-userdata";
import { imgSize } from "../../lib/ent-prefs";

interface DetailProps {
  mediaType: TmdbMediaType;
  id: number;
  onBack: () => void;
  onOpenDetail: (mediaType: TmdbMediaType, id: number) => void;
  onWatch: (payload: WatchPayload) => void;
  inList: (mediaType: TmdbMediaType, id: number) => boolean;
  onToggleList: (item: { mediaType: TmdbMediaType; id: number; title: string; posterPath: string | null; rating: number; year: string }) => void;
  onHistoryChange?: () => void;
}

type Tab = "overview" | "episodes" | "cast" | "watch" | "facts" | "review";

export function EntDetailPage({ mediaType, id, onBack, onOpenDetail, onWatch, inList, onToggleList, onHistoryChange }: DetailProps) {
  const [detail, setDetail] = useState<TmdbMovieDetails | null>(null);
  const [recs, setRecs] = useState<TmdbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  // User rating + review (v7.2.0)
  const [userRating, setUserRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewSaved, setReviewSaved] = useState(false);
  const [collections, setCollections] = useState(getCollections());
  // v8.0.0 — Episodes tab (TV only): season browser + episode list.
  const [seasonData, setSeasonData] = useState<TmdbSeason | null>(null);
  const [selSeason, setSelSeason] = useState(1);
  const [seasonLoading, setSeasonLoading] = useState(false);
  // v8.0.0 — watched + hidden title state + per-episode watched refresh tick.
  const [watchedTick, setWatchedTick] = useState(0);
  const [hiddenTick, setHiddenTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setRecs([]);
    setTrailerOpen(false);
    setTab(mediaType === "tv" ? "episodes" : "overview");
    setSelSeason(1);
    (async () => {
      const [d, r] = await Promise.all([
        window.nexus.tmdbDetailsAny(mediaType, id),
        window.nexus.tmdbRecommendations(mediaType, id),
      ]);
      if (cancelled) return;
      const parsed = asDetails(d);
      if (!parsed) setError("Couldn't load details. TMDB may be rate-limited — try again shortly.");
      else {
        setDetail(parsed);
        // Load user rating + review for this title (v7.2.0).
        setUserRating(getRating(mediaType, id));
        const existing = getReview(mediaType, id);
        if (existing) { setReviewText(existing.text); setReviewSaved(true); }
        else { setReviewText(""); setReviewSaved(false); }
        setCollections(getCollections());
        recordHistory({
          mediaType, id,
          title: parsed.title,
          posterPath: parsed.posterPath,
          backdropPath: parsed.backdropPath,
          rating: parsed.rating,
          year: parsed.year,
        });
        onHistoryChange?.();
      }
      setRecs(asItems(r));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mediaType, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // v8.0.0 — fetch season episodes when the Episodes tab is open for a TV title.
  useEffect(() => {
    if (mediaType !== "tv" || !detail || tab !== "episodes") return;
    let cancelled = false;
    setSeasonLoading(true);
    (async () => {
      const r = await window.nexus.tmdbSeasonEpisodes(id, selSeason);
      if (cancelled) return;
      setSeasonData(asSeason(r));
      setSeasonLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mediaType, id, detail, tab, selSeason]); // eslint-disable-line react-hooks/exhaustive-deps

  const isTv = mediaType === "tv";
  const typeLabel = isTv ? "Series" : "Film";
  const title = detail?.title ?? "";
  const backdrop = detail ? (tmdbImg(detail.backdropPath, imgSize("w1280")) ?? tmdbImg(detail.posterPath, imgSize("w780"))) : undefined;
  const poster = detail ? tmdbImg(detail.posterPath, imgSize("w500")) : undefined;
  // v8.0.0 — title-level watched / hidden state (re-read on tick after mutation).
  const _wt = watchedTick; void _wt;
  const _ht = hiddenTick; void _ht;
  const titleWatched = detail ? isWatched(mediaType, id) : false;
  const titleHidden = detail ? isHidden(mediaType, id) : false;
  const trailerKey = detail?.trailerKey ?? null;
  const listed = inList(mediaType, id);
  const resume = getContinueFor(mediaType, id);
  const ratingPct = detail ? Math.round(detail.rating * 10) : 0;

  const watchPayload = (season?: number, episode?: number): WatchPayload => ({
    mediaType, id, title,
    posterPath: detail?.posterPath ?? null,
    backdropPath: detail?.backdropPath ?? null,
    numberOfSeasons: detail?.numberOfSeasons ?? null,
    season, episode,
    runtimeMin: detail?.runtime ?? null,
  });

  return (
    <div className="ent-dp">
      {/* Ambient blurred backdrop */}
      {backdrop && <div className="ent-dp-ambient" style={{ backgroundImage: `url(${backdrop})` }} aria-hidden="true" />}

      {/* ── Cinematic hero ── */}
      <div className="ent-dp-hero">
        {backdrop && <img className="ent-dp-backdrop" src={backdrop} alt={title} />}
        <div className="ent-dp-fade" />

        {/* Top bar: back + quick actions */}
        <div className="ent-dp-topbar">
          <button className="ent-glass-pill" onClick={onBack}>
            <Icon.ArrowLeft size={15} /> Back
          </button>
          <div className="ent-dp-topbar-actions">
            <button
              className={listed ? "ent-dp-icon-btn on" : "ent-dp-icon-btn"}
              onClick={() => onToggleList({ mediaType, id, title, posterPath: detail?.posterPath ?? null, rating: detail?.rating ?? 0, year: detail?.year ?? "" })}
              title={listed ? "Remove from My List" : "Add to My List"}
              aria-label={listed ? "Remove from My List" : "Add to My List"}
            >
              <Icon.Bookmark size={16} filled={listed} />
            </button>
            <button
              className="ent-dp-icon-btn"
              onClick={() => {
                const url = `https://www.themoviedb.org/${mediaType}/${id}`;
                navigator.clipboard?.writeText(url).then(
                  () => pushToast("Link copied to clipboard", "success", <Icon.Tag size={13} />),
                  () => pushToast("Couldn't copy — try again", "error", <Icon.Close size={13} />),
                );
              }}
              title="Copy TMDB link"
              aria-label="Copy link"
            >
              <Icon.Tag size={15} />
            </button>
          </div>
        </div>

        {/* Title block */}
        <div className="ent-dp-titleblock">
          <div className="ent-hero-kicker">
            <span className="ent-kicker-brand">NEXUS TV</span>
            <span className="ent-kicker-sep" />
            <span>{typeLabel}</span>
          </div>
          <h1 className="ent-dp-title">{loading ? "…" : title}</h1>
          {detail?.tagline && <p className="ent-dp-tagline">{detail.tagline}</p>}

          {/* Inline meta row */}
          {detail && (
            <div className="ent-dp-meta">
              {/* Rating ring */}
              {detail.rating > 0 && (
                <div className="ent-dp-ring" title={`TMDB score: ${formatRating(detail.rating)}`}>
                  <svg viewBox="0 0 36 36" className="ent-dp-ring-svg">
                    <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="16" fill="none" stroke="#fbbf24" strokeWidth="3"
                      strokeDasharray={`${ratingPct} 100`} strokeLinecap="round"
                      transform="rotate(-90 18 18)" pathLength={100} />
                  </svg>
                  <span className="ent-dp-ring-val">{ratingPct}<small>%</small></span>
                </div>
              )}
              {detail.year && <span className="ent-dp-meta-item">{detail.year}</span>}
              {detail.runtime ? <span className="ent-dp-meta-item">{formatRuntime(detail.runtime)}</span> : null}
              {isTv && detail.numberOfSeasons ? <span className="ent-dp-meta-item">{detail.numberOfSeasons} season{detail.numberOfSeasons === 1 ? "" : "s"}</span> : null}
              {isTv && detail.numberOfEpisodes ? <span className="ent-dp-meta-item">{detail.numberOfEpisodes} eps</span> : null}
              {detail.genres.slice(0, 2).map(g => <span className="ent-dp-meta-badge" key={g.id}>{g.name}</span>)}
            </div>
          )}
        </div>

        {/* Trailer play (center) */}
        {trailerKey && !trailerOpen && (
          <button className="ent-dp-play" onClick={() => setTrailerOpen(true)} aria-label="Play trailer">
            <span className="ent-dp-play-ring"><Icon.Play size={26} /></span>
            <span className="ent-dp-play-label">Play Trailer</span>
          </button>
        )}
      </div>

      {/* ── Action bar (primary CTAs) ── */}
      {detail && (
        <div className="ent-dp-actionbar">
          <button className="ent-cta primary lg" onClick={() => onWatch(watchPayload(resume?.season, resume?.episode))}>
            <Icon.Play size={18} /> {resume ? (isTv ? `Resume S${resume.season} · E${resume.episode}` : "Resume") : "Watch Now"}
          </button>
          {trailerKey && (
            <button className="ent-cta ghost lg" onClick={() => setTrailerOpen(true)}>
              <Icon.Film size={16} /> Watch Trailer
            </button>
          )}
          {detail.imdbId && (
            <a
              className="ent-cta ghost lg link"
              href={`https://www.imdb.com/title/${detail.imdbId}/`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => { e.preventDefault(); void window.nexus.tmdbOpenExternal(`https://www.imdb.com/title/${detail.imdbId}/`); }}
            >
              <Icon.ExternalLink size={15} /> IMDb
            </a>
          )}
          {detail.homepage && (
            <a
              className="ent-cta ghost lg link"
              href={detail.homepage}
              target="_blank" rel="noopener noreferrer"
              onClick={e => { e.preventDefault(); void window.nexus.tmdbOpenExternal(detail.homepage!); }}
            >
              <Icon.ExternalLink size={15} /> Homepage
            </a>
          )}
          {/* User star rating (v7.2.0) */}
          <div className="ent-dp-rating-widget" title="Your rating">
            <span className="ent-dp-rating-label">Your rating</span>
            <div className="ent-dp-stars">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <button
                  key={n}
                  className={n <= userRating ? "ent-dp-star on" : "ent-dp-star"}
                  onClick={() => {
                    const next = n === userRating ? 0 : n;
                    setRating(mediaType, id, next);
                    setUserRating(next);
                    pushToast(next === 0 ? "Rating cleared" : `Rated ${next}/10`, "success", <Icon.Star size={13} filled />);
                  }}
                  aria-label={`Rate ${n}/10`}
                >
                  <Icon.Star size={13} filled={n <= userRating} />
                </button>
              ))}
            </div>
          </div>
          {/* Add to collection (v7.2.0) */}
          {collections.length > 0 && (
            <div className="ent-dp-col-add">
              <Icon.Library size={15} />
              <select
                defaultValue=""
                onChange={e => {
                  if (!e.target.value) return;
                  addToCollection(e.target.value, { mediaType, id, title, posterPath: detail.posterPath });
                  pushToast(`Added to collection`, "success", <Icon.Library size={13} />);
                  e.target.value = "";
                }}
              >
                <option value="" disabled>Add to collection…</option>
                {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {/* v8.0.0 — Mark watched + Hide from recommendations */}
          <button
            className={titleWatched ? "ent-cta ghost lg on" : "ent-cta ghost lg"}
            onClick={() => {
              setWatched(mediaType, id, !titleWatched);
              setWatchedTick(t => t + 1);
              pushToast(titleWatched ? "Marked as not watched" : "Marked as watched", "success", <Icon.Eye size={14} />);
            }}
            title={titleWatched ? "Mark as not watched" : "Mark as watched"}
          >
            <Icon.Eye size={15} /> {titleWatched ? "Watched" : "Mark Watched"}
          </button>
          <button
            className={titleHidden ? "ent-cta ghost lg warn" : "ent-cta ghost lg"}
            onClick={() => {
              setHidden(mediaType, id, !titleHidden);
              setHiddenTick(t => t + 1);
              pushToast(titleHidden ? "Shown in recommendations again" : "Hidden from recommendations", "info", <Icon.EyeOff size={14} />);
            }}
            title={titleHidden ? "Show in recommendations" : "Hide from recommendations"}
          >
            <Icon.EyeOff size={15} /> {titleHidden ? "Hidden" : "Hide"}
          </button>
          {/* Resume progress bar */}
          {resume && (
            <div className="ent-dp-actionbar-resume">
              <span className="ent-dp-resume-bar"><span style={{ width: `${Math.round(resume.progress * 100)}%` }} /></span>
              <span className="ent-dp-resume-label">
                {isTv ? `You're on S${resume.season} · E${resume.episode}` : `${Math.round(resume.progress * 100)}% watched`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="ent-dp-body">
        {loading && (
          <div className="ent-dp-loading"><Icon.Spinner size={28} /><p>Loading details…</p></div>
        )}
        {error && (
          <div className="ent-empty"><Icon.Film size={34} /><p>{error}</p></div>
        )}

        {detail && (
          <>
            {/* Poster + tabbed info panel */}
            <div className="ent-dp-panel">
              {poster && (
                <div className="ent-dp-poster">
                  <img src={poster} alt={title} />
                </div>
              )}

              <div className="ent-dp-panel-content">
                {/* Tabs */}
                <div className="ent-dp-tabs" role="tablist">
                  <button role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "ent-dp-tab on" : "ent-dp-tab"} onClick={() => setTab("overview")}>Overview</button>
                  {isTv && (
                    <button role="tab" aria-selected={tab === "episodes"} className={tab === "episodes" ? "ent-dp-tab on" : "ent-dp-tab"} onClick={() => setTab("episodes")}>Episodes</button>
                  )}
                  <button role="tab" aria-selected={tab === "cast"} className={tab === "cast" ? "ent-dp-tab on" : "ent-dp-tab"} onClick={() => setTab("cast")}>Cast &amp; Crew</button>
                  {detail.providers && detail.providers.length > 0 && (
                    <button role="tab" aria-selected={tab === "watch"} className={tab === "watch" ? "ent-dp-tab on" : "ent-dp-tab"} onClick={() => setTab("watch")}>Where to Watch</button>
                  )}
                  <button role="tab" aria-selected={tab === "facts"} className={tab === "facts" ? "ent-dp-tab on" : "ent-dp-tab"} onClick={() => setTab("facts")}>Facts</button>
                  <button role="tab" aria-selected={tab === "review"} className={tab === "review" ? "ent-dp-tab on" : "ent-dp-tab"} onClick={() => setTab("review")}>My Review</button>
                </div>

                {/* Tab content */}
                <div className="ent-dp-tabbody">
                  {tab === "overview" && (
                    <div className="ent-dp-tabpane">
                      {detail.overview && <p className="ent-dp-story">{detail.overview}</p>}
                      {detail.genres.length > 0 && (
                        <div className="ent-dp-genres">
                          {detail.genres.map(g => <span className="ent-gpill" key={g.id}>{g.name}</span>)}
                        </div>
                      )}
                      {/* Quick facts strip */}
                      <div className="ent-dp-quickfacts">
                        {detail.director && <Fact label="Director" value={detail.director} />}
                        <Fact label="Status" value={detail.status ?? "—"} />
                        {detail.runtime ? <Fact label="Runtime" value={formatRuntime(detail.runtime)} /> : null}
                        {isTv && detail.numberOfEpisodes ? <Fact label="Episodes" value={String(detail.numberOfEpisodes)} /> : null}
                        {detail.cast[0] && <Fact label="Starring" value={detail.cast.slice(0, 3).map(c => c.name).join(", ")} />}
                      </div>
                    </div>
                  )}

                  {tab === "episodes" && isTv && (
                    <div className="ent-dp-tabpane">
                      <div className="ent-dp-eps-head">
                        <div className="ent-dp-eps-season">
                          <label className="ent-dp-eps-season-l">Season</label>
                          <select
                            value={selSeason}
                            onChange={e => setSelSeason(Number(e.target.value))}
                            className="ent-dp-eps-select"
                          >
                            {Array.from({ length: Math.max(1, detail.numberOfSeasons ?? 1) }, (_, i) => i + 1).map(s => (
                              <option key={s} value={s}>Season {s}</option>
                            ))}
                          </select>
                        </div>
                        {seasonData && seasonData.episodes.length > 0 && (
                          <div className="ent-dp-eps-progress">
                            <Icon.Eye size={13} />
                            <span>{countSeasonWatched(mediaType, id, selSeason, seasonData.episodes.length)} / {seasonData.episodes.length} watched</span>
                          </div>
                        )}
                      </div>
                      {seasonData?.overview && <p className="ent-dp-eps-overview">{seasonData.overview}</p>}
                      {seasonLoading ? (
                        <div className="ent-dp-loading"><Icon.Spinner size={22} /><p>Loading episodes…</p></div>
                      ) : seasonData && seasonData.episodes.length > 0 ? (
                        <div className="ent-dp-eps">
                          {seasonData.episodes.map(ep => {
                            const epW = isEpisodeWatched(mediaType, id, selSeason, ep.episodeNumber);
                            const still = tmdbImg(ep.stillPath, imgSize("w342")) ?? poster;
                            return (
                              <div key={ep.id} className={epW ? "ent-dp-ep watched" : "ent-dp-ep"}>
                                <button
                                  className="ent-dp-ep-thumb"
                                  onClick={() => onWatch(watchPayload(selSeason, ep.episodeNumber))}
                                  title="Play this episode"
                                  aria-label={`Play ${ep.name}`}
                                >
                                  {still ? <img src={still} alt={ep.name} loading="lazy" /> : <div className="ent-dp-ep-ph"><Icon.Film size={20} /></div>}
                                  <span className="ent-dp-ep-play"><Icon.Play size={20} /></span>
                                  <span className="ent-dp-ep-num">E{ep.episodeNumber}</span>
                                </button>
                                <div className="ent-dp-ep-body">
                                  <div className="ent-dp-ep-top">
                                    <span className="ent-dp-ep-title">{ep.name}</span>
                                    {ep.rating > 0 && <span className="ent-dp-ep-rating"><Icon.Star size={11} filled /> {ep.rating.toFixed(1)}</span>}
                                  </div>
                                  {ep.overview && <p className="ent-dp-ep-ov">{ep.overview}</p>}
                                  <div className="ent-dp-ep-meta">
                                    {ep.runtime ? <span><Icon.Clock size={11} /> {formatRuntime(ep.runtime)}</span> : null}
                                    {ep.airDate ? <span><Icon.Calendar size={11} /> {formatAirDate(ep.airDate)}</span> : null}
                                  </div>
                                  <div className="ent-dp-ep-actions">
                                    <button className="ent-cta ghost sm" onClick={() => onWatch(watchPayload(selSeason, ep.episodeNumber))}>
                                      <Icon.Play size={13} /> Play
                                    </button>
                                    <button
                                      className={epW ? "ent-dp-ep-watch on" : "ent-dp-ep-watch"}
                                      onClick={() => {
                                        setEpisodeWatched(mediaType, id, selSeason, ep.episodeNumber, !epW);
                                        setWatchedTick(t => t + 1);
                                      }}
                                      title={epW ? "Mark as not watched" : "Mark as watched"}
                                    >
                                      <Icon.Eye size={13} /> {epW ? "Watched" : "Mark watched"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="ent-dp-tabpane-empty"><Icon.Tv size={26} /><p>No episode data for this season.</p></div>
                      )}
                    </div>
                  )}

                  {tab === "cast" && (
                    <div className="ent-dp-tabpane">
                      {detail.cast.length > 0 ? (
                        <div className="ent-dp-cast-grid">
                          {detail.cast.map(c => (
                            <div key={c.id} className="ent-dp-cast-item">
                              <div className="ent-dp-cast-img">
                                {c.profilePath
                                  ? <img src={tmdbImg(c.profilePath, "w185")} alt={c.name} loading="lazy" />
                                  : <div className="ent-cast-ph"><Icon.Home size={18} /></div>}
                              </div>
                              <div className="ent-dp-cast-name">{c.name}</div>
                              {c.character && <div className="ent-dp-cast-char">{c.character}</div>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="ent-dp-tabpane-empty"><Icon.Film size={26} /><p>No cast information available.</p></div>
                      )}
                    </div>
                  )}

                  {tab === "watch" && detail.providers && (
                    <div className="ent-dp-tabpane">
                      <div className="ent-dp-prov">
                        {detail.providers.slice(0, 12).map(p => (
                          <span key={p.providerId} className="ent-provider" title={p.providerName}>
                            {p.logoPath && <img src={tmdbImg(p.logoPath, "w92")} alt="" />}
                            {p.providerName}
                          </span>
                        ))}
                        {detail.providerLink && (
                          <a
                            className="ent-provider link"
                            href={detail.providerLink}
                            target="_blank" rel="noopener noreferrer"
                            onClick={e => { e.preventDefault(); void window.nexus.tmdbOpenExternal(detail.providerLink!); }}
                          >
                            <Icon.ExternalLink size={11} /> JustWatch
                          </a>
                        )}
                      </div>
                      <p className="ent-dp-prov-note">Streaming availability for your region (US). NEXUS TV streams via CineSrc regardless of these providers.</p>
                    </div>
                  )}

                  {tab === "facts" && (
                    <div className="ent-dp-tabpane">
                      <div className="ent-dp-facts">
                        <Fact label="Type" value={typeLabel} />
                        <Fact label="Release Year" value={detail.year || "—"} />
                        {detail.runtime ? <Fact label="Runtime" value={formatRuntime(detail.runtime)} /> : null}
                        {isTv && detail.numberOfSeasons ? <Fact label="Seasons" value={String(detail.numberOfSeasons)} /> : null}
                        {isTv && detail.numberOfEpisodes ? <Fact label="Total Episodes" value={String(detail.numberOfEpisodes)} /> : null}
                        <Fact label="TMDB Rating" value={detail.rating > 0 ? `${formatRating(detail.rating)}/10 (${ratingPct}%)` : "—"} />
                        {detail.director && <Fact label="Director" value={detail.director} />}
                        <Fact label="Status" value={detail.status ?? "—"} />
                        {detail.imdbId && <Fact label="IMDb ID" value={detail.imdbId} />}
                        {detail.genres.length > 0 && <Fact label="Genres" value={detail.genres.map(g => g.name).join(", ")} />}
                        {detail.cast[0] && <Fact label="Top Cast" value={detail.cast.slice(0, 5).map(c => c.name).join(", ")} />}
                      </div>
                    </div>
                  )}

                  {tab === "review" && (
                    <div className="ent-dp-tabpane">
                      <div className="ent-dp-review">
                        <div className="ent-dp-review-head">
                          <span className="ent-dp-review-title">Your Notes &amp; Review</span>
                          {userRating > 0 && <span className="ent-dp-review-rating"><Icon.Star size={12} filled /> {userRating}/10</span>}
                        </div>
                        <textarea
                          className="ent-dp-review-input"
                          value={reviewText}
                          onChange={e => { setReviewText(e.target.value); setReviewSaved(false); }}
                          placeholder="Write your thoughts on this title… (saved locally on this PC)"
                          rows={6}
                        />
                        <div className="ent-dp-review-actions">
                          <button
                            className="ent-cta primary"
                            onClick={() => {
                              if (!reviewText.trim()) { deleteReview(mediaType, id); setReviewSaved(false); pushToast("Review deleted", "info", <Icon.Trash size={13} />); }
                              else { setReview({ mediaType, id, title, text: reviewText.trim() }); setReviewSaved(true); pushToast("Review saved", "success", <Icon.Check size={13} />); }
                            }}
                          >
                            <Icon.Check size={15} /> {reviewText.trim() ? "Save Review" : "Delete Review"}
                          </button>
                          {reviewSaved && <span className="ent-dp-review-saved"><Icon.CheckCircle size={13} /> Saved</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recommendations */}
            <div className="ent-dp-recs">
              <Rail title={`More Like ${title || "This"}`} items={recs} onOpen={onOpenDetail} />
            </div>
          </>
        )}
      </div>

      {/* Trailer modal */}
      <EntTrailerModal
        open={trailerOpen}
        mediaType={mediaType}
        id={id}
        title={title}
        onClose={() => setTrailerOpen(false)}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="ent-dp-fact">
      <div className="ent-dp-fact-l">{label}</div>
      <div className="ent-dp-fact-v">{value}</div>
    </div>
  );
}
