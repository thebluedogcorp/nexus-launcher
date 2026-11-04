// v6.0.0 — EntPlayer: full-screen CineSrc player with progress tracking.
// Embeds cinesrc.st streams by TMDB ID (movie + TV). For TV, a season/episode
// selector re-targets the iframe. While open, wall-clock progress is tracked
// and persisted to the local Continue Watching store (native-app advantage:
// the app remembers where you left off across restarts).

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icons";
import {
  cinesrcEmbedUrl,
  type TmdbMediaType,
} from "../../lib/tmdb-types";
import {
  recordContinue,
  estimateProgress,
  type ContinueEntry,
} from "../../lib/ent-store";
import { getPrefs } from "../../lib/ent-prefs";
import { pushToast } from "./EntToaster";
import { getDownloadSettings, downloadOfflinePackage, isDownloaded, removeDownload } from "../../lib/ent-downloads";

/** Everything the player needs to open a stream + save progress. */
export interface WatchPayload {
  mediaType: TmdbMediaType;
  id: number;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  numberOfSeasons?: number | null;
  season?: number;
  episode?: number;
  runtimeMin?: number | null;
}

interface EntPlayerProps {
  open: boolean;
  payload: WatchPayload | null;
  onClose: () => void;
  /** Fired whenever progress is persisted (so Home's Continue row updates). */
  onProgress?: () => void;
}

const SAVE_INTERVAL_MS = 20_000;

export function EntPlayer({ open, payload, onClose, onProgress }: EntPlayerProps) {
  const isTv = payload?.mediaType === "tv";
  const seasons = useMemo(() => {
    const n = payload?.numberOfSeasons && payload.numberOfSeasons > 0 ? payload.numberOfSeasons : 1;
    return Array.from({ length: Math.min(n, 50) }, (_, i) => i + 1);
  }, [payload?.numberOfSeasons]);

  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const startedAtRef = useRef<number>(0);
  const seasonRef = useRef(1);
  const episodeRef = useRef(1);
  // v8.0.0 — guards auto-next so we only advance once per episode.
  const advancedRef = useRef(false);
  // Keep refs in sync with state inside an effect (never during render).
  useEffect(() => { seasonRef.current = season; }, [season]);
  useEffect(() => { episodeRef.current = episode; advancedRef.current = false; }, [episode]);

  // Reset + start tracking when the player opens.
  useEffect(() => {
    if (!open || !payload) return;
    setSeason(Math.max(1, payload.season ?? 1));
    setEpisode(Math.max(1, payload.episode ?? 1));
    startedAtRef.current = Date.now();
  }, [open, payload]);

  // Persist progress on close + periodically while open.
  useEffect(() => {
    if (!open || !payload) return;
    const save = () => {
      const elapsedSec = (Date.now() - startedAtRef.current) / 1000;
      if (elapsedSec < 10) return; // too brief to count
      const progress = estimateProgress(elapsedSec, payload.runtimeMin ?? null);
      recordContinue({
        mediaType: payload.mediaType,
        id: payload.id,
        title: payload.title,
        backdropPath: payload.backdropPath ?? null,
        posterPath: payload.posterPath ?? null,
        season: seasonRef.current,
        episode: episodeRef.current,
        progress,
      });
      onProgress?.();
      // v8.0.0 — auto-advance to the next episode when the current one finishes.
      if (payload.mediaType === "tv" && progress >= 0.95 && getPrefs().autoplayNext && !advancedRef.current) {
        advancedRef.current = true;
        setEpisode(e => Math.min(99, e + 1));
        startedAtRef.current = Date.now();
        pushToast("Next episode starting", "info", <Icon.Forward size={14} />);
        // v9.0.0 — Auto Download: package the next episode for offline.
        void downloadOfflinePackage({
          mediaType: "tv",
          id: payload.id,
          title: payload.title,
          posterPath: payload.posterPath ?? null,
          backdropPath: payload.backdropPath ?? null,
          season: seasonRef.current,
          episode: Math.min(99, episodeRef.current + 1),
        });
      }
    };
    const interval = setInterval(save, SAVE_INTERVAL_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { save(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(interval);
      window.removeEventListener("keydown", onKey);
      save(); // final save on unmount/close
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payload?.mediaType, payload?.id]);

  if (!open || !payload) return null;

  const src = cinesrcEmbedUrl(payload.mediaType, payload.id, season, episode);
  const seLabel = isTv ? `S${season} · E${episode}` : "Movie";
  // v9.0.0 — download state for the current episode/movie.
  const curDownloaded = isDownloaded(payload.mediaType, payload.id, isTv ? season : undefined, isTv ? episode : undefined);
  const downloadNow = async () => {
    if (!getDownloadSettings().location) {
      pushToast("Set a download location in Account first", "error", <Icon.Folder size={13} />);
      return;
    }
    const entry = await downloadOfflinePackage({
      mediaType: payload.mediaType,
      id: payload.id,
      title: payload.title,
      posterPath: payload.posterPath ?? null,
      backdropPath: payload.backdropPath ?? null,
      season: isTv ? season : undefined,
      episode: isTv ? episode : undefined,
    });
    if (entry) pushToast(`Downloaded ${seLabel}`, "success", <Icon.Download size={14} />);
    else pushToast("Download failed — check Account settings", "error", <Icon.Close size={13} />);
  };

  return (
    <div className="ent-player-overlay" role="dialog" aria-modal="true" aria-label={`Playing ${payload.title}`}>
      {/* Top control bar */}
      <div className="ent-player-bar">
        <div className="ent-player-bar-left">
          <span className="ent-player-badge">{isTv ? "Series" : "Movie"}</span>
          <div className="ent-player-title">{payload.title}</div>
          {isTv && (
            <div className="ent-player-se">
              {payload.numberOfSeasons && payload.numberOfSeasons > 1 ? (
                <label className="ent-player-se-group">
                  <span>S</span>
                  <select value={season} onChange={e => { setSeason(Number(e.target.value)); setEpisode(1); startedAtRef.current = Date.now(); }}>
                    {seasons.map(s => <option key={s} value={s}>S{s}</option>)}
                  </select>
                </label>
              ) : (
                <label className="ent-player-se-group">
                  <span>S</span>
                  <input
                    type="number" min={1} max={50} value={season}
                    onChange={e => {
                      const v = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                      setSeason(v); setEpisode(1); startedAtRef.current = Date.now();
                    }}
                  />
                </label>
              )}
              <label className="ent-player-se-group">
                <span>E</span>
                <input
                  type="number" min={1} max={99} value={episode}
                  onChange={e => {
                    const v = Math.max(1, Math.min(99, Number(e.target.value) || 1));
                    setEpisode(v); startedAtRef.current = Date.now();
                  }}
                />
              </label>
              <button className="ent-player-prev" onClick={() => setEpisode(e => Math.max(1, e - 1))} disabled={episode <= 1} title="Previous episode">
                <Icon.Chevron size={14} />
              </button>
              <button className="ent-player-next" onClick={() => setEpisode(e => Math.min(99, e + 1))} title="Next episode">
                <Icon.Chevron size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="ent-player-bar-right">
          <span className="ent-player-pos">{seLabel}</span>
          {/* v9.0.0 — download the current episode/movie */}
          <button
            className={curDownloaded ? "ent-player-dl on" : "ent-player-dl"}
            onClick={() => {
              if (curDownloaded) { removeDownload(payload.mediaType, payload.id, isTv ? season : undefined, isTv ? episode : undefined); pushToast("Download removed", "info", <Icon.Trash size={13} />); }
              else void downloadNow();
            }}
            title={curDownloaded ? "Remove offline package" : "Save offline package"}
          >
            {curDownloaded ? <Icon.CheckCircle size={13} /> : <Icon.Download size={13} />} {curDownloaded ? "Saved" : "Download"}
          </button>
          <a
            className="ent-player-link"
            href={src} target="_blank" rel="noopener noreferrer"
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
          title={payload.title}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="origin"
        />
      </div>

      {/* Footer note */}
      <div className="ent-player-foot">
        <span className="ent-player-foot-dot" />
        Streamed via CineSrc · indexed by TMDB ID · NEXUS does not host or store any video · progress is saved locally.
      </div>
    </div>
  );
}

/** Convenience: build a Continue-row resume payload from a saved entry. */
export function continueToPayload(e: ContinueEntry): WatchPayload {
  return {
    mediaType: e.mediaType,
    id: e.id,
    title: e.title,
    posterPath: e.posterPath,
    backdropPath: e.backdropPath,
    season: e.season,
    episode: e.episode,
  };
}
