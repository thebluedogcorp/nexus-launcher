import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DetectedGame,
  Game,
  LauncherSettings,
  PlatformId,
  SortKey,
  Stats,
} from "@shared/types";
import { PLATFORM_LIST } from "@shared/types";
import { Icon } from "./components/Icons";
import { GamePage } from "./components/GamePage";
import { AddGameDialog } from "./components/AddGameDialog";
import { ScanDialog } from "./components/ScanDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { UpdateDialog } from "./components/UpdateDialog";
import { ToastContainer, type Toast } from "./components/Toast";
import { useGamepadController } from "./lib/useGamepad";
import {
  formatPlaytime, formatPlaytimeShort, formatSize, platformColor, platformLabel,
  gradientFor, initials, relativeTime,
} from "./lib/helpers";

interface Filters {
  platform: string;
  favOnly: boolean;
  query: string;
  sort: SortKey;
}

const DEFAULT_FILTERS: Filters = { platform: "all", favOnly: false, query: "", sort: "recent" };

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recently Played" },
  { value: "name", label: "Name A–Z" },
  { value: "playtime", label: "Most Played" },
  { value: "rating", label: "Top Rated" },
];

export function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<LauncherSettings | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [pageGame, setPageGame] = useState<Game | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [patching, setPatching] = useState(false);
  const [patchProgress, setPatchProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version?: string; releaseUrl?: string; downloadUrl?: string; downloadSize?: number } | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  const toast = useCallback((type: Toast["type"], title: string, desc?: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, title, desc }]);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const refreshGames = useCallback(async () => {
    const list = await window.nexus.listGames({
      platform: filters.platform, favOnly: filters.favOnly, query: filters.query, sort: filters.sort,
    });
    setGames(list);
  }, [filters]);

  const refreshStats = useCallback(async () => setStats(await window.nexus.getStats()), []);
  const refreshAll = useCallback(async () => {
    setLoading(true);
    try { await Promise.all([refreshGames(), refreshStats()]); } finally { setLoading(false); }
  }, [refreshGames, refreshStats]);

  useEffect(() => {
    (async () => {
      try {
        const s = await window.nexus.getSettings();
        setSettings(s);
        setFilters((f) => ({ ...f, sort: s.defaultSort }));
        await refreshAll();
        if (s.autoScanOnStart) {
          try {
            const summary = await window.nexus.runScan(
              PLATFORM_LIST.filter((p) => p.id !== "custom" && p.id !== "manual").map((p) => p.id as PlatformId),
            );
            if (summary.detected.length > 0) {
              const imported = await window.nexus.importDetected(summary.detected);
              if (imported.length > 0) toast("success", `Found ${imported.length} new game${imported.length === 1 ? "" : "s"}`, "Artwork fetched automatically.");
            }
          } catch { /* silent */ }
        }
        try {
          const upd = await window.nexus.checkForUpdates();
          if (upd.ok && upd.updateAvailable) {
            setUpdateAvailable({ version: upd.version, releaseUrl: upd.releaseUrl, downloadUrl: upd.downloadUrl, downloadSize: upd.downloadSize });
          }
        } catch { /* ignore */ }
      } catch (e) {
        console.error("[NEXUS] init failed:", e);
        toast("error", "Couldn't load library", "The local database may be locked.");
      } finally { setLoading(false); }
    })();

    const offProgress = (window as unknown as { nexus?: { onPatchProgress?: (cb: (p: { gameId: number; title: string; current: number; total: number }) => void) => () => void } }).nexus?.onPatchProgress?.((p) => {
      setPatching(true);
      setPatchProgress({ current: p.current, total: p.total, title: p.title });
    });
    const offGameUpdated = (window as unknown as { nexus?: { onPatchGameUpdated?: (cb: (p: { game: Game }) => void) => () => void } }).nexus?.onPatchGameUpdated?.(({ game }) => {
      setGames((prev) => prev.map((g) => (g.id === game.id ? game : g)));
      if (pageGame?.id === game.id) setPageGame(game);
      refreshStats();
    });
    const offDone = (window as unknown as { nexus?: { onPatchDone?: (cb: (p: { patched: number; attempted: number }) => void) => () => void } }).nexus?.onPatchDone?.(({ patched, attempted }) => {
      setPatching(false); setPatchProgress(null);
      if (patched > 0) toast("success", `Enriched ${patched} of ${attempted} games`, "Artwork fetched automatically.");
      refreshAll();
    });
    return () => { offProgress?.(); offGameUpdated?.(); offDone?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!loading) refreshGames(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters]);

  // Live clock (PS5 shows the time in the top-right).
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const openPage = useCallback(async (id: number) => setPageGame(await window.nexus.getGame(id)), []);

  const handleLaunch = useCallback(async (g: Game) => {
    toast("info", `Launching ${g.title}…`, "Starting via its native store protocol.");
    const res = await window.nexus.launchGame(g.id);
    if (res.ok) {
      toast("success", `${g.title} is running`, "Play session recorded.");
      await refreshAll();
      if (pageGame?.id === g.id) setPageGame(await window.nexus.getGame(g.id));
    } else toast("error", "Launch failed", res.message);
  }, [refreshAll, toast, pageGame]);

  const handlePatch = useCallback(async (g: Game) => {
    toast("info", "Patching metadata…", "Querying RAWG + Steam.");
    const updated = await window.nexus.patchMetadata(g.id);
    if (updated) {
      toast("success", "Metadata updated", updated.bannerImage ? "Artwork refreshed." : "Details refreshed.");
      await refreshAll();
      if (pageGame?.id === g.id) setPageGame(updated);
    } else toast("error", "No metadata found");
  }, [refreshAll, toast, pageGame]);

  const handleToggleFav = useCallback(async (g: Game) => {
    await window.nexus.updateGame(g.id, { favorite: !g.favorite });
    await refreshAll();
    if (pageGame?.id === g.id) setPageGame(await window.nexus.getGame(g.id));
  }, [refreshAll, pageGame]);

  const handleDelete = useCallback(async (g: Game) => {
    await window.nexus.deleteGame(g.id);
    toast("success", "Removed from library", g.title);
    setPageGame(null);
    await refreshAll();
  }, [refreshAll, toast]);

  const handleAdd = useCallback(async (input: {
    title: string; platform: PlatformId; executable?: string | null;
    installDir?: string | null; launchCommand?: string | null; autoPatch?: boolean;
  }) => {
    const g = await window.nexus.addGame(input);
    toast("success", `${g.title} added`, input.autoPatch !== false ? "Metadata auto-patched." : undefined);
    await refreshAll();
    return g;
  }, [refreshAll, toast]);

  const handleRunScan = useCallback(async (platforms: PlatformId[]) => window.nexus.runScan(platforms), []);
  const handleDeepScan = useCallback(async (customPaths: string[]) => window.nexus.scanFilesystem(customPaths), []);
  const handleImport = useCallback(async (items: DetectedGame[]) => {
    const imported = await window.nexus.importDetected(items);
    toast("success", `Imported ${imported.length} game${imported.length === 1 ? "" : "s"}`, "Artwork fetched automatically.");
    await refreshAll();
    return imported;
  }, [refreshAll, toast]);

  const handleSaveSettings = useCallback(async (s: Partial<LauncherSettings>) => {
    const next = await window.nexus.setSettings(s);
    setSettings(next);
    toast("success", "Settings saved");
    return next;
  }, [toast]);

  const handleCheckUpdates = useCallback(async () => {
    toast("info", "Checking for updates…");
    try {
      const upd = await window.nexus.checkForUpdates();
      if (upd.ok && upd.updateAvailable) {
        setUpdateAvailable({ version: upd.version, releaseUrl: upd.releaseUrl, downloadUrl: upd.downloadUrl, downloadSize: upd.downloadSize });
        setUpdateDialogOpen(true);
      } else if (upd.ok) toast("success", "You're up to date", upd.message);
      else toast("error", "Update check failed", upd.message);
    } catch (e) { toast("error", "Update check failed", e instanceof Error ? e.message : String(e)); }
  }, [toast]);

  const focusedGame = games[focusedIdx] ?? null;

  // ===== CONTROLLER SUPPORT =====
  // Wire gamepad actions to navigation. The handler reads the current state
  // via refs so it always sees fresh values without re-subscribing.
  const stateRef = useRef({ focusedIdx, games, pageGame, addOpen, scanOpen, settingsOpen, updateDialogOpen });
  stateRef.current = { focusedIdx, games, pageGame, addOpen, scanOpen, settingsOpen, updateDialogOpen };

  const onGamepadAction = useCallback((action: string) => {
    const s = stateRef.current;
    // If a modal is open, controller only handles "back" (close).
    if (s.addOpen || s.scanOpen || s.settingsOpen || s.updateDialogOpen) {
      if (action === "back") {
        if (s.addOpen) setAddOpen(false);
        else if (s.scanOpen) setScanOpen(false);
        else if (s.settingsOpen) setSettingsOpen(false);
        else if (s.updateDialogOpen) setUpdateDialogOpen(false);
      }
      return;
    }
    // On the game page, back closes the page; play launches; details is a no-op.
    if (s.pageGame) {
      if (action === "back") setPageGame(null);
      else if (action === "play" || action === "confirm") handleLaunch(s.pageGame);
      return;
    }
    // Library navigation.
    if (s.games.length === 0) {
      if (action === "scan" || action === "confirm") setScanOpen(true);
      return;
    }
    if (action === "left") setFocusedIdx((i) => Math.max(0, i - 1));
    else if (action === "right") setFocusedIdx((i) => Math.min(s.games.length - 1, i + 1));
    else if (action === "confirm") { const g = s.games[s.focusedIdx]; if (g) openPage(g.id); }
    else if (action === "play") { const g = s.games[s.focusedIdx]; if (g) handleLaunch(g); }
    else if (action === "details") { const g = s.games[s.focusedIdx]; if (g) openPage(g.id); }
    else if (action === "menu") setSettingsOpen(true);
    else if (action === "scan") setScanOpen(true);
    else if (action === "back") {/* no-op at root */}
  }, [handleLaunch, openPage]);

  const { connected: controllerConnected } = useGamepadController({ onAction: onGamepadAction });

  // Scroll the focused tile into view when it changes (mouse or controller).
  useEffect(() => {
    const el = document.querySelector(".tile.focused") as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [focusedIdx]);

  // ===== GAME PAGE =====
  if (pageGame) {
    return (
      <div className="app">
        <GamePage game={pageGame} onClose={() => setPageGame(null)} onLaunch={handleLaunch} onPatch={handlePatch} onDelete={handleDelete} onToggleFav={handleToggleFav} />
        {controllerConnected && (
          <div className="hints-bar">
            <span className="hint"><span className="key round">B</span> Back</span>
            <span className="hint"><span className="key round">A</span> / <span className="key round">X</span> Play</span>
          </div>
        )}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  // ===== MAIN UI =====
  return (
    <div className="app">
      <DynamicBackground games={games} focusedIdx={focusedIdx} focusedGame={focusedGame} />

      {/* ===== TOP BAR ===== */}
      <header className="topbar">
        <div className="tb-left">
          <div className="tb-brand">
            <div className="tb-brand-mark"><Icon.Gamepad size={16} /></div>
            <div className="tb-brand-text">
              <span className="tb-brand-name">NEXUS</span>
              <span className="tb-brand-sub">Launcher</span>
            </div>
          </div>
          <div className="tb-tabs">
            <button className="tb-tab active">Games</button>
            <button className="tb-tab">Media</button>
          </div>
        </div>
        <div className="tb-right">
          {updateAvailable && (
            <button className="update-badge" onClick={() => setUpdateDialogOpen(true)} title={`NEXUS ${updateAvailable.version} available`}>
              <Icon.DownloadCloud size={13} /> {updateAvailable.version}
            </button>
          )}
          <div className={searchOpen ? "tb-search open" : "tb-search"}>
            <span className="icon"><Icon.Search size={15} /></span>
            <input
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              onBlur={() => { if (!filters.query) setSearchOpen(false); }}
              placeholder="Search…"
              autoFocus={searchOpen}
            />
          </div>
          <button className="tb-icon-btn" onClick={() => setSearchOpen((v) => !v)} title="Search"><Icon.Search size={17} /></button>
          <button className="tb-icon-btn" onClick={() => setScanOpen(true)} title="Scan"><Icon.Scan size={17} /></button>
          <button className="tb-icon-btn" onClick={() => setAddOpen(true)} title="Add game"><Icon.Plus size={17} /></button>
          <button className="tb-icon-btn" onClick={() => setSettingsOpen(true)} title="Settings"><Icon.Settings size={17} /></button>
          <span className="tb-clock">{clock.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          <div className="tb-avatar">N</div>
        </div>
      </header>

      {/* ===== FILTER ROW: sort + platform quick-filters + fav toggle ===== */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 32px",
        flexShrink: 0, overflowX: "auto", scrollbarWidth: "none",
      }}>
        <select
          value={filters.sort}
          onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}
          style={{
            height: 30, padding: "0 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
            border: "1px solid var(--nx-border-2)", background: "rgba(20,20,26,0.6)",
            backdropFilter: "blur(14px)", color: "var(--nx-text-dim)", outline: "none", cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={() => setFilters((f) => ({ ...f, platform: "all", favOnly: false }))}
          style={{
            padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600,
            border: `1px solid ${filters.platform === "all" && !filters.favOnly ? "rgba(255,255,255,0.3)" : "var(--nx-border)"}`,
            background: filters.platform === "all" && !filters.favOnly ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
            color: filters.platform === "all" && !filters.favOnly ? "#fff" : "var(--nx-text-dim)",
            transition: "all .15s", whiteSpace: "nowrap", flexShrink: 0,
          }}
        >All</button>
        <button
          onClick={() => setFilters((f) => ({ ...f, favOnly: !f.favOnly }))}
          style={{
            padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600,
            border: `1px solid ${filters.favOnly ? "rgba(245,197,66,0.4)" : "var(--nx-border)"}`,
            background: filters.favOnly ? "rgba(245,197,66,0.1)" : "rgba(255,255,255,0.03)",
            color: filters.favOnly ? "var(--nx-gold)" : "var(--nx-text-dim)",
            transition: "all .15s", whiteSpace: "nowrap", flexShrink: 0,
            display: "inline-flex", alignItems: "center", gap: 5,
          }}
        >
          <Icon.Star size={12} filled={filters.favOnly} /> Favorites
        </button>
        <div style={{ width: 1, height: 18, background: "var(--nx-border)", margin: "0 4px", flexShrink: 0 }} />
        {PLATFORM_LIST.filter((p) => p.id !== "custom").map((p) => (
          <button
            key={p.id}
            onClick={() => setFilters((f) => ({ ...f, platform: p.id, favOnly: false }))}
            style={{
              padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600,
              border: `1px solid ${filters.platform === p.id ? `${p.accent}55` : "var(--nx-border)"}`,
              background: filters.platform === p.id ? `${p.accent}1a` : "rgba(255,255,255,0.03)",
              color: filters.platform === p.id ? p.accent : "var(--nx-text-dim)",
              transition: "all .15s", whiteSpace: "nowrap", flexShrink: 0,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.accent }} />
            {p.label.split(" ")[0]}
            {stats?.byPlatform?.[p.id] ? <span style={{ opacity: 0.6 }}>{stats.byPlatform[p.id]}</span> : null}
          </button>
        ))}
      </div>

      {/* ===== STAGE: carousel + bottom info zone ===== */}
      <main className="stage">
        {patching && patchProgress && (
          <div className="enrich-banner">
            <div className="icon-wrap"><Icon.Spinner size={14} /></div>
            <div className="text">
              <div className="title">Enriching library <span className="count">{patchProgress.current}/{patchProgress.total || "…"}</span></div>
              <div className="sub">{patchProgress.title}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="carousel">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="shimmer" style={{ width: 130, aspectRatio: "3 / 4", borderRadius: 12, flexShrink: 0 }} />
            ))}
          </div>
        ) : games.length === 0 ? (
          <EmptyState hasQuery={!!filters.query} onScan={() => setScanOpen(true)} onAdd={() => setAddOpen(true)} />
        ) : (
          <div className="carousel">
            {games.map((g, i) => (
              <Tile
                key={g.id}
                game={g}
                focused={i === focusedIdx}
                onHover={() => setFocusedIdx(i)}
                onClick={() => openPage(g.id)}
                onToggleFav={handleToggleFav}
              />
            ))}
          </div>
        )}

        {/* Bottom zone: left (title + Play) + right (detail card) */}
        {focusedGame && !loading && (
          <div className="bottom-zone">
            <div className="bl-info">
              <h1 className="bl-title">{focusedGame.title}</h1>
              <div className="bl-tagline">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: platformColor(focusedGame.platform), display: "inline-block" }} />
                  {platformLabel(focusedGame.platform)}
                </span>
                {focusedGame.developer && <><span className="dot" /><span>{focusedGame.developer}</span></>}
                {focusedGame.releaseDate && <><span className="dot" /><span>{focusedGame.releaseDate.slice(0, 4)}</span></>}
                {focusedGame.rating !== null && <><span className="dot" /><span className="rating"><Icon.Star size={13} filled /> {focusedGame.rating.toFixed(1)}</span></>}
                {focusedGame.playtimeSec > 0 && <><span className="dot" /><span>{formatPlaytime(focusedGame.playtimeSec)} played</span></>}
              </div>
              <div className="bl-actions">
                <button className="btn btn-primary" onClick={() => handleLaunch(focusedGame)}>
                  <Icon.Play size={17} /> Play
                </button>
                <button className="btn btn-icon" onClick={() => openPage(focusedGame.id)} title="Details">
                  <Icon.Info size={16} />
                </button>
                <button
                  className={focusedGame.favorite ? "btn btn-icon" : "btn btn-icon"}
                  onClick={() => handleToggleFav(focusedGame)}
                  title={focusedGame.favorite ? "Remove favorite" : "Add favorite"}
                  style={focusedGame.favorite ? { background: "rgba(245,197,66,0.15)", borderColor: "rgba(245,197,66,0.4)", color: "var(--nx-gold)" } : {}}
                >
                  <Icon.Star size={16} filled={focusedGame.favorite} />
                </button>
              </div>
            </div>

            {/* Detail card (bottom-right) */}
            <div className="br-card">
              <div className="br-cover">
                {focusedGame.coverImage || focusedGame.bannerImage ? (
                  <img src={(focusedGame.coverImage || focusedGame.bannerImage) ?? undefined} alt={focusedGame.title} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="br-cover-proc" style={{ background: `radial-gradient(circle at 30% 20%, ${gradientFor(focusedGame.title).from}, #050507 70%)` }}>
                    <span style={{ fontSize: 24, fontWeight: 900, color: "rgba(255,255,255,0.85)" }}>{initials(focusedGame.title)}</span>
                  </div>
                )}
              </div>
              <div className="br-body">
                <span className="br-label"><Icon.Shield size={11} /> Full Game</span>
                <div className="br-price">{focusedGame.rating !== null ? `${focusedGame.rating.toFixed(1)} ★` : "—"}</div>
                <div className="br-stats">
                  <div className="br-stat">
                    <span className="icon"><Icon.Clock size={13} /></span>
                    <span className="value">{formatPlaytimeShort(focusedGame.playtimeSec)}</span>
                    <span className="label">Played</span>
                  </div>
                  <div className="br-stat">
                    <span className="icon"><Icon.Play size={13} /></span>
                    <span className="value">{focusedGame.launchCount}</span>
                    <span className="label">Launches</span>
                  </div>
                  <div className="br-stat">
                    <span className="icon"><Icon.HardDrive size={13} /></span>
                    <span className="value">{formatSize(focusedGame.sizeBytes)}</span>
                    <span className="label">Size</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Controller hints bar (only when a controller is connected) */}
      {controllerConnected && (
        <div className="hints-bar">
          <span className="hint"><span className="key round">A</span> Select</span>
          <span className="hint"><span className="key round">B</span> Back</span>
          <span className="hint"><span className="key round">X</span> Play</span>
          <span className="hint"><span className="key round">Y</span> Details</span>
          <span className="hint"><span className="key">◀</span><span className="key">▶</span> Browse</span>
          <span className="hint"><span className="key">☰</span> Settings</span>
        </div>
      )}

      {/* Dialogs */}
      {addOpen && <AddGameDialog onClose={() => setAddOpen(false)} onAdd={handleAdd} />}
      {scanOpen && <ScanDialog onClose={() => setScanOpen(false)} onRunScan={handleRunScan} onImport={handleImport} onDeepScan={handleDeepScan} />}
      {settingsOpen && settings && (
        <SettingsDialog initial={settings} onClose={() => setSettingsOpen(false)} onSave={handleSaveSettings} onCheckUpdates={handleCheckUpdates} />
      )}
      {updateDialogOpen && updateAvailable && (
        <UpdateDialog info={updateAvailable} onClose={() => setUpdateDialogOpen(false)} />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

/** Dynamic full-bleed background that cross-fades to the focused game's banner. */
function DynamicBackground({ games, focusedIdx, focusedGame }: { games: Game[]; focusedIdx: number; focusedGame: Game | null }) {
  const visible = useMemo(() => {
    const list: { id: number; image: string }[] = [];
    const seen = new Set<number>();
    for (let i = focusedIdx; i < games.length && list.length < 3; i++) {
      const g = games[i];
      const img = g.bannerImage || g.coverImage;
      if (img && !seen.has(g.id)) { list.push({ id: g.id, image: img }); seen.add(g.id); }
    }
    if (list.length === 0 && focusedGame) {
      const grad = gradientFor(focusedGame.title);
      return [{ id: focusedGame.id, image: `radial-gradient(circle at 30% 20%, ${grad.from}, #050507 70%)` }];
    }
    return list;
  }, [games, focusedIdx, focusedGame]);

  return (
    <>
      <div className="bg-layer">
        {visible.map((v, i) => (
          <div
            key={v.id}
            className={i === 0 ? "bg-slide active" : "bg-slide"}
            style={{ backgroundImage: v.image.startsWith("radial") ? v.image : `url(${v.image})` }}
          />
        ))}
      </div>
      <div className="bg-overlay" />
    </>
  );
}

/** A single portrait (3:4) tile — PS5 style. */
function Tile({ game, focused, onHover, onClick, onToggleFav }: {
  game: Game; focused: boolean; onHover: () => void; onClick: () => void; onToggleFav: (g: Game) => void;
}) {
  const banner = game.bannerImage || game.coverImage;
  const grad = gradientFor(game.title);
  return (
    <div className={focused ? "tile focused" : "tile"} onMouseEnter={onHover} onClick={onClick}>
      {banner ? (
        <img src={banner} alt={game.title} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className="tile-proc" style={{ background: `radial-gradient(120% 120% at 20% 0%, ${grad.from} 0%, ${grad.to} 70%, #050505 100%)` }}>
          <div className="grid-lines" />
          <div className="blob" style={{ background: grad.accent }} />
          <span className="mono">{initials(game.title)}</span>
        </div>
      )}
      {focused && game.favorite && (
        <div style={{ position: "absolute", top: 6, right: 6, zIndex: 3 }}>
          <Icon.Star size={12} filled style={{ color: "var(--nx-gold)" }} />
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasQuery, onScan, onAdd }: { hasQuery: boolean; onScan: () => void; onAdd: () => void }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <div className="glow" />
        <div className="box"><Icon.Gamepad size={34} /></div>
      </div>
      <h3>{hasQuery ? "No matches found" : "Your library is empty"}</h3>
      <p>
        {hasQuery
          ? "No games match your search."
          : "Scan your system to auto-detect installed games. NEXUS automatically fetches cover art and screenshots — no setup needed."}
      </p>
      {!hasQuery && (
        <div className="empty-actions">
          <button className="btn btn-primary" onClick={onScan}><Icon.Scan size={18} /> Scan My System</button>
          <button className="btn btn-ghost" onClick={onAdd}><Icon.Plus size={17} /> Add Manually</button>
        </div>
      )}
    </div>
  );
}
