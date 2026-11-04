// v6.5.0 — EntSettings: a NEXUS TV settings/preferences modal.
// v8.0.0 — expanded: Playback (autoplay-next, data saver), Parental Controls
//          (content rating), Notifications (enable + quiet hours), Watched badges.
// Toggles persist via ent-prefs (pub/sub). Opens via the sidebar gear icon.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import {
  getPrefs, setPrefs, subscribePrefs, type EntPrefs,
} from "../../lib/ent-prefs";
import { getList, getContinue, getHistory, clearHistory } from "../../lib/ent-store";
import { getNotifications, clearNotifications, unreadNotificationCount } from "../../lib/ent-userdata";
import { pushToast } from "./EntToaster";

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  onDataCleared: () => void;
}

const RATING_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: "", label: "Off", desc: "No filtering" },
  { value: "PG", label: "PG", desc: "General — some content unsuitable for young children" },
  { value: "PG-13", label: "PG-13", desc: "Parents strongly cautioned for under 13" },
  { value: "R", label: "R", desc: "Restricted — under 17 requires an adult" },
];

export function EntSettings({ open, onClose, onDataCleared }: SettingsProps) {
  const [prefs, setPrefsState] = useState<EntPrefs>(() => getPrefs());
  const [stats, setStats] = useState({ list: 0, progress: 0, history: 0, notifs: 0 });

  useEffect(() => {
    if (!open) return;
    const unsub = subscribePrefs(p => setPrefsState(p));
    setStats({
      list: getList().length,
      progress: getContinue().length,
      history: getHistory().length,
      notifs: unreadNotificationCount(),
    });
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
    pushToast(`${PREF_LABELS[key] ?? key} ${prefs[key] ? "off" : "on"}`, "info", <Icon.Settings size={13} />);
  };

  const setField = <K extends keyof EntPrefs>(key: K, value: EntPrefs[K]) => {
    setPrefs({ [key]: value } as Partial<EntPrefs>);
  };

  const clearAll = () => {
    clearHistory();
    localStorage.removeItem("nx-ent-list");
    localStorage.removeItem("nx-ent-progress");
    localStorage.removeItem("nx-ent-history");
    localStorage.removeItem("nx-ent-watched");
    localStorage.removeItem("nx-ent-hidden");
    localStorage.removeItem("nx-ent-ep-watched");
    clearNotifications();
    setStats({ list: 0, progress: 0, history: 0, notifs: 0 });
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
          {/* ── Playback ── */}
          <section className="ent-set-section">
            <h3 className="ent-set-h"><Icon.Play size={14} /> Playback</h3>
            <ToggleRow label="Hero auto-advance" desc="Rotate the featured hero every 8 seconds." on={prefs.heroAutoplay} onClick={() => toggle("heroAutoplay")} />
            <ToggleRow label="Autoplay next episode" desc="Automatically continue to the next episode when one finishes." on={prefs.autoplayNext} onClick={() => toggle("autoplayNext")} />
            <ToggleRow label="Data saver" desc="Use smaller image sizes to reduce bandwidth usage." on={prefs.dataSaver} onClick={() => toggle("dataSaver")} />
            <ToggleRow label="Reduced motion" desc="Disable non-essential animations (overrides system setting)." on={prefs.reduceMotion} onClick={() => toggle("reduceMotion")} />
            <ToggleRow label="NEW release badges" desc="Show a green NEW pill on titles released in the last ~18 months." on={prefs.showNewBadges} onClick={() => toggle("showNewBadges")} />
            <ToggleRow label="Watched badges" desc="Show a check overlay on titles you've marked as watched." on={prefs.showWatchedBadges} onClick={() => toggle("showWatchedBadges")} />
          </section>

          {/* ── Parental controls ── */}
          <section className="ent-set-section">
            <h3 className="ent-set-h"><Icon.Shield size={14} /> Parental Controls</h3>
            <p className="ent-set-note">Hide titles above your chosen content rating from browse and discovery. This is a local guide filter — streams are still accessible if opened directly.</p>
            <div className="ent-set-rating-grid">
              {RATING_OPTIONS.map(r => (
                <button
                  key={r.value || "off"}
                  className={prefs.parentalRating === r.value ? "ent-set-rating on" : "ent-set-rating"}
                  onClick={() => setField("parentalRating", r.value)}
                >
                  <span className="ent-set-rating-l">{r.label}</span>
                  <span className="ent-set-rating-d">{r.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── Notifications ── */}
          <section className="ent-set-section">
            <h3 className="ent-set-h"><Icon.Bell size={14} /> Notifications</h3>
            <ToggleRow label="In-app notifications" desc="Show new-episode alerts and streak milestones." on={prefs.notificationsEnabled} onClick={() => toggle("notificationsEnabled")} />
            <div className="ent-set-quiet">
              <div className="ent-set-quiet-label">
                <Icon.Clock2 size={14} /> Quiet hours
              </div>
              <div className="ent-set-quiet-times">
                <label className="ent-set-quiet-field">
                  <span>From</span>
                  <input
                    type="time"
                    value={prefs.quietHoursStart}
                    onChange={e => setField("quietHoursStart", e.target.value)}
                    className="ent-set-time-input"
                  />
                </label>
                <label className="ent-set-quiet-field">
                  <span>To</span>
                  <input
                    type="time"
                    value={prefs.quietHoursEnd}
                    onChange={e => setField("quietHoursEnd", e.target.value)}
                    className="ent-set-time-input"
                  />
                </label>
              </div>
              <span className="ent-set-quiet-hint">Notifications are suppressed during this window (overnight wrap supported).</span>
            </div>
          </section>

          {/* ── Library stats ── */}
          <section className="ent-set-section">
            <h3 className="ent-set-h"><Icon.Library size={14} /> Your Library</h3>
            <div className="ent-set-stats">
              <SetStat v={stats.list} l="My List" />
              <SetStat v={stats.progress} l="In Progress" />
              <SetStat v={stats.history} l="Recently Viewed" />
              <SetStat v={stats.notifs} l="Unread Notifs" />
            </div>
          </section>

          {/* ── Data ── */}
          <section className="ent-set-section">
            <h3 className="ent-set-h"><Icon.HardDrive size={14} /> Data</h3>
            <p className="ent-set-note">All NEXUS TV data (My List, Continue Watching, Recently Viewed, ratings, reviews, watched marks, notifications, preferences) is stored locally on this PC. Nothing is sent to any server.</p>
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

const PREF_LABELS: Record<keyof EntPrefs, string> = {
  heroAutoplay: "Hero auto-advance",
  reduceMotion: "Reduced motion",
  showNewBadges: "NEW badges",
  autoplayNext: "Autoplay next episode",
  dataSaver: "Data saver",
  showWatchedBadges: "Watched badges",
  parentalRating: "Parental controls",
  quietHoursStart: "Quiet hours start",
  quietHoursEnd: "Quiet hours end",
  notificationsEnabled: "Notifications",
  preferredLanguage: "Preferred audio language",
};

function ToggleRow({ label, desc, on, onClick }: { label: string; desc: string; on: boolean; onClick: () => void }) {
  return (
    <div className="ent-set-row">
      <div className="ent-set-row-text">
        <span className="ent-set-row-label">{label}</span>
        <span className="ent-set-row-desc">{desc}</span>
      </div>
      <button className={on ? "ent-toggle on" : "ent-toggle"} onClick={onClick} role="switch" aria-checked={on} aria-label={label}>
        <span className="ent-toggle-knob" />
      </button>
    </div>
  );
}

function SetStat({ v, l }: { v: number; l: string }) {
  return (
    <div className="ent-set-stat">
      <div className="ent-set-stat-v">{v}</div>
      <div className="ent-set-stat-l">{l}</div>
    </div>
  );
}
