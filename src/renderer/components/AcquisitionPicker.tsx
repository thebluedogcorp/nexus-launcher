// v4.5.2 — AcquisitionPicker (store-focused). When the user clicks Get on a
// game that isn't installed, this lists the OFFICIAL stores where they can
// buy/get the game — zero configuration. The system is intelligent: it
// deep-links to the exact store app page when the game's platform id is known
// (e.g. a Steam-detected game's steamAppId) OR when a live store search finds
// an exact title match; otherwise it opens the store's search-results page.
// All links open in the default browser via window.open (https only).

import { useEffect, useState } from "react";
import type { AcquisitionOption } from "@shared/types";
import { Icon } from "./Icons";

interface Props {
  gameId: number;
  gameTitle: string;
  installed: boolean;
  onClose: () => void;
  onStarted: () => void;
}

export function AcquisitionPicker({ gameId, gameTitle, installed, onClose, onStarted }: Props) {
  const [options, setOptions] = useState<AcquisitionOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    (async () => {
      try {
        // v4.5.2 — intelligent store-link resolution (live Steam/GOG search
        // for deep links, search-page fallback). Zero-config for the user.
        setOptions(await window.nexus.resolveStoreLinks(gameId));
      } catch { /* ignore */ }
      setLoading(false);
    })();
    return () => window.removeEventListener("keydown", onKey);
  }, [gameId, onClose]);

  const choose = (opt: AcquisitionOption) => {
    if (opt.storeUrl) {
      window.open(opt.storeUrl, "_blank");
      onStarted();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Get game">
        <div className="modal-header">
          <div className="modal-title"><Icon.ExternalLink size={16} /> Get {gameTitle}{installed ? " (re-install)" : ""}</div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.Close size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>
            This game isn't installed. Get it from an official store — NEXUS opens the store page in your browser so you can buy or download it there.
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-faint)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <Icon.Spinner size={20} />
              <span>Searching official stores…</span>
            </div>
          ) : options.length === 0 ? (
            <div className="coll-pick-empty">No store links available.</div>
          ) : (
            <div className="coll-pick-list">
              {options.map((opt, i) => {
                const key = `${opt.sourceName}-${i}`;
                return (
                  <button key={key} className="coll-pick-row" onClick={() => choose(opt)}>
                    <span className="coll-pick-emoji"><Icon.ExternalLink size={15} /></span>
                    <span className="coll-pick-name" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                      <span style={{ color: "var(--text)" }}>{opt.label} · {opt.sourceName}</span>
                      {opt.note && <span style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 400 }}>{opt.note}</span>}
                    </span>
                    <Icon.Chevron size={14} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
