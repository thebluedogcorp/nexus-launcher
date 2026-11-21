// v10.0.0 — MediaPlayer: HTML5 <video> overlay that streams from the SMART
// `nexus-media://media/<id>/play` protocol endpoint.
//
// The /play endpoint auto-selects the playback strategy server-side:
//   • Direct Play  — browser-native container + codec (MP4/WebM/MOV with
//     H.264/AAC). Served as raw bytes with 206 Range → the native seek bar
//     works.
//   • Remux        — MKV (or other non-native container) with browser-supported
//     codecs. ffmpeg `-c copy` remuxes to fragmented MP4, piped into the
//     <video>. Plays from start; seeking restarts the stream at ?start=<sec>.
//   • Transcode    — unsupported codec (HEVC/VC-1/MPEG-2/FLAC/AC3). ffmpeg
//     re-encodes to H.264+AAC fMP4. Same seek behavior as remux.
//
// This replaces the v9.3.0 "MKV shows a file path, can't play" behavior —
// now MKV/HEVC actually play in-app via ffmpeg.
//
// E1 — resume from saved progress + record progress periodically + on close.
// Only the user's own files are ever served — no third-party stream hosts.

import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@shared/types";
import { Icon } from "../Icons";
import { playUrlFor, streamUrlFor } from "../../lib/media-ipc";
import { recordProgress, getProgress } from "../../lib/media-ipc";
import { formatSize } from "../../lib/helpers";

interface MediaPlayerProps {
  item: MediaItem;
  onClose: () => void;
}

/** Containers Chromium's <video> decodes natively (Direct Play candidates). */
const NATIVE_CONTAINERS = new Set(["mp4", "webm", "mov", "m4v"]);
const NATIVE_VIDEO_CODECS = new Set(["h264", "avc", "avc1", "vp8", "vp9", "av1"]);
const NATIVE_AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis"]);

/** Rough client-side strategy guess for badge display + seek behavior. The
 *  server's /play endpoint makes the authoritative decision; this only
 *  decides whether we treat the native seek bar as Range-capable. */
function isDirectPlay(item: MediaItem): boolean {
  if (!NATIVE_CONTAINERS.has(item.container)) return false;
  const v = (item.videoCodec ?? "").toLowerCase();
  const a = (item.audioCodec ?? "").toLowerCase();
  const vOk = !v || NATIVE_VIDEO_CODECS.has(v);
  const aOk = !a || NATIVE_AUDIO_CODECS.has(a);
  return vOk && aOk;
}

/** Strategy label for the badge. */
function strategyLabel(item: MediaItem): string {
  if (isDirectPlay(item)) return "Direct Play";
  // Distinguish transcode (unsupported codec) from remux (unsupported container).
  const v = (item.videoCodec ?? "").toLowerCase();
  const a = (item.audioCodec ?? "").toLowerCase();
  const TRANSCODE_V = new Set(["hevc", "h265", "h266", "vc1", "vc-1", "wmv3", "wmv2", "mpeg2video", "mpeg2", "theora"]);
  const TRANSCODE_A = new Set(["ac3", "eac3", "dts", "truehd", "flac", "alac", "pcm_s16le", "pcm_s24le"]);
  if (TRANSCODE_V.has(v) || TRANSCODE_A.has(a)) return "Transcoding";
  return "Remuxing";
}

export function MediaPlayer({ item, onClose }: MediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [src, setSrc] = useState<string>("");
  // For remux/transcode streams, seeking restarts the stream at ?start=<sec>.
  // We track the current start offset so we don't reload unnecessarily.
  const startOffsetRef = useRef(0);
  const direct = isDirectPlay(item);

  // Resolve the play URL once on mount (and whenever the start offset changes
  // due to a seek on a non-direct stream).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Direct Play uses the raw /stream URL (Range-capable, seekable).
        // Remux/transcode uses /play with ?start=<offset>.
        const base = direct ? await streamUrlFor(item.id) : await playUrlFor(item.id);
        const url = direct || startOffsetRef.current === 0
          ? base
          : `${base}?start=${startOffsetRef.current}`;
        if (!cancelled) {
          setSrc(url);
          setLoading(true);
          setReady(false);
        }
      } catch (e) {
        if (!cancelled) setError("Couldn't resolve play URL: " + (e instanceof Error ? e.message : String(e)));
      }
    })();
    return () => { cancelled = true; };
  }, [item.id, direct]);

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

  // E1 — Resume from saved progress on open (only for Direct Play where seek
  // works natively; remux/transcode resume by setting the start offset before
  // the first src resolve).
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (resumedRef.current) return;
    resumedRef.current = true;
    // Already handled via startOffsetRef for non-direct; nothing more here.
    if (direct) {
      (async () => {
        try {
          const p = await getProgress(item.id);
          if (p && p.positionSec > 5 && videoRef.current) {
            if (p.durationSec && p.positionSec > p.durationSec - 10) return;
            videoRef.current.currentTime = p.positionSec;
          }
        } catch { /* non-fatal */ }
      })();
    }
  }, [ready, item.id, direct]);

  // Pre-resume for non-direct: fetch progress BEFORE first src resolve so the
  // stream starts at the saved offset.
  useEffect(() => {
    if (direct) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getProgress(item.id);
        if (!cancelled && p && p.positionSec > 5) {
          if (p.durationSec && p.positionSec > p.durationSec - 10) return;
          startOffsetRef.current = Math.floor(p.positionSec);
          // Trigger the src-reload effect by toggling state. We bump a counter
          // the effect depends on. Simpler: just setSrc directly here.
          const base = await playUrlFor(item.id);
          if (!cancelled) setSrc(`${base}?start=${startOffsetRef.current}`);
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [item.id, direct]);

  // Periodic progress recording (every 5s while playing). For non-direct
  // streams, add the start offset so the recorded position is absolute.
  useEffect(() => {
    if (!ready) return;
    const v = videoRef.current;
    if (!v) return;
    const interval = setInterval(() => {
      if (!v.paused && Number.isFinite(v.currentTime) && v.currentTime > 0) {
        const abs = direct ? v.currentTime : v.currentTime + startOffsetRef.current;
        void recordProgress(item.id, abs, Number.isFinite(v.duration) ? (direct ? v.duration : v.duration + startOffsetRef.current) : null);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [ready, item.id, direct]);

  // Final progress record on unmount.
  useEffect(() => {
    return () => {
      const v = videoRef.current;
      if (v && Number.isFinite(v.currentTime) && v.currentTime > 0) {
        const abs = direct ? v.currentTime : v.currentTime + startOffsetRef.current;
        void recordProgress(item.id, abs, Number.isFinite(v.duration) ? (direct ? v.duration : v.duration + startOffsetRef.current) : null);
      }
    };
  }, [item.id, direct]);

  // Seek handler for non-direct streams: reload the src with ?start=<newTime>.
  // The native seek bar's Range requests aren't honored by the ffmpeg pipe, so
  // we restart the stream at the sought position.
  const handleSeeked = () => {
    if (direct) return;
    const v = videoRef.current;
    if (!v) return;
    const target = Math.floor(v.currentTime);
    if (target === startOffsetRef.current) return;
    // Record the old position first.
    void recordProgress(item.id, v.currentTime + startOffsetRef.current, null);
    startOffsetRef.current = target;
    resumedRef.current = true; // don't re-resume after reload
    setSrc(""); // force reload
    (async () => {
      const base = await playUrlFor(item.id);
      setSrc(`${base}?start=${target}`);
      setLoading(true);
      setReady(false);
    })();
  };

  return (
    <div className="ent-player-overlay nx-media-player-overlay" role="dialog" aria-modal="true" aria-label={`Play ${item.title}`}>
      <div className="ent-player-bar">
        <div className="ent-player-bar-left">
          <span className="ent-player-badge">{item.container}</span>
          <span className="ent-player-badge strat" title="Playback strategy resolved by the /play endpoint">{strategyLabel(item)}</span>
          <div className="ent-player-title">{item.title}</div>
          <div className="nx-media-player-sub">
            {formatSize(item.fileSize)}{duration ? ` · ${formatDuration(duration)}` : ""}
            {item.videoCodec ? ` · ${item.videoCodec}/${item.audioCodec ?? "?"}` : ""}
            {item.width && item.height ? ` · ${item.width}x${item.height}` : ""}
          </div>
        </div>
        <div className="ent-player-bar-right">
          <button className="ent-player-close" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <Icon.Close size={18} />
          </button>
        </div>
      </div>

      <div className="ent-player-stage nx-media-player-stage">
        {!src && !error && (
          <div className="nx-media-player-busy">
            <Icon.Spinner size={28} />
            <p>Resolving stream…</p>
          </div>
        )}

        {loading && src && (
          <div className="nx-media-player-busy">
            <Icon.Spinner size={28} />
            <p>{direct ? "Buffering…" : `${strategyLabel(item)}…`}</p>
          </div>
        )}

        {error && (
          <div className="nx-media-player-busy error">
            <p className="nx-media-player-unsupported-title">Playback error</p>
            <p className="nx-media-player-unsupported-body">{error}</p>
            <code className="nx-media-player-path" title={item.filePath}>{item.filePath}</code>
          </div>
        )}

        {src && (
          <video
            ref={videoRef}
            src={src}
            className="nx-media-video"
            controls
            autoPlay
            // Direct Play: the protocol emits 206 + Content-Range so the native
            // seek bar works. Remux/transcode: seeking reloads the stream at
            // ?start=<sec> (handleSeeked) since the fMP4 pipe isn't Range-seekable.
            onSeeked={handleSeeked}
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
              setError(
                direct
                  ? "The stream could not be loaded. The file may be missing or corrupted."
                  : `${strategyLabel(item)} failed. ffmpeg may be missing or the file is unreadable. Check that ffmpeg is bundled with the app.`
              );
              setLoading(false);
            }}
          />
        )}

        {!direct && src && ready && (
          <div className="nx-media-player-seek-note">
            <Icon.Info size={12} />
            <span>Seeking restarts the stream at the chosen position (remux/transcode streams aren&apos;t byte-seekable).</span>
          </div>
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
