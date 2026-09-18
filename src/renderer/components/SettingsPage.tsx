import { useState } from "react";
import type { LauncherSettings, SortKey } from "@shared/types";
import { SORT_LABELS } from "@shared/types";
import { Icon } from "./Icons";

interface Props {
  initial: LauncherSettings;
  onClose: () => void;
  onSave: (s: Partial<LauncherSettings>) => Promise<LauncherSettings>;
  onCheckUpdates: () => void;
}

export function SettingsPage({ initial, onClose, onSave, onCheckUpdates }: Props) {
  const [autoScan, setAutoScan] = useState(initial.autoScanOnStart);
  const [defaultSort, setDefaultSort] = useState<SortKey>(initial.defaultSort);
  const [scanPaths, setScanPaths] = useState(initial.scanPaths);
  const [accentColor, setAccentColor] = useState(localStorage.getItem("nx-accent") || "#4ade80");
  const [tileSize, setTileSize] = useState(Number(localStorage.getItem("nx-tile-size")) || 150);
  const [transitionSpeed, setTransitionSpeed] = useState(Number(localStorage.getItem("nx-transition")) || 300);
  const [haptics, setHaptics] = useState(localStorage.getItem("nx-haptics") !== "off");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    localStorage.setItem("nx-accent", accentColor);
    localStorage.setItem("nx-tile-size", String(tileSize));
    localStorage.setItem("nx-transition", String(transitionSpeed));
    localStorage.setItem("nx-haptics", haptics ? "on" : "off");
    document.documentElement.style.setProperty("--accent", accentColor);
    await onSave({ autoScanOnStart: autoScan, defaultSort, scanPaths });
    setSaving(false);
  };

  const accentColors = [
    { name: "Green", color: "#4ade80" },
    { name: "Blue", color: "#38bdf8" },
    { name: "Purple", color: "#c084fc" },
    { name: "Pink", color: "#f472b6" },
    { name: "Orange", color: "#fb923c" },
    { name: "Red", color: "#f87171" },
    { name: "Cyan", color: "#22d3ee" },
    { name: "Yellow", color: "#facc15" },
  ];

  return (
    <div className="game-page">
      <button className="gp-back" onClick={onClose}><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.Chevron size={18} /></span></button>
      <div style={{ padding: "40px 48px", maxWidth: 800, margin: "0 auto" }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 28 }}>Settings</h1>

        {/* Appearance */}
        <div className="gp-section-title"><span className="bar" /> Appearance</div>
        <div style={{ display: "grid", gap: 16, marginBottom: 28 }}>
          <div className="editor-field">
            <label>Accent Color</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {accentColors.map((c) => (
                <button key={c.color} onClick={() => setAccentColor(c.color)} style={{
                  width: 36, height: 36, borderRadius: 10, background: c.color,
                  border: accentColor === c.color ? "3px solid #fff" : "3px solid transparent",
                  transition: "all .15s", cursor: "pointer",
                }} title={c.name} />
              ))}
            </div>
          </div>
          <div className="editor-field">
            <label>Tile Size: {tileSize}px</label>
            <input type="range" min={120} max={200} step={10} value={tileSize} onChange={(e) => setTileSize(Number(e.target.value))} style={{ width: "100%" }} />
          </div>
          <div className="editor-field">
            <label>Animation Speed: {transitionSpeed}ms</label>
            <input type="range" min={100} max={600} step={50} value={transitionSpeed} onChange={(e) => setTransitionSpeed(Number(e.target.value))} style={{ width: "100%" }} />
          </div>
        </div>

        {/* Behavior */}
        <div className="gp-section-title"><span className="bar" /> Behavior</div>
        <div style={{ display: "grid", gap: 14, marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,.02)" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Auto-scan on startup</div><div style={{ fontSize: 11, color: "var(--dim)" }}>Detect newly installed games when NEXUS launches.</div></div>
            <button onClick={() => setAutoScan(!autoScan)} style={{ width: 42, height: 22, borderRadius: 999, padding: 2, background: autoScan ? "var(--accent)" : "rgba(255,255,255,.1)", position: "relative", transition: "background .15s" }}>
              <span style={{ position: "absolute", top: 2, left: autoScan ? 22 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,.02)" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Controller haptics</div><div style={{ fontSize: 11, color: "var(--dim)" }}>Vibrate on navigation and button presses.</div></div>
            <button onClick={() => setHaptics(!haptics)} style={{ width: 42, height: 22, borderRadius: 999, padding: 2, background: haptics ? "var(--accent)" : "rgba(255,255,255,.1)", position: "relative", transition: "background .15s" }}>
              <span style={{ position: "absolute", top: 2, left: haptics ? 22 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
            </button>
          </div>
          <div className="editor-field">
            <label>Default Sort</label>
            <select className="field-input" value={defaultSort} onChange={(e) => setDefaultSort(e.target.value as SortKey)}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
            </select>
          </div>
        </div>

        {/* Scan Paths */}
        <div className="gp-section-title"><span className="bar" /> Custom Scan Paths</div>
        <div className="editor-field" style={{ marginBottom: 28 }}>
          <textarea className="field-input" value={scanPaths} onChange={(e) => setScanPaths(e.target.value)} placeholder={"C:\\Games\nD:\\SteamLibrary"} rows={3} style={{ fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 12 }} />
          <div className="field-hint"><Icon.Info size={12} /><span>One path per line. NEXUS also probes these during a deep scan.</span></div>
        </div>

        {/* Updates */}
        <div className="gp-section-title"><span className="bar" /> Updates</div>
        <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,.02)", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Check for updates</div><div style={{ fontSize: 11, color: "var(--dim)" }}>Download and install the latest version from GitHub.</div></div>
            <button className="btn btn-outline btn-sm" onClick={onCheckUpdates}><Icon.Refresh size={13} /> Check Now</button>
          </div>
        </div>

        {/* Save */}
        <div style={{ display: "flex", gap: 10, marginBottom: 40 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Icon.Spinner size={14} /> : <Icon.Check size={14} />} Save Settings
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
