// v4.6.6 — TrailerBlock. A dedicated, click-to-play trailer player that sits
// in the game detail body (not overlaid on the hero). This avoids ALL the
// autoplay/z-index/CSP-stacking issues that plagued the hero-overlay approach.
//
// States:
//   - No URL + has steamAppId → "Fetch Trailer" button (calls onPatch which
//     fetches the Steam trailer immediately — no RAWG key needed).
//   - No URL + no steamAppId → "No trailer available" message.
//   - Has URL + not playing → poster image + large play button overlay.
//   - Has URL + playing → muted, looping <video>. Mute/unmute toggle.
//   - Error → "Trailer unavailable" + poster.
//
// The user explicitly clicks play (user-initiated playback — always allowed,
// no autoplay restrictions). The video is in the normal document flow (no
// z-index stacking issues).

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

  const url = game.trailerUrl;
  const poster = banner || game.coverImage;

  // Reset when the game changes.
  useEffect(() => {
    setPlaying(false);
    setError(false);
  }, [game.id, url]);

  const play = () => {
    if (!url) return;
    const v = videoRef.current;
    if (!v) return;
    setError(false);
    v.currentTime = 0;
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.then(() => setPlaying(true)).catch(() => setError(true));
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

  // No trailer URL.
  if (!url) {
    return (
      <div className="gp-section">
        <div className="gp-section-title"><span className="bar" /> Trailer</div>
        <div className="trailer-block trailer-empty">
          {game.steamAppId ? (
            <button className="btn btn-outline" onClick={fetchTrailer} disabled={fetching}>
              {fetching ? <Icon.Spinner size={15} /> : <Icon.Download size={15} />} Fetch Trailer
            </button>
          ) : (
            <span style={{ color: "var(--text-faint)", fontSize: 13 }}>No trailer available for this game.</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="gp-section">
      <div className="gp-section-title"><span className="bar" /> Trailer</div>
      <div className="trailer-block">
        {error ? (
          // Error state: poster + "unavailable" message
          <div className="trailer-poster" style={poster ? { backgroundImage: `url(${poster})` } : {}}>
            <div className="trailer-error-overlay">
              <Icon.Close size={24} />
              <span>Trailer unavailable</span>
            </div>
          </div>
        ) : playing ? (
          // Playing: video + mute toggle
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
              onError={() => setError(true)}
              onPlaying={() => setPlaying(true)}
              onClick={toggleMute}
            />
            <button className="trailer-mute-btn" onClick={toggleMute} title={muted ? "Unmute" : "Mute"}>
              {muted ? <Icon.Close size={14} /> : <Icon.Check size={14} />}
              <span style={{ fontSize: 10, marginLeft: 4 }}>{muted ? "Muted" : "Sound"}</span>
            </button>
          </>
        ) : (
          // Initial: poster + play button
          <div className="trailer-poster" style={poster ? { backgroundImage: `url(${poster})` } : {}} onClick={play}>
            <div className="trailer-play-overlay">
              <div className="trailer-play-btn">
                <Icon.Play size={32} />
              </div>
              <span className="trailer-play-label">Play Trailer</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
