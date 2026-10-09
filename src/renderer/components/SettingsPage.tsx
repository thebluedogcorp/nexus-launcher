import { useState, useEffect } from "react";
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

  // Startup & Close behavior state
  const [launchOnStartup, setLaunchOnStartup] = useState(initial.launchOnStartup);
  const [closeBehavior, setCloseBehavior] = useState<"exit" | "minimize" | "ask">(initial.closeBehavior);
  const [startupLoading, setStartupLoading] = useState(false);

  // On mount, query the actual registry state for launch-on-startup
  useEffect(() => {
    void window.nexus.isLaunchOnStartupEnabled().then((enabled: boolean) => {
      setLaunchOnStartup(enabled);
    }).catch(() => {});
  }, []);

  const toggleStartup = async () => {
    setStartupLoading(true);
    try {
      const newState = await window.nexus.setLaunchOnStartup(!launchOnStartup);
      setLaunchOnStartup(newState);
    } catch (e) {
      console.error("Failed to toggle startup:", e);
    }
    setStartupLoading(false);
  };

  const toggleCloseBehavior = async (behavior: "exit" | "minimize" | "ask") => {
    setCloseBehavior(behavior);
    try {
      await window.nexus.setCloseBehavior(behavior);
    } catch (e) {
      console.error("Failed to set close behavior:", e);
    }
  };

  const save = async () => {
    setSaving(true);
    localStorage.setItem("nx-accent", accentColor);
    localStorage.setItem("nx-tile-size", String(tileSize));
    localStorage.setItem("nx-transition", String(transitionSpeed));
    localStorage.setItem("nx-haptics", haptics ? "on" : "off");
    document.documentElement.style.setProperty("--accent", accentColor);
    await onSave({ autoScanOnStart: autoScan, defaultSort, scanPaths, launchOnStartup, closeBehavior });
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

        {/* Startup & Close Behavior */}
        <div className="gp-section-title"><span className="bar" /> Startup & Close Behavior</div>
        <div style={{ display: "grid", gap: 14, marginBottom: 28 }}>
          {/* Launch on System Startup */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,.02)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Launch on System Startup</div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>Automatically start NEXUS when your computer boots.</div>
            </div>
            <button
              onClick={toggleStartup}
              disabled={startupLoading}
              style={{
                width: 42, height: 22, borderRadius: 999, padding: 2,
                background: launchOnStartup ? "var(--accent)" : "rgba(255,255,255,.1)",
                position: "relative",
                transition: "background .15s",
                opacity: startupLoading ? 0.5 : 1,
                cursor: startupLoading ? "wait" : "pointer",
              }}
            >
              <span style={{
                position: "absolute", top: 2,
                left: launchOnStartup ? 22 : 2,
                width: 18, height: 18, borderRadius: "50%",
                background: "#fff", transition: "left .15s",
              }} />
            </button>
          </div>

          {/* Close Behavior */}
          <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,.02)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 4 }}>When I close NEXUS</div>
            <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 12 }}>Choose what happens when you click the close button.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {([
                { value: "exit" as const, label: "Exit Completely", desc: "Close entirely" },
                { value: "minimize" as const, label: "Minimize to Tray", desc: "Run in background" },
                { value: "ask" as const, label: "Ask Every Time", desc: "Show a prompt" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => toggleCloseBehavior(opt.value)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: closeBehavior === opt.value
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                    background: closeBehavior === opt.value
                      ? "rgba(45,212,191,0.10)"
                      : "rgba(255,255,255,0.02)",
                    color: closeBehavior === opt.value ? "var(--accent)" : "var(--dim)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all .15s",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    textAlign: "left",
                    minWidth: 120,
                  }}
                >
                  <span>{opt.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{opt.desc}</span>
                </button>
              ))}
            </div>
            {closeBehavior !== "exit" && (
              <div style={{ marginTop: 10, fontSize: 10, color: "var(--faint)", display: "flex", alignItems: "center", gap: 5 }}>
                <Icon.Info size={11} />
                <span>The app will keep running in the system tray. Click the tray icon to reopen, or right-click for Quit.</span>
              </div>
            )}
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

        {/* Game Overlay */}
        <div className="gp-section-title"><span className="bar" /> Game Overlay</div>
        <div style={{ display: "grid", gap: 14, marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,.02)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>In-Game Overlay</div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>
                Press <strong style={{ color: "var(--accent)" }}>Alt+O</strong> while playing to toggle the overlay.
                Press <strong style={{ color: "var(--accent)" }}>Ctrl+Shift+X</strong> to toggle click-through mode.
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => { void window.nexus.overlayToggle?.(); }}>
              <Icon.Gamepad size={13} /> Test Overlay
            </button>
          </div>

          {/* Overlay features list */}
          <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,.02)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Available Overlay Widgets</div>
            <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 12 }}>
              Each game can have a customized overlay with different widgets enabled.
              Configure per-game overlays from the game detail page.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                "FPS Counter", "CPU/GPU Monitor", "RAM/VRAM Usage", "FPS Graph",
                "Network/Ping", "Clock", "Session Timer", "Game Info",
                "Audio Level", "Notes Scratchpad", "Crosshair Overlay", "Quick Links",
              ].map((feature) => (
                <div key={feature} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 8px", borderRadius: 6,
                  background: "rgba(255,255,255,0.02)",
                  fontSize: 11, color: "var(--dim)",
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* Per-game profiles info */}
          <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,.02)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Per-Game Profiles</div>
            <div style={{ fontSize: 11, color: "var(--dim)", display: "flex", alignItems: "center", gap: 5 }}>
              <Icon.Info size={12} />
              <span>When you launch a game, the overlay automatically detects it and loads the profile you configured for that specific game — custom links, notes, crosshair settings, enabled widgets, and more.</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
