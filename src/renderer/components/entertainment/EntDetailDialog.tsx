// v5.0.0 — EntDetailDialog: modal showing backdrop/title/meta/overview/cast/
// genres/watch-providers, with a click-to-play YouTube trailer that swaps the
// backdrop for an embedded iframe (Netflix-style).

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { NexusMark } from "../Logo";
import {
  tmdbImg,
  formatRuntime,
  formatRating,
  asDetails,
  type TmdbMediaType,
  type TmdbMovieDetails,
} from "../../lib/tmdb-types";

interface DetailDialogProps {
  open: boolean;
  mediaType: TmdbMediaType | null;
  id: number | null;
  onClose: () => void;
  /** v5.1.0 — Launch the full-screen CineSrc player. */
  onWatch: (mediaType: TmdbMediaType, id: number, title: string, numberOfSeasons: number | null) => void;
  /** Extra label hint when the details shape is TV (the IPC returns a movie-shape). */
  isTvHint?: boolean;
}

export function EntDetailDialog({ open, mediaType, id, onClose, onWatch, isTvHint }: DetailDialogProps) {
  const [detail, setDetail] = useState<TmdbMovieDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!open || mediaType === null || id === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setPlaying(false);
    (async () => {
      const r = await window.nexus.tmdbDetailsAny(mediaType, id);
      if (cancelled) return;
      const d = asDetails(r);
      if (!d) {
        setError("Couldn't load details. TMDB may be rate-limited — try again shortly.");
      } else {
        setDetail(d);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, mediaType, id]);

  if (!open) return null;

  const typeLabel = isTvHint ? "TV Series" : mediaType === "tv" ? "TV Series" : "Movie";
  const title = detail?.title ?? "";
  const backdrop = detail ? tmdbImg(detail.backdropPath, "w1280") : undefined;
  const poster = detail ? tmdbImg(detail.posterPath, "w342") : undefined;
  const trailerKey = detail?.trailerKey ?? null;

  return (
    <div className="ent-modal-overlay" onClick={onClose}>
      <div className="ent-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title || "Details"}>
        <button className="ent-modal-close" onClick={onClose} aria-label="Close">
          <Icon.Close size={18} />
        </button>

        {/* Header: backdrop OR trailer embed */}
        <div className="ent-modal-header">
          {playing && trailerKey ? (
            <iframe
              className="ent-modal-trailer"
              src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1`}
              title={`${title} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <>
              {backdrop && <img className="ent-modal-backdrop" src={backdrop} alt={title} />}
              <div className="ent-modal-header-scrim" />
              {trailerKey && (
                <button className="ent-modal-play" onClick={() => setPlaying(true)} aria-label="Play trailer">
                  <span className="ent-modal-play-circle"><Icon.Play size={26} /></span>
                  <span className="ent-modal-play-label">Play Trailer</span>
                </button>
              )}
              <div className="ent-modal-titleblock">
                <div className="ent-modal-badges">
                  <span className="ent-badge ent-badge-ent">
                    {mediaType === "tv" ? <Icon.Film size={11} /> : <Icon.Film size={11} />}
                    {typeLabel}
                  </span>
                  {detail && detail.rating > 0 && (
                    <span className="ent-badge ent-badge-star">
                      <Icon.Star size={11} filled /> {formatRating(detail.rating)}
                    </span>
                  )}
                  {detail && detail.year && (
                    <span className="ent-badge ent-badge-meta">
                      <Icon.Calendar size={11} /> {detail.year}
                    </span>
                  )}
                  {detail && detail.runtime ? (
                    <span className="ent-badge ent-badge-meta">
                      <Icon.Clock size={11} /> {formatRuntime(detail.runtime)}
                    </span>
                  ) : null}
                </div>
                <h2 className="ent-modal-title">{title || "Loading…"}</h2>
                {detail?.tagline && <p className="ent-modal-tagline">{detail.tagline}</p>}
              </div>
            </>
          )}
        </div>

        {/* Body */}
        <div className="ent-modal-body">
          {loading && (
            <div className="ent-modal-loading"><Icon.Spinner size={22} /></div>
          )}
          {error && (
            <div className="ent-modal-error">
              <Icon.Film size={28} />
              <p>{error}</p>
            </div>
          )}
          {detail && (
            <>
              {/* Action row */}
              <div className="ent-modal-actions">
                <button
                  className="ent-btn ent-btn-primary"
                  onClick={() => onWatch(mediaType ?? "movie", detail.id, detail.title, detail.numberOfSeasons ?? null)}
                >
                  <Icon.Play size={15} /> Watch Now
                </button>
                {trailerKey && !playing && (
                  <button className="ent-btn ent-btn-ghost" onClick={() => setPlaying(true)}>
                    <Icon.Film size={15} /> Play Trailer
                  </button>
                )}
                {trailerKey && playing && (
                  <button className="ent-btn ent-btn-ghost" onClick={() => setPlaying(false)}>
                    Stop
                  </button>
                )}
                <button className="ent-btn ent-btn-ghost" onClick={() => { /* watchlist stub */ }}>
                  <Icon.Heart size={15} /> Watchlist
                </button>
                {detail.homepage && (
                  <a className="ent-btn ent-btn-ghost" href={detail.homepage} target="_blank" rel="noopener noreferrer" onClick={e => { e.preventDefault(); void window.nexus.tmdbOpenExternal(detail.homepage!); }}>
                    <Icon.ExternalLink size={15} /> Homepage
                  </a>
                )}
                {detail.imdbId && (
                  <a className="ent-btn ent-btn-ghost" href={`https://www.imdb.com/title/${detail.imdbId}/`} target="_blank" rel="noopener noreferrer" onClick={e => { e.preventDefault(); void window.nexus.tmdbOpenExternal(`https://www.imdb.com/title/${detail.imdbId}/`); }}>
                    <Icon.ExternalLink size={15} /> IMDb
                  </a>
                )}
              </div>

              {/* Overview + poster */}
              <div className="ent-modal-grid">
                {poster && (
                  <div className="ent-modal-poster">
                    <img src={poster} alt={title} />
                  </div>
                )}
                <div className="ent-modal-info">
                  {detail.overview && (
                    <>
                      <h3 className="ent-modal-h3">Overview</h3>
                      <p className="ent-modal-overview">{detail.overview}</p>
                    </>
                  )}
                  {detail.genres.length > 0 && (
                    <div className="ent-modal-section">
                      <h3 className="ent-modal-h3"><Icon.Tag size={11} /> Genres</h3>
                      <div className="ent-modal-genres">
                        {detail.genres.map(g => <span key={g.id} className="ent-chip">{g.name}</span>)}
                      </div>
                    </div>
                  )}
                  <div className="ent-modal-meta-grid">
                    <MetaItem label="Status" value={detail.status ?? "—"} />
                    <MetaItem label="Rating" value={detail.rating ? `${formatRating(detail.rating)}` : "—"} />
                    {detail.director && <MetaItem label="Director" value={detail.director} />}
                    {detail.runtime ? <MetaItem label="Runtime" value={formatRuntime(detail.runtime)} /> : null}
                  </div>
                </div>
              </div>

              {/* Cast */}
              {detail.cast.length > 0 && (
                <div className="ent-modal-section">
                  <h3 className="ent-modal-h3">Top Cast</h3>
                  <div className="ent-modal-cast">
                    {detail.cast.map(c => (
                      <div key={c.id} className="ent-cast-item">
                        <div className="ent-cast-img">
                          {c.profilePath ? (
                            <img src={tmdbImg(c.profilePath, "w185")} alt={c.name} loading="lazy" />
                          ) : (
                            <div className="ent-cast-placeholder"><Icon.Home size={16} /></div>
                          )}
                        </div>
                        <div className="ent-cast-name">{c.name}</div>
                        {c.character && <div className="ent-cast-char">{c.character}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Watch providers */}
              {detail.providers && detail.providers.length > 0 && (
                <div className="ent-modal-section">
                  <h3 className="ent-modal-h3">Where to Watch <span className="ent-modal-h3-sub">(US)</span></h3>
                  <div className="ent-modal-providers">
                    {detail.providers.slice(0, 10).map(p => (
                      <span key={p.providerId} className="ent-provider" title={p.providerName}>
                        {p.logoPath && <img src={tmdbImg(p.logoPath, "w92")} alt="" />}
                        {p.providerName}
                      </span>
                    ))}
                    {detail.providerLink && (
                      <a
                        className="ent-provider ent-provider-link"
                        href={detail.providerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => { e.preventDefault(); void window.nexus.tmdbOpenExternal(detail.providerLink!); }}
                      >
                        <Icon.ExternalLink size={11} /> JustWatch
                      </a>
                    )}
                  </div>
                </div>
              )}

              {!trailerKey && (
                <div className="ent-modal-section">
                  <div className="ent-modal-note">No trailer available for this title.</div>
                </div>
              )}

              {/* Brand footer */}
              <div className="ent-modal-foot">
                <NexusMark size={14} />
                <span>NEXUS TV · Metadata by TMDB</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="ent-meta-item">
      <div className="ent-meta-label">{label}</div>
      <div className="ent-meta-value">{value}</div>
    </div>
  );
}
