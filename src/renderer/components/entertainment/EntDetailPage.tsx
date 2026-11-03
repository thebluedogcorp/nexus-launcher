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
  asDetails,
  asItems,
  type TmdbItem,
  type TmdbMediaType,
  type TmdbMovieDetails,
} from "../../lib/tmdb-types";
import { getContinueFor, recordHistory } from "../../lib/ent-store";

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

type Tab = "overview" | "cast" | "watch" | "facts";

export function EntDetailPage({ mediaType, id, onBack, onOpenDetail, onWatch, inList, onToggleList, onHistoryChange }: DetailProps) {
  const [detail, setDetail] = useState<TmdbMovieDetails | null>(null);
  const [recs, setRecs] = useState<TmdbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setRecs([]);
    setTrailerOpen(false);
    setTab("overview");
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

  const isTv = mediaType === "tv";
  const typeLabel = isTv ? "Series" : "Film";
  const title = detail?.title ?? "";
  const backdrop = detail ? (tmdbImg(detail.backdropPath, "w1280") ?? tmdbImg(detail.posterPath, "w780")) : undefined;
  const poster = detail ? tmdbImg(detail.posterPath, "w500") : undefined;
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
                  <button role="tab" aria-selected={tab === "cast"} className={tab === "cast" ? "ent-dp-tab on" : "ent-dp-tab"} onClick={() => setTab("cast")}>Cast &amp; Crew</button>
                  {detail.providers && detail.providers.length > 0 && (
                    <button role="tab" aria-selected={tab === "watch"} className={tab === "watch" ? "ent-dp-tab on" : "ent-dp-tab"} onClick={() => setTab("watch")}>Where to Watch</button>
                  )}
                  <button role="tab" aria-selected={tab === "facts"} className={tab === "facts" ? "ent-dp-tab on" : "ent-dp-tab"} onClick={() => setTab("facts")}>Facts</button>
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
