import { useState, useEffect, type ReactNode } from "react";
import type { LauncherSettings, SortKey, Collection } from "@shared/types";
import { SORT_LABELS, PLATFORM_LIST } from "@shared/types";
import { Icon } from "./Icons";
import { applyAccent } from "../lib/accent";
import { NexusMark } from "./Logo";
import { PlatformMark } from "./PlatformMark";
import { IconGlyph } from "./IconGlyph";

interface Props {
  initial: LauncherSettings;
  onClose: () => void;
  onSave: (s: Partial<LauncherSettings>) => Promise<LauncherSettings>;
  onCheckUpdates: () => void;
}

type TabId = "general" | "appearance" | "library" | "sidebar" | "startup" | "overlay" | "about";

interface TabDef { id: TabId; label: string; icon: ReactNode }
const TABS: TabDef[] = [
  { id: "general", label: "General", icon: <Icon.Settings size={15} /> },
  { id: "appearance", label: "Appearance", icon: <Icon.Sparkles size={15} /> },
  { id: "library", label: "Library", icon: <Icon.Library size={15} /> },
  { id: "sidebar", label: "Sidebar", icon: <Icon.Folder size={15} /> },
  { id: "startup", label: "Startup & Close", icon: <Icon.Shield size={15} /> },
  { id: "overlay", label: "Overlay", icon: <Icon.Gamepad size={15} /> },
  { id: "about", label: "About", icon: <Icon.Info size={15} /> },
];

const ACCENT_COLORS = [
  { name: "Teal", color: "#2dd4bf" },
  { name: "Green", color: "#4ade80" },
  { name: "Blue", color: "#38bdf8" },
  { name: "Purple", color: "#c084fc" },
  { name: "Pink", color: "#f472b6" },
  { name: "Orange", color: "#fb923c" },
  { name: "Red", color: "#f87171" },
  { name: "Cyan", color: "#22d3ee" },
  { name: "Yellow", color: "#facc15" },
];

const OVERLAY_FEATURES = [
  "FPS Counter", "CPU/GPU Monitor", "RAM/VRAM Usage", "FPS Graph",
  "Network/Ping", "Clock", "Session Timer", "Game Info",
  "Audio Level", "Notes Scratchpad", "Crosshair Overlay", "Quick Links",
];

export function SettingsPage({ initial, onClose, onSave, onCheckUpdates }: Props) {
  // Local form state — synced to db + localStorage on Save
  const [autoScan, setAutoScan] = useState(initial.autoScanOnStart);
  const [defaultSort, setDefaultSort] = useState<SortKey>(initial.defaultSort);
  const [scanPaths, setScanPaths] = useState(initial.scanPaths);
  const [accentColor, setAccentColor] = useState(localStorage.getItem("nx-accent") || "#2dd4bf");
  const [tileSize, setTileSize] = useState(Number(localStorage.getItem("nx-tile-size")) || 150);
  const [transitionSpeed, setTransitionSpeed] = useState(Number(localStorage.getItem("nx-transition")) || 300);
  const [haptics, setHaptics] = useState(localStorage.getItem("nx-haptics") !== "off");
  const [uiMode, setUiMode] = useState<"console" | "desktop">(
    (localStorage.getItem("nx-uimode") as "console" | "desktop") || initial.uiMode || "console"
  );
  const [launchOnStartup, setLaunchOnStartup] = useState(initial.launchOnStartup);
  const [closeBehavior, setCloseBehavior] = useState<"exit" | "minimize" | "ask">(initial.closeBehavior);
  const [startupLoading, setStartupLoading] = useState(false);
  const [tab, setTab] = useState<TabId>("general");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; msg: string } | null>(null);
  // v4.3.0 — sidebar customization state.
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Set<string>>(
    () => new Set((initial.hiddenPlatforms ?? "").split("|").filter(Boolean))
  );
  const [collections, setCollections] = useState<Collection[]>([]);
  // Load collections for the management section.
  useEffect(() => { (async () => { try { setCollections(await window.nexus.listCollections()); } catch { /* ignore */ } })(); }, []);

  // Read the actual registry state for launch-on-startup on mount
  useEffect(() => {
    void window.nexus.isLaunchOnStartupEnabled().then((enabled: boolean) => {
      setLaunchOnStartup(enabled);
    }).catch(() => {});
  }, []);

  const flash = (type: "info" | "success" | "error", msg: string) => {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 4000);
  };

  const toggleStartup = async () => {
    setStartupLoading(true);
    try {
      const newState = await window.nexus.setLaunchOnStartup(!launchOnStartup);
      setLaunchOnStartup(newState);
      flash("success", newState ? "NEXUS will launch on system startup" : "Startup launch disabled");
    } catch (e) {
      flash("error", "Couldn't toggle startup: " + (e instanceof Error ? e.message : String(e)));
    }
    setStartupLoading(false);
  };

  const toggleCloseBehavior = async (behavior: "exit" | "minimize" | "ask") => {
    setCloseBehavior(behavior);
    try {
      await window.nexus.setCloseBehavior(behavior);
      flash("success", `Close behavior set to: ${behavior === "exit" ? "Exit completely" : behavior === "minimize" ? "Minimize to tray" : "Ask every time"}`);
    } catch (e) {
      flash("error", "Couldn't set close behavior: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const switchUiMode = async (mode: "console" | "desktop") => {
    setUiMode(mode);
    localStorage.setItem("nx-uimode", mode);
    try {
      await onSave({ uiMode: mode });
      flash("success", `Switched to ${mode === "console" ? "Console" : "Desktop"} mode — toggle instantly without restart`);
    } catch {
      /* flash already shown by parent toast */
    }
  };

  const exportLibrary = async () => {
    try {
      const json = await window.nexus.exportLibrary();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexus-library-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash("success", "Library exported — downloaded as JSON backup.");
    } catch (e) {
      flash("error", "Export failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const importLibrary = async (file: File) => {
    try {
      const text = await file.text();
      const res = await window.nexus.importLibrary(text);
      flash("success", `Imported ${res.imported} game${res.imported === 1 ? "" : "s"}${res.skipped > 0 ? ` (${res.skipped} already existed)` : ""}`);
    } catch (e) {
      flash("error", "Import failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const checkMissing = async () => {
    try {
      const missing = await window.nexus.checkMissingGames();
      if (missing.length === 0) flash("success", "All games installed — no missing games found.");
      else flash("info", `${missing.length} game${missing.length === 1 ? "" : "s"} missing — ${missing.slice(0, 3).map((m: { title: string }) => m.title).join(", ")}${missing.length > 3 ? "…" : ""}`);
    } catch (e) {
      flash("error", "Check failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      localStorage.setItem("nx-accent", accentColor);
      localStorage.setItem("nx-tile-size", String(tileSize));
      localStorage.setItem("nx-transition", String(transitionSpeed));
      localStorage.setItem("nx-haptics", haptics ? "on" : "off");
      localStorage.setItem("nx-uimode", uiMode);
      applyAccent(accentColor);
      await onSave({
        autoScanOnStart: autoScan, defaultSort, scanPaths, launchOnStartup, closeBehavior, uiMode,
        // v4.3.0 — persist platform visibility (pipe-separated) + sidebar collapse default
        hiddenPlatforms: Array.from(hiddenPlatforms).join("|"),
        sidebarCollapsed: localStorage.getItem("nx-plat-collapsed") === "1",
      });
      flash("success", "Settings saved.");
    } catch (e) {
      flash("error", "Couldn't save: " + (e instanceof Error ? e.message : String(e)));
    }
    setSaving(false);
  };

  return (
    <div className="game-page">
      <button className="gp-back" onClick={onClose}>
        <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.Chevron size={18} /></span>
      </button>
      <div style={{ padding: "40px 48px 80px", maxWidth: 1080, margin: "0 auto" }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 28 }}>Settings</h1>

        <div className="settings-layout">
          {/* ===== LEFT SIDEBAR ===== */}
          <aside className="settings-sidebar">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "settings-tab active" : "settings-tab"} onClick={() => setTab(t.id)}>
                {t.icon}
                {t.label}
              </button>
            ))}
          </aside>

          {/* ===== RIGHT CONTENT ===== */}
          <div className="settings-content">
            {notice && (
              <div style={{
                marginBottom: 16, padding: "10px 14px", borderRadius: 8,
                border: `1px solid ${notice.type === "error" ? "rgba(248,113,113,0.32)" : notice.type === "success" ? "rgba(45,212,191,0.32)" : "var(--border-2)"}`,
                background: notice.type === "error" ? "rgba(248,113,113,0.08)" : notice.type === "success" ? "rgba(45,212,191,0.08)" : "rgba(255,255,255,0.02)",
                color: notice.type === "error" ? "var(--danger)" : notice.type === "success" ? "var(--accent)" : "var(--text-dim)",
                fontSize: 12, display: "flex", alignItems: "center", gap: 8,
              }}>
                {notice.type === "success" ? <Icon.CheckCircle size={14} /> : notice.type === "error" ? <Icon.Info size={14} /> : <Icon.Info size={14} />}
                <span>{notice.msg}</span>
              </div>
            )}

            {/* ===== GENERAL TAB ===== */}
            {tab === "general" && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Scanning</div>
                  <div className="settings-row">
                    <div className="label-stack">
                      <div className="t">Auto-scan on startup</div>
                      <div className="d">Detect newly installed games every time NEXUS launches.</div>
                    </div>
                    <button onClick={() => setAutoScan(!autoScan)} className={`settings-toggle ${autoScan ? "on" : ""}`}>
                      <span className="knob" />
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Default Sort</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                    <div className="label-stack">
                      <div className="t">Sort library by</div>
                      <div className="d">Applies when NEXUS starts and as the default filter.</div>
                    </div>
                    <div className="settings-choice-row">
                      {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                        <button key={k} className={`settings-choice ${defaultSort === k ? "active" : ""}`} onClick={() => setDefaultSort(k)}>
                          {SORT_LABELS[k]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Custom Scan Paths</div>
                  <div className="editor-field" style={{ marginBottom: 0 }}>
                    <textarea className="field-input" value={scanPaths} onChange={(e) => setScanPaths(e.target.value)} placeholder={"C:\\Games\nD:\\SteamLibrary"} rows={4} style={{ fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 12 }} />
                    <div className="field-hint"><Icon.Info size={12} /><span>One path per line. NEXUS probes these during a deep filesystem scan in addition to detected platform libraries.</span></div>
                  </div>
                </div>
              </>
            )}

            {/* ===== APPEARANCE TAB ===== */}
            {tab === "appearance" && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />UI Mode</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                    <div className="label-stack">
                      <div className="t">Launcher layout</div>
                      <div className="d">Console mode is the PS5-style carousel — controller-friendly, scrolls by arrow buttons. Desktop mode is a grid view like Steam/Epic — mouse-friendly with normal wheel scroll.</div>
                    </div>
                    <div className="settings-choice-row">
                      <button className={`settings-choice ${uiMode === "console" ? "active" : ""}`} onClick={() => switchUiMode("console")}>
                        <span>Console Mode</span>
                        <span className="desc">PS5-style carousel — controller-friendly</span>
                      </button>
                      <button className={`settings-choice ${uiMode === "desktop" ? "active" : ""}`} onClick={() => switchUiMode("desktop")}>
                        <span>Desktop Mode</span>
                        <span className="desc">Steam/Epic-style grid — mouse-friendly</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Accent Color</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
                    <div className="label-stack">
                      <div className="t">Highlight color</div>
                      <div className="d">Used for focused tiles, action buttons, links, and accents throughout the launcher.</div>
                    </div>
                    <div className="settings-accent-row">
                      {ACCENT_COLORS.map((c) => (
                        <button
                          key={c.color}
                          className={`settings-accent-swatch ${accentColor === c.color ? "active" : ""}`}
                          style={{ background: c.color }}
                          onClick={() => {
                            setAccentColor(c.color);
                            applyAccent(c.color);
                          }}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Carousel Tile Size</div>
                  <div className="editor-field" style={{ marginBottom: 0 }}>
                    <label>Tile width: {tileSize}px</label>
                    <input className="settings-range" type="range" min={120} max={200} step={10} value={tileSize} onChange={(e) => setTileSize(Number(e.target.value))} />
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Animation Speed</div>
                  <div className="editor-field" style={{ marginBottom: 0 }}>
                    <label>Transition duration: {transitionSpeed}ms</label>
                    <input className="settings-range" type="range" min={100} max={600} step={50} value={transitionSpeed} onChange={(e) => setTransitionSpeed(Number(e.target.value))} />
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Haptics</div>
                  <div className="settings-row">
                    <div className="label-stack">
                      <div className="t">Controller haptics</div>
                      <div className="d">Vibrate on navigation and button presses when a controller is connected.</div>
                    </div>
                    <button onClick={() => setHaptics(!haptics)} className={`settings-toggle ${haptics ? "on" : ""}`}>
                      <span className="knob" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ===== LIBRARY TAB ===== */}
            {tab === "library" && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Backup & Restore</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
                    <div className="label-stack">
                      <div className="t">Export library</div>
                      <div className="d">Download a JSON backup of your entire library — games, collections, play sessions.</div>
                    </div>
                    <div className="settings-choice-row">
                      <button className="settings-choice" style={{ minWidth: 0 }} onClick={exportLibrary}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.Download size={14} /> Export Library</span>
                      </button>
                      <label className="settings-choice" style={{ minWidth: 0, cursor: "pointer" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.DownloadCloud size={14} /> Import Library</span>
                        <input type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importLibrary(f); }} />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Maintenance</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
                    <div className="label-stack">
                      <div className="t">Check missing games</div>
                      <div className="d">Verify that every game in your library is still installed at its recorded path. Reports any missing installs.</div>
                    </div>
                    <div className="settings-choice-row">
                      <button className="settings-choice" style={{ minWidth: 0 }} onClick={checkMissing}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.Scan size={14} /> Check Missing Games</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ===== SIDEBAR TAB (v4.3.0) ===== */}
            {tab === "sidebar" && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Platform Visibility</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, padding: "14px 16px" }}>
                    <div className="label-stack" style={{ marginBottom: 6 }}>
                      <div className="t">Show these platforms in the sidebar</div>
                      <div className="d">Hidden platforms still appear on game cards, but won't clutter your sidebar list. Click a row to toggle.</div>
                    </div>
                    {PLATFORM_LIST.filter((p) => p.id !== "custom").map((p) => {
                      const hidden = hiddenPlatforms.has(p.id);
                      return (
                        <button
                          key={p.id}
                          className="settings-choice"
                          style={{ minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: hidden ? 0.55 : 1 }}
                          onClick={() => setHiddenPlatforms((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                            <span style={{ color: "var(--text-faint)", display: "inline-flex" }}><PlatformMark platform={p.id} size={16} /></span>
                            <span style={{ color: "var(--text)" }}>{p.label}</span>
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: hidden ? "var(--text-faint)" : "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {hidden ? "Hidden" : "Visible"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Collapse Behavior</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                    <div className="label-stack">
                      <div className="t">Default sidebar sections</div>
                      <div className="d">You can also collapse the Collections and Platforms sections at any time with the chevron in the sidebar — your choice persists across restarts.</div>
                    </div>
                    <div className="settings-choice-row">
                      <button className="settings-choice" style={{ minWidth: 0 }} onClick={() => { localStorage.setItem("nx-coll-collapsed", "0"); localStorage.setItem("nx-plat-collapsed", "0"); flash("success", "Both sidebar sections will start expanded"); }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.Library size={14} /> Expand Both</span>
                      </button>
                      <button className="settings-choice" style={{ minWidth: 0 }} onClick={() => { localStorage.setItem("nx-plat-collapsed", "1"); flash("success", "Platforms section will start collapsed"); }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.Chevron size={14} /> Collapse Platforms</span>
                      </button>
                      <button className="settings-choice" style={{ minWidth: 0 }} onClick={() => { localStorage.setItem("nx-coll-collapsed", "1"); localStorage.setItem("nx-plat-collapsed", "1"); flash("success", "Both sections will start collapsed"); }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.Chevron size={14} /> Collapse Both</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Manage Collections</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6, padding: "12px 14px" }}>
                    {collections.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "8px 4px" }}>No collections. Create one from the sidebar.</div>
                    )}
                    {collections.map((c) => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: "var(--r-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 15, display: "inline-flex", alignItems: "center", color: "var(--text)" }}><IconGlyph k={c.icon} size={16} /></span>
                        <span style={{ flex: 1, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{c.gameCount} games</span>
                        {c.pinned && <span style={{ color: "var(--accent)" }} title="Pinned"><Icon.Star size={12} filled /></span>}
                        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.kind === "manual" ? "manual" : c.kind.startsWith("auto:") ? "auto" : c.kind}</span>
                        {c.id >= 0 && c.kind === "manual" && (
                          <>
                            <button className="ctx-item" style={{ padding: "4px 8px", fontSize: 11 }} onClick={async () => { await window.nexus.updateCollection(c.id, { pinned: !c.pinned }); setCollections(await window.nexus.listCollections()); }} title={c.pinned ? "Unpin" : "Pin"}>
                              <Icon.Star size={12} filled={c.pinned} />
                            </button>
                            <button className="ctx-item danger" style={{ padding: "4px 8px", fontSize: 11 }} onClick={async () => { await window.nexus.deleteCollection(c.id); setCollections(await window.nexus.listCollections()); flash("success", "Collection deleted"); }} title="Delete">
                              <Icon.Trash size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ===== STARTUP & CLOSE TAB ===== */}
            {tab === "startup" && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />System Startup</div>
                  <div className="settings-row">
                    <div className="label-stack">
                      <div className="t">Launch on system startup</div>
                      <div className="d">Automatically start NEXUS when your computer boots.</div>
                    </div>
                    <button
                      onClick={toggleStartup}
                      disabled={startupLoading}
                      className={`settings-toggle ${launchOnStartup ? "on" : ""}`}
                      style={{ opacity: startupLoading ? 0.5 : 1, cursor: startupLoading ? "wait" : "pointer" }}
                    >
                      <span className="knob" />
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Close Behavior</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
                    <div className="label-stack">
                      <div className="t">When I close NEXUS</div>
                      <div className="d">Choose what happens when you click the close button.</div>
                    </div>
                    <div className="settings-choice-row">
                      {([
                        { value: "exit" as const, label: "Exit Completely", desc: "Close entirely" },
                        { value: "minimize" as const, label: "Minimize to Tray", desc: "Run in background" },
                        { value: "ask" as const, label: "Ask Every Time", desc: "Show a prompt" },
                      ]).map((opt) => (
                        <button key={opt.value} className={`settings-choice ${closeBehavior === opt.value ? "active" : ""}`} onClick={() => toggleCloseBehavior(opt.value)}>
                          <span>{opt.label}</span>
                          <span className="desc">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                    {closeBehavior !== "exit" && (
                      <div style={{ fontSize: 10, color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 5 }}>
                        <Icon.Info size={11} />
                        <span>The app keeps running in the system tray. Click the tray icon to reopen, or right-click for Quit.</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ===== OVERLAY TAB ===== */}
            {tab === "overlay" && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />In-Game Overlay</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
                    <div className="label-stack">
                      <div className="t">Quick toggle</div>
                      <div className="d">
                        Press <strong style={{ color: "var(--accent)" }}>Alt+O</strong> while playing to toggle the overlay.
                        Press <strong style={{ color: "var(--accent)" }}>Ctrl+Shift+X</strong> to toggle click-through mode.
                      </div>
                    </div>
                    <div className="settings-choice-row">
                      <button className="settings-choice" style={{ minWidth: 0 }} onClick={() => { void window.nexus.overlayToggle?.(); }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.Gamepad size={14} /> Test Overlay</span>
                      </button>
                      <button className="settings-choice" style={{ minWidth: 0 }} onClick={() => { void window.nexus.overlayToggleClickThrough?.(); }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.Refresh size={14} /> Toggle Click-Through</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Available Widgets</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                    <div className="label-stack">
                      <div className="t">Per-game profiles</div>
                      <div className="d">Each game can have a customized overlay with different widgets enabled. Configure per-game overlays from the game detail page.</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {OVERLAY_FEATURES.map((feature) => (
                        <div key={feature} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "6px 8px", borderRadius: 6,
                          background: "rgba(255,255,255,0.02)",
                          fontSize: 11, color: "var(--text-dim)",
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ===== ABOUT TAB ===== */}
            {tab === "about" && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />About NEXUS</div>
                  <div className="about-card">
                    <div className="logo"><NexusMark size={28} /></div>
                    <div>
                      <div className="name">NEXUS Launcher</div>
                      <div className="ver">Version 4.3.1 — Universal Game Launcher for Windows</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                        Auto-detects every installed game across Steam, Epic, GOG, Battle.net, EA, Ubisoft, Riot and Xbox. Patches rich metadata via RAWG + Steam APIs. Launches natively.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Updates</div>
                  <div className="settings-row">
                    <div className="label-stack">
                      <div className="t">Check for updates</div>
                      <div className="d">Download and install the latest version from GitHub.</div>
                    </div>
                    <button className="settings-choice" style={{ minWidth: 0 }} onClick={onCheckUpdates}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.Refresh size={14} /> Check Now</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Sticky Save / Cancel */}
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <Icon.Spinner size={14} /> : <Icon.Check size={14} />} Save Settings
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
