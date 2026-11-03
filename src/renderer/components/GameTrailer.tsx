// v4.6.3 — GameTrailer. A muted, looping mp4 preview that overlays a game's
// cover art when the preview is "active" (card hovered / tile focused / hero
// visible).
//
// FIXED in v4.6.3:
//   - The CSP was missing a `media-src` directive, which blocked ALL video
//     from HTTPS sources. Even with a valid trailer URL, the webview refused
//     to load the video. Fixed: index.html CSP now includes
//     `media-src 'self' https: blob: file:`.
//   - The component now has proper state transitions: idle → loading →
//     playing → error → fallback. A loading indicator is shown briefly
//     while the video buffers. On error, falls back to the poster.
//   - The video element is properly cleaned up when the component unmounts
//     or when the game changes (no leaked video elements or stale state).

import { useEffect, useRef, useState } from "react";

interface Props {
  url: string | null;           // the trailer mp4 URL (null = no trailer, show poster)
  posterUrl?: string | null;    // fallback static image
  active: boolean;              // whether this preview should be playing
  className?: string;
  onFallback?: () => void;
}

type PlayerState = "idle" | "loading" | "playing" | "error";

export function useTrailerAutoplay(): boolean {
  const [on, setOn] = useState(() => localStorage.getItem("nx-autoplay-trailers") !== "0");
  useEffect(() => {
    const handler = () => setOn(localStorage.getItem("nx-autoplay-trailers") !== "0");
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  return on;
}

export function GameTrailer({ url, posterUrl, active, className, onFallback }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<PlayerState>("idle");
  const autoplay = useTrailerAutoplay();
  const reducedMotion = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // v4.6.3 — diagnostic logging (visible in DevTools console: View → Toggle Developer Tools).
  useEffect(() => {
    if (active) {
      console.log(`[GameTrailer] active=${active} url=${url ? url.slice(0, 60) + "…" : "null"} autoplay=${autoplay} reducedMotion=${reducedMotion} shouldPlay=${!!url && active && autoplay && !reducedMotion}`);
    }
  }, [active, url, autoplay, reducedMotion]);

  // Reset state when the URL changes (different game).
  useEffect(() => {
    setState("idle");
  }, [url]);

  // The trailer plays ONLY when: there's a URL, the preview is active,
  // autoplay is enabled, and reduced motion is NOT requested.
  const shouldPlay = !!url && active && autoplay && !reducedMotion;

  // Manage the video element lifecycle.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !shouldPlay) return;

    setState("loading");
    v.currentTime = 0;
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.then(() => setState("playing")).catch(() => {
        setState("error");
        onFallback?.();
      });
    } else {
      setState("playing");
    }

    // Cleanup: pause + reset when the effect re-runs or unmounts.
    return () => {
      try { v.pause(); } catch { /* ignore */ }
    };
  }, [shouldPlay, url]);

  // Handle video events.
  const onCanPlay = () => {
    if (shouldPlay) setState("playing");
  };
  const onError = () => {
    setState("error");
    onFallback?.();
  };
  const onWaiting = () => {
    if (state === "playing") setState("loading");
  };
  const onPlaying = () => setState("playing");

  // Not playing → show the poster (or nothing — the parent's cover shows through).
  if (!shouldPlay || state === "error") {
    return posterUrl ? (
      <img className={className} src={posterUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
    ) : null;
  }

  return (
    <>
      {/* Loading indicator (shown briefly while buffering) */}
      {state === "loading" && (
        <div className="gc-trailer-loading" style={{
          position: "absolute", inset: 0, zIndex: 2,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.3)",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin" style={{ color: "var(--accent)", opacity: 0.7 }}>
            <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
            <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
          </svg>
        </div>
      )}
      <video
        ref={videoRef}
        className={className}
        src={url!}
        poster={posterUrl ?? undefined}
        muted
        loop
        playsInline
        preload="auto"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        onCanPlay={onCanPlay}
        onError={onError}
        onWaiting={onWaiting}
        onPlaying={onPlaying}
      />
    </>
  );
}
