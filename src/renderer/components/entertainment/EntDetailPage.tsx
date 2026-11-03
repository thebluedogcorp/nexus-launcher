// v6.0.0 — EntDetailPage: full detail page (reference image 1 — cinema style).
// Full-bleed backdrop hero with centered trailer play + glass info panel that
// overlaps the hero (poster, meta, actions), cast avatars, storyline,
// recommendations rail. Replaces the old detail dialog.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { Rail } from "./EntRails";
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

export function EntDetailPage({ mediaType, id, onBack, onOpenDetail, onWatch, inList, onToggleList, onHistoryChange }: DetailProps) {
  const [detail, setDetail] = useState<TmdbMovieDetails | null>(null);
  const [recs, setRecs] = useState<TmdbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trailerPlaying, setTrailerPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setRecs([]);
    setTrailerPlaying(false);
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
        // Record this visit in the Recently Viewed history (v6.3.0).
        recordHistory({
          mediaType,
          id,
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
  }, [mediaType, id]);

  const isTv = mediaType === "tv";
  const typeLabel = isTv ? "Series" : "Film";
  const title = detail?.title ?? "";
  const backdrop = detail ? (tmdbImg(detail.backdropPath, "w1280") ?? tmdbImg(detail.posterPath, "w780")) : undefined;
  const poster = detail ? tmdbImg(detail.posterPath, "w500") : undefined;
  const trailerKey = detail?.trailerKey ?? null;
  const listed = inList(mediaType, id);
  const resume = getContinueFor(mediaType, id);

  const watchPayload = (season?: number, episode?: number): WatchPayload => ({
    mediaType,
    id,
    title,
    posterPath: detail?.posterPath ?? null,
    backdropPath: detail?.backdropPath ?? null,
    numberOfSeasons: detail?.numberOfSeasons ?? null,
    season,
    episode,
    runtimeMin: detail?.runtime ?? null,
  });

  return (
    <div className="ent-dp">
      {/* Ambient blurred backdrop (v6.6.0) — fills the page behind everything */}
      {backdrop && <div className="ent-dp-ambient" style={{ backgroundImage: `url(${backdrop})` }} aria-hidden="true" />}

      {/* ── Hero ── */}
      <div className="ent-dp-hero">
        {trailerPlaying && trailerKey ? (
          <iframe
            className="ent-dp-trailer"
            src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1`}
            title={`${title} trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <>
            {backdrop && <img className="ent-dp-backdrop" src={backdrop} alt={title} />}
            <div className="ent-dp-fade" />
            {/* Trailer play (center, image 1) */}
            {trailerKey && (
              <button className="ent-dp-play" onClick={() => setTrailerPlaying(true)} aria-label="Play trailer">
                <span className="ent-dp-play-ring"><Icon.Play size={26} /></span>
                <span className="ent-dp-play-label">Play Trailer</span>
              </button>
            )}
            {/* Title block */}
            <div className="ent-dp-titleblock">
              <div className="ent-hero-kicker">
                <span className="ent-kicker-brand">NEXUS TV</span>
                <span className="ent-kicker-sep" />
                <span>{typeLabel}</span>
              </div>
              <h1 className="ent-dp-title">{loading ? "…" : title}</h1>
              {detail?.tagline && <p className="ent-dp-tagline">{detail.tagline}</p>}
            </div>
          </>
        )}

        {/* Back pill (image 2) */}
        <div className="ent-dp-topbar">
          <button className="ent-glass-pill" onClick={onBack}>
            <Icon.ArrowLeft size={15} /> Back
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="ent-dp-body">
        {loading && (
          <div className="ent-dp-loading"><Icon.Spinner size={24} /><p>Loading details…</p></div>
        )}
        {error && (
          <div className="ent-empty"><Icon.Film size={34} /><p>{error}</p></div>
        )}

        {detail && (
          <>
            {/* Glass info panel (image 1) */}
            <div className="ent-dp-glass">
              {poster && (
                <div className="ent-dp-poster">
                  <img src={poster} alt={title} />
                </div>
              )}
              <div className="ent-dp-info">
                <div className="ent-dp-ratings">
                  {detail.rating > 0 && (
                    <span className="ent-hm star"><Icon.Star size={12} filled /> {formatRating(detail.rating)}</span>
                  )}
                  {detail.year && <span className="ent-hm">{detail.year}</span>}
                  {detail.runtime ? <span className="ent-hm">{formatRuntime(detail.runtime)}</span> : null}
                  {isTv && detail.numberOfSeasons ? <span className="ent-hm">{detail.numberOfSeasons} season{detail.numberOfSeasons === 1 ? "" : "s"}</span> : null}
                  <span className="ent-hm">{typeLabel}</span>
                </div>

                {detail.overview && <p className="ent-dp-syn">{detail.overview}</p>}

                {detail.genres.length > 0 && (
                  <div className="ent-dp-genres">
                    {detail.genres.map(g => <span className="ent-gpill" key={g.id}>{g.name}</span>)}
                  </div>
                )}

                <div className="ent-dp-actions">
                  <button
                    className="ent-cta primary"
                    onClick={() => onWatch(watchPayload(resume?.season, resume?.episode))}
                  >
                    <Icon.Play size={16} /> {resume ? (isTv ? `Resume S${resume.season} · E${resume.episode}` : "Resume") : "Watch Now"}
                  </button>
                  {trailerKey && !trailerPlaying && (
                    <button className="ent-cta ghost" onClick={() => setTrailerPlaying(true)}>
                      <Icon.Film size={15} /> Trailer
                    </button>
                  )}
                  <button
                    className={listed ? "ent-cta ghost listed" : "ent-cta ghost"}
                    onClick={() => onToggleList({ mediaType, id, title, posterPath: detail.posterPath, rating: detail.rating, year: detail.year })}
                  >
                    <Icon.Bookmark size={15} filled={listed} /> {listed ? "In My List" : "My List"}
                  </button>
                  {detail.imdbId && (
                    <a
                      className="ent-cta ghost link"
                      href={`https://www.imdb.com/title/${detail.imdbId}/`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => { e.preventDefault(); void window.nexus.tmdbOpenExternal(`https://www.imdb.com/title/${detail.imdbId}/`); }}
                    >
                      <Icon.ExternalLink size={14} /> IMDb
                    </a>
                  )}
                </div>

                {/* Resume banner */}
                {resume && (
                  <div className="ent-dp-resume">
                    <span className="ent-dp-resume-bar"><span style={{ width: `${Math.round(resume.progress * 100)}%` }} /></span>
                    <span className="ent-dp-resume-label">
                      {isTv ? `You're on S${resume.season} · E${resume.episode}` : `${Math.round(resume.progress * 100)}% watched`}
                    </span>
                  </div>
                )}
              </div>

              {/* Stats column (image 1 details block) */}
              <div className="ent-dp-stats">
                {detail.director && <Stat label="Director" value={detail.director} />}
                <Stat label="Status" value={detail.status ?? "—"} />
                {detail.runtime ? <Stat label="Runtime" value={formatRuntime(detail.runtime)} /> : null}
                {isTv && detail.numberOfEpisodes ? <Stat label="Episodes" value={String(detail.numberOfEpisodes)} /> : null}
                {detail.cast[0] && <Stat label="Starring" value={detail.cast.slice(0, 3).map(c => c.name).join(", ")} />}
              </div>
            </div>

            {/* Cast */}
            {detail.cast.length > 0 && (
              <section className="ent-dp-section">
                <h2 className="ent-dp-h">Cast</h2>
                <div className="ent-dp-cast">
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
              </section>
            )}

            {/* Storyline (image 1) */}
            {detail.overview && (
              <section className="ent-dp-section">
                <h2 className="ent-dp-h">Storyline</h2>
                <p className="ent-dp-story">{detail.overview}</p>
              </section>
            )}

            {/* Where to watch */}
            {detail.providers && detail.providers.length > 0 && (
              <section className="ent-dp-section">
                <h2 className="ent-dp-h">Also Streaming On <span className="ent-dp-h-sub">(US)</span></h2>
                <div className="ent-dp-prov">
                  {detail.providers.slice(0, 10).map(p => (
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
              </section>
            )}
          </>
        )}

        {/* Recommendations */}
        <div className="ent-dp-recs">
          <Rail title={`More Like ${title || "This"}`} items={recs} onOpen={onOpenDetail} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ent-dp-stat">
      <div className="ent-dp-stat-l">{label}</div>
      <div className="ent-dp-stat-v">{value}</div>
    </div>
  );
}
