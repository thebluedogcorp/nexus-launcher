// v5.1.0 — EntPlayer: full-screen content player that embeds the CineSrc
// streaming iframe (movies + TV by TMDB ID). For TV, a season/episode
// selector re-targets the iframe without re-mounting the whole overlay.
//
// CineSrc (cinesrc.st) is a free streaming-API that indexes embeddable
// streams against TMDB IDs — no scraping, no file hosting. The embed pages
// return 200 with no X-Frame-Options, so they iframe cleanly.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icons";
import { cinesrcEmbedUrl, type TmdbMediaType } from "../../lib/tmdb-types";

interface EntPlayerProps {
  open: boolean;
  mediaType: TmdbMediaType;
  tmdbId: number;
  title: string;
  /** TV only — drives the season dropdown range. */
  numberOfSeasons: number | null;
  onClose: () => void;
}

export function EntPlayer({ open, mediaType, tmdbId, title, numberOfSeasons, onClose }: EntPlayerProps) {
  const isTv = mediaType === "tv";
  const seasons = useMemo(() => {
    const n = numberOfSeasons && numberOfSeasons > 0 ? numberOfSeasons : 1;
    return Array.from({ length: Math.min(n, 50) }, (_, i) => i + 1);
  }, [numberOfSeasons]);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);

  // Reset selectors when the target changes.
  useEffect(() => {
    setSeason(1);
    setEpisode(1);
  }, [tmdbId, mediaType]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const src = cinesrcEmbedUrl(mediaType, tmdbId, season, episode);

  return (
    <div className="ent-player-overlay" role="dialog" aria-modal="true" aria-label={`Playing ${title}`}>
      {/* Top control bar */}
      <div className="ent-player-bar">
        <div className="ent-player-bar-left">
          <span className="ent-player-badge">{isTv ? "TV" : "Movie"}</span>
          <div className="ent-player-title">{title}</div>
          {isTv && (
            <div className="ent-player-se">
              {numberOfSeasons && numberOfSeasons > 1 ? (
                <label className="ent-player-se-group">
                  <span>S</span>
                  <select value={season} onChange={e => { setSeason(Number(e.target.value)); setEpisode(1); }}>
                    {seasons.map(s => <option key={s} value={s}>S{s}</option>)}
                  </select>
                </label>
              ) : (
                <label className="ent-player-se-group">
                  <span>S</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={season}
                    onChange={e => {
                      const v = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                      setSeason(v);
                      setEpisode(1);
                    }}
                  />
                </label>
              )}
              <label className="ent-player-se-group">
                <span>E</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={episode}
                  onChange={e => {
                    const v = Math.max(1, Math.min(99, Number(e.target.value) || 1));
                    setEpisode(v);
                  }}
                />
              </label>
              <button
                className="ent-player-prev"
                onClick={() => setEpisode(e => Math.max(1, e - 1))}
                disabled={episode <= 1}
                title="Previous episode"
              >
                <Icon.Chevron size={14} />
              </button>
              <button
                className="ent-player-next"
                onClick={() => setEpisode(e => Math.min(99, e + 1))}
                title="Next episode"
              >
                <Icon.Chevron size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="ent-player-bar-right">
          <a
            className="ent-player-link"
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => { e.preventDefault(); void window.nexus.tmdbOpenExternal(src); }}
            title="Open in browser"
          >
            <Icon.ExternalLink size={13} /> Open
          </a>
          <button className="ent-player-close" onClick={onClose} title="Close player (Esc)">
            <Icon.Close size={18} />
          </button>
        </div>
      </div>

      {/* Player iframe */}
      <div className="ent-player-stage">
        <iframe
          key={src}
          src={src}
          title={title}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="origin"
        />
      </div>

      {/* Footer note */}
      <div className="ent-player-foot">
        <span className="ent-player-foot-dot" />
        Streamed via CineSrc · content indexed by TMDB ID · NEXUS does not host or store any video.
      </div>
    </div>
  );
}
