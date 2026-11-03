// v6.5.0 — EntSettings: a NEXUS TV settings/preferences modal.
// Toggles for hero autoplay, reduced motion, NEW badges — plus a data
// management section (clear My List / Continue Watching / History) and
// live stats. Opens via the sidebar gear icon.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import {
  getPrefs, setPrefs, subscribePrefs, type EntPrefs,
} from "../../lib/ent-prefs";
import { getList, getContinue, getHistory, clearHistory } from "../../lib/ent-store";
import { pushToast } from "./EntToaster";

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  onDataCleared: () => void;
}

export function EntSettings({ open, onClose, onDataCleared }: SettingsProps) {
  const [prefs, setPrefsState] = useState<EntPrefs>(() => getPrefs());
  const [stats, setStats] = useState({ list: 0, progress: 0, history: 0 });

  useEffect(() => {
    if (!open) return;
    const unsub = subscribePrefs(p => setPrefsState(p));
    setStats({ list: getList().length, progress: getContinue().length, history: getHistory().length });
    return unsub;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (key: keyof EntPrefs) => {
    setPrefs({ [key]: !prefs[key] } as Partial<EntPrefs>);
    pushToast(`${key === "heroAutoplay" ? "Hero autoplay" : key === "reduceMotion" ? "Reduced motion" : "NEW badges"} ${prefs[key] ? "off" : "on"}`, "info", <Icon.Settings size={13} />);
  };

  const clearAll = () => {
    clearHistory();
    localStorage.removeItem("nx-ent-list");
    localStorage.removeItem("nx-ent-progress");
    localStorage.removeItem("nx-ent-history");
    setStats({ list: 0, progress: 0, history: 0 });
    onDataCleared();
    pushToast("All NEXUS TV data cleared from this PC", "success", <Icon.Trash size={13} />);
  };

  return (
    <div className="ent-set-overlay" role="dialog" aria-modal="true" aria-label="NEXUS TV settings" onMouseDown={onClose}>
      <div className="ent-set" onMouseDown={e => e.stopPropagation()}>
        <div className="ent-set-head">
          <div className="ent-set-title">
            <Icon.Settings size={18} />
            <span>NEXUS TV Settings</span>
          </div>
          <button className="ent-set-close" onClick={onClose} aria-label="Close">
            <Icon.Close size={16} />
          </button>
        </div>

        <div className="ent-set-body">
          {/* Preferences */}
          <section className="ent-set-section">
            <h3 className="ent-set-h">Playback</h3>
            <div className="ent-set-row">
              <div className="ent-set-row-text">
                <span className="ent-set-row-label">Hero auto-advance</span>
                <span className="ent-set-row-desc">Rotate the featured hero every 8 seconds.</span>
              </div>
              <button className={prefs.heroAutoplay ? "ent-toggle on" : "ent-toggle"} onClick={() => toggle("heroAutoplay")} role="switch" aria-checked={prefs.heroAutoplay} aria-label="Hero auto-advance">
                <span className="ent-toggle-knob" />
              </button>
            </div>
            <div className="ent-set-row">
              <div className="ent-set-row-text">
                <span className="ent-set-row-label">Reduced motion</span>
                <span className="ent-set-row-desc">Disable non-essential animations (overrides system setting).</span>
              </div>
              <button className={prefs.reduceMotion ? "ent-toggle on" : "ent-toggle"} onClick={() => toggle("reduceMotion")} role="switch" aria-checked={prefs.reduceMotion} aria-label="Reduced motion">
                <span className="ent-toggle-knob" />
              </button>
            </div>
            <div className="ent-set-row">
              <div className="ent-set-row-text">
                <span className="ent-set-row-label">NEW release badges</span>
                <span className="ent-set-row-desc">Show a green NEW pill on titles released in the last ~18 months.</span>
              </div>
              <button className={prefs.showNewBadges ? "ent-toggle on" : "ent-toggle"} onClick={() => toggle("showNewBadges")} role="switch" aria-checked={prefs.showNewBadges} aria-label="NEW badges">
                <span className="ent-toggle-knob" />
              </button>
            </div>
          </section>

          {/* Stats */}
          <section className="ent-set-section">
            <h3 className="ent-set-h">Your Library</h3>
            <div className="ent-set-stats">
              <div className="ent-set-stat">
                <div className="ent-set-stat-v">{stats.list}</div>
                <div className="ent-set-stat-l">My List</div>
              </div>
              <div className="ent-set-stat">
                <div className="ent-set-stat-v">{stats.progress}</div>
                <div className="ent-set-stat-l">In Progress</div>
              </div>
              <div className="ent-set-stat">
                <div className="ent-set-stat-v">{stats.history}</div>
                <div className="ent-set-stat-l">Recently Viewed</div>
              </div>
            </div>
          </section>

          {/* Data management */}
          <section className="ent-set-section">
            <h3 className="ent-set-h">Data</h3>
            <p className="ent-set-note">All NEXUS TV data (My List, Continue Watching, Recently Viewed, preferences) is stored locally on this PC. Nothing is sent to any server.</p>
            <button className="ent-set-danger" onClick={clearAll}>
              <Icon.Trash size={14} /> Clear all NEXUS TV data
            </button>
          </section>

          <div className="ent-set-foot">
            <Icon.Shield size={12} />
            <span>NEXUS TV · No telemetry · Local-only storage</span>
          </div>
        </div>
      </div>
    </div>
  );
}
