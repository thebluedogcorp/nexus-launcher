// v4.3.0 — "Add to Collection" picker.
// Lists every manual collection with a checkbox reflecting the game's current
// membership. Toggling calls addGameToCollection / removeGameFromCollection.
// Smart Collections (auto:*) are shown read-only (can't add manually — they're
// computed). Includes a quick "New collection" button.
import { useState, useEffect } from "react";
import type { Collection } from "@shared/types";
import { Icon } from "./Icons";

interface Props {
  gameId: number;
  gameTitle: string;
  collections: Collection[];
  onClose: () => void;
  onToggle: (collectionId: number, add: boolean) => Promise<void> | void;
  onCreateNew: () => void;
}

export function CollectionPicker({ gameId, gameTitle, collections, onClose, onToggle, onCreateNew }: Props) {
  const [memberOf, setMemberOf] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    (async () => {
      try {
        const ids = await window.nexus.getCollectionsForGame(gameId);
        setMemberOf(new Set(ids));
      } catch { /* ignore */ }
      setLoading(false);
    })();
    return () => window.removeEventListener("keydown", onKey);
  }, [gameId, onClose]);

  const toggle = async (c: Collection) => {
    if (c.kind !== "manual" && c.id !== -1) return; // read-only smart collections
    const isMember = memberOf.has(c.id);
    setMemberOf((prev) => { const next = new Set(prev); if (isMember) next.delete(c.id); else next.add(c.id); return next; });
    await onToggle(c.id, !isMember);
  };

  const manual = collections.filter((c) => c.kind === "manual");
  const smart = collections.filter((c) => c.kind !== "manual");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add to collection">
        <div className="modal-header">
          <div className="modal-title"><Icon.Folder size={16} /> Add to Collection</div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.Close size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>
            Choose which collections contain <strong style={{ color: "var(--text)" }}>{gameTitle}</strong>.
          </div>

          <div className="field-label" style={{ marginBottom: 8 }}>Smart Collections</div>
          <div className="coll-pick-list">
            {smart.map((c) => (
              <div key={c.id} className="coll-pick-row" title={c.description ?? ""}>
                <span className="coll-pick-emoji">{c.icon}</span>
                <span className="coll-pick-name">{c.name}</span>
                <span className="coll-pick-count">{c.gameCount}</span>
                <span className="coll-pick-readonly" title="Auto-generated — managed by your library activity">auto</span>
              </div>
            ))}
          </div>

          <div className="field-label" style={{ marginTop: 18, marginBottom: 8 }}>Your Collections</div>
          <div className="coll-pick-list">
            {manual.length === 0 && (
              <div className="coll-pick-empty">No collections yet. Create one below.</div>
            )}
            {manual.map((c) => {
              const checked = memberOf.has(c.id);
              return (
                <button key={c.id} className={checked ? "coll-pick-row checked" : "coll-pick-row"} onClick={() => toggle(c)} title={c.description ?? ""}>
                  <span className="coll-pick-emoji">{c.icon}</span>
                  <span className="coll-pick-name">{c.name}</span>
                  <span className="coll-pick-count">{c.gameCount}</span>
                  <span className={checked ? "coll-pick-check on" : "coll-pick-check"}><Icon.Check size={12} /></span>
                </button>
              );
            })}
          </div>

          <button className="btn btn-ghost btn-sm" style={{ marginTop: 14, width: "100%" }} onClick={onCreateNew}>
            <Icon.Plus size={14} /> New Collection
          </button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary btn-sm" onClick={onClose}><Icon.Check size={14} /> Done</button>
        </div>
      </div>
    </div>
  );
}
