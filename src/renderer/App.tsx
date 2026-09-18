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
  gradientFor, initials,
} from "./lib/helpers";

type NavSection = "home" | "library" | "favorites";

interface Filters {
  platform: string;
  favOnly: boolean;
  query: string;
  sort: SortKey;
}

const DEFAULT_FILTERS: Filters = {
  platform: "all",
  favOnly: false,
  query: "",
  sort: "recent",
};

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
  const [patching, setPatching] = useState(false);
  const [patchProgress, setPatchProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{
    version?: string; releaseUrl?: string; downloadUrl?: string; downloadSize?: number;
  } | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  const toast = useCallback((type: Toast["type"], title: string, desc?: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, title, desc }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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
                toast("success", `Auto-scan found ${imported.length} new game${imported.length === 1 ? "" : "s"}`, "Artwork is being fetched automatically in the background.");
              }
            }
          } catch { /* silent */ }
        }
        try {
          const upd = await window.nexus.checkForUpdates();
          if (upd.ok && upd.updateAvailable) {
            setUpdateAvailable({
              version: upd.version, releaseUrl: upd.releaseUrl,
              downloadUrl: upd.downloadUrl, downloadSize: upd.downloadSize,
            });
          }
        } catch { /* ignore */ }
      } catch (e) {
        console.error("[NEXUS] init failed:", e);
        toast("error", "Couldn't load library", "The local database may be locked or better-sqlite3 failed to load.");
      } finally {
        setLoading(false);
      }
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
      setPatching(false);
      setPatchProgress(null);
      if (patched > 0) {
        toast("success", `Enriched ${patched} of ${attempted} games`, "Cover art + screenshots fetched automatically.");
      }
      refreshAll();
    });

    return () => { offProgress?.(); offGameUpdated?.(); offDone?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) refreshGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const openPage = useCallback(async (id: number) => setPageGame(await window.nexus.getGame(id)), []);

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

  const handleRunScan = useCallback(async (platforms: PlatformId[]) => window.nexus.runScan(platforms), []);

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
      if (res.patched > 0) toast("success", `Enriched ${res.patched} game${res.patched === 1 ? "" : "s"}`, "Cover art + details + screenshots added.");
      else toast("info", "Everything's already enriched", "All your games have artwork.");
      await refreshAll();
    } catch (e) {
      toast("error", "Bulk patch failed", e instanceof Error ? e.message : String(e));
    } finally {
      setPatching(false); setPatchProgress(null);
    }
  }, [refreshAll, toast]);

  const handleCheckUpdates = useCallback(async () => {
    toast("info", "Checking for updates…", "Querying GitHub Releases.");
    try {
      const upd = await window.nexus.checkForUpdates();
      if (upd.ok && upd.updateAvailable) {
        setUpdateAvailable({ version: upd.version, releaseUrl: upd.releaseUrl, downloadUrl: upd.downloadUrl, downloadSize: upd.downloadSize });
        setUpdateDialogOpen(true);
      } else if (upd.ok) toast("success", "You're up to date", upd.message);
      else toast("error", "Update check failed", upd.message);
    } catch (e) {
      toast("error", "Update check failed", e instanceof Error ? e.message : String(e));
    }
  }, [toast]);

  const focusedGame = games[focusedIdx] ?? null;

  const stageHeading = useMemo(() => {
    if (filters.favOnly) return "Favorites";
    if (filters.query) return `Results for "${filters.query}"`;
    if (filters.platform !== "all") {
      const p = PLATFORM_LIST.find((x) => x.id === filters.platform);
      return p ? p.label : "Library";
    }
    if (nav === "favorites") return "Favorites";
    if (nav === "home") return "Home";
    return "Your Library";
  }, [filters, nav]);

  const eyebrowText = useMemo(() => {
    if (filters.query) return "Search results";
    if (filters.favOnly) return "Your favorite games";
    if (filters.platform !== "all") return "Platform library";
    if (nav === "home") return "Welcome back";
    return "Browse your collection";
  }, [filters, nav]);

  // ===== GAME PAGE =====
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

  // ===== MAIN UI =====
  return (
    <div className="app">
      <DynamicBackground games={games} focusedIdx={focusedIdx} focusedGame={focusedGame} />

      {/* ===== SIDEBAR (single, professional nav) ===== */}
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="sb-brand-mark"><Icon.Gamepad size={18} /></div>
          <div className="sb-brand-text">
            <span className="sb-brand-name">NEXUS</span>
            <span className="sb-brand-sub">Game Launcher</span>
          </div>
        </div>

        <div className="sb-search">
          <div className="sb-search-input">
            <span className="icon"><Icon.Search size={16} /></span>
            <input
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Search library…"
            />
          </div>
        </div>

        <nav className="sb-nav">
          <div className="sb-section">Browse</div>
          <button
            className={nav === "home" && filters.platform === "all" && !filters.favOnly ? "sb-nav-item active" : "sb-nav-item"}
            onClick={() => { setNav("home"); setFilters((f) => ({ ...f, platform: "all", favOnly: false, query: "" })); }}
          >
            <span className="icon"><Icon.Home size={18} /></span> Home
            <span className="count">{stats?.totalGames ?? 0}</span>
          </button>
          <button
            className={nav === "favorites" || filters.favOnly ? "sb-nav-item active" : "sb-nav-item"}
            onClick={() => { setNav("favorites"); setFilters((f) => ({ ...f, favOnly: true, platform: "all", query: "" })); }}
          >
            <span className="icon"><Icon.Star size={18} /></span> Favorites
            <span className="count">{stats?.favorites ?? 0}</span>
          </button>

          <div className="sb-section">Platforms</div>
          {PLATFORM_LIST.filter((p) => p.id !== "custom" && p.id !== "manual").map((p) => (
            <button
              key={p.id}
              className={filters.platform === p.id ? "sb-nav-item active" : "sb-nav-item"}
              onClick={() => { setNav("library"); setFilters((f) => ({ ...f, platform: p.id, favOnly: false, query: "" })); }}
            >
              <span className="sb-plat-dot" style={{ background: `${p.accent}1f`, color: p.accent }}>{p.monogram}</span>
              {p.label}
              <span className="count">{stats?.byPlatform?.[p.id] ?? 0}</span>
            </button>
          ))}
          <button
            className={filters.platform === "manual" ? "sb-nav-item active" : "sb-nav-item"}
            onClick={() => { setNav("library"); setFilters((f) => ({ ...f, platform: "manual", favOnly: false, query: "" })); }}
          >
            <span className="icon"><Icon.Heart size={18} /></span> My Additions
            <span className="count">{stats?.byPlatform?.manual ?? 0}</span>
          </button>
        </nav>

        {/* Footer: status + actions */}
        <div className="sb-footer">
          {patching && patchProgress ? (
            <div className="sb-status">
              <span className="dot busy" />
              <span className="sb-status-text">Enriching {patchProgress.title}</span>
              <span className="sb-status-count">{patchProgress.current}/{patchProgress.total || "…"}</span>
            </div>
          ) : (
            <div className="sb-status">
              <span className="dot" />
              <span className="sb-status-text">{stats?.totalGames ?? 0} games · {formatPlaytimeShort(stats?.totalPlaytimeSec ?? 0)} played</span>
            </div>
          )}
          {!patching && games.some((g) => !g.bannerImage) && games.length > 0 && (
            <button className="sb-footer-btn primary" onClick={handlePatchAll} title="Fetch artwork for all games missing it">
              <Icon.Wand size={15} /> Enrich All
            </button>
          )}
          <div className="sb-footer-actions">
            <button className="sb-footer-btn" onClick={() => setScanOpen(true)} title="Scan system">
              <Icon.Scan size={15} /> Scan
            </button>
            <button className="sb-footer-btn" onClick={() => setAddOpen(true)} title="Add game">
              <Icon.Plus size={15} /> Add
            </button>
            <button className="sb-footer-btn" onClick={() => setSettingsOpen(true)} title="Settings">
              <Icon.Settings size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main className="main">
        <div className="main-scroll">
          {/* Stage header */}
          <div className="stage-header">
            <div className="stage-title-block">
              <div className="stage-eyebrow">
                <span className="pulse-dot" /> {eyebrowText}
              </div>
              <h1 className="stage-title">{stageHeading}</h1>
            </div>
            <div className="stage-meta">
              {updateAvailable ? (
                <button className="update-badge" onClick={() => setUpdateDialogOpen(true)} title={`NEXUS ${updateAvailable.version} is available — click to install`}>
                  <Icon.DownloadCloud size={14} /> Update to {updateAvailable.version}
                </button>
              ) : (
                <div className="stat"><Icon.Library size={15} /><strong>{stats?.totalGames ?? 0}</strong> games</div>
              )}
              {stats && (
                <>
                  <div className="sep" />
                  <div className="stat"><Icon.Clock size={15} /><strong>{formatPlaytimeShort(stats.totalPlaytimeSec)}</strong> played</div>
                  <div className="sep" />
                  <div className="stat"><Icon.HardDrive size={15} /><strong>{formatSize(stats.totalSizeBytes)}</strong></div>
                </>
              )}
            </div>
          </div>

          {/* Enrichment banner */}
          {patching && patchProgress && (
            <div className="enrich-banner">
              <div className="icon-wrap"><Icon.Spinner size={18} /></div>
              <div className="text">
                <div className="title">Enriching your library<span className="count"> {patchProgress.current}/{patchProgress.total || "…"}</span></div>
                <div className="sub">Fetching artwork for {patchProgress.title} from RAWG + Steam.</div>
              </div>
            </div>
          )}

          {/* Carousel / empty / loading */}
          {loading ? (
            <div className="carousel">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="shimmer" style={{ width: 280, aspectRatio: "3 / 4", borderRadius: 18, flexShrink: 0 }} />
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

          {/* Focused game info panel */}
          {focusedGame && !loading && (
            <div className="info-panel">
              <div className="info-title-block">
                <div className="info-title">{focusedGame.title}</div>
                <div className="info-meta-row">
                  <span className="plat">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: platformColor(focusedGame.platform), display: "inline-block" }} />
                    {platformLabel(focusedGame.platform)}
                  </span>
                  {focusedGame.developer && <><span className="dot" /><span>{focusedGame.developer}</span></>}
                  {focusedGame.releaseDate && <><span className="dot" /><span>{focusedGame.releaseDate.slice(0, 4)}</span></>}
                  {focusedGame.rating !== null && <><span className="dot" /><span className="rating"><Icon.Star size={13} filled /> {focusedGame.rating.toFixed(1)}</span></>}
                  {focusedGame.playtimeSec > 0 && <><span className="dot" /><span>{formatPlaytime(focusedGame.playtimeSec)}</span></>}
                </div>
              </div>
              <div className="info-stats">
                <InfoStat value={focusedGame.launchCount.toString()} label="Launches" />
                <InfoStat value={formatPlaytimeShort(focusedGame.playtimeSec)} label="Playtime" />
                <InfoStat value={formatSize(focusedGame.sizeBytes)} label="Size" />
              </div>
              <div className="info-actions">
                <button className="btn btn-primary" onClick={() => handleLaunch(focusedGame)}>
                  <Icon.Play size={18} /> Play
                </button>
                <button className="btn btn-ghost" onClick={() => openPage(focusedGame.id)}>
                  <Icon.Info size={17} /> Details
                </button>
              </div>
            </div>
          )}
        </div>
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

/** A single game tile in the carousel. */
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
          <span className="plat">
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: platformColor(game.platform), display: "inline-block" }} />
            {platformLabel(game.platform)}
          </span>
          {game.playtimeSec > 0 && <><span className="dot" />{formatPlaytimeShort(game.playtimeSec)}</>}
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
        <div className="box"><Icon.Gamepad size={34} /></div>
      </div>
      <h3>{hasQuery ? "No matches found" : "Your library is empty"}</h3>
      <p>
        {hasQuery
          ? "No games match your search. Try a different query."
          : "Scan your system to auto-detect installed games, or add a game manually. NEXUS automatically fetches cover art and screenshots — no setup needed."}
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
