// v6.6.0 — EntTrailerModal: a YouTube trailer modal.
// Fetches the trailer key on-demand via tmdbDetailsAny (so callers only need
// mediaType + id). Full-screen YouTube iframe, Esc to close, click-outside.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { asDetails, type TmdbMediaType } from "../../lib/tmdb-types";

interface TrailerModalProps {
  open: boolean;
  mediaType: TmdbMediaType;
  id: number;
  title: string;
  onClose: () => void;
}

export function EntTrailerModal({ open, mediaType, id, title, onClose }: TrailerModalProps) {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setKey(null); setError(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setKey(null);
    (async () => {
      try {
        const d = await window.nexus.tmdbDetailsAny(mediaType, id);
        if (cancelled) return;
        const parsed = asDetails(d);
        if (parsed?.trailerKey) setKey(parsed.trailerKey);
        else setError("No trailer available for this title.");
      } catch {
        if (!cancelled) setError("Couldn't load the trailer. Try again shortly.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, mediaType, id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ent-trailer-overlay" role="dialog" aria-modal="true" aria-label={`Trailer: ${title}`} onMouseDown={onClose}>
      <div className="ent-trailer" onMouseDown={e => e.stopPropagation()}>
        <div className="ent-trailer-head">
          <div className="ent-trailer-title">
            <Icon.Film size={16} />
            <span>Trailer — {title}</span>
          </div>
          <button className="ent-trailer-close" onClick={onClose} aria-label="Close trailer">
            <Icon.Close size={16} />
          </button>
        </div>
        <div className="ent-trailer-stage">
          {loading && (
            <div className="ent-trailer-loading"><Icon.Spinner size={28} /><p>Loading trailer…</p></div>
          )}
          {error && (
            <div className="ent-trailer-error"><Icon.Film size={32} /><p>{error}</p></div>
          )}
          {!loading && !error && key && (
            <iframe
              src={`https://www.youtube.com/embed/${key}?autoplay=1&rel=0&playsinline=1&color=white`}
              title={`Trailer: ${title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
        </div>
      </div>
    </div>
  );
}
