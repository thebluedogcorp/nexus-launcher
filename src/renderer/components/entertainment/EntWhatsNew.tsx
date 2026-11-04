// v7.3.0 — EntWhatsNew: a "What's New" changelog modal.
// Shows every version's changes with the latest highlighted. Makes the
// autonomous update pipeline visible inside the app — you can see exactly
// what each scheduled update added. Opens via the sidebar sparkle button
// or the 'n' keyboard shortcut.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { CHANGELOG, getLatestVersion } from "../../lib/ent-changelog";

interface WhatsNewProps {
  open: boolean;
  onClose: () => void;
}

const KIND_LABEL: Record<string, string> = {
  major: "Major",
  feature: "Feature",
  polish: "Polish",
};

export function EntWhatsNew({ open, onClose }: WhatsNewProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "n") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const latest = getLatestVersion();
  const entries = expanded ? CHANGELOG : CHANGELOG.slice(0, 4);

  return (
    <div className="ent-wn-overlay" role="dialog" aria-modal="true" aria-label="What's New" onMouseDown={onClose}>
      <div className="ent-wn" onMouseDown={e => e.stopPropagation()}>
        <div className="ent-wn-head">
          <div className="ent-wn-title">
            <Icon.Sparkles size={18} />
            <span>What's New in NEXUS TV</span>
          </div>
          <button className="ent-wn-close" onClick={onClose} aria-label="Close">
            <Icon.Close size={16} />
          </button>
        </div>

        <div className="ent-wn-body">
          {/* Latest version — featured card */}
          <div className="ent-wn-latest">
            <div className="ent-wn-latest-badge">
              <span className="ent-wn-version">{latest.version}</span>
              <span className={`ent-wn-kind ${latest.kind}`}>{KIND_LABEL[latest.kind]}</span>
            </div>
            <h2 className="ent-wn-latest-title">{latest.title}</h2>
            <div className="ent-wn-latest-date">{latest.date}</div>
            <ul className="ent-wn-items">
              {latest.items.map((it, i) => (
                <li key={i}><Icon.Check size={13} /> {it}</li>
              ))}
            </ul>
          </div>

          {/* Previous versions */}
          <div className="ent-wn-history">
            {entries.slice(1).map(e => (
              <div key={e.version} className="ent-wn-entry">
                <div className="ent-wn-entry-head">
                  <span className="ent-wn-version sm">{e.version}</span>
                  <span className={`ent-wn-kind sm ${e.kind}`}>{KIND_LABEL[e.kind]}</span>
                  <span className="ent-wn-entry-date">{e.date}</span>
                </div>
                <div className="ent-wn-entry-title">{e.title}</div>
                <ul className="ent-wn-items sm">
                  {e.items.slice(0, 4).map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                  {e.items.length > 4 && <li className="ent-wn-more">+{e.items.length - 4} more…</li>}
                </ul>
              </div>
            ))}
          </div>

          {!expanded && CHANGELOG.length > 4 && (
            <button className="ent-wn-expand" onClick={() => setExpanded(true)}>
              <Icon.Chevron size={14} /> Show all {CHANGELOG.length} versions
            </button>
          )}
        </div>

        <div className="ent-wn-foot">
          <span className="ent-wn-foot-dot" />
          <span>NEXUS TV updates itself automatically — check back to see what's new.</span>
          <span className="ent-wn-foot-hint">press <kbd>n</kbd> anytime</span>
        </div>
      </div>
    </div>
  );
}
