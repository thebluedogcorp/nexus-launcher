// v9.3.0 (M1) — MediaPlayer: HTML5 <video> overlay that streams from the
// custom `nexus-media://media/<id>/stream` protocol.
//
// Ported from the Next.js reference (src/components/media/media-player.tsx).
// Adaptations:
//   • The src is `nexus-media://media/<id>/stream` — a stable, privileged
//     scheme. The main-process handler respects HTTP Range requests so video
//     seeking works. The URL is deterministic from the id, so we set it
//     directly (no async resolution needed); streamUrlFor() is also called
//     once for parity with the IPC surface in case the scheme ever changes.
//   • Browser support note: Chromium's <video> only plays MP4/WebM/MOV/M4V/
//     OGG natively. For unsupported containers (MKV, AVI, FLV, WMV, TS, MPG,
//     MPEG, M2TS) we show the file path so the user can open it in their
//     system media player.
//
// Only the user's own files are ever served — no third-party stream hosts.

import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@shared/types";
import { Icon } from "../Icons";
import { streamUrlFor } from "../../lib/media-ipc";
import { formatSize } from "../../lib/helpers";

interface MediaPlayerProps {
  item: MediaItem;
  onClose: () => void;
}

const PLAYABLE_CONTAINERS = new Set(["mp4", "webm", "mov", "m4v", "ogg"]);

export function MediaPlayer({ item, onClose }: MediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [src, setSrc] = useState<string>("");

  // Resolve the stream URL once on mount. The URL is stable, but going
  // through the IPC wrapper keeps the renderer decoupled from the scheme.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await streamUrlFor(item.id);
        if (!cancelled) setSrc(url);
      } catch (e) {
        if (!cancelled) setError("Couldn't resolve stream URL: " + (e instanceof Error ? e.message : String(e)));
      }
    })();
    return () => { cancelled = true; };
  }, [item.id]);

  // Esc closes the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const playable = PLAYABLE_CONTAINERS.has(item.container);

  return (
    <div className="ent-player-overlay nx-media-player-overlay" role="dialog" aria-modal="true" aria-label={`Play ${item.title}`}>
      <div className="ent-player-bar">
        <div className="ent-player-bar-left">
          <span className="ent-player-badge">{item.container}</span>
          <div className="ent-player-title">{item.title}</div>
          <div className="nx-media-player-sub">
            {formatSize(item.fileSize)}{duration ? ` · ${formatDuration(duration)}` : ""}
          </div>
        </div>
        <div className="ent-player-bar-right">
          <button className="ent-player-close" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <Icon.Close size={18} />
          </button>
        </div>
      </div>

      <div className="ent-player-stage nx-media-player-stage">
        {!playable && (
          <div className="nx-media-player-unsupported">
            <Icon.Film size={36} />
            <p className="nx-media-player-unsupported-title">{item.container.toUpperCase()} playback</p>
            <p className="nx-media-player-unsupported-body">
              This container isn&apos;t natively supported by the in-app browser engine.
              MP4 / WebM / MOV / M4V play in-app; others can be opened in your system
              player via the file path below.
            </p>
            <code className="nx-media-player-path" title={item.filePath}>{item.filePath}</code>
          </div>
        )}

        {playable && !src && !error && (
          <div className="nx-media-player-busy">
            <Icon.Spinner size={28} />
            <p>Resolving stream…</p>
          </div>
        )}

        {playable && loading && src && (
          <div className="nx-media-player-busy">
            <Icon.Spinner size={28} />
            <p>Buffering…</p>
          </div>
        )}

        {playable && error && (
          <div className="nx-media-player-busy error">
            <p className="nx-media-player-unsupported-title">Playback error</p>
            <p className="nx-media-player-unsupported-body">{error}</p>
          </div>
        )}

        {playable && src && (
          <video
            ref={videoRef}
            src={src}
            className="nx-media-video"
            controls
            autoPlay
            // The protocol handler emits 206 Partial Content with
            // Content-Range + Accept-Ranges, so the native seek bar works.
            onLoadStart={() => { setLoading(true); setError(null); setReady(false); setDuration(null); }}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              setDuration(Number.isFinite(d) ? d : null);
              setReady(true);
            }}
            onCanPlay={() => setLoading(false)}
            onWaiting={() => setLoading(true)}
            onPlaying={() => setLoading(false)}
            onError={() => {
              setError("The stream could not be loaded. The file may be missing or corrupted, or the container isn't decodable by Chromium.");
              setLoading(false);
            }}
          />
        )}
      </div>

      <div className="nx-media-player-foot">
        <span className="nx-media-player-foot-left">
          <Icon.Play size={12} />
          <span>Streaming from your local media server — only files on this machine</span>
        </span>
        {ready && <span className="nx-media-player-foot-right">Ready</span>}
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (!isFinite(sec)) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
