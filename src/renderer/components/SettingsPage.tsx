import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { LauncherSettings, SortKey, Collection } from "@shared/types";
import { SORT_LABELS, PLATFORM_LIST } from "@shared/types";
import { Icon } from "./Icons";
import { applyAccent } from "../lib/accent";
import { NexusMark } from "./Logo";
import { PlatformMark } from "./PlatformMark";
import { IconGlyph } from "./IconGlyph";
import { FIRST_PARTY_PLUGINS } from "../lib/first-party-plugins";
import type { InstalledPlugin } from "@shared/plugin-types";
import { reloadPlugins } from "../lib/plugin-runtime";
import { usePluginExtensions } from "../lib/plugin-store";
import { PluginIcon } from "./PluginIcon";

interface Props {
  initial: LauncherSettings;
  onClose: () => void;
  onSave: (s: Partial<LauncherSettings>) => Promise<LauncherSettings>;
  onCheckUpdates: () => void;
}

type TabId = "general" | "appearance" | "library" | "sidebar" | "plugins" | "developer" | "startup" | "overlay" | "about";

interface TabDef { id: TabId; label: string; icon: ReactNode }
const TABS: TabDef[] = [
  { id: "general", label: "General", icon: <Icon.Settings size={15} /> },
  { id: "appearance", label: "Appearance", icon: <Icon.Sparkles size={15} /> },
  { id: "library", label: "Library", icon: <Icon.Library size={15} /> },
  { id: "sidebar", label: "Sidebar", icon: <Icon.Folder size={15} /> },
  { id: "plugins", label: "Plugins", icon: <Icon.FileCog size={15} /> },
  { id: "developer", label: "Developer", icon: <Icon.Cpu size={15} /> },
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
  const [rawgApiKey, setRawgApiKey] = useState(initial.rawgApiKey ?? "");
  const [autoScan, setAutoScan] = useState(initial.autoScanOnStart);
  const [defaultSort, setDefaultSort] = useState<SortKey>(initial.defaultSort);
  const [scanPaths, setScanPaths] = useState(initial.scanPaths);
  const [accentColor, setAccentColor] = useState(localStorage.getItem("nx-accent") || "#2dd4bf");
  const [tileSize, setTileSize] = useState(Number(localStorage.getItem("nx-tile-size")) || 150);
  const [transitionSpeed, setTransitionSpeed] = useState(Number(localStorage.getItem("nx-transition")) || 300);
  const [haptics, setHaptics] = useState(localStorage.getItem("nx-haptics") !== "off");
  // v4.6.0 — auto-play game trailers (muted, one at a time, reduced-motion-respected).
  const [autoplayTrailers, setAutoplayTrailers] = useState(localStorage.getItem("nx-autoplay-trailers") !== "0");
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
      localStorage.setItem("nx-autoplay-trailers", autoplayTrailers ? "1" : "0");
      localStorage.setItem("nx-uimode", uiMode);
      applyAccent(accentColor);
      await onSave({
        rawgApiKey, autoScanOnStart: autoScan, defaultSort, scanPaths, launchOnStartup, closeBehavior, uiMode,
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
                  <div className="settings-section-title"><span className="bar" />RAWG API Key</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                    <div className="label-stack">
                      <div className="t">RAWG API Key</div>
                      <div className="d">Required for cover art, descriptions, ratings, screenshots, AND game trailers. The built-in default key has expired — get your own free key at <a href="https://rawg.io/apilogin" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>rawg.io/apilogin</a> (sign up, request a key, paste it below). Without a valid key, no metadata or trailers will be fetched.</div>
                    </div>
                    <input
                      className="field-input"
                      type="text"
                      value={rawgApiKey}
                      onChange={(e) => setRawgApiKey(e.target.value)}
                      placeholder="Paste your RAWG API key here (e.g. b40b7e…)"
                      style={{ fontFamily: '"Cascadia Code",Consolas,monospace', fontSize: 12 }}
                    />
                  </div>
                </div>

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

                {/* v4.10.0 — Installer cache cleanup */}
                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Update Cache</div>
                  <InstallerCleanupCard flash={flash} />
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

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Game Trailers</div>
                  <div className="settings-row">
                    <div className="label-stack">
                      <div className="t">Auto-play game trailers</div>
                      <div className="d">When enabled, games with a valid trailer show a muted, looping video preview on hover (cards) and on the game detail page. Only one trailer plays at a time. Falls back to the static poster when off, unavailable, or if the user has requested reduced motion.</div>
                    </div>
                    <button onClick={() => setAutoplayTrailers(!autoplayTrailers)} className={`settings-toggle ${autoplayTrailers ? "on" : ""}`}>
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

            {/* ===== PLUGINS TAB (v4.7.0) ===== */}
            {tab === "plugins" && <PluginsTab flash={flash} />}

            {/* ===== DEVELOPER TAB (v4.7.0) ===== */}
            {tab === "developer" && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Developer Mode</div>
                  <div className="settings-row">
                    <div className="label-stack">
                      <div className="t">Enable developer mode</div>
                      <div className="d">Shows diagnostic info in the console, enables DevTools shortcuts, and exposes additional debugging tools for plugins + the app itself.</div>
                    </div>
                    <button onClick={() => { const v = localStorage.getItem("nx-devmode") !== "1"; localStorage.setItem("nx-devmode", v ? "1" : "0"); flash("info", v ? "Developer mode enabled" : "Developer mode disabled"); }} className={`settings-toggle ${localStorage.getItem("nx-devmode") === "1" ? "on" : ""}`}>
                      <span className="knob" />
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Plugin Development</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", padding: "14px 16px" }}>
                    <div className="label-stack">
                      <div className="t">Plugin Developer Guide</div>
                      <div className="d">Complete documentation for creating NEXUS plugins — manifest format, HostAPI reference, permissions, lifecycle, example plugins, and debugging.</div>
                    </div>
                    <a href="https://github.com/thebluedogcorp/nexus-launcher/blob/main/PLUGIN_DEVELOPER_GUIDE.md" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: "var(--r-md)", background: "var(--accent)", color: "var(--accent-fg)", fontWeight: 600, fontSize: 13, textDecoration: "none", marginTop: 8 }}>
                      <Icon.ExternalLink size={14} /> Open Developer Guide
                    </a>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Example Plugins</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", padding: "14px 16px" }}>
                    <div className="d" style={{ lineHeight: 1.6 }}>Two example plugins are included in the repository under <code>example-plugins/</code>:</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      <div style={{ flex: 1, padding: 14, borderRadius: "var(--r-md)", background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 16, marginBottom: 4 }}>👋 Hello World</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Minimal plugin: registers a page + calls the games API.</div>
                      </div>
                      <div style={{ flex: 1, padding: 14, borderRadius: "var(--r-md)", background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 16, marginBottom: 4 }}>📊 Library Insights</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Dashboard with stats + game-card action + events + storage.</div>
                      </div>
                    </div>
                    <a href="https://github.com/thebluedogcorp/nexus-launcher/tree/main/example-plugins" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent)", fontSize: 12, marginTop: 8, textDecoration: "none" }}>
                      <Icon.ExternalLink size={12} /> View on GitHub
                    </a>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />Diagnostics</div>
                  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", padding: "14px 16px" }}>
                    <div className="label-stack">
                      <div className="t">Open DevTools</div>
                      <div className="d">Inspect the app's HTML/CSS/JS, view console logs (including plugin logs + trailer diagnostics), and debug issues.</div>
                    </div>
                    <div className="settings-choice-row" style={{ marginTop: 8 }}>
                      <button className="settings-choice" style={{ minWidth: 0 }} onClick={() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "F12" })); }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.Cpu size={14} /> Toggle DevTools</span>
                      </button>
                      <button className="settings-choice" style={{ minWidth: 0 }} onClick={() => { location.reload(); }}>
                        <Icon.Refresh size={14} /> Reload App
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title"><span className="bar" />App Info</div>
                  <div className="settings-row" style={{ flexDirection: "column", padding: "14px 16px" }}>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.8 }}>
                      <strong style={{ color: "var(--text)" }}>Version:</strong> 4.7.0<br />
                      <strong style={{ color: "var(--text)" }}>Electron:</strong> 32<br />
                      <strong style={{ color: "var(--text)" }}>React:</strong> 19<br />
                      <strong style={{ color: "var(--text)" }}>Plugin API:</strong> v1<br />
                      <strong style={{ color: "var(--text)" }}>CSP:</strong> media-src + frame-src (YouTube) enabled<br />
                      <strong style={{ color: "var(--text)" }}>GitHub:</strong> <a href="https://github.com/thebluedogcorp/nexus-launcher" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>thebluedogcorp/nexus-launcher</a>
                    </div>
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
                      <div className="ver">Version 4.8.1 — Universal Game Launcher for Windows</div>
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

function PluginsTab({ flash }: { flash: (type: "info" | "success" | "error", msg: string) => void }) {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  // v4.9.0 — per-plugin settings panel expansion (from registered settingsPanels)
  const [openSettings, setOpenSettings] = useState<string | null>(null);
  // v4.10.0 — plugin update info: map of id → {installedVersion, latestVersion}
  const [updates, setUpdates] = useState<Record<string, { installedVersion: string; latestVersion: string }>>({});
  const [checking, setChecking] = useState(false);
  const { settingsPanels } = usePluginExtensions();

  const refresh = async () => {
    try { setPlugins(await window.nexus.pluginsList()); } catch {}
    setLoading(false);
  };

  // v4.10.0 — Build the first-party catalog (id + version + name) from the
  // embedded FIRST_PARTY_PLUGINS constant, then ask the main process which
  // installed plugins are outdated. Auto-check on mount + on user demand.
  const checkForUpdates = async (silent = false) => {
    setChecking(true);
    try {
      const catalog = FIRST_PARTY_PLUGINS.map((fp) => {
        const m = JSON.parse(fp.manifest);
        return { id: m.id, version: m.version, name: m.name };
      });
      const res = await window.nexus.pluginsCheckUpdates(catalog);
      const map: Record<string, { installedVersion: string; latestVersion: string }> = {};
      for (const u of res.updates) {
        map[u.id] = { installedVersion: u.installedVersion, latestVersion: u.latestVersion };
      }
      setUpdates(map);
      if (!silent) {
        if (res.updates.length === 0) flash("success", "All plugins are up to date");
        else flash("info", `${res.updates.length} plugin update${res.updates.length === 1 ? "" : "s"} available`);
      }
    } catch (e) {
      if (!silent) flash("error", `Update check failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setChecking(false);
  };

  useEffect(() => {
    void refresh();
    void checkForUpdates(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePlugin = async (fp: typeof FIRST_PARTY_PLUGINS[0]) => {
    setUpdating(fp.id);
    try {
      const result = await window.nexus.pluginsUpdateFromCode(fp.manifest, fp.code);
      if ("error" in result) {
        flash("error", `Update failed: ${result.error}`);
      } else {
        await reloadPlugins();
        flash("success", `Updated ${result.manifest.name} to v${result.manifest.version}`);
        void refresh();
        void checkForUpdates(true);
      }
    } catch (e) {
      flash("error", `Update failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setUpdating(null);
  };

  const installFromDir = async () => {
    const dir = await window.nexus.pluginsSelectDir();
    if (!dir) return;
    const result = await window.nexus.pluginsInstall(dir);
    if ("error" in result) { flash("error", `Install failed: ${result.error}`); }
    else { flash("success", `Installed: ${result.manifest.name}`); void refresh(); }
  };

  const installFirstParty = async (fp: typeof FIRST_PARTY_PLUGINS[0]) => {
    setInstalling(fp.id);
    try {
      const result = await window.nexus.pluginsInstallFromCode(fp.manifest, fp.code);
      if ("error" in result) { flash("error", `Install failed: ${result.error}`); }
      else {
        await window.nexus.pluginsEnable(result.manifest.id);
        await reloadPlugins();
        flash("success", `Installed + enabled: ${result.manifest.name}`);
        void refresh();
      }
    } catch (e) { flash("error", `Install failed: ${e instanceof Error ? e.message : String(e)}`); }
    setInstalling(null);
  };

  const toggle = async (p: InstalledPlugin) => {
    if (p.status === "enabled") { await window.nexus.pluginsDisable(p.manifest.id); }
    else { await window.nexus.pluginsEnable(p.manifest.id); }
    await reloadPlugins(); void refresh();
    flash("success", `${p.manifest.name} ${p.status === "enabled" ? "disabled" : "enabled"}`);
  };
  const remove = async (p: InstalledPlugin) => {
    await window.nexus.pluginsRemove(p.manifest.id);
    await reloadPlugins(); void refresh();
    flash("success", `Removed: ${p.manifest.name}`);
  };

  // Parse all first-party manifests once.
  const fpParsed = useMemo(() => FIRST_PARTY_PLUGINS.map((fp) => ({ ...JSON.parse(fp.manifest), _fp: fp })), []);
  const categories = useMemo(() => {
    const set = new Set<string>();
    fpParsed.forEach((m) => m.category && set.add(m.category));
    return ["all", ...Array.from(set)];
  }, [fpParsed]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fpParsed.filter((m) => {
      if (cat !== "all" && m.category !== cat) return false;
      if (!q) return true;
      return (m.name + " " + (m.description ?? "") + " " + (m.tagline ?? "") + " " + (m.author ?? "")).toLowerCase().includes(q)
        || (m.permissions ?? []).some((p: string) => p.toLowerCase().includes(q));
    });
  }, [fpParsed, query, cat]);

  const featured = filtered.filter((m) => m.featured);
  const standard = filtered.filter((m) => !m.featured);
  const updateCount = Object.keys(updates).length;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-faint)" }}>Loading…</div>;

  const installedIds = new Set(plugins.map((p) => p.manifest.id));
  const enabledIds = new Set(plugins.filter((p) => p.status === "enabled").map((p) => p.manifest.id));

  return (
    <>
      {/* ===== Gallery Header (search + filter + check-for-updates) ===== */}
      <div className="settings-section plugin-gallery-head">
        <div className="settings-section-title">
          <span className="bar" />Plugin Marketplace
          {updateCount > 0 && (
            <span className="plugin-update-pill" title={`${updateCount} plugin update${updateCount === 1 ? "" : "s"} available`}>
              <Icon.Refresh size={10} /> {updateCount} update{updateCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="plugin-gallery-head-row">
          <div className="plugin-search-box">
            <Icon.Search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search plugins, capabilities, or authors…" />
            {query && <button className="plugin-search-clear" onClick={() => setQuery("")} aria-label="Clear search"><Icon.Close size={12} /></button>}
          </div>
          <div className="plugin-cat-chips">
            {categories.map((c) => (
              <button key={c} className={cat === c ? "plugin-cat-chip active" : "plugin-cat-chip"} onClick={() => setCat(c)}>
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>
          <button className="plugin-check-updates-btn" onClick={() => checkForUpdates(false)} disabled={checking} title="Check for plugin updates">
            {checking ? <Icon.Spinner size={12} /> : <Icon.Refresh size={12} />}
            {checking ? "Checking…" : "Check for updates"}
          </button>
        </div>
      </div>

      {/* ===== Featured Plugins ===== */}
      {featured.length > 0 && (
        <div className="settings-section">
          <div className="settings-section-title"><span className="bar" />Featured</div>
          <div className="plugin-featured-grid">
            {featured.map((m) => (
              <FeaturedPluginCard
                key={m.id}
                manifest={m}
                installed={installedIds.has(m.id)}
                enabled={enabledIds.has(m.id)}
                installing={installing === m.id}
                onInstall={() => void installFirstParty(m._fp)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ===== Browse All ===== */}
      <div className="settings-section">
        <div className="settings-section-title"><span className="bar" />Browse All</div>
        {standard.length === 0 ? (
          <div className="plugin-empty">No plugins match your search. Try a different keyword or category.</div>
        ) : (
          <div className="plugin-gallery-grid">
            {standard.map((m) => (
              <PluginGalleryCard
                key={m.id}
                manifest={m}
                installed={installedIds.has(m.id)}
                enabled={enabledIds.has(m.id)}
                installing={installing === m.id}
                onInstall={() => void installFirstParty(m._fp)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ===== Installed Plugins (redesigned — no word-wrap bug) ===== */}
      <div className="settings-section">
        <div className="settings-section-title"><span className="bar" />Installed Plugins <span className="plugin-count-pill">{plugins.length}</span></div>
        {plugins.length === 0 ? (
          <div className="plugin-empty">No plugins installed yet. Install a first-party plugin above, or click “Install from Directory” below to add a custom plugin.</div>
        ) : (
          <div className="plugin-installed-list">
            {plugins.map((p) => (
              <InstalledPluginRow
                key={p.manifest.id}
                plugin={p}
                hasSettings={settingsPanels.some((sp) => sp.pluginId === p.manifest.id)}
                updateInfo={updates[p.manifest.id]}
                updating={updating === p.manifest.id}
                onToggle={() => void toggle(p)}
                onRemove={() => void remove(p)}
                onUpdate={async () => {
                  const fp = FIRST_PARTY_PLUGINS.find((f) => f.id === p.manifest.id);
                  if (fp) await updatePlugin(fp);
                }}
                onOpenSettings={() => setOpenSettings(openSettings === p.manifest.id ? null : p.manifest.id)}
                settingsOpen={openSettings === p.manifest.id}
                settingsExt={settingsPanels.find((sp) => sp.pluginId === p.manifest.id)}
              />
            ))}
          </div>
        )}
        <div className="settings-choice-row" style={{ marginTop: 12 }}>
          <button className="settings-choice" style={{ minWidth: 0 }} onClick={installFromDir}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon.Plus size={14} /> Install from Directory</span>
          </button>
        </div>
      </div>
    </>
  );
}

// ─── v4.9.0 — Gallery card for a standard first-party plugin. ──────────────
function PluginGalleryCard({ manifest, installed, enabled, installing, onInstall }: {
  manifest: { id: string; name: string; version: string; author: string; description: string; icon?: string; category?: string; tagline?: string; accent?: string; permissions?: string[] };
  installed: boolean;
  enabled: boolean;
  installing: boolean;
  onInstall: () => void;
}) {
  const accent = manifest.accent || "var(--accent)";
  return (
    <div className={`plugin-card ${installed ? "installed" : ""}`}>
      <div className="plugin-card-head" style={{ background: `linear-gradient(135deg, ${accent}26 0%, transparent 100%)` }}>
        <div className="plugin-card-icon" style={{ background: `${accent}1f`, color: accent }}>
          <PluginIcon name={manifest.icon} size={22} />
        </div>
        <div className="plugin-card-meta">
          <div className="plugin-card-name">{manifest.name}</div>
          <div className="plugin-card-tag">{manifest.tagline || manifest.category || "Plugin"} · v{manifest.version}</div>
        </div>
        {installed && (
          <span className={`plugin-installed-badge ${enabled ? "on" : ""}`}>
            <Icon.Check size={10} /> {enabled ? "Enabled" : "Installed"}
          </span>
        )}
      </div>
      <div className="plugin-card-body">
        <p className="plugin-card-desc">{manifest.description}</p>
        <div className="plugin-perm-row">
          {(manifest.permissions ?? []).map((perm) => (
            <span key={perm} className="plugin-perm-chip" title={perm}>{perm}</span>
          ))}
        </div>
      </div>
      <div className="plugin-card-foot">
        <span className="plugin-author">by {manifest.author}</span>
        {installed ? (
          <button className="plugin-btn-installed" disabled><Icon.Check size={12} /> Added</button>
        ) : (
          <button className="plugin-btn-install" onClick={onInstall} disabled={installing} style={{ background: accent }}>
            {installing ? <Icon.Spinner size={12} /> : <Icon.Plus size={12} />} Install
          </button>
        )}
      </div>
    </div>
  );
}

// ─── v4.9.0 — Larger card for featured plugins. ─────────────────────────────
function FeaturedPluginCard(props: Parameters<typeof PluginGalleryCard>[0]) {
  const manifest = props.manifest;
  const accent = manifest.accent || "var(--accent)";
  return (
    <div className={`plugin-card featured ${props.installed ? "installed" : ""}`}>
      <div className="plugin-card-featured-strip" style={{ background: `linear-gradient(135deg, ${accent}38 0%, ${accent}10 100%)` }}>
        <div className="plugin-featured-mark" style={{ background: accent, color: "#000" }}><Icon.Sparkles size={11} /></div>
        <span className="plugin-featured-label">Featured</span>
      </div>
      <div className="plugin-card-head" style={{ background: `linear-gradient(135deg, ${accent}26 0%, transparent 100%)` }}>
        <div className="plugin-card-icon featured" style={{ background: `${accent}24`, color: accent }}>
          <PluginIcon name={manifest.icon} size={28} />
        </div>
        <div className="plugin-card-meta">
          <div className="plugin-card-name featured">{manifest.name}</div>
          <div className="plugin-card-tag">{manifest.tagline || manifest.category}</div>
        </div>
      </div>
      <div className="plugin-card-body">
        <p className="plugin-card-desc">{manifest.description}</p>
        <div className="plugin-perm-row">
          {(manifest.permissions ?? []).map((perm) => (
            <span key={perm} className="plugin-perm-chip" title={perm}>{perm}</span>
          ))}
        </div>
      </div>
      <div className="plugin-card-foot">
        <span className="plugin-author">by {manifest.author} · v{manifest.version}</span>
        {props.installed ? (
          <button className="plugin-btn-installed" disabled><Icon.Check size={12} /> {props.enabled ? "Enabled" : "Installed"}</button>
        ) : (
          <button className="plugin-btn-install" onClick={props.onInstall} disabled={props.installing} style={{ background: accent }}>
            {props.installing ? <Icon.Spinner size={12} /> : <Icon.Plus size={12} />} Install
          </button>
        )}
      </div>
    </div>
  );
}

// ─── v4.9.0 — Row for an installed plugin (fixes the broken word-wrap layout). ─
function InstalledPluginRow({ plugin, hasSettings, updateInfo, updating, onToggle, onRemove, onUpdate, onOpenSettings, settingsOpen, settingsExt }: {
  plugin: InstalledPlugin;
  hasSettings: boolean;
  updateInfo?: { installedVersion: string; latestVersion: string };
  updating: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: () => void;
  onOpenSettings: () => void;
  settingsOpen: boolean;
  settingsExt?: import("@shared/plugin-types").SettingsPanelExtension;
}) {
  const m = plugin.manifest;
  const accent = m.accent || "var(--accent)";
  return (
    <div className={`plugin-row ${plugin.status === "enabled" ? "on" : ""} ${plugin.status === "error" ? "err" : ""} ${updateInfo ? "upd" : ""}`}>
      <div className="plugin-row-icon" style={{ background: `${accent}1a`, color: accent }}>
        <PluginIcon name={m.icon} size={18} />
      </div>
      <div className="plugin-row-body">
        <div className="plugin-row-title">
          <span className="plugin-row-name">{m.name}</span>
          <span className="plugin-row-ver">v{updateInfo ? updateInfo.installedVersion : m.version}</span>
          <span className={`plugin-row-status status-${plugin.status}`}>{plugin.status}</span>
          {updateInfo && (
            <span className="plugin-row-update-badge" title={`Update available — v${updateInfo.installedVersion} → v${updateInfo.latestVersion}`}>
              <Icon.Refresh size={9} /> v{updateInfo.latestVersion} available
            </span>
          )}
        </div>
        <div className="plugin-row-desc">{m.description}</div>
        <div className="plugin-row-meta">
          <span className="plugin-row-author">by {m.author}</span>
          {(m.permissions ?? []).length > 0 && (
            <span className="plugin-row-perms">
              {(m.permissions ?? []).map((p) => <span key={p} className="plugin-perm-chip tiny" title={p}>{p}</span>)}
            </span>
          )}
        </div>
        {plugin.error && <div className="plugin-row-error"><Icon.Info size={11} /> {plugin.error}</div>}
      </div>
      <div className="plugin-row-actions">
        {updateInfo && (
          <button className="plugin-action-btn update" onClick={onUpdate} disabled={updating} title={`Update to v${updateInfo.latestVersion}`}>
            {updating ? <Icon.Spinner size={13} /> : <Icon.Refresh size={13} />}
            <span>{updating ? "Updating…" : "Update"}</span>
          </button>
        )}
        {hasSettings && (
          <button className="plugin-action-btn" onClick={onOpenSettings} title="Plugin settings">
            <Icon.Settings size={14} />
          </button>
        )}
        <button className={`settings-toggle ${plugin.status === "enabled" ? "on" : ""}`} onClick={onToggle} title={plugin.status === "enabled" ? "Disable" : "Enable"}>
          <span className="knob" />
        </button>
        <button className="plugin-action-btn danger" onClick={onRemove} title="Remove plugin">
          <Icon.Trash size={13} />
        </button>
      </div>
      {settingsOpen && settingsExt && <PluginSettingsPanel ext={settingsExt} />}
    </div>
  );
}

// v4.9.0 — Renders a plugin-registered settings panel inside the row (expand).
function PluginSettingsPanel({ ext }: { ext: import("@shared/plugin-types").SettingsPanelExtension }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try { ext.mount(el); } catch (e) { el.innerHTML = `<div style="padding:12px;color:var(--danger);font-size:12px">Failed to load settings panel: ${e instanceof Error ? e.message : String(e)}</div>`; }
    return () => { try { ext.unmount?.(el); } catch { /* ignore */ } };
  }, [ext]);
  return <div className="plugin-settings-panel" ref={ref} />;
}

// v4.10.0 — Installer cache cleanup card. Shows how much disk space old update
// installers are taking in %TEMP% (each NEXUS-Setup-*.exe is ~85 MB, left
// behind after every auto-update), with a one-click Clean button + auto-cleanup
// on startup (handled by src/main/index.ts).
function InstallerCleanupCard({ flash }: { flash: (type: "info" | "success" | "error", msg: string) => void }) {
  const [info, setInfo] = useState<{ bytes: number; files: string[] }>({ bytes: 0, files: [] });
  const [cleaning, setCleaning] = useState(false);

  const refresh = async () => {
    try { setInfo(await window.nexus.getInstallerCacheInfo()); } catch { /* ignore */ }
  };
  useEffect(() => { void refresh(); }, []);

  const formatSize = (b: number) => {
    if (b === 0) return "0 MB";
    const mb = b / (1024 * 1024);
    if (mb < 1) return (b / 1024).toFixed(0) + " KB";
    if (mb < 1024) return mb.toFixed(1) + " MB";
    return (mb / 1024).toFixed(2) + " GB";
  };

  const clean = async () => {
    setCleaning(true);
    try {
      const result = await window.nexus.cleanupInstallers();
      if (result.ok) {
        flash("success", result.message || "Cache cleared");
      } else {
        flash("error", `Cleanup failed: ${result.message}`);
      }
      await refresh();
    } catch (e) {
      flash("error", `Cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setCleaning(false);
  };

  return (
    <div className="plugin-cleanup-card">
      <div className="plugin-cleanup-card-icon"><Icon.HardDrive size={18} /></div>
      <div className="plugin-cleanup-card-body">
        <div className="plugin-cleanup-card-title">Installer cache</div>
        <div className="plugin-cleanup-card-desc">
          NEXUS downloads installer .exe files to <code style={{ fontFamily: '"Cascadia Code",Consolas,monospace', fontSize: 11 }}>%TEMP%</code> when checking for app updates — each is ~85 MB and is normally left behind after install. NEXUS auto-sweeps them on startup; you can also clean manually.
          {info.files.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>{formatSize(info.bytes)}</span> across {info.files.length} file{info.files.length === 1 ? "" : "s"}: {info.files.slice(0, 3).join(", ")}{info.files.length > 3 ? ` +${info.files.length - 3} more` : ""}
            </div>
          )}
        </div>
      </div>
      <div className="plugin-cleanup-card-actions">
        <button className="plugin-cleanup-card-btn" onClick={() => void refresh()} disabled={cleaning} title="Refresh">
          <Icon.Refresh size={12} />
        </button>
        <button className="plugin-cleanup-card-btn danger" onClick={() => void clean()} disabled={cleaning || info.bytes === 0} title="Delete leftover installer files">
          {cleaning ? <Icon.Spinner size={12} /> : <Icon.Trash size={12} />} Clean
        </button>
      </div>
    </div>
  );
}
