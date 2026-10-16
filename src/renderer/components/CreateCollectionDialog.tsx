// v4.3.0 — Create / Edit Collection dialog.
// Lets the user name a collection, pick a folder emoji, optionally set a
// per-collection accent color (or inherit the global accent), and add a
// description. Used both for creating new manual collections and editing
// existing ones.
import { useState, useEffect } from "react";
import type { Collection } from "@shared/types";
import { COLLECTION_ICONS } from "@shared/types";
import { Icon } from "./Icons";

interface Props {
  initial?: Collection | null;     // null = create mode; object = edit mode
  onClose: () => void;
  onSave: (data: { name: string; icon: string; color: string; description: string }) => Promise<void> | void;
}

const COLOR_SWATCHES = [
  "",          // "" = inherit global accent
  "#f87171", "#fb923c", "#facc15", "#4ade80", "#34d399",
  "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6", "#94a3b8",
];

export function CreateCollectionDialog({ initial, onClose, onSave }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "📁");
  const [color, setColor] = useState(initial?.color ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), icon, color, description: description.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const editing = !!initial;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={editing ? "Edit collection" : "Create collection"}>
        <div className="modal-header">
          <div className="modal-title"><Icon.Folder size={16} /> {editing ? "Edit Collection" : "New Collection"}</div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon.Close size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label" htmlFor="coll-name">Name</label>
            <input id="coll-name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GTA games, Currently playing…" autoFocus maxLength={48} />
          </div>

          <div className="field">
            <label className="field-label">Icon</label>
            <div className="coll-icon-grid">
              {COLLECTION_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  className={icon === emoji ? "coll-icon-swatch active" : "coll-icon-swatch"}
                  onClick={() => setIcon(emoji)}
                  title={emoji}
                  aria-label={`Icon ${emoji}`}
                >{emoji}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label">Accent color</label>
            <div className="settings-accent-row">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c || "inherit"}
                  className={color === c ? "settings-accent-swatch active" : "settings-accent-swatch"}
                  style={c ? { background: c } : { background: "linear-gradient(135deg,#f87171,#facc15,#4ade80,#60a5fa,#a78bfa)" }}
                  onClick={() => setColor(c)}
                  title={c ? c : "Use global accent"}
                  aria-label={c ? `Color ${c}` : "Use global accent"}
                />
              ))}
            </div>
            <div className="field-hint"><Icon.Info size={12} /><span>Leave on the rainbow swatch to inherit the global accent color. Pick a solid color to give this collection its own accent.</span></div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="coll-desc">Description <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
            <textarea id="coll-desc" className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's in this collection?" maxLength={140} rows={2} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={!name.trim() || saving}>
            {saving ? <Icon.Spinner size={14} /> : <Icon.Check size={14} />} {editing ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
