// v4.6.0 — GameTrailer. A muted, looping mp4 preview that overlays a game's
// cover art when the preview is "active" (card hovered / tile focused / hero
// visible). Designed for restraint:
//   - Muted by default, playsInline, loop. No audio, no player chrome.
//   - Only renders the <video> when `active` is true AND the global auto-play
//     setting is on AND the user hasn't requested reduced motion. Otherwise
//     the poster image is shown (graceful fallback — never a blank/broken area).
//   - On any video error, hides itself + calls onFallback so the parent keeps
//     the static poster.
//   - Only ONE trailer plays at a time because only one preview is "active" at
//     a time (the hovered card / the focused tile / the visible hero).
//   - Paused (removed) when `active` becomes false, so hidden screens never
//     keep a video running.

import { useEffect, useRef, useState } from "react";

interface Props {
  url: string | null;           // the trailer mp4 URL (null = no trailer, show poster)
  posterUrl?: string | null;    // fallback static image
  active: boolean;              // whether this preview should be playing
  className?: string;
  onFallback?: () => void;
}

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
  const [failed, setFailed] = useState(false);
  const autoplay = useTrailerAutoplay();
  // Respect the OS reduced-motion preference.
  const reducedMotion = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // The trailer plays ONLY when: there's a URL, it hasn't failed, the preview
  // is active, autoplay is enabled, and reduced motion is NOT requested.
  const shouldPlay = !!url && !failed && active && autoplay && !reducedMotion;

  // When shouldPlay flips on, try to play (browsers require muted for autoplay).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (shouldPlay) {
      v.currentTime = 0;
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => setFailed(true));
    } else {
      v.pause();
    }
  }, [shouldPlay]);

  // Reset the failed flag if the URL changes (different game).
  useEffect(() => { setFailed(false); }, [url]);

  if (!shouldPlay) {
    // Show the poster (or nothing — the parent's cover art shows through).
    return posterUrl ? (
      <img className={className} src={posterUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
    ) : null;
  }

  return (
    <video
      ref={videoRef}
      className={className}
      src={url!}
      poster={posterUrl ?? undefined}
      muted
      loop
      playsInline
      preload="none"
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      onError={() => { setFailed(true); onFallback?.(); }}
    />
  );
}
