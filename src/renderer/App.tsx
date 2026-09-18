import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DetectedGame, Game, LauncherSettings, PlatformId, SortKey, Stats } from "@shared/types";
import { PLATFORM_LIST } from "@shared/types";
import { Icon } from "./components/Icons";
import { GamePage } from "./components/GamePage";
import { AddGameDialog } from "./components/AddGameDialog";
import { ScanDialog } from "./components/ScanDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { UpdateDialog } from "./components/UpdateDialog";
import { ToastContainer, type Toast } from "./components/Toast";
import { useGamepadController } from "./lib/useGamepad";
import { formatPlaytime, formatPlaytimeShort, formatSize, platformColor, platformLabel, gradientFor, initials, relativeTime } from "./lib/helpers";

interface Filters { platform: string; favOnly: boolean; query: string; sort: SortKey }
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
  const [patching, setPatching] = useState(false);
  const [patchProgress, setPatchProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version?: string; releaseUrl?: string; downloadUrl?: string; downloadSize?: number } | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  const toast = useCallback((type: Toast["type"], title: string, desc?: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, title, desc }]);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const refreshGames = useCallback(async () => {
    setGames(await window.nexus.listGames({ platform: filters.platform, favOnly: filters.favOnly, query: filters.query, sort: filters.sort }));
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
            const summary = await window.nexus.runScan(PLATFORM_LIST.filter((p) => p.id !== "custom" && p.id !== "manual").map((p) => p.id as PlatformId));
            if (summary.detected.length > 0) {
              const imported = await window.nexus.importDetected(summary.detected);
              if (imported.length > 0) toast("success", `Found ${imported.length} new game${imported.length === 1 ? "" : "s"}`, "Artwork fetched automatically.");
            }
          } catch {}
        }
        try {
          const upd = await window.nexus.checkForUpdates();
          if (upd.ok && upd.updateAvailable) setUpdateAvailable({ version: upd.version, releaseUrl: upd.releaseUrl, downloadUrl: upd.downloadUrl, downloadSize: upd.downloadSize });
        } catch {}
      } catch (e) {
        toast("error", "Couldn't load library", "The local database may be locked.");
      } finally { setLoading(false); }
    })();
    const offP = (window as unknown as { nexus?: { onPatchProgress?: (cb: (p: { gameId: number; title: string; current: number; total: number }) => void) => () => void } }).nexus?.onPatchProgress?.((p) => { setPatching(true); setPatchProgress({ current: p.current, total: p.total, title: p.title }); });
    const offG = (window as unknown as { nexus?: { onPatchGameUpdated?: (cb: (p: { game: Game }) => void) => () => void } }).nexus?.onPatchGameUpdated?.(({ game }) => { setGames((prev) => prev.map((g) => (g.id === game.id ? game : g))); if (pageGame?.id === game.id) setPageGame(game); refreshStats(); });
    const offD = (window as unknown as { nexus?: { onPatchDone?: (cb: (p: { patched: number; attempted: number }) => void) => () => void } }).nexus?.onPatchDone?.(({ patched, attempted }) => { setPatching(false); setPatchProgress(null); if (patched > 0) toast("success", `Enriched ${patched} of ${attempted} games`, "Artwork fetched automatically."); refreshAll(); });
    return () => { offP?.(); offG?.(); offD?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!loading) refreshGames(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters]);

  const openPage = useCallback(async (id: number) => setPageGame(await window.nexus.getGame(id)), []);
  const handleLaunch = useCallback(async (g: Game) => {
    toast("info", `Launching ${g.title}…`);
    const res = await window.nexus.launchGame(g.id);
    if (res.ok) { toast("success", `${g.title} is running`, "Play session recorded."); await refreshAll(); if (pageGame?.id === g.id) setPageGame(await window.nexus.getGame(g.id)); }
    else toast("error", "Launch failed", res.message);
  }, [refreshAll, toast, pageGame]);
  const handlePatch = useCallback(async (g: Game) => {
    toast("info", "Patching metadata…");
    const updated = await window.nexus.patchMetadata(g.id);
    if (updated) { toast("success", "Metadata updated"); await refreshAll(); if (pageGame?.id === g.id) setPageGame(updated); }
    else toast("error", "No metadata found");
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
  const handleAdd = useCallback(async (input: { title: string; platform: PlatformId; executable?: string | null; installDir?: string | null; launchCommand?: string | null; autoPatch?: boolean }) => {
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
  const handleSaveSettings = useCallback(async (s: Partial<LauncherSettings>) => { const next = await window.nexus.setSettings(s); setSettings(next); toast("success", "Settings saved"); return next; }, [toast]);
  const handleCheckUpdates = useCallback(async () => {
    toast("info", "Checking for updates…");
    try {
      const upd = await window.nexus.checkForUpdates();
      if (upd.ok && upd.updateAvailable) { setUpdateAvailable({ version: upd.version, releaseUrl: upd.releaseUrl, downloadUrl: upd.downloadUrl, downloadSize: upd.downloadSize }); setUpdateDialogOpen(true); }
      else if (upd.ok) toast("success", "You're up to date", upd.message);
      else toast("error", "Update check failed", upd.message);
    } catch (e) { toast("error", "Update check failed", e instanceof Error ? e.message : String(e)); }
  }, [toast]);
  const handlePatchAll = useCallback(async () => {
    setPatching(true); setPatchProgress({ current: 0, total: 0, title: "" });
    try {
      const res = await window.nexus.patchAllMetadata();
      if (res.patched > 0) toast("success", `Enriched ${res.patched} game${res.patched === 1 ? "" : "s"}`, "Artwork fetched.");
      else toast("info", "Everything's already enriched");
      await refreshAll();
    } catch (e) { toast("error", "Bulk patch failed", e instanceof Error ? e.message : String(e)); }
    finally { setPatching(false); setPatchProgress(null); }
  }, [refreshAll, toast]);

  // Controller support
  const stateRef = useRef({ games, pageGame, addOpen, scanOpen, settingsOpen, updateDialogOpen, focusedIdx });
  stateRef.current = { games, pageGame, addOpen, scanOpen, settingsOpen, updateDialogOpen, focusedIdx };
  const onGamepad = useCallback((action: string) => {
    const s = stateRef.current;
    if (s.addOpen || s.scanOpen || s.settingsOpen || s.updateDialogOpen) {
      if (action === "back") { if (s.addOpen) setAddOpen(false); else if (s.scanOpen) setScanOpen(false); else if (s.settingsOpen) setSettingsOpen(false); else if (s.updateDialogOpen) setUpdateDialogOpen(false); }
      return;
    }
    if (s.pageGame) { if (action === "back") setPageGame(null); else if (action === "play" || action === "confirm") handleLaunch(s.pageGame); return; }
    if (s.games.length === 0) { if (action === "scan" || action === "confirm") setScanOpen(true); return; }
    if (action === "left") setFocusedIdx((i) => Math.max(0, i - 1));
    else if (action === "right") setFocusedIdx((i) => Math.min(s.games.length - 1, i + 1));
    else if (action === "confirm") { const g = s.games[s.focusedIdx]; if (g) openPage(g.id); }
    else if (action === "play") { const g = s.games[s.focusedIdx]; if (g) handleLaunch(g); }
    else if (action === "details") { const g = s.games[s.focusedIdx]; if (g) openPage(g.id); }
    else if (action === "menu") setSettingsOpen(true);
    else if (action === "scan") setScanOpen(true);
  }, [handleLaunch, openPage]);
  const { connected: controllerConnected } = useGamepadController({ onAction: onGamepad });

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (pageGame) { if (e.key === "Escape") setPageGame(null); return; }
      if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key === "k")) { e.preventDefault(); const el = document.querySelector(".tb-search input") as HTMLInputElement; el?.focus(); }
      else if (e.key === "ArrowLeft") setFocusedIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setFocusedIdx((i) => Math.min(games.length - 1, i + 1));
      else if (e.key === "Enter") { const g = games[focusedIdx]; if (g) openPage(g.id); }
      else if (e.key === "s") setScanOpen(true);
      else if (e.key === "a") setAddOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageGame, games, focusedIdx, openPage]);

  // Scroll focused tile into view
  useEffect(() => {
    const el = document.querySelector(".tile.focused") as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [focusedIdx]);

  const focusedGame = games[focusedIdx] ?? null;

  // Game page
  if (pageGame) {
    return (
      <>
        <GamePage game={pageGame} onClose={() => setPageGame(null)} onLaunch={handleLaunch} onPatch={handlePatch} onDelete={handleDelete} onToggleFav={handleToggleFav} />
        {controllerConnected && <div className="hints-bar"><span className="hint"><span className="k r">B</span> Back</span><span className="hint"><span className="k r">A</span>/<span className="k r">X</span> Play</span></div>}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Main PS5 UI
  return (
    <div className="app">
      <DynamicBackground games={games} focusedIdx={focusedIdx} focusedGame={focusedGame} />

      {/* Top bar */}
      <header className="topbar">
        <div className="tb-brand">
          <div className="tb-logo"><Icon.Gamepad size={16} /></div>
          <div><div className="tb-name">NEXUS</div><div className="tb-sub">Launcher</div></div>
        </div>
        <div className="tb-search">
          <span className="icon"><Icon.Search size={15} /></span>
          <input value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} placeholder="Search library…  (press /)" />
        </div>
        <select className="tb-select" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {updateAvailable && (
          <button className="update-badge" onClick={() => setUpdateDialogOpen(true)} title={`NEXUS ${updateAvailable.version} available`}>
            <Icon.DownloadCloud size={13} /> {updateAvailable.version}
          </button>
        )}
        <button className="tb-icon" onClick={() => setScanOpen(true)} title="Scan (S)"><Icon.Scan size={16} /></button>
        <button className="tb-icon primary" onClick={() => setAddOpen(true)} title="Add (A)"><Icon.Plus size={15} /> Add</button>
        <button className="tb-icon" onClick={() => setSettingsOpen(true)} title="Settings"><Icon.Settings size={16} /></button>
      </header>

      {/* Stage: carousel + info zone */}
      <main className="stage">
        {/* Filter pills */}
        <div className="filter-row">
          <button className={filters.platform === "all" && !filters.favOnly ? "filter-pill active" : "filter-pill"} onClick={() => setFilters((f) => ({ ...f, platform: "all", favOnly: false }))}>All</button>
          <button className={filters.favOnly ? "filter-pill active" : "filter-pill"} onClick={() => setFilters((f) => ({ ...f, favOnly: !f.favOnly }))}><Icon.Star size={11} filled={filters.favOnly} /> Favorites</button>
          <div className="filter-sep" />
          {PLATFORM_LIST.filter((p) => p.id !== "custom").map((p) => (
            <button key={p.id} className={filters.platform === p.id ? "filter-pill active" : "filter-pill"} onClick={() => setFilters((f) => ({ ...f, platform: p.id, favOnly: false }))}>
              <span className="d" style={{ background: p.accent }} />
              {p.label}
              {stats?.byPlatform?.[p.id] ? <span style={{ opacity: 0.6 }}>{stats.byPlatform[p.id]}</span> : null}
            </button>
          ))}
        </div>

        {/* Enrichment banner */}
        {patching && patchProgress && (
          <div className="enrich-banner">
            <div className="iw"><Icon.Spinner size={14} /></div>
            <div><div className="t">Enriching library <span className="c">{patchProgress.current}/{patchProgress.total || "…"}</span></div><div className="s">{patchProgress.title}</div></div>
          </div>
        )}

        {/* Carousel + Info zone */}
        {loading ? (
          <div style={{ display: "flex", gap: 14, overflow: "hidden", padding: "60px 0 40px", alignItems: "center", justifyContent: "center", flex: 1 }}>
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer" style={{ width: 160, aspectRatio: "3/4", borderRadius: 14, flexShrink: 0 }} />)}
          </div>
        ) : games.length === 0 ? (
          <div className="empty">
            <div className="box"><Icon.Gamepad size={34} /></div>
            <h3>{filters.query ? "No matches found" : "Your library is empty"}</h3>
            <p>{filters.query ? "Try a different search." : "Scan your system to auto-detect installed games. NEXUS fetches cover art automatically."}</p>
            {!filters.query && <div className="empty-actions"><button className="btn btn-primary" onClick={() => setScanOpen(true)}><Icon.Scan size={17} /> Scan System</button><button className="btn btn-ghost" onClick={() => setAddOpen(true)}><Icon.Plus size={16} /> Add Manually</button></div>}
          </div>
        ) : (
          <>
            {/* Carousel — overflow-y: visible so the focused tile never clips */}
            <div className="carousel-wrap">
              <div className="carousel">
                {games.map((g, i) => (
                  <div key={g.id} className={i === focusedIdx ? "tile focused" : "tile"} onMouseEnter={() => setFocusedIdx(i)} onClick={() => openPage(g.id)}>
                    {g.coverImage || g.bannerImage ? (
                      <img src={(g.coverImage || g.bannerImage) ?? undefined} alt={g.title} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="tile-proc" style={{ background: `radial-gradient(120% 120% at 20% 0%, ${gradientFor(g.title).from} 0%, ${gradientFor(g.title).to} 70%, #050505 100%)` }}>
                        <div className="ln" /><div className="gl" style={{ background: gradientFor(g.title).accent }} /><span className="mono">{initials(g.title)}</span>
                      </div>
                    )}
                    <div className="tile-overlay" />
                    <div className="tile-chips">
                      {g.source === "auto" ? <span className="chip auto">Detected</span> : <span className="chip">Manual</span>}
                      {g.rating !== null && <span className="chip gold"><Icon.Star size={10} filled /> {g.rating.toFixed(1)}</span>}
                    </div>
                    {i === focusedIdx && (
                      <button className={g.favorite ? "fav-btn on" : "fav-btn"} onClick={(e) => { e.stopPropagation(); handleToggleFav(g); }} style={{ position: "absolute", top: 8, right: 8, zIndex: 3 }}>
                        <Icon.Star size={13} filled={g.favorite} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Info zone below */}
            {focusedGame && (
              <div className="info-zone">
                <div className="info-left">
                  <h1 className="info-title">{focusedGame.title}</h1>
                  <div className="info-meta">
                    <span className="pat"><span style={{ width: 7, height: 7, borderRadius: "50%", background: platformColor(focusedGame.platform), display: "inline-block" }} />{platformLabel(focusedGame.platform)}</span>
                    {focusedGame.developer && <><span className="dot" />{focusedGame.developer}</>}
                    {focusedGame.releaseDate && <><span className="dot" />{focusedGame.releaseDate.slice(0, 4)}</>}
                    {focusedGame.rating !== null && <><span className="dot" /><span className="rating"><Icon.Star size={12} filled /> {focusedGame.rating.toFixed(1)}</span></>}
                    {focusedGame.playtimeSec > 0 && <><span className="dot" />{formatPlaytime(focusedGame.playtimeSec)} played</>}
                    {focusedGame.lastPlayedAt && <><span className="dot" />Last: {relativeTime(focusedGame.lastPlayedAt)}</>}
                  </div>
                  <div className="info-actions">
                    <button className="btn btn-primary" onClick={() => handleLaunch(focusedGame)}><Icon.Play size={17} /> Play</button>
                    <button className="btn btn-ghost" onClick={() => openPage(focusedGame.id)}><Icon.Info size={16} /> Details</button>
                    <button className="btn btn-icon" onClick={() => handleToggleFav(focusedGame)} title={focusedGame.favorite ? "Remove favorite" : "Add favorite"} style={focusedGame.favorite ? { background: "rgba(251,191,36,0.12)", borderColor: "rgba(251,191,36,0.36)", color: "var(--gold)" } : {}}><Icon.Star size={16} filled={focusedGame.favorite} /></button>
                    {!patching && games.some((g) => !g.bannerImage) && <button className="btn btn-outline" onClick={handlePatchAll} title="Fetch artwork for all games"><Icon.Wand size={15} /> Enrich All</button>}
                  </div>
                </div>
                {/* Detail card */}
                <div className="info-card">
                  <div className="info-card-cover">
                    {focusedGame.coverImage || focusedGame.bannerImage ? (
                      <img src={(focusedGame.coverImage || focusedGame.bannerImage) ?? undefined} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="info-card-proc" style={{ background: `radial-gradient(circle at 30% 20%, ${gradientFor(focusedGame.title).from}, #050505 70%)` }}>
                        <span style={{ fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,0.85)" }}>{initials(focusedGame.title)}</span>
                      </div>
                    )}
                  </div>
                  <div className="info-card-body">
                    <span className="info-card-label"><Icon.Shield size={10} /> Full Game</span>
                    <div className="info-card-stat"><Icon.Play size={12} /><span className="v">{focusedGame.launchCount}</span> launches</div>
                    <div className="info-card-stats">
                      <div className="info-card-stat"><Icon.Clock size={11} /><span className="v">{formatPlaytimeShort(focusedGame.playtimeSec)}</span></div>
                      <div className="info-card-stat"><Icon.HardDrive size={11} /><span className="v">{formatSize(focusedGame.sizeBytes)}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Dialogs */}
      {addOpen && <AddGameDialog onClose={() => setAddOpen(false)} onAdd={handleAdd} />}
      {scanOpen && <ScanDialog onClose={() => setScanOpen(false)} onRunScan={handleRunScan} onImport={handleImport} onDeepScan={handleDeepScan} />}
      {settingsOpen && settings && <SettingsDialog initial={settings} onClose={() => setSettingsOpen(false)} onSave={handleSaveSettings} onCheckUpdates={handleCheckUpdates} />}
      {updateDialogOpen && updateAvailable && <UpdateDialog info={updateAvailable} onClose={() => setUpdateDialogOpen(false)} />}
      {controllerConnected && !pageGame && <div className="hints-bar"><span className="hint"><span className="k r">A</span> Select</span><span className="hint"><span className="k r">B</span> Back</span><span className="hint"><span className="k r">X</span> Play</span><span className="hint"><span className="k r">Y</span> Details</span><span className="hint"><span className="k">←</span><span className="k">→</span> Browse</span></div>}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

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
      return [{ id: focusedGame.id, image: `radial-gradient(circle at 30% 20%, ${grad.from}, #08080c 70%)` }];
    }
    return list;
  }, [games, focusedIdx, focusedGame]);
  return (
    <>
      <div className="bg-layer">
        {visible.map((v, i) => <div key={v.id} className={i === 0 ? "bg-slide active" : "bg-slide"} style={{ backgroundImage: v.image.startsWith("radial") ? v.image : `url(${v.image})` }} />)}
      </div>
      <div className="bg-overlay" />
    </>
  );
}
