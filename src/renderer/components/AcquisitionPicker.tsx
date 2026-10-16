// v4.5.0 — AcquisitionPicker. Lists the authorized ways to acquire a game
// (open-source catalog, official store, user HTTP sources) and lets the user
// pick one. Downloadable options start the download engine; store-link options
// open the official store page in the browser.

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
  const [starting, setStarting] = useState<string | null>(null); // the option being started (by url)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    (async () => {
      try { setOptions(await window.nexus.resolveAcquisitionOptions(gameId)); }
      catch { /* ignore */ }
      setLoading(false);
    })();
    return () => window.removeEventListener("keydown", onKey);
  }, [gameId, onClose]);

  const choose = async (opt: AcquisitionOption) => {
    if (opt.storeUrl) {
      // Store-link: open the official store page in the default browser.
      window.open(opt.storeUrl, "_blank");
      onStarted();
      return;
    }
    if (opt.downloadUrl) {
      setStarting(opt.downloadUrl);
      try {
        const r = await window.nexus.startDownload(gameId, opt);
        if ("error" in r && r.error) {
          alert(r.error);
        } else {
          onStarted();
        }
      } finally {
        setStarting(null);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Get game">
        <div className="modal-header">
          <div className="modal-title"><Icon.Download size={16} /> Acquire {installed ? "(re-install)" : ""}</div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.Close size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>
            Choose an authorized way to get <strong style={{ color: "var(--text)" }}>{gameTitle}</strong>.
          </div>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>Resolving sources…</div>
          ) : options.length === 0 ? (
            <div className="coll-pick-empty">
              No acquisition sources available for this game.
              <br /><br />
              You can add a <strong>Direct HTTP source</strong> in Settings → Downloads if you have a direct download URL you're authorized to use, or use the <strong>catalog</strong> (Scan → Browse free games) to add an open-source game.
            </div>
          ) : (
            <div className="coll-pick-list">
              {options.map((opt, i) => {
                const key = `${opt.sourceKind}-${opt.storeUrl ?? opt.downloadUrl ?? i}`;
                const isStore = !!opt.storeUrl;
                const busy = starting === opt.downloadUrl;
                return (
                  <button key={key} className="coll-pick-row" onClick={() => choose(opt)} disabled={!!starting}>
                    <span className="coll-pick-emoji">{isStore ? <Icon.Store size={16} /> : <Icon.Download size={16} />}</span>
                    <span className="coll-pick-name" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                      <span style={{ color: "var(--text)" }}>{opt.label} · {opt.sourceName}</span>
                      {opt.note && <span style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 400 }}>{opt.note}</span>}
                    </span>
                    {busy ? <Icon.Spinner size={14} /> : <Icon.Chevron size={14} />}
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
