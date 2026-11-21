// v9.2.0 — EntPlayer: third-party stream embedding has been REMOVED.
//
// Previously this component embedded CineSrc (and experimental 2Embed/VidSrc
// fallback) iframes keyed by TMDB ID, with a stream-source selector, a
// Hindi-audio toast, an "Open in browser" link, wall-clock progress tracking,
// and offline-package download buttons. All of that routed through pirated
// streaming hosts, so it has been removed.
//
// What remains is the overlay dialog shell (title + Esc/X close) plus a clear
// "Streaming removed" notice. A local media server (stream your own files
// from disk) arrives in v9.3.0.
//
// The component still accepts { open, payload, onClose } props so existing
// call sites (EntShell's watch() bridge, My List resume, etc.) keep working —
// they now open this notice instead of a player.

import { useEffect } from "react";
import { Icon } from "../Icons";
import type { TmdbMediaType } from "../../lib/tmdb-types";

/** Everything the overlay needs to identify the title the user tried to open. */
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
  /**
   * Kept for backward compatibility with call sites that pass it. The notice
   * panel does not track playback progress, so this is now a no-op.
   */
  onProgress?: () => void;
}

export function EntPlayer({ open, payload, onClose }: EntPlayerProps) {
  // Esc closes the overlay (matches the previous player behavior).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || !payload) return null;

  return (
    <div className="ent-player-overlay" role="dialog" aria-modal="true" aria-label={`Streaming removed — ${payload.title}`}>
      {/* Top control bar — title + close only */}
      <div className="ent-player-bar">
        <div className="ent-player-bar-left">
          <span className="ent-player-badge">{payload.mediaType === "tv" ? "Series" : "Movie"}</span>
          <div className="ent-player-title">{payload.title}</div>
        </div>
        <div className="ent-player-bar-right">
          <button className="ent-player-close" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <Icon.Close size={18} />
          </button>
        </div>
      </div>

      {/* Notice panel — replaces the old iframe stage */}
      <div className="ent-player-stage">
        <div className="ent-player-notice">
          <span className="ent-player-notice-icon"><Icon.Shield size={34} /></span>
          <h2 className="ent-player-notice-title">Streaming removed</h2>
          <p className="ent-player-notice-body">
            NEXUS no longer embeds third-party stream sources. Entertainment is now
            browse-only: TMDB metadata, cast &amp; crew, episodes, and YouTube trailers
            still work everywhere.
          </p>
          <p className="ent-player-notice-foot">
            A local media server (stream your own files) arrives in <strong>v9.3.0</strong>.
          </p>
        </div>
      </div>

      {/* Footer note */}
      <div className="ent-player-foot">
        <span className="ent-player-foot-dot" />
        NEXUS does not host or embed any video · metadata by TMDB · trailers via YouTube.
      </div>
    </div>
  );
}
