// v6.3.0 — EntShortcuts: a keyboard-shortcuts overlay (press ?).
// Surfaces every NEXUS TV shortcut in a clean, grouped modal so the
// keyboard-first design is discoverable. Closes on Esc / click-outside.

import { useEffect } from "react";
import { Icon } from "../Icons";

interface ShortcutsProps {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  label: string;
}

const GROUPS: { group: string; items: Shortcut[] }[] = [
  {
    group: "Navigation",
    items: [
      { keys: ["Ctrl", "K"], label: "Open command palette" },
      { keys: ["/"], label: "Jump to Search" },
      { keys: ["g"], label: "Switch to Games mode" },
      { keys: ["Esc"], label: "Back / close overlay" },
      { keys: ["?"], label: "Show this shortcuts overlay" },
    ],
  },
  {
    group: "Browse",
    items: [
      { keys: ["←", "→"], label: "Move focus across cards" },
      { keys: ["↑", "↓"], label: "Jump to prev/next row" },
      { keys: ["Enter"], label: "Open focused card" },
    ],
  },
  {
    group: "Hero",
    items: [
      { keys: ["Hover"], label: "Reveal prev/next arrows" },
      { keys: ["Click dots"], label: "Jump to a featured title" },
    ],
  },
  {
    group: "Player",
    items: [
      { keys: ["Esc"], label: "Close player (saves progress)" },
      { keys: ["S/E inputs"], label: "Change TV season / episode" },
    ],
  },
];

export function EntShortcuts({ open, onClose }: ShortcutsProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?" || e.key === "/") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // Use capture so we fire before the shell's global handlers.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ent-sc-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onMouseDown={onClose}>
      <div className="ent-sc" onMouseDown={e => e.stopPropagation()}>
        <div className="ent-sc-head">
          <div className="ent-sc-title">
            <Icon.Keyboard size={18} />
            <span>Keyboard Shortcuts</span>
          </div>
          <button className="ent-sc-close" onClick={onClose} aria-label="Close">
            <Icon.Close size={16} />
          </button>
        </div>
        <div className="ent-sc-grid">
          {GROUPS.map(g => (
            <div className="ent-sc-group" key={g.group}>
              <div className="ent-sc-group-h">{g.group}</div>
              {g.items.map(it => (
                <div className="ent-sc-row" key={it.label}>
                  <span className="ent-sc-label">{it.label}</span>
                  <span className="ent-sc-keys">
                    {it.keys.map((k, i) => (
                      <kbd className="ent-sc-kbd" key={i}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="ent-sc-foot">
          <Icon.Sparkles size={12} />
          <span>NEXUS TV is designed keyboard-first. Press <kbd className="ent-sc-kbd">?</kbd> anytime to see this.</span>
        </div>
      </div>
    </div>
  );
}
