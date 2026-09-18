import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  formatPlaytime, formatPlaytimeShort, formatSize, platformColor, platformLabel,
  gradientFor, initials, relativeTime,
} from "./lib/helpers";

type NavSection = "home" | "library" | "favorites" | "platform";

interface Filters {
  platform: string;
  favOnly: boolean;
  query: string;
  sort: SortKey;
}

const DEFAULT_FILTERS: Filters = { platform: "all", favOnly: false, query: "", sort: "recent" };

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
  const [nav, setNav] = useState<NavSection>("home");
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [patching, setPatching] = useState(false);
  const [patchProgress, setPatchProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{
    version?: string; releaseUrl?: string; downloadUrl?: string; downloadSize?: number;
  } | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

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
              if (imported.length > 0) {
                toast("success", `Found ${imported.length} new game${imported.length === 1 ? "" : "s"}`, "Artwork is being fetched automatically.");
              }
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
        toast("error", "Couldn't load library", "The local database may be locked or better-sqlite3 failed to load.");
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
      if (patched > 0) toast("success", `Enriched ${patched} of ${attempted} games`, "Cover art + screenshots fetched automatically.");
      refreshAll();
    });
    return () => { offProgress?.(); offGameUpdated?.(); offDone?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!loading) refreshGames(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters]);

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
      toast("success", "Metadata updated", updated.bannerImage ? "Artwork + screenshots refreshed." : "Details refreshed.");
      await refreshAll();
      if (pageGame?.id === g.id) setPageGame(updated);
    } else toast("error", "No metadata found", "Try a different title.");
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
    toast("info", "Checking for updates…", "Querying GitHub Releases.");
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

  // ===== GAME PAGE =====
  if (pageGame) {
    return (
      <div className="app">
        <GamePage game={pageGame} onClose={() => setPageGame(null)} onLaunch={handleLaunch} onPatch={handlePatch} onDelete={handleDelete} onToggleFav={handleToggleFav} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  // ===== MAIN PS5 UI =====
  return (
    <div className="app">
      <DynamicBackground games={games} focusedIdx={focusedIdx} focusedGame={focusedGame} />

      {/* ===== TOP BAR (PS5 style: brand left, nav center pill, icons right) ===== */}
      <header className="topbar">
        <div className="tb-brand">
          <div className="tb-brand-mark"><Icon.Gamepad size={18} /></div>
          <div className="tb-brand-text">
            <span className="tb-brand-name">NEXUS</span>
            <span className="tb-brand-sub">Launcher</span>
          </div>
        </div>

        <nav className="tb-nav">
          <button
            className={nav === "home" && filters.platform === "all" && !filters.favOnly ? "tb-nav-item active" : "tb-nav-item"}
            onClick={() => { setNav("home"); setFilters((f) => ({ ...f, platform: "all", favOnly: false, query: "" })); }}
          >Home <span className="count">{stats?.totalGames ?? 0}</span></button>
          <button
            className={nav === "favorites" || filters.favOnly ? "tb-nav-item active" : "tb-nav-item"}
            onClick={() => { setNav("favorites"); setFilters((f) => ({ ...f, favOnly: true, platform: "all", query: "" })); }}
          >Favorites <span className="count">{stats?.favorites ?? 0}</span></button>
          <button
            className={nav === "platform" ? "tb-nav-item active" : "tb-nav-item"}
            onClick={() => { setNav("platform"); setFilters((f) => ({ ...f, platform: "steam", favOnly: false, query: "" })); }}
          >Library</button>
        </nav>

        <div className="tb-right">
          {updateAvailable && (
            <button className="update-badge" onClick={() => setUpdateDialogOpen(true)} title={`NEXUS ${updateAvailable.version} available`}>
              <Icon.DownloadCloud size={13} /> {updateAvailable.version}
            </button>
          )}
          {/* Expandable search */}
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
          <button className="tb-icon-btn" onClick={() => setSearchOpen((v) => !v)} title="Search">
            <Icon.Search size={17} />
          </button>
          <button className="tb-icon-btn" onClick={() => setScanOpen(true)} title="Scan system">
            <Icon.Scan size={17} />
          </button>
          <button className="tb-icon-btn" onClick={() => setAddOpen(true)} title="Add game">
            <Icon.Plus size={17} />
          </button>
          <button className="tb-icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
            <Icon.Settings size={17} />
          </button>
        </div>
      </header>

      {/* ===== PLATFORM FILTER ROW (only in Library view) ===== */}
      {nav === "platform" && (
        <div style={{ display: "flex", gap: 8, padding: "0 36px 0", overflowX: "auto", flexShrink: 0 }}>
          {PLATFORM_LIST.filter((p) => p.id !== "custom").map((p) => (
            <button
              key={p.id}
              onClick={() => setFilters((f) => ({ ...f, platform: p.id, favOnly: false, query: "" }))}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "6px 13px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                border: `1px solid ${filters.platform === p.id ? "rgba(0,168,225,0.4)" : "var(--nx-border)"}`,
                background: filters.platform === p.id ? "rgba(0,168,225,0.1)" : "rgba(255,255,255,0.03)",
                color: filters.platform === p.id ? "#5ac8e8" : "var(--nx-text-dim)",
                transition: "all .15s", whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.accent }} />
              {p.label}
              {stats?.byPlatform?.[p.id] ? <span style={{ opacity: 0.6 }}>{stats.byPlatform[p.id]}</span> : null}
            </button>
          ))}
        </div>
      )}

      {/* ===== MAIN STAGE: tiles carousel + info panel ===== */}
      <main className="stage">
        {patching && patchProgress && (
          <div className="enrich-banner">
            <div className="icon-wrap"><Icon.Spinner size={15} /></div>
            <div className="text">
              <div className="title">Enriching library <span className="count">{patchProgress.current}/{patchProgress.total || "…"}</span></div>
              <div className="sub">{patchProgress.title}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="carousel">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="shimmer" style={{ width: 200, aspectRatio: "1 / 1", borderRadius: 14, flexShrink: 0 }} />
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

        {/* Info panel below the carousel — PS5 style: title + 3 stats + actions */}
        {focusedGame && !loading && (
          <div className="info-panel">
            <h1 className="info-title">{focusedGame.title}</h1>
            <div className="info-meta-row">
              <span className="pat">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: platformColor(focusedGame.platform), display: "inline-block" }} />
                {platformLabel(focusedGame.platform)}
              </span>
              {focusedGame.developer && <><span className="dot" /><span>{focusedGame.developer}</span></>}
              {focusedGame.releaseDate && <><span className="dot" /><span>{focusedGame.releaseDate.slice(0, 4)}</span></>}
              {focusedGame.rating !== null && <><span className="dot" /><span className="rating"><Icon.Star size={13} filled /> {focusedGame.rating.toFixed(1)}</span></>}
            </div>
            <div className="info-stats">
              <InfoStat value={formatPlaytimeShort(focusedGame.playtimeSec)} label="Time Played" />
              <InfoStat value={focusedGame.launchCount.toString()} label="Launches" />
              <InfoStat value={formatSize(focusedGame.sizeBytes)} label="Size" />
              {focusedGame.lastPlayedAt && <InfoStat value={relativeTime(focusedGame.lastPlayedAt)} label="Last Played" />}
            </div>
            <div className="info-actions">
              <button className="btn btn-primary" onClick={() => handleLaunch(focusedGame)}>
                <Icon.Play size={17} /> Play
              </button>
              <button className="btn btn-ghost" onClick={() => openPage(focusedGame.id)}>
                <Icon.Info size={16} /> Details
              </button>
              <button
                className={focusedGame.favorite ? "btn btn-outline" : "btn btn-ghost"}
                onClick={() => handleToggleFav(focusedGame)}
                title={focusedGame.favorite ? "Remove favorite" : "Add favorite"}
              >
                <Icon.Star size={16} filled={focusedGame.favorite} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Dialogs */}
      {addOpen && <AddGameDialog onClose={() => setAddOpen(false)} onAdd={handleAdd} />}
      {scanOpen && <ScanDialog onClose={() => setScanOpen(false)} onRunScan={handleRunScan} onImport={handleImport} />}
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

/** A single square tile in the carousel — PS5 style. */
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
      <div className="tile-overlay" />
      <div className="tile-chips">
        {game.source === "auto" ? <span className="chip auto">Detected</span> : <span className="chip">Manual</span>}
        {game.rating !== null && <span className="chip gold"><Icon.Star size={10} filled /> {game.rating.toFixed(1)}</span>}
      </div>
      {focused && (
        <button
          className={game.favorite ? "fav-btn on" : "fav-btn"}
          onClick={(e) => { e.stopPropagation(); onToggleFav(game); }}
          style={{ position: "absolute", top: 10, right: 10, zIndex: 3 }}
          title={game.favorite ? "Remove favorite" : "Add favorite"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={game.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      )}
    </div>
  );
}

function InfoStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="info-stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
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
          ? "No games match your search. Try a different query."
          : "Scan your system to auto-detect installed games, or add a game manually. NEXUS automatically fetches cover art and screenshots."}
      </p>
      {!hasQuery && (
        <div className="empty-actions">
          <button className="btn btn-primary" onClick={onScan}>
            <Icon.Scan size={18} /> Scan My System
          </button>
          <button className="btn btn-ghost" onClick={onAdd}>
            <Icon.Plus size={17} /> Add Manually
          </button>
        </div>
      )}
    </div>
  );
}
