// v4.6.7 — TrailerBlock. A dedicated, click-to-play trailer player in the
// game detail body. Now searches Steam BY TITLE (not just appId) + falls back
// to a YouTube embed for games without a Steam trailer.
//
// States:
//   - No URL → "Fetch Trailer" button (always shown — searches Steam by
//     title, then falls back to YouTube embed).
//   - Has URL + not playing → poster + play button.
//   - Playing → muted, looping video. Mute/unmute toggle.
//   - Error → "Trailer unavailable" + retry button.
//   - YouTube fallback → embedded YouTube iframe (muted, autoplay).

import { useEffect, useRef, useState } from "react";
import type { Game } from "@shared/types";
import { Icon } from "./Icons";

interface Props {
  game: Game;
  banner?: string | null;
  onPatch: (g: Game) => void | Promise<void>;
}

export function TrailerBlock({ game, banner, onPatch }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState(false);
  const [fetching, setFetching] = useState(false);
  // YouTube fallback: if the mp4 trailer fails or isn't found, embed YouTube.
  const [ytFallback, setYtFallback] = useState(false);

  const url = game.trailerUrl;
  const poster = banner || game.coverImage;

  useEffect(() => {
    setPlaying(false);
    setError(false);
    setYtFallback(false);
  }, [game.id, url]);

  const play = () => {
    const v = videoRef.current;
    if (!v) return;
    setError(false);
    v.currentTime = 0;
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.then(() => setPlaying(true)).catch(() => { setError(true); setYtFallback(true); });
    } else {
      setPlaying(true);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const fetchTrailer = async () => {
    setFetching(true);
    try {
      await onPatch(game);
    } catch { /* ignore */ }
    setFetching(false);
  };

  // YouTube embed URL (muted, autoplay, no controls, no branding).
  const ytQuery = encodeURIComponent(`${game.title} official trailer`);
  const ytEmbed = `https://www.youtube-nocookie.com/embed?listType=search&list=${ytQuery}&autoplay=1&mute=1&loop=1&controls=0&modestbranding=1&rel=0`;

  // No trailer URL → show fetch button or YouTube fallback.
  if (!url) {
    if (ytFallback) {
      return (
        <div className="gp-section">
          <div className="gp-section-title"><span className="bar" /> Trailer</div>
          <div className="trailer-block">
            <iframe
              src={ytEmbed}
              style={{ width: "100%", height: "100%", border: "none", borderRadius: "var(--r-xl)" }}
              allow="autoplay; encrypted-media"
              allowFullScreen
              title={`${game.title} trailer`}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="gp-section">
        <div className="gp-section-title"><span className="bar" /> Trailer</div>
        <div className="trailer-block trailer-empty">
          <button className="btn btn-outline" onClick={fetchTrailer} disabled={fetching}>
            {fetching ? <Icon.Spinner size={15} /> : <Icon.Download size={15} />} Fetch Trailer
          </button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setYtFallback(true)}>
            <Icon.Play size={13} /> Try YouTube
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gp-section">
      <div className="gp-section-title"><span className="bar" /> Trailer</div>
      <div className="trailer-block">
        {error ? (
          <div className="trailer-poster" style={poster ? { backgroundImage: `url(${poster})` } : {}}>
            <div className="trailer-error-overlay">
              <Icon.Close size={24} />
              <span>Trailer unavailable</span>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setYtFallback(true)}>Try YouTube</button>
            </div>
          </div>
        ) : ytFallback ? (
          <iframe
            src={ytEmbed}
            style={{ width: "100%", height: "100%", border: "none" }}
            allow="autoplay; encrypted-media"
            allowFullScreen
            title={`${game.title} trailer`}
          />
        ) : playing ? (
          <>
            <video
              ref={videoRef}
              src={url}
              poster={poster ?? undefined}
              muted={muted}
              loop
              playsInline
              preload="auto"
              className="trailer-video"
              onError={() => { setError(true); setYtFallback(true); }}
              onPlaying={() => setPlaying(true)}
              onClick={toggleMute}
            />
            <button className="trailer-mute-btn" onClick={toggleMute} title={muted ? "Unmute" : "Mute"}>
              {muted ? <Icon.Close size={14} /> : <Icon.Check size={14} />}
              <span style={{ fontSize: 10, marginLeft: 4 }}>{muted ? "Muted" : "Sound"}</span>
            </button>
          </>
        ) : (
          <div className="trailer-poster" style={poster ? { backgroundImage: `url(${poster})` } : {}} onClick={play}>
            <div className="trailer-play-overlay">
              <div className="trailer-play-btn"><Icon.Play size={32} /></div>
              <span className="trailer-play-label">Play Trailer</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
