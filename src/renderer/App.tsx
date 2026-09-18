import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DetectedGame,
  Game,
  LauncherSettings,
  PlatformId,
  ScanSummary,
  SortKey,
  Stats,
  ViewMode,
} from "@shared/types";
import { PLATFORM_LIST, SORT_LABELS } from "@shared/types";
import { Icon } from "./components/Icons";
import { GameCard } from "./components/GameCard";
import { GameDetailDialog } from "./components/GameDetailDialog";
import { AddGameDialog } from "./components/AddGameDialog";
import { ScanDialog } from "./components/ScanDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { HeroCarousel } from "./components/HeroCarousel";
import { ToastContainer, type Toast } from "./components/Toast";
import {
  formatPlaytime, formatPlaytimeShort, formatSize, platformColor, platformLabel,
} from "./lib/helpers";

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
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  // Initial load + settings + auto-scan.
  useEffect(() => {
    (async () => {
      try {
        const s = await window.nexus.getSettings();
        setSettings(s);
        setFilters((f) => ({ ...f, sort: s.defaultSort }));
        await refreshAll();
        if (s.autoScanOnStart) {
          // Kick off a silent background scan on launch.
          try {
            const summary = await window.nexus.runScan(
              PLATFORM_LIST.filter((p) => p.id !== "custom" && p.id !== "manual").map((p) => p.id as PlatformId),
            );
            if (summary.detected.length > 0) {
              const imported = await window.nexus.importDetected(summary.detected);
              if (imported.length > 0) {
                toast("success", `Auto-scan found ${imported.length} new game${imported.length === 1 ? "" : "s"}`);
                await refreshAll();
              }
            }
          } catch {
            // Silent failure on auto-scan.
          }
        }
      } catch (e) {
        // Database / IPC layer failed — show a clear toast instead of a blank screen.
        console.error("[NEXUS] init failed:", e);
        toast("error", "Couldn't load library", "The local database may be locked or better-sqlite3 failed to load.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filters change.
  useEffect(() => {
    if (!loading) refreshGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const openDetail = useCallback(async (id: number) => {
    const g = await window.nexus.getGame(id);
    setSelectedGame(g);
  }, []);

  const handleLaunch = useCallback(async (g: Game) => {
    toast("info", `Launching ${g.title}…`, "Starting the game via its native store protocol.");
    const res = await window.nexus.launchGame(g.id);
    if (res.ok) {
      toast("success", `${g.title} is running`, "Play session recorded.");
      await refreshAll();
      // Refresh the open detail too.
      const updated = await window.nexus.getGame(g.id);
      setSelectedGame(updated);
    } else {
      toast("error", "Launch failed", res.message);
    }
  }, [refreshAll, toast]);

  const handlePatch = useCallback(async (g: Game) => {
    toast("info", "Patching metadata from RAWG…");
    const updated = await window.nexus.patchMetadata(g.id);
    if (updated) {
      toast("success", "Metadata updated", updated.coverImage ? "Cover art + details refreshed." : "Details refreshed.");
      await refreshAll();
      setSelectedGame(updated);
    } else {
      toast("error", "No metadata found", "Set a RAWG API key in Settings, or try a different title.");
    }
  }, [refreshAll, toast]);

  const handleToggleFav = useCallback(async (g: Game) => {
    await window.nexus.updateGame(g.id, { favorite: !g.favorite });
    await refreshAll();
    if (selectedGame?.id === g.id) {
      setSelectedGame(await window.nexus.getGame(g.id));
    }
  }, [refreshAll, selectedGame]);

  const handleDelete = useCallback(async (g: Game) => {
    await window.nexus.deleteGame(g.id);
    toast("success", "Removed from library", g.title);
    setSelectedGame(null);
    await refreshAll();
  }, [refreshAll, toast]);

  const handleAdd = useCallback(async (input: {
    title: string; platform: PlatformId; executable?: string | null;
    installDir?: string | null; launchCommand?: string | null; autoPatch?: boolean;
  }) => {
    const g = await window.nexus.addGame(input);
    toast("success", `${g.title} added to library`, input.autoPatch !== false ? "Metadata auto-patched." : undefined);
    await refreshAll();
    return g;
  }, [refreshAll, toast]);

  const handleRunScan = useCallback(async (platforms: PlatformId[]) => {
    return await window.nexus.runScan(platforms);
  }, []);

  const handleImport = useCallback(async (items: DetectedGame[]) => {
    const imported = await window.nexus.importDetected(items);
    toast("success", `Imported ${imported.length} game${imported.length === 1 ? "" : "s"}`);
    await refreshAll();
    return imported;
  }, [refreshAll, toast]);

  const handleSaveSettings = useCallback(async (s: Partial<LauncherSettings>) => {
    const next = await window.nexus.setSettings(s);
    setSettings(next);
    toast("success", "Settings saved");
    return next;
  }, [toast]);

  const [patching, setPatching] = useState(false);
  const [patchProgress, setPatchProgress] = useState<{ patched: number; attempted: number } | null>(null);

  const handlePatchAll = useCallback(async () => {
    setPatching(true);
    setPatchProgress(null);
    toast("info", "Fetching artwork for all games…", "Pulling banners + screenshots from RAWG.");
    try {
      const res = await window.nexus.patchAllMetadata();
      setPatchProgress(res);
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
    }
  }, [refreshAll, toast]);

  const heading = useMemo(() => {
    if (filters.favOnly) return "Favorites";
    if (filters.query) return `Results for "${filters.query}"`;
    if (filters.platform === "all") return "Your Library";
    const p = PLATFORM_LIST.find((x) => x.id === filters.platform);
    return p ? p.label : "Library";
  }, [filters]);

  return (
    <div className="app">
      {/* Title bar */}
      <div className="titlebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon.Gamepad size={16} />
          </div>
          <div className="brand-text">
            <span className="name">NEXUS</span>
            <span className="sub">Game Launcher</span>
          </div>
        </div>
        <div className="search">
          <span className="icon"><Icon.Search size={16} /></span>
          <input
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder="Search your library…"
          />
        </div>
        <div className="spacer" />
        <button className="btn btn-outline" onClick={() => setScanOpen(true)}>
          <Icon.Scan size={15} /> <span>Scan System</span>
        </button>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Icon.Plus size={15} /> <span>Add Game</span>
        </button>
        <button className="btn btn-ghost btn-icon" onClick={() => setSettingsOpen(true)} title="Settings">
          <Icon.Settings size={16} />
        </button>
      </div>

      <div className="body">
        <Sidebar
          stats={stats}
          platform={filters.platform}
          favOnly={filters.favOnly}
          onPlatform={(p) => setFilters((f) => ({ ...f, platform: p, favOnly: false }))}
          onFav={() => setFilters((f) => ({ ...f, favOnly: !f.favOnly, platform: "all" }))}
        />
        <div className="main">
          <div className="main-scroll">
            {/* Hero carousel — only on the default "all games" view with no query. */}
            {!filters.favOnly && !filters.query && filters.platform === "all" && !loading && games.length > 0 && (
              <HeroCarousel games={games} onPlay={handleLaunch} onOpen={openDetail} />
            )}

            {/* Patch-all enrichment banner — shown when some games lack artwork. */}
            {!loading && games.length > 0 && games.some((g) => !g.bannerImage) && (
              <div className="patch-banner">
                <Icon.Sparkles size={22} />
                <div className="info">
                  <div className="title">
                    {patching
                      ? `Enriching library… ${patchProgress ? `(${patchProgress.patched}/${patchProgress.attempted})` : ""}`
                      : "Enrich your library with cover art + screenshots"}
                  </div>
                  <div className="sub">
                    {patching
                      ? "Fetching banners and details from RAWG. This runs in the background."
                      : "Some games are missing artwork. Pull banners, descriptions and screenshot galleries from RAWG in one click."}
                  </div>
                </div>
                {!patching && (
                  <button className="btn btn-outline btn-sm" onClick={handlePatchAll}>
                    <Icon.Wand size={14} /> Enrich All
                  </button>
                )}
                {patching && <Icon.Spinner size={18} />}
              </div>
            )}

            <div className="toolbar">
              <div className="toolbar-info">
                <strong>{stats?.totalGames ?? 0}</strong> games
                {stats ? ` · ${formatPlaytimeShort(stats.totalPlaytimeSec)} played` : ""}
              </div>
              <div className="toolbar-actions">
                <select
                  className="sort-select"
                  value={filters.sort}
                  onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <option key={k} value={k}>{SORT_LABELS[k]}</option>
                  ))}
                </select>
                <div className="view-toggle">
                  <button className={filters.view === "grid" ? "active" : ""} onClick={() => setFilters((f) => ({ ...f, view: "grid" }))} title="Grid view">
                    <Icon.Grid size={15} />
                  </button>
                  <button className={filters.view === "list" ? "active" : ""} onClick={() => setFilters((f) => ({ ...f, view: "list" }))} title="List view">
                    <Icon.List size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid-wrap">
              {loading ? (
                <div className="grid">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{ overflow: "hidden", borderRadius: 14, border: "1px solid var(--nx-border)", background: "var(--nx-surface)" }}>
                      <div className="shimmer" style={{ aspectRatio: "16 / 9" }} />
                      <div style={{ padding: 12 }}>
                        <div className="shimmer" style={{ height: 13, width: "70%", borderRadius: 4 }} />
                        <div className="shimmer" style={{ height: 10, width: "40%", borderRadius: 4, marginTop: 8 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : games.length === 0 ? (
                <EmptyState
                  hasQuery={!!filters.query}
                  onScan={() => setScanOpen(true)}
                  onAdd={() => setAddOpen(true)}
                />
              ) : filters.view === "grid" ? (
                <div className="grid">
                  {games.map((g, i) => (
                    <GameCard
                      key={g.id}
                      game={g}
                      index={i}
                      onOpen={openDetail}
                      onToggleFav={handleToggleFav}
                      onLaunch={handleLaunch}
                    />
                  ))}
                </div>
              ) : (
                <div className="list-view">
                  {games.map((g) => (
                    <button key={g.id} className="list-row" onClick={() => openDetail(g.id)}>
                      <div className="list-thumb">
                        <ListThumb game={g} />
                      </div>
                      <div className="list-title">{g.title}</div>
                      <div className="list-meta">
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: platformColor(g.platform) }} />
                          {platformLabel(g.platform)}
                        </span>
                        <span>{formatPlaytime(g.playtimeSec)}</span>
                        <span>{formatSize(g.sizeBytes)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="footer">
            <div className="footer-left">
              <div className="footer-mark">
                <Icon.Gamepad size={13} />
              </div>
              <strong style={{ color: "var(--nx-text)" }}>NEXUS</strong> Game Launcher
              <span style={{ color: "var(--nx-text-faint)" }}>· v1.0.0</span>
            </div>
            <div className="footer-right">
              <span><Icon.Shield size={12} /> Read-only scanner</span>
              <span><Icon.Cpu size={12} /> RAWG metadata</span>
              <span><Icon.HardDrive size={12} /> Local SQLite</span>
            </div>
          </div>
        </div>
      </div>

      {selectedGame && (
        <GameDetailDialog
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
          onLaunch={handleLaunch}
          onPatch={handlePatch}
          onDelete={handleDelete}
          onToggleFav={handleToggleFav}
        />
      )}
      {addOpen && (
        <AddGameDialog onClose={() => setAddOpen(false)} onAdd={handleAdd} />
      )}
      {scanOpen && (
        <ScanDialog
          onClose={() => setScanOpen(false)}
          onRunScan={handleRunScan}
          onImport={handleImport}
        />
      )}
      {settingsOpen && settings && (
        <SettingsDialog
          initial={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function ListThumb({ game }: { game: Game }) {
  if (game.coverImage) {
    return <img src={game.coverImage} alt={game.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />;
  }
  return <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1c1917, #0a0a0a)" }} />;
}

function Sidebar({
  stats, platform, favOnly, onPlatform, onFav,
}: {
  stats: Stats | null;
  platform: string;
  favOnly: boolean;
  onPlatform: (p: string) => void;
  onFav: () => void;
}) {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <div className="sidebar-section">Library</div>
        <button className={!favOnly && platform === "all" ? "nav-item active" : "nav-item"} onClick={() => onPlatform("all")}>
          <span className="icon"><Icon.Library size={16} /></span>
          All Games
          <span className="count">{stats?.totalGames ?? 0}</span>
        </button>
        <button className={favOnly ? "nav-item active" : "nav-item"} onClick={onFav}>
          <span className="icon"><Icon.Star size={16} /></span>
          Favorites
          <span className="count">{stats?.favorites ?? 0}</span>
        </button>

        <div className="sidebar-section">Platforms</div>
        {PLATFORM_LIST.filter((p) => p.id !== "custom" && p.id !== "manual").map((p) => (
          <button
            key={p.id}
            className={!favOnly && platform === p.id ? "nav-item active" : "nav-item"}
            onClick={() => onPlatform(p.id)}
          >
            <span className="plat-dot" style={{ background: `${p.accent}1f`, color: p.accent }}>{p.monogram}</span>
            {p.label}
            <span className="count">{stats?.byPlatform?.[p.id] ?? 0}</span>
          </button>
        ))}
        <div className="sidebar-section">Shortcuts</div>
        <button className={!favOnly && platform === "manual" ? "nav-item active" : "nav-item"} onClick={() => onPlatform("manual")}>
          <span className="icon"><Icon.Heart size={16} /></span>
          My Additions
        </button>
      </nav>

      {stats && (
        <div className="sidebar-footer">
          <div className="overview-card">
            <div className="overview-title">
              <Icon.TrendingUp size={12} /> Library Overview
            </div>
            <div className="overview-grid">
              <OverviewStat icon={<Icon.Clock size={11} />} label="Playtime" value={formatPlaytimeShort(stats.totalPlaytimeSec)} />
              <OverviewStat icon={<Icon.Play size={11} />} label="Launches" value={stats.totalLaunches.toLocaleString()} />
              <OverviewStat icon={<Icon.HardDrive size={11} />} label="Disk" value={formatSize(stats.totalSizeBytes)} />
              <OverviewStat icon={<Icon.Star size={11} />} label="Avg ★" value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"} />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function OverviewStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="overview-stat">
      <div className="label">{icon} {label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function StatsGrid({ stats }: { stats: Stats | null }) {
  if (!stats) {
    return (
      <div className="stats-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card shimmer" style={{ height: 86 }} />
        ))}
      </div>
    );
  }
  const items = [
    { icon: <Icon.Gamepad size={16} />, label: "Total Games", value: stats.totalGames.toString(), sub: `${Object.keys(stats.byPlatform).length} platforms`, glow: "rgba(52,211,153,0.1)" },
    { icon: <Icon.Clock size={16} />, label: "Total Playtime", value: formatPlaytime(stats.totalPlaytimeSec), sub: `${stats.totalLaunches} launches`, glow: "rgba(45,212,191,0.1)" },
    { icon: <Icon.Star size={16} />, label: "Favorites", value: stats.favorites.toString(), sub: stats.avgRating ? `${stats.avgRating.toFixed(1)} avg ★` : "no ratings", glow: "rgba(251,191,36,0.1)" },
    { icon: <Icon.HardDrive size={16} />, label: "Disk Used", value: formatSize(stats.totalSizeBytes), sub: `${stats.playedToday} played today`, glow: "rgba(34,211,238,0.1)" },
  ];
  return (
    <div className="stats-grid">
      {items.map((it) => (
        <div key={it.label} className="stat-card">
          <div className="glow" style={{ background: `linear-gradient(135deg, ${it.glow}, transparent)` }} />
          <div className="stat-icon">{it.icon}</div>
          <div className="stat-value">{it.value}</div>
          <div className="stat-label">{it.label}</div>
          <div className="stat-sub">{it.sub}</div>
        </div>
      ))}
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
          : "Scan your system to auto-detect installed games, or add a game manually to get started."}
      </p>
      {!hasQuery && (
        <div className="empty-actions">
          <button className="btn btn-primary" onClick={onScan}>
            <Icon.Scan size={15} /> Scan My System
          </button>
          <button className="btn btn-ghost" onClick={onAdd}>
            <Icon.Plus size={15} /> Add Manually
          </button>
        </div>
      )}
    </div>
  );
}
