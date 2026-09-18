import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DetectedGame,
  Game,
  LauncherSettings,
  PlatformId,
  SortKey,
  Stats,
  ViewMode,
} from "@shared/types";
import { PLATFORM_LIST, SORT_LABELS } from "@shared/types";
import { Icon } from "./components/Icons";
import { GamePage } from "./components/GamePage";
import { AddGameDialog } from "./components/AddGameDialog";
import { ScanDialog } from "./components/ScanDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { UpdateDialog } from "./components/UpdateDialog";
import { ToastContainer, type Toast } from "./components/Toast";
import {
  formatPlaytime, formatPlaytimeShort, formatSize, platformColor, platformLabel,
  gradientFor, initials,
} from "./lib/helpers";

type NavSection = "home" | "library" | "favorites" | "settings";

interface Filters {
  platform: string;
  favOnly: boolean;
  query: string;
  sort: SortKey;
  view: ViewMode;
}

const DEFAULT_FILTERS: Filters = {
  platform: "all",
  favOnly: false,
  query: "",
  sort: "recent",
  view: "grid",
};

export function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<LauncherSettings | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [pageGame, setPageGame] = useState<Game | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [nav, setNav] = useState<NavSection>("home");
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [patching, setPatching] = useState(false);
  const [patchProgress, setPatchProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{
    version?: string;
    releaseUrl?: string;
    downloadUrl?: string;
    downloadSize?: number;
  } | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const toast = useCallback((type: Toast["type"], title: string, desc?: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, title, desc }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshGames = useCallback(async () => {
    const list = await window.nexus.listGames({
      platform: filters.platform,
      favOnly: filters.favOnly,
      query: filters.query,
      sort: filters.sort,
    });
    setGames(list);
  }, [filters]);

  const refreshStats = useCallback(async () => {
    setStats(await window.nexus.getStats());
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([refreshGames(), refreshStats()]);
    } finally {
      setLoading(false);
    }
  }, [refreshGames, refreshStats]);

  // Initial load + settings + auto-scan + auto-update check.
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
                toast("success", `Auto-scan found ${imported.length} new game${imported.length === 1 ? "" : "s"}`, "Metadata is being enriched automatically in the background.");
              }
            }
          } catch {
            // Silent failure on auto-scan.
          }
        }
        // Check for app updates (non-blocking).
        try {
          const upd = await window.nexus.checkForUpdates();
          if (upd.ok && upd.updateAvailable) {
            setUpdateAvailable({
              version: upd.version,
              releaseUrl: upd.releaseUrl,
              downloadUrl: upd.downloadUrl,
              downloadSize: upd.downloadSize,
            });
          }
        } catch {
          // ignore
        }
      } catch (e) {
        console.error("[NEXUS] init failed:", e);
        toast("error", "Couldn't load library", "The local database may be locked or better-sqlite3 failed to load.");
      } finally {
        setLoading(false);
      }
    })();

    // Subscribe to background patch progress events (auto-patching on import).
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
      setPatching(false);
      setPatchProgress(null);
      if (patched > 0) {
        toast("success", `Enriched ${patched} of ${attempted} games`, "Cover art + screenshots fetched automatically.");
      }
      refreshAll();
    });

    return () => {
      offProgress?.();
      offGameUpdated?.();
      offDone?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filters change.
  useEffect(() => {
    if (!loading) refreshGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const openPage = useCallback(async (id: number) => {
    const g = await window.nexus.getGame(id);
    setPageGame(g);
  }, []);

  const handleLaunch = useCallback(async (g: Game) => {
    toast("info", `Launching ${g.title}…`, "Starting via its native store protocol.");
    const res = await window.nexus.launchGame(g.id);
    if (res.ok) {
      toast("success", `${g.title} is running`, "Play session recorded.");
      await refreshAll();
      if (pageGame?.id === g.id) setPageGame(await window.nexus.getGame(g.id));
    } else {
      toast("error", "Launch failed", res.message);
    }
  }, [refreshAll, toast, pageGame]);

  const handlePatch = useCallback(async (g: Game) => {
    toast("info", "Patching metadata…", "Querying RAWG + Steam for the richest result.");
    const updated = await window.nexus.patchMetadata(g.id);
    if (updated) {
      toast("success", "Metadata updated", updated.bannerImage ? "Artwork + screenshots refreshed." : "Details refreshed.");
      await refreshAll();
      if (pageGame?.id === g.id) setPageGame(updated);
    } else {
      toast("error", "No metadata found", "Try a different title in the game's page.");
    }
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
    toast("success", `${g.title} added to library`, input.autoPatch !== false ? "Metadata auto-patched from RAWG + Steam." : undefined);
    await refreshAll();
    return g;
  }, [refreshAll, toast]);

  const handleRunScan = useCallback(async (platforms: PlatformId[]) => {
    return await window.nexus.runScan(platforms);
  }, []);

  const handleImport = useCallback(async (items: DetectedGame[]) => {
    const imported = await window.nexus.importDetected(items);
    toast("success", `Imported ${imported.length} game${imported.length === 1 ? "" : "s"}`, "Artwork is being fetched automatically in the background.");
    await refreshAll();
    return imported;
  }, [refreshAll, toast]);

  const handleSaveSettings = useCallback(async (s: Partial<LauncherSettings>) => {
    const next = await window.nexus.setSettings(s);
    setSettings(next);
    toast("success", "Settings saved");
    return next;
  }, [toast]);

  const handlePatchAll = useCallback(async () => {
    setPatching(true);
    setPatchProgress({ current: 0, total: 0, title: "" });
    toast("info", "Enriching library…", "Fetching artwork from RAWG + Steam.");
    try {
      const res = await window.nexus.patchAllMetadata();
      if (res.patched > 0) {
        toast("success", `Enriched ${res.patched} game${res.patched === 1 ? "" : "s"}`, "Cover art + details + screenshots added.");
      } else {
        toast("info", "Everything's already enriched", "All your games have artwork.");
      }
      await refreshAll();
    } catch (e) {
      toast("error", "Bulk patch failed", e instanceof Error ? e.message : String(e));
    } finally {
      setPatching(false);
      setPatchProgress(null);
    }
  }, [refreshAll, toast]);

  const handleCheckUpdates = useCallback(async () => {
    setCheckingUpdate(true);
    toast("info", "Checking for updates…", "Querying GitHub Releases.");
    try {
      const upd = await window.nexus.checkForUpdates();
      if (upd.ok && upd.updateAvailable) {
        setUpdateAvailable({
          version: upd.version,
          releaseUrl: upd.releaseUrl,
          downloadUrl: upd.downloadUrl,
          downloadSize: upd.downloadSize,
        });
        setUpdateDialogOpen(true);
      } else if (upd.ok) {
        toast("success", "You're up to date", upd.message);
      } else {
        toast("error", "Update check failed", upd.message);
      }
    } catch (e) {
      toast("error", "Update check failed", e instanceof Error ? e.message : String(e));
    } finally {
      setCheckingUpdate(false);
    }
  }, [toast]);

  // The focused tile drives the dynamic background.
  const focusedGame = games[focusedIdx] ?? null;

  // Featured games for the carousel (when no filter is applied, show all; otherwise filtered).
  const carouselGames = useMemo(() => games.slice(0, 24), [games]);

  const stageHeading = useMemo(() => {
    if (filters.favOnly) return "Favorites";
    if (filters.query) return `Results for "${filters.query}"`;
    if (filters.platform !== "all") {
      const p = PLATFORM_LIST.find((x) => x.id === filters.platform);
      return p ? p.label : "Library";
    }
    return nav === "favorites" ? "Favorites" : "Your Library";
  }, [filters, nav]);

  // ============ GAME PAGE (full screen) ============
  if (pageGame) {
    return (
      <div className="app">
        <GamePage
          game={pageGame}
          onClose={() => setPageGame(null)}
          onLaunch={handleLaunch}
          onPatch={handlePatch}
          onDelete={handleDelete}
          onToggleFav={handleToggleFav}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  // ============ MAIN PS5-STYLE UI ============
  return (
    <div className="app">
      {/* Dynamic full-bleed background */}
      <DynamicBackground games={carouselGames} focusedIdx={focusedIdx} focusedGame={focusedGame} />

      {/* Top nav */}
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark"><Icon.Gamepad size={17} /></div>
          <div className="brand-text">
            <span className="name">NEXUS</span>
            <span className="sub">Game Launcher</span>
          </div>
        </div>
        <nav className="top-nav">
          <button className={nav === "home" ? "top-nav-item active" : "top-nav-item"} onClick={() => { setNav("home"); setFilters((f) => ({ ...f, platform: "all", favOnly: false, query: "" })); }}>Home</button>
          <button className={nav === "library" ? "top-nav-item active" : "top-nav-item"} onClick={() => { setNav("library"); setFilters((f) => ({ ...f, platform: "all", favOnly: false, query: "" })); }}>Library</button>
          <button className={nav === "favorites" ? "top-nav-item active" : "top-nav-item"} onClick={() => { setNav("favorites"); setFilters((f) => ({ ...f, favOnly: true, platform: "all", query: "" })); }}>Favorites</button>
          <button className="top-nav-item" onClick={() => setSettingsOpen(true)}>Settings</button>
        </nav>
        <div className="search">
          <span className="icon"><Icon.Search size={16} /></span>
          <input
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder="Search your library…"
          />
        </div>
        <div className="top-actions">
          {updateAvailable && (
            <button
              className="update-badge"
              onClick={() => setUpdateDialogOpen(true)}
              title={`NEXUS ${updateAvailable.version} is available — click to install`}
            >
              <Icon.DownloadCloud size={14} /> Update available
            </button>
          )}
          <button className="btn btn-ghost btn-icon" onClick={() => setScanOpen(true)} title="Scan system">
            <Icon.Scan size={17} />
          </button>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Icon.Plus size={16} /> <span>Add Game</span>
          </button>
        </div>
      </div>

      {/* Main stage */}
      <div className="stage">
        <div className="stage-header">
          <h2 className="stage-title"><span className="bar" />{stageHeading}</h2>
          <span className="stage-sub">{stats?.totalGames ?? 0} games · {formatPlaytimeShort(stats?.totalPlaytimeSec ?? 0)} played</span>
        </div>

        {loading ? (
          <div style={{ display: "flex", gap: 14, overflow: "hidden", padding: "20px 4px" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shimmer" style={{ width: 230, aspectRatio: "3 / 4", borderRadius: 16, flexShrink: 0 }} />
            ))}
          </div>
        ) : games.length === 0 ? (
          <EmptyState hasQuery={!!filters.query} onScan={() => setScanOpen(true)} onAdd={() => setAddOpen(true)} />
        ) : (
          <div className="carousel" id="nexus-carousel">
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

        {/* Inline info panel for the focused game */}
        {focusedGame && !loading && (
          <div className="info-panel">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="info-title">{focusedGame.title}</div>
              <div className="info-meta-row">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: platformColor(focusedGame.platform) }} />
                  {platformLabel(focusedGame.platform)}
                </span>
                {focusedGame.developer && <><span className="dot" /><span>{focusedGame.developer}</span></>}
                {focusedGame.releaseDate && <><span className="dot" /><span>{focusedGame.releaseDate.slice(0, 4)}</span></>}
                {focusedGame.rating !== null && <><span className="dot" /><span className="info-meta-row rating"><Icon.Star size={12} filled /> {focusedGame.rating.toFixed(1)}</span></>}
                {focusedGame.playtimeSec > 0 && <><span className="dot" /><span>{formatPlaytime(focusedGame.playtimeSec)}</span></>}
              </div>
            </div>
            <div className="info-stats">
              <InfoStat value={focusedGame.launchCount.toString()} label="Launches" />
              <InfoStat value={formatPlaytimeShort(focusedGame.playtimeSec)} label="Playtime" />
              <InfoStat value={formatSize(focusedGame.sizeBytes)} label="Size" />
            </div>
            <div className="info-actions">
              <button className="info-play" onClick={() => handleLaunch(focusedGame)}>
                <Icon.Play size={18} /> Play
              </button>
              <button className="info-details" onClick={() => openPage(focusedGame.id)}>
                <Icon.Info size={16} /> Details
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating glass bottom dock */}
      <div className="dock">
        <button className={nav === "home" ? "dock-item active" : "dock-item"} onClick={() => { setNav("home"); setFilters((f) => ({ ...f, platform: "all", favOnly: false, query: "" })); }}>
          <Icon.Home size={20} /><span className="label">Home</span>
        </button>
        <button className={nav === "library" ? "dock-item active" : "dock-item"} onClick={() => { setNav("library"); setFilters((f) => ({ ...f, platform: "all", favOnly: false, query: "" })); }}>
          <Icon.Library size={20} /><span className="label">Library</span>
        </button>
        <button className={nav === "favorites" ? "dock-item active" : "dock-item"} onClick={() => { setNav("favorites"); setFilters((f) => ({ ...f, favOnly: true, platform: "all", query: "" })); }}>
          <Icon.Star size={20} /><span className="label">Favorites</span>
        </button>
        <div className="dock-divider" />
        {PLATFORM_LIST.filter((p) => p.id !== "custom").slice(0, 4).map((p) => (
          <button
            key={p.id}
            className={filters.platform === p.id ? "dock-item active" : "dock-item"}
            onClick={() => { setNav("library"); setFilters((f) => ({ ...f, platform: p.id, favOnly: false, query: "" })); }}
            title={p.label}
          >
            <span style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, background: `${p.accent}1f`, color: p.accent }}>{p.monogram}</span>
            <span className="label">{p.label.split(" ")[0]}</span>
          </button>
        ))}
        <div className="dock-spacer" />
        {patching && patchProgress && (
          <div className="patch-pill">
            <Icon.Spinner size={14} />
            <span>Enriching <span className="count">{patchProgress.current}/{patchProgress.total || "…"}</span></span>
          </div>
        )}
        {!patching && games.some((g) => !g.bannerImage) && games.length > 0 && (
          <button className="btn btn-outline btn-sm" onClick={handlePatchAll} title="Fetch artwork for all games missing it">
            <Icon.Wand size={14} /> Enrich All
          </button>
        )}
        <button className="dock-item" onClick={() => setScanOpen(true)} title="Scan system">
          <Icon.Scan size={20} /><span className="label">Scan</span>
        </button>
        <button className="dock-item" onClick={() => setAddOpen(true)} title="Add game">
          <Icon.Plus size={20} /><span className="label">Add</span>
        </button>
        <button className="dock-item" onClick={() => setSettingsOpen(true)} title="Settings">
          <Icon.Settings size={20} /><span className="label">Settings</span>
        </button>
      </div>

      {addOpen && <AddGameDialog onClose={() => setAddOpen(false)} onAdd={handleAdd} />}
      {scanOpen && <ScanDialog onClose={() => setScanOpen(false)} onRunScan={handleRunScan} onImport={handleImport} />}
      {settingsOpen && settings && (
        <SettingsDialog
          initial={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
          onCheckUpdates={handleCheckUpdates}
        />
      )}
      {updateDialogOpen && updateAvailable && (
        <UpdateDialog
          info={updateAvailable}
          onClose={() => setUpdateDialogOpen(false)}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

/** Dynamic full-bleed background that cross-fades to the focused game's banner. */
function DynamicBackground({ games, focusedIdx, focusedGame }: { games: Game[]; focusedIdx: number; focusedGame: Game | null }) {
  // Show up to 3 recent backgrounds for smooth cross-fade.
  const visible = useMemo(() => {
    const list: { id: number; image: string }[] = [];
    const seen = new Set<number>();
    for (let i = focusedIdx; i < games.length && list.length < 3; i++) {
      const g = games[i];
      const img = g.bannerImage || g.coverImage;
      if (img && !seen.has(g.id)) {
        list.push({ id: g.id, image: img });
        seen.add(g.id);
      }
    }
    if (list.length === 0 && focusedGame) {
      const grad = gradientFor(focusedGame.title);
      return [{ id: focusedGame.id, image: `radial-gradient(circle at 30% 20%, ${grad.from}, #060608 70%)` }];
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

/** A single game tile in the carousel. */
function Tile({
  game, focused, onHover, onClick, onToggleFav,
}: {
  game: Game; focused: boolean; onHover: () => void; onClick: () => void; onToggleFav: (g: Game) => void;
}) {
  const banner = game.bannerImage || game.coverImage;
  const grad = gradientFor(game.title);

  return (
    <div
      className={focused ? "tile focused" : "tile"}
      onMouseEnter={onHover}
      onClick={onClick}
    >
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
        <span className={game.source === "auto" ? "chip auto" : "chip manual"}>
          {game.source === "auto" ? "Detected" : "Manual"}
        </span>
        <button
          className={game.favorite ? "fav-btn on" : "fav-btn"}
          onClick={(e) => { e.stopPropagation(); onToggleFav(game); }}
          title={game.favorite ? "Remove favorite" : "Add favorite"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={game.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      </div>
      <div className="tile-meta">
        <div className="tile-title">{game.title}</div>
        <div className="tile-sub">
          <span className="dot" style={{ background: platformColor(game.platform) }} />
          {platformLabel(game.platform)}
          {game.playtimeSec > 0 && <> · {formatPlaytimeShort(game.playtimeSec)}</>}
        </div>
      </div>
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
        <div className="box"><Icon.Gamepad size={32} /></div>
      </div>
      <h3>{hasQuery ? "No matches found" : "Your library is empty"}</h3>
      <p>
        {hasQuery
          ? "No games match your search. Try a different query."
          : "Scan your system to auto-detect installed games, or add a game manually to get started. NEXUS will automatically fetch cover art and screenshots."}
      </p>
      {!hasQuery && (
        <div className="empty-actions">
          <button className="info-play" onClick={onScan}>
            <Icon.Scan size={18} /> Scan My System
          </button>
          <button className="btn btn-ghost" style={{ height: 46, padding: "0 22px", fontSize: 14 }} onClick={onAdd}>
            <Icon.Plus size={16} /> Add Manually
          </button>
        </div>
      )}
    </div>
  );
}
