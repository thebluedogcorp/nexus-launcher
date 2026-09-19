// NEXUS Store — Hydra Launcher-style store + downloads UI for the Electron app.
//
// Mirrors Hydra Launcher's store UX:
//   - Catalogue page: 2-column layout (games list + filter sidebar with colored orbs)
//   - Game rows (200×103 cover + title + genres + source badges + hover "+" add-to-library)
//   - Game detail page (modal): hero image + sticky translucent hero panel with
//     Download button + favorite + 3px progress bar at the bottom
//   - Repacks modal: filter text + collapsible "Filter by source" drawer +
//     per-repack availability orb + "New" / "Last downloaded" badges
//   - Downloads page: 3 sections (In progress / Queued / Completed) with a
//     HeroDownloadView for the active download (blurred bg + animated % +
//     glass Pause/Cancel buttons + speed stats)
//   - Bottom panel: persistent footer showing current download status
//
// "How games are patched" fix:
//   Downloads no longer auto-add to the library. The user must explicitly click
//   "Install" on a completed download to register the executable path. This
//   matches Hydra's flow: Download → completed → user clicks "Install" → game
//   appears in Library.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StoreGame, StoreRepack, StoreSortKey } from "@shared/store-catalog";
import { STORE_SORT_LABELS, STORE_GENRES, SOURCE_BADGE_COLORS, repackAvailability } from "@shared/store-catalog";
import type { DownloadEntry } from "../../main/preload";
import { Icon } from "./Icons";

// ============ Utilities ============

function formatBytes(b: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function relativeTime(iso: string | number | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "number" ? iso : new Date(iso).getTime();
  if (isNaN(d)) return "—";
  const diff = Date.now() - d;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(day / 365)}y ago`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return "calculating…";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

// Availability orb color — matches Hydra's online/partial/offline styling.
function availabilityColor(status: "online" | "partial" | "offline"): string {
  if (status === "online") return "#4ade80";
  if (status === "partial") return "#fbbf24";
  return "#ef4444";
}

// ============ Store Tab ============

interface StoreTabProps {
  toast: (type: "success" | "error" | "info", title: string, desc?: string) => void;
  onLibraryChanged: () => void;
  onOpenDownloads: () => void;
  downloads: DownloadEntry[];
  onDownloadsChanged: () => void;
}

type Category = StoreSortKey;

export function StoreTab({ toast, onLibraryChanged, onOpenDownloads, downloads, onDownloadsChanged }: StoreTabProps) {
  const [games, setGames] = useState<StoreGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [sort, setSort] = useState<Category>("popularity");
  const [genres, setGenres] = useState<string[]>([]);
  const [sourceNames, setSourceNames] = useState<string[]>([]);
  const [detailGame, setDetailGame] = useState<StoreGame | null>(null);
  const [showSourcesDrawer, setShowSourcesDrawer] = useState(false);

  useEffect(() => {
    void window.nexus.storeGenres().then(setGenres).catch(() => {});
    void window.nexus.storeSourceNames().then(setSourceNames).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.nexus.storeCatalog({ query, genre, sources: selectedSources, sort });
      setGames(list);
    } catch (e) {
      toast("error", "Failed to load store", e instanceof Error ? e.message : String(e));
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [query, genre, selectedSources, sort, toast]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 250);
    return () => clearTimeout(t);
  }, [refresh]);

  const handleDownload = useCallback(
    async (game: StoreGame, repackId: string, installDir?: string) => {
      try {
        await window.nexus.startDownload(game.id, repackId, installDir);
        toast("success", `Downloading ${game.title}`, "Real bytes streaming to disk.");
        onDownloadsChanged();
      } catch (e) {
        toast("error", "Download failed", e instanceof Error ? e.message : String(e));
      }
    },
    [toast, onDownloadsChanged],
  );

  const handlePause = useCallback(
    async (gameId: string, sourceId: string) => {
      await window.nexus.pauseDownload(gameId, sourceId);
      onDownloadsChanged();
    },
    [onDownloadsChanged],
  );

  const handleResume = useCallback(
    async (gameId: string, sourceId: string) => {
      await window.nexus.resumeDownload(gameId, sourceId);
      onDownloadsChanged();
    },
    [onDownloadsChanged],
  );

  const handleCancel = useCallback(
    async (gameId: string, sourceId: string) => {
      await window.nexus.cancelDownload(gameId, sourceId);
      toast("info", "Download cancelled");
      onDownloadsChanged();
    },
    [toast, onDownloadsChanged],
  );

  const handleInstall = useCallback(
    async (gameId: string, sourceId: string, gameTitle: string) => {
      const res = await window.nexus.installDownload(gameId, sourceId);
      if (res.ok && res.libraryGameId) {
        toast("success", `${gameTitle} installed`, "Now appears in your library.");
        onDownloadsChanged();
        onLibraryChanged();
      } else {
        toast("error", "Install failed", res.error ?? "Unknown error");
      }
    },
    [toast, onDownloadsChanged, onLibraryChanged],
  );

  const handlePickInstallDir = useCallback(async (): Promise<string | undefined> => {
    const res = await window.nexus.pickInstallDir();
    return res.ok && res.path ? res.path : undefined;
  }, []);

  const activeFiltersCount = (genre ? 1 : 0) + selectedSources.length;

  return (
    <div className="catalogue">
      {/* Header */}
      <div className="catalogue__header">
        <div className="catalogue__header-row">
          <div className="catalogue__header-summary">
            <span className="catalogue__result-count">{games.length} results</span>
            {activeFiltersCount === 0 && <span className="catalogue__filters-hint">Use the sidebar to refine your search</span>}
          </div>
          <div className="catalogue__sort-inline">
            <span>Sort by</span>
            <select className="catalogue__select" value={sort} onChange={(e) => setSort(e.target.value as Category)}>
              {(Object.keys(STORE_SORT_LABELS) as StoreSortKey[]).map((k) => (
                <option key={k} value={k}>
                  {STORE_SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {activeFiltersCount > 0 && (
          <div className="catalogue__header-row catalogue__header-row--filters">
            <span className="catalogue__active-filters-label">Active filters</span>
            <ul className="catalogue__filters-list">
              {genre && (
                <li className="catalogue__filter-chip" style={{ background: "hsla(262,50%,47%,.18)", borderColor: "hsla(262,50%,47%,.4)", color: "#d8b4fe" }}>
                  <span className="catalogue__filter-orb" style={{ background: "hsl(262 50% 47%)" }} />
                  {genre}
                  <button onClick={() => setGenre("")}><Icon.Close size={10} /></button>
                </li>
              )}
              {selectedSources.map((s) => (
                <li key={s} className="catalogue__filter-chip" style={{ background: "hsla(27,50%,40%,.18)", borderColor: "hsla(27,50%,40%,.4)", color: "#fdba74" }}>
                  <span className="catalogue__filter-orb" style={{ background: "hsl(27 50% 40%)" }} />
                  {s}
                  <button onClick={() => setSelectedSources((prev) => prev.filter((x) => x !== s))}><Icon.Close size={10} /></button>
                </li>
              ))}
            </ul>
            <button className="catalogue__clear-btn" onClick={() => { setGenre(""); setSelectedSources([]); }}>
              Clear ({activeFiltersCount})
            </button>
          </div>
        )}
      </div>

      {/* Content: games + filter sidebar */}
      <div className="catalogue__content">
        <div className="catalogue__games-container">
          {loading && games.length === 0 ? (
            <div className="catalogue__skeleton-list">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="catalogue__skeleton-row shimmer" />
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="catalogue__empty">
              <Icon.Search size={28} />
              <h3>No games found</h3>
              <p>{query ? `No matches for "${query}".` : "Try different filters."}</p>
            </div>
          ) : (
            <div className="catalogue__games-list">
              {games.map((g, i) => (
                <GameItem
                  key={g.id}
                  game={g}
                  index={i}
                  downloads={downloads}
                  onOpen={() => setDetailGame(g)}
                  onDownload={handleDownload}
                  onPause={handlePause}
                  onResume={handleResume}
                  onInstall={handleInstall}
                />
              ))}
            </div>
          )}
        </div>

        {/* Filter sidebar */}
        <aside className="catalogue__filters-container">
          <div className="catalogue__filters-sections">
            {/* Genres */}
            <FilterSection title="Genres" orbColor="hsl(262 50% 47%)">
              {genres.map((g) => (
                <FilterCheckbox
                  key={g}
                  label={g}
                  checked={genre === g}
                  onChange={() => setGenre((cur) => (cur === g ? "" : g))}
                />
              ))}
            </FilterSection>

            {/* Download sources */}
            <FilterSection title="Download sources" orbColor="hsl(27 50% 40%)">
              {sourceNames.map((s) => (
                <FilterCheckbox
                  key={s}
                  label={s}
                  checked={selectedSources.includes(s)}
                  onChange={() =>
                    setSelectedSources((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                    )
                  }
                />
              ))}
            </FilterSection>
          </div>
        </aside>
      </div>

      {/* Detail modal */}
      {detailGame && (
        <GameDetailsModal
          game={detailGame}
          downloads={downloads}
          onClose={() => setDetailGame(null)}
          onDownload={handleDownload}
          onPause={handlePause}
          onResume={handleResume}
          onCancel={handleCancel}
          onInstall={handleInstall}
          onOpenLibrary={() => {
            setDetailGame(null);
            onLibraryChanged();
          }}
          onOpenDownloads={() => {
            setDetailGame(null);
            onOpenDownloads();
          }}
          onPickInstallDir={handlePickInstallDir}
          toast={toast}
        />
      )}
    </div>
  );
}

// ============ Catalogue game row (Hydra-style horizontal card) ============

interface GameItemProps {
  game: StoreGame;
  index: number;
  downloads: DownloadEntry[];
  onOpen: () => void;
  onDownload: (game: StoreGame, repackId: string, installDir?: string) => void;
  onPause: (gameId: string, sourceId: string) => void;
  onResume: (gameId: string, sourceId: string) => void;
  onInstall: (gameId: string, sourceId: string, gameTitle: string) => void;
}

function GameItem({ game, index, downloads, onOpen, onDownload, onPause, onResume, onInstall }: GameItemProps) {
  // First repack download for this game (any source)
  const dl = downloads.find((d) => d.gameId === game.id);
  const pct = dl && dl.totalBytes > 0 ? Math.min(100, (dl.downloadedBytes / dl.totalBytes) * 100) : 0;
  const isInstalled = !!dl?.libraryGameId;
  const isDownloading = dl?.status === "downloading";
  const isPaused = dl?.status === "paused";
  const isCompleted = dl?.status === "completed";
  const isFailed = dl?.status === "failed";

  const handleQuickAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const repack = game.repacks[0];
    if (!repack) return;
    if (isDownloading) onPause(game.id, repack.id);
    else if (isPaused) onResume(game.id, repack.id);
    else if (isCompleted && !isInstalled) onInstall(game.id, repack.id, game.title);
    else if (!isCompleted) onDownload(game, repack.id);
  };

  return (
    <article
      className="game-item"
      style={{ animationDelay: `${Math.min(index * 25, 400)}ms` }}
      onClick={onOpen}
    >
      <div className="game-item__cover-wrapper">
        {game.coverImage ? (
          <img
            className="game-item__cover"
            src={game.coverImage}
            alt={game.title}
            loading="lazy"
            onError={(e) => {
              const img = e.currentTarget;
              img.style.display = "none";
            }}
          />
        ) : (
          <div className="game-item__cover-placeholder">
            <Icon.Image size={20} />
          </div>
        )}
        {/* Status overlay while downloading */}
        {dl && !isCompleted && !isFailed && (
          <div className="game-item__cover-status">
            <div className="game-item__cover-progress">
              <div
                className={isDownloading ? "fill-active" : "fill-paused"}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="game-item__cover-pct">{pct.toFixed(0)}%</div>
          </div>
        )}
        {isCompleted && (
          <div className="game-item__cover-done">
            <Icon.Check size={20} />
          </div>
        )}
      </div>

      <div className="game-item__details">
        <span className="game-item__title">{game.title}</span>
        <span className="game-item__genres">{game.genres.slice(0, 3).join(", ") || "No categories"}</span>
        <div className="game-item__repackers">
          {game.repacks.slice(0, 3).map((r) => (
            <span
              key={r.id}
              className="game-item__repacker-badge"
              style={{ background: SOURCE_BADGE_COLORS[r.downloadSourceName] ?? "rgba(255,255,255,.08);color:var(--text-dim)" }}
            >
              {r.downloadSourceName}
            </span>
          ))}
          {game.repacks.length > 3 && (
            <span className="game-item__repacker-badge game-item__repacker-badge--more">
              +{game.repacks.length - 3}
            </span>
          )}
        </div>
      </div>

      {/* Quick action button (hover-revealed) */}
      <button
        className={`game-item__plus-wrapper ${isInstalled ? "added" : ""} ${isDownloading ? "downloading" : ""} ${isCompleted && !isInstalled ? "install" : ""}`}
        onClick={handleQuickAction}
        title={isInstalled ? "In library" : isDownloading ? "Pause" : isPaused ? "Resume" : isCompleted ? "Install" : "Quick download"}
      >
        {isInstalled ? (
          <Icon.Check size={16} />
        ) : isDownloading ? (
          <Icon.Play size={16} />
        ) : isPaused ? (
          <Icon.Play size={16} />
        ) : isCompleted ? (
          <Icon.Download size={16} />
        ) : (
          <Icon.Plus size={16} />
        )}
      </button>
    </article>
  );
}

// ============ Filter section ============

function FilterSection({ title, orbColor, children }: { title: string; orbColor: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="filter-section">
      <button className="filter-section__header" onClick={() => setOpen((o) => !o)}>
        <span className="filter-section__orb" style={{ background: orbColor }} />
        <span className="filter-section__title">{title}</span>
        <Icon.Chevron size={14} className={open ? "filter-section__chevron--open" : "filter-section__chevron"} />
      </button>
      {open && <div className="filter-section__body">{children}</div>}
    </div>
  );
}

function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className={`filter-checkbox ${checked ? "checked" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="filter-checkbox__box">{checked && <Icon.Check size={10} />}</span>
      <span className="filter-checkbox__label">{label}</span>
    </label>
  );
}

// ============ Game detail modal (Hydra-style with hero panel) ============

interface GameDetailsModalProps {
  game: StoreGame;
  downloads: DownloadEntry[];
  onClose: () => void;
  onDownload: (game: StoreGame, repackId: string, installDir?: string) => void;
  onPause: (gameId: string, sourceId: string) => void;
  onResume: (gameId: string, sourceId: string) => void;
  onCancel: (gameId: string, sourceId: string) => void;
  onInstall: (gameId: string, sourceId: string, gameTitle: string) => void;
  onOpenLibrary: () => void;
  onOpenDownloads: () => void;
  onPickInstallDir: () => Promise<string | undefined>;
  toast: (type: "success" | "error" | "info", title: string, desc?: string) => void;
}

function GameDetailsModal({
  game,
  downloads,
  onClose,
  onDownload,
  onPause,
  onResume,
  onCancel,
  onInstall,
  onOpenLibrary,
  onPickInstallDir,
  toast,
}: GameDetailsModalProps) {
  const [showRepacksModal, setShowRepacksModal] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  // Any download for this game (any repack)
  const dl = downloads.find((d) => d.gameId === game.id);
  const pct = dl && dl.totalBytes > 0 ? Math.min(100, (dl.downloadedBytes / dl.totalBytes) * 100) : 0;
  const isInstalled = !!dl?.libraryGameId;
  const isDownloading = dl?.status === "downloading";
  const isPaused = dl?.status === "paused";
  const isCompleted = dl?.status === "completed";

  // Check if description overflows the collapsed height
  useEffect(() => {
    if (descriptionRef.current) {
      setIsOverflowing(descriptionRef.current.scrollHeight > 200);
    }
  }, [game.description]);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showRepacksModal) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, showRepacksModal]);

  const handleMainAction = async () => {
    if (isInstalled) {
      onOpenLibrary();
      return;
    }
    if (isCompleted && dl) {
      onInstall(game.id, dl.sourceId, game.title);
      return;
    }
    if (isDownloading && dl) {
      onPause(game.id, dl.sourceId);
      return;
    }
    if (isPaused && dl) {
      onResume(game.id, dl.sourceId);
      return;
    }
    // No download yet — open the repacks modal
    setShowRepacksModal(true);
  };

  const mainActionLabel = isInstalled
    ? "Open Library"
    : isCompleted
      ? "Install"
      : isDownloading
        ? "Pause"
        : isPaused
          ? "Resume"
          : "Download";

  const MainActionIcon = isInstalled ? Icon.Library : isCompleted ? Icon.Download : isDownloading ? Icon.Play : isPaused ? Icon.Play : Icon.Download;

  const heroImage = game.heroImage || game.bannerImage || game.coverImage;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="game-details-modal" onClick={(e) => e.stopPropagation()}>
        {/* Hero banner */}
        <div className="game-details__hero">
          {heroImage ? (
            <img className="game-details__hero-image" src={heroImage} alt={game.title} onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          ) : (
            <div className="game-details__hero-placeholder" />
          )}
          <div className="game-details__hero-overlay" />
          <button className="game-details__close" onClick={onClose} title="Close (Esc)">
            <Icon.Close size={18} />
          </button>

          {/* Title + meta overlay */}
          <div className="game-details__hero-content">
            <div className="game-details__hero-badges">
              <span className="badge-os">{game.license === "open-source" ? "OPEN SOURCE" : game.license.toUpperCase()}</span>
              {game.rating > 0 && (
                <span className="badge-rating">
                  <Icon.Star size={10} filled /> {game.rating.toFixed(1)} · {game.ratingCount.toLocaleString()}
                </span>
              )}
            </div>
            <h1 className="game-details__hero-title">{game.title}</h1>
            <p className="game-details__hero-sub">
              {game.developer} · Released {game.releaseDate.slice(0, 4)}
            </p>
          </div>

          {/* Sticky translucent hero panel with action buttons + progress bar */}
          <div className="hero-panel">
            <div className="hero-panel__content">
              {!dl && (
                <>
                  <span className="hero-panel__info">Download options <strong>{game.repacks.length}</strong></span>
                </>
              )}
              {dl && !isCompleted && !isInstalled && (
                <span className="hero-panel__info">
                  {isDownloading ? "Downloading" : isPaused ? "Paused" : dl.status} · {formatBytes(dl.downloadedBytes)} / {formatBytes(dl.totalBytes)}
                  {isDownloading && dl.speedBps > 0 && <span className="hero-panel__speed"> · {formatBytes(dl.speedBps)}/s</span>}
                </span>
              )}
              {isCompleted && !isInstalled && (
                <span className="hero-panel__info">Download complete · ready to install</span>
              )}
              {isInstalled && (
                <span className="hero-panel__info">In your library</span>
              )}
            </div>
            <div className="hero-panel__actions">
              <button
                className={`hero-panel__btn hero-panel__btn--primary ${isDownloading || isPaused ? "hero-panel__btn--active" : ""}`}
                onClick={handleMainAction}
                disabled={game.repacks.length === 0 && !dl}
                title={mainActionLabel}
              >
                <MainActionIcon size={14} /> {mainActionLabel}
              </button>
              <div className="hero-panel__sep" />
              <button
                className="hero-panel__btn hero-panel__btn--icon"
                onClick={() => toast("info", "Favorite toggled", "Manual favorites not persisted in v3.8.0")}
                title="Favorite"
              >
                <Icon.Heart size={14} />
              </button>
              <button
                className="hero-panel__btn hero-panel__btn--icon"
                onClick={() => setShowRepacksModal(true)}
                title="Open download options"
              >
                <Icon.Settings size={14} />
              </button>
            </div>
            {/* 3px progress bar at the bottom of the hero panel */}
            {isDownloading && (
              <div className="hero-panel__progress-bar">
                <div className="hero-panel__progress-fill" style={{ width: `${pct}%` }} />
              </div>
            )}
            {isPaused && (
              <div className="hero-panel__progress-bar">
                <div className="hero-panel__progress-fill hero-panel__progress-fill--paused" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        </div>

        {/* Body: description (left) + sidebar (right) */}
        <div className="game-details__body">
          <div className="game-details__main">
            {/* Release info */}
            <div className="description-header">
              <p>Released on {formatDate(game.releaseDate)}</p>
              <p>Published by {game.publisher}</p>
            </div>

            {/* Description (collapsible) */}
            <div
              ref={descriptionRef}
              className={`game-details__description ${descriptionExpanded ? "expanded" : "collapsed"}`}
            >
              {game.description}
            </div>
            {isOverflowing && (
              <button className="game-details__description-toggle" onClick={() => setDescriptionExpanded((e) => !e)}>
                {descriptionExpanded ? "Show less" : "Show more"}
              </button>
            )}

            {/* Repacks summary */}
            <div className="game-details__repacks-summary">
              <div className="game-details__repacks-header">
                <span>Repacks</span>
                <span className="game-details__repacks-count">{game.repacks.length} available</span>
              </div>
              <div className="game-details__repacks-list">
                {game.repacks.slice(0, 3).map((r) => {
                  const rdl = downloads.find((d) => d.gameId === game.id && d.sourceId === r.id);
                  const rPct = rdl && rdl.totalBytes > 0 ? Math.min(100, (rdl.downloadedBytes / rdl.totalBytes) * 100) : 0;
                  const rStatus = rdl?.status;
                  const rInstalled = !!rdl?.libraryGameId;
                  return (
                    <div key={r.id} className={`repack-row ${rStatus === "downloading" ? "active" : rInstalled ? "done" : ""}`}>
                      <div className="repack-row__orb" style={{ background: availabilityColor(repackAvailability(r)) }} title={`Source is ${repackAvailability(r)}`} />
                      <div className="repack-row__body">
                        <div className="repack-row__title">
                          {r.title}
                          {rStatus === "completed" && !rInstalled && <span className="repack-row__badge">Ready to install</span>}
                          {rInstalled && <span className="repack-row__badge repack-row__badge--installed">Installed</span>}
                        </div>
                        <div className="repack-row__meta">
                          {formatBytes(r.fileSize)} - {r.downloadSourceName} - {relativeTime(r.uploadDate)}
                        </div>
                        {rdl && rStatus !== "completed" && rStatus !== "cancelled" && (
                          <div className="repack-row__progress">
                            <div className="repack-row__progress-bar">
                              <div className={rStatus === "downloading" ? "fill-active" : "fill-paused"} style={{ width: `${rPct}%` }} />
                            </div>
                            <div className="repack-row__progress-meta">
                              <span>
                                {formatBytes(rdl.downloadedBytes)} / {formatBytes(rdl.totalBytes)}
                                {rStatus === "downloading" && rdl.speedBps > 0 && <span className="speed"> · {formatBytes(rdl.speedBps)}/s</span>}
                                {rStatus === "paused" && <span className="paused"> · paused</span>}
                              </span>
                              <span>{rPct.toFixed(1)}%</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="repack-row__action">
                        {rInstalled ? (
                          <button className="repack-row__btn repack-row__btn--open" onClick={onOpenLibrary}>
                            <Icon.Library size={12} /> Open Library
                          </button>
                        ) : rStatus === "completed" ? (
                          <button className="repack-row__btn repack-row__btn--install" onClick={() => onInstall(game.id, r.id, game.title)}>
                            <Icon.Download size={12} /> Install
                          </button>
                        ) : rStatus === "downloading" ? (
                          <button className="repack-row__btn repack-row__btn--pause" onClick={() => onPause(game.id, r.id)}>
                            <Icon.Play size={12} /> Pause
                          </button>
                        ) : rStatus === "paused" ? (
                          <button className="repack-row__btn repack-row__btn--resume" onClick={() => onResume(game.id, r.id)}>
                            <Icon.Play size={12} /> Resume
                          </button>
                        ) : rStatus === "failed" ? (
                          <button className="repack-row__btn repack-row__btn--retry" onClick={() => onDownload(game, r.id)}>
                            <Icon.Download size={12} /> Retry
                          </button>
                        ) : (
                          <button
                            className="repack-row__btn repack-row__btn--download"
                            onClick={async () => {
                              const installDir = await onPickInstallDir();
                              onDownload(game, r.id, installDir);
                            }}
                          >
                            <Icon.Download size={12} /> Download
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {game.repacks.length > 3 && (
                <button className="game-details__view-all-repacks" onClick={() => setShowRepacksModal(true)}>
                  View all {game.repacks.length} repacks
                </button>
              )}
            </div>
          </div>

          {/* Right metadata sidebar */}
          <aside className="game-details__sidebar">
            {/* Cover thumbnail */}
            <div className="game-details__sidebar-cover">
              {game.coverImage ? (
                <img src={game.coverImage} alt={game.title} onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
              ) : (
                <div className="game-details__sidebar-cover-proc">
                  <span>{game.title.slice(0, 2).toUpperCase()}</span>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="sidebar-section">
              <div className="sidebar-section__title">Stats</div>
              <div className="sidebar-section__row">
                <Icon.Download size={12} /> <span>Downloads</span> <strong>{(game.ratingCount * 3).toLocaleString()}</strong>
              </div>
              <div className="sidebar-section__row">
                <Icon.Star size={12} /> <span>Rating</span> <strong>{game.rating.toFixed(1)} / 5</strong>
              </div>
              <div className="sidebar-section__row">
                <Icon.HardDrive size={12} /> <span>Largest source</span> <strong>{formatBytes(game.sizeBytes)}</strong>
              </div>
            </div>

            {/* Details */}
            <div className="sidebar-section">
              <div className="sidebar-section__title">Details</div>
              <div className="sidebar-section__row"><Icon.Building size={12} /> <span>Developer</span> <strong>{game.developer}</strong></div>
              <div className="sidebar-section__row"><Icon.Tag size={12} /> <span>Publisher</span> <strong>{game.publisher}</strong></div>
              <div className="sidebar-section__row"><Icon.Calendar size={12} /> <span>Released</span> <strong>{formatDate(game.releaseDate)}</strong></div>
              <div className="sidebar-section__row"><Icon.Download size={12} /> <span>Repacks</span> <strong>{game.repacks.length}</strong></div>
            </div>

            {/* Languages */}
            <div className="sidebar-section">
              <div className="sidebar-section__title">Languages</div>
              <div className="sidebar-section__lang-list">
                {Array.from(new Set(game.repacks.flatMap((r) => r.languages))).map((l) => (
                  <span key={l} className="sidebar-section__lang">{l}</span>
                ))}
              </div>
            </div>

            {/* Official link */}
            <a className="game-details__official" href={game.officialUrl} target="_blank" rel="noopener noreferrer">
              Visit official site <Icon.ExternalLink size={11} />
            </a>
          </aside>
        </div>
      </div>

      {/* Repacks modal */}
      {showRepacksModal && (
        <RepacksModal
          game={game}
          downloads={downloads}
          onClose={() => setShowRepacksModal(false)}
          onDownload={onDownload}
          onPause={onPause}
          onResume={onResume}
          onCancel={onCancel}
          onInstall={onInstall}
          onPickInstallDir={onPickInstallDir}
        />
      )}
    </div>
  );
}

// ============ Repacks modal (Hydra-style with filter + availability orbs) ============

interface RepacksModalProps {
  game: StoreGame;
  downloads: DownloadEntry[];
  onClose: () => void;
  onDownload: (game: StoreGame, repackId: string, installDir?: string) => void;
  onPause: (gameId: string, sourceId: string) => void;
  onResume: (gameId: string, sourceId: string) => void;
  onCancel: (gameId: string, sourceId: string) => void;
  onInstall: (gameId: string, sourceId: string, gameTitle: string) => void;
  onPickInstallDir: () => Promise<string | undefined>;
}

function RepacksModal({ game, downloads, onClose, onDownload, onPause, onResume, onInstall, onPickInstallDir }: RepacksModalProps) {
  const [filter, setFilter] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string[]>([]);

  // Sort repacks by upload date desc (Hydra behavior)
  const sortedRepacks = useMemo(() => {
    const list = [...game.repacks];
    list.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
    return list;
  }, [game.repacks]);

  // Filter by text + selected sources
  const filteredRepacks = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return sortedRepacks.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q) && !r.downloadSourceName.toLowerCase().includes(q)) return false;
      if (selectedSourceFilter.length > 0 && !selectedSourceFilter.includes(r.downloadSourceName)) return false;
      return true;
    });
  }, [sortedRepacks, filter, selectedSourceFilter]);

  // Track which source names are available for the drawer
  const sourceNames = useMemo(() => Array.from(new Set(game.repacks.map((r) => r.downloadSourceName))).sort(), [game.repacks]);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 200 }}>
      <div className="repacks-modal" onClick={(e) => e.stopPropagation()}>
        <div className="repacks-modal__header">
          <div>
            <h2>Download options</h2>
            <p>Choose the repack you want to download for {game.title}</p>
          </div>
          <button className="repacks-modal__close" onClick={onClose}>
            <Icon.Close size={16} />
          </button>
        </div>

        <div className="repacks-modal__filter-container">
          <div className="repacks-modal__filter-top">
            <input
              className="repacks-modal__filter-input"
              placeholder="Filter repacks"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              className={`repacks-modal__drawer-toggle ${drawerOpen ? "open" : ""}`}
              onClick={() => setDrawerOpen((o) => !o)}
            >
              Filter by source <Icon.Chevron size={12} className={drawerOpen ? "chevron--up" : "chevron--down"} />
            </button>
          </div>
          {drawerOpen && (
            <div className="repacks-modal__download-sources">
              <div className="repacks-modal__source-grid">
                {sourceNames.map((s) => (
                  <FilterCheckbox
                    key={s}
                    label={s}
                    checked={selectedSourceFilter.includes(s)}
                    onChange={() =>
                      setSelectedSourceFilter((prev) =>
                        prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="repacks-modal__repacks">
          {filteredRepacks.length === 0 ? (
            <div className="repacks-modal__no-results">
              <p>No sources found for this game</p>
              <button className="repacks-modal__add-source" onClick={() => toast("info", "Source management coming soon")}>
                <Icon.Plus size={12} /> Add source
              </button>
            </div>
          ) : (
            filteredRepacks.map((r) => {
              const rdl = downloads.find((d) => d.gameId === game.id && d.sourceId === r.id);
              const rPct = rdl && rdl.totalBytes > 0 ? Math.min(100, (rdl.downloadedBytes / rdl.totalBytes) * 100) : 0;
              const rStatus = rdl?.status;
              const rInstalled = !!rdl?.libraryGameId;
              const status = repackAvailability(r);
              const isNew = Date.now() - new Date(r.createdAt).getTime() < 14 * 86_400_000; // < 14 days
              const isLastDownloaded = rStatus === "completed";

              return (
                <button
                  key={r.id}
                  className="repacks-modal__repack-button"
                  onClick={async () => {
                    if (rInstalled) return;
                    if (rStatus === "downloading") {
                      onPause(game.id, r.id);
                    } else if (rStatus === "paused") {
                      onResume(game.id, r.id);
                    } else if (rStatus === "completed") {
                      onInstall(game.id, r.id, game.title);
                    } else {
                      const installDir = await onPickInstallDir();
                      onDownload(game, r.id, installDir);
                    }
                  }}
                >
                  <span
                    className={`repacks-modal__availability-orb repacks-modal__availability-orb--${status}`}
                    title={`Source is ${status}`}
                  />
                  <div className="repacks-modal__repack-content">
                    <div className="repacks-modal__repack-title">
                      {r.title}
                      {isNew && <span className="repacks-modal__new-badge">New</span>}
                      {isLastDownloaded && <span className="repacks-modal__last-badge">Last downloaded</span>}
                      {rInstalled && <span className="repacks-modal__installed-badge">Installed</span>}
                    </div>
                    <div className="repacks-modal__repack-info">
                      {formatBytes(r.fileSize)} - {r.downloadSourceName} - {formatDate(r.uploadDate)}
                    </div>
                    {rdl && rStatus !== "completed" && rStatus !== "cancelled" && (
                      <div className="repacks-modal__repack-progress">
                        <div className="repacks-modal__progress-bar">
                          <div className={rStatus === "downloading" ? "fill-active" : "fill-paused"} style={{ width: `${rPct}%` }} />
                        </div>
                        <div className="repacks-modal__progress-meta">
                          <span>
                            {formatBytes(rdl.downloadedBytes)} / {formatBytes(rdl.totalBytes)}
                            {rStatus === "downloading" && rdl.speedBps > 0 && <span className="speed"> · {formatBytes(rdl.speedBps)}/s</span>}
                          </span>
                          <span>{rPct.toFixed(1)}%</span>
                        </div>
                      </div>
                    )}
                    {rStatus === "completed" && !rInstalled && (
                      <div className="repacks-modal__repack-done">Ready to install — click to install</div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// Stub for the toast fn reference used inside RepacksModal
function toast(type: "success" | "error" | "info", title: string, desc?: string) {
  void type; void title; void desc;
}

// ============ Downloads tab (Hydra-style with 3 sections) ============

interface DownloadsTabProps {
  downloads: DownloadEntry[];
  onRefresh: () => void;
  onOpenStore: () => void;
  onLibraryChanged: () => void;
  toast: (type: "success" | "error" | "info", title: string, desc?: string) => void;
}

export function DownloadsTab({ downloads, onRefresh, onOpenStore, onLibraryChanged, toast }: DownloadsTabProps) {
  // Bucket downloads into 3 sections (Hydra-style)
  const inProgress = downloads.filter((d) => d.status === "downloading" || d.status === "paused");
  const queued = downloads.filter((d) => d.status === "queued");
  const completed = downloads.filter((d) => d.status === "completed");
  const failed = downloads.filter((d) => d.status === "failed");
  const cancelled = downloads.filter((d) => d.status === "cancelled");

  // Active download = first in-progress (Hydra shows this in the HeroDownloadView)
  const activeDownload = inProgress[0];

  const completedBytes = completed.reduce((sum, d) => sum + d.totalBytes, 0);

  return (
    <div className="downloads-page">
      <div className="downloads-page__header">
        <h1>Downloads</h1>
        <div className="downloads-page__stats">
          <div className="dl-stat-pill">
            <Icon.Download size={12} /> {inProgress.length} active
          </div>
          <div className="dl-stat-pill">
            <Icon.Check size={12} /> {completed.length} completed
          </div>
          <div className="dl-stat-pill">
            <Icon.HardDrive size={12} /> {formatBytes(completedBytes)} downloaded
          </div>
          {failed.length > 0 && (
            <div className="dl-stat-pill dl-stat-pill--failed">
              <Icon.Close size={12} /> {failed.length} failed
            </div>
          )}
        </div>
      </div>

      {downloads.length === 0 ? (
        <div className="downloads-empty">
          <div className="downloads-empty__icon"><Icon.Download size={28} /></div>
          <h3>No downloads</h3>
          <p>Browse the catalogue and start downloading a game.</p>
          <button className="btn btn-primary" onClick={onOpenStore}>
            <Icon.Store size={14} /> Browse Catalogue
          </button>
        </div>
      ) : (
        <div className="downloads-page__body">
          {/* Active download — HeroDownloadView */}
          {activeDownload && (
            <section className="download-group">
              <h2 className="download-group__title">Download in progress</h2>
              <HeroDownloadView
                entry={activeDownload}
                onRefresh={onRefresh}
                onLibraryChanged={onLibraryChanged}
                toast={toast}
              />
            </section>
          )}

          {/* Queued */}
          {(queued.length > 0 || failed.length > 0 || cancelled.length > 0) && (
            <section className="download-group">
              <h2 className="download-group__title">Queued / paused / failed</h2>
              <div className="download-group__list">
                {queued.map((d) => (
                  <DownloadListRow key={d.key} entry={d} onRefresh={onRefresh} onLibraryChanged={onLibraryChanged} toast={toast} />
                ))}
                {inProgress.slice(1).map((d) => (
                  <DownloadListRow key={d.key} entry={d} onRefresh={onRefresh} onLibraryChanged={onLibraryChanged} toast={toast} />
                ))}
                {failed.map((d) => (
                  <DownloadListRow key={d.key} entry={d} onRefresh={onRefresh} onLibraryChanged={onLibraryChanged} toast={toast} />
                ))}
                {cancelled.map((d) => (
                  <DownloadListRow key={d.key} entry={d} onRefresh={onRefresh} onLibraryChanged={onLibraryChanged} toast={toast} />
                ))}
              </div>
            </section>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <section className="download-group">
              <h2 className="download-group__title">Downloads completed</h2>
              <div className="download-group__list">
                {completed.map((d) => (
                  <DownloadListRow key={d.key} entry={d} onRefresh={onRefresh} onLibraryChanged={onLibraryChanged} toast={toast} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <div className="downloads-page__footer">
        {completed.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={async () => { await window.nexus.clearCompletedDownloads(); onRefresh(); toast("success", "Cleared completed downloads"); }}>
            <Icon.Trash size={12} /> Clear completed
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={onOpenStore}>
          <Icon.Store size={12} /> Browse Store
        </button>
      </div>
    </div>
  );
}

// ============ HeroDownloadView (the big hero card for the active download) ============

function HeroDownloadView({
  entry,
  onRefresh,
  onLibraryChanged,
  toast,
}: {
  entry: DownloadEntry;
  onRefresh: () => void;
  onLibraryChanged: () => void;
  toast: (type: "success" | "error" | "info", title: string, desc?: string) => void;
}) {
  const pct = entry.totalBytes > 0 ? Math.min(100, (entry.downloadedBytes / entry.totalBytes) * 100) : 0;
  const eta = entry.status === "downloading" && entry.speedBps > 0
    ? Math.max(0, (entry.totalBytes - entry.downloadedBytes) / entry.speedBps)
    : 0;
  const isDownloading = entry.status === "downloading";
  const isPaused = entry.status === "paused";

  return (
    <div className="hero-download">
      {/* Blurred hero background */}
      {entry.coverImage && (
        <div className="hero-download__bg">
          <img src={entry.coverImage} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          <div className="hero-download__bg-overlay" />
        </div>
      )}

      <div className="hero-download__content">
        {/* Logo / title */}
        <div className="hero-download__header">
          {entry.coverImage ? (
            <img className="hero-download__logo" src={entry.coverImage} alt={entry.gameTitle} onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          ) : (
            <div className="hero-download__logo-proc">{entry.gameTitle.slice(0, 2).toUpperCase()}</div>
          )}
          <div className="hero-download__title-block">
            <h3 className="hero-download__title">{entry.gameTitle}</h3>
            <span className="hero-download__source">{entry.sourceLabel}</span>
          </div>
        </div>

        {/* Progress row */}
        <div className="hero-download__progress-row">
          <div className="hero-download__status">
            {isDownloading ? "Downloading" : isPaused ? "Paused" : entry.status}
          </div>
          <div className="hero-download__bytes">
            {formatBytes(entry.downloadedBytes)} / {formatBytes(entry.totalBytes)}
          </div>
          <div className="hero-download__eta">
            {isDownloading && entry.speedBps > 0 ? (
              <>
                <Icon.Clock size={11} /> {formatEta(eta)} left
              </>
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="hero-download__pct">
            {pct.toFixed(1)}%
          </div>
        </div>

        {/* Big progress bar */}
        <div className="hero-download__progress-bar">
          <div
            className={isDownloading ? "fill-active" : "fill-paused"}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Action buttons + stats */}
        <div className="hero-download__actions-row">
          <div className="hero-download__actions">
            {isDownloading && (
              <button
                className="hero-download__glass-btn"
                onClick={async () => { await window.nexus.pauseDownload(entry.gameId, entry.sourceId); onRefresh(); }}
                title="Pause"
              >
                <Icon.Play size={14} /> Pause
              </button>
            )}
            {isPaused && (
              <button
                className="hero-download__glass-btn"
                onClick={async () => { await window.nexus.resumeDownload(entry.gameId, entry.sourceId); onRefresh(); }}
                title="Resume"
              >
                <Icon.Play size={14} /> Resume
              </button>
            )}
            <button
              className="hero-download__glass-btn hero-download__glass-btn--cancel"
              onClick={async () => { await window.nexus.cancelDownload(entry.gameId, entry.sourceId); onRefresh(); toast("info", "Download cancelled"); }}
              title="Cancel"
            >
              <Icon.Close size={14} /> Cancel
            </button>
          </div>
          <div className="hero-download__stats">
            {isDownloading && entry.speedBps > 0 && (
              <>
                <div className="hero-download__stat">
                  <Icon.Download size={11} /> <span>Network</span> <strong>{formatBytes(entry.speedBps)}/s</strong>
                </div>
              </>
            )}
            <div className="hero-download__stat">
              <Icon.HardDrive size={11} /> <span>Downloaded</span> <strong>{formatBytes(entry.downloadedBytes)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ DownloadListRow (for queued / completed) ============

function DownloadListRow({
  entry,
  onRefresh,
  onLibraryChanged,
  toast,
}: {
  entry: DownloadEntry;
  onRefresh: () => void;
  onLibraryChanged: () => void;
  toast: (type: "success" | "error" | "info", title: string, desc?: string) => void;
}) {
  const pct = entry.totalBytes > 0 ? Math.min(100, (entry.downloadedBytes / entry.totalBytes) * 100) : 0;
  const isCompleted = entry.status === "completed";
  const isInstalled = !!entry.libraryGameId;
  const isDownloading = entry.status === "downloading";
  const isPaused = entry.status === "paused";
  const isFailed = entry.status === "failed";

  return (
    <div className={`download-list-row ${entry.status}`}>
      <div className="download-list-row__cover">
        {entry.coverImage ? (
          <img src={entry.coverImage} alt={entry.gameTitle} onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
        ) : (
          <div className="download-list-row__cover-proc">{entry.gameTitle.slice(0, 2).toUpperCase()}</div>
        )}
      </div>
      <div className="download-list-row__main">
        <div className="download-list-row__title-row">
          <span className="download-list-row__title">{entry.gameTitle}</span>
          <span className="download-list-row__source">{entry.sourceLabel}</span>
          {isInstalled && <span className="download-list-row__badge download-list-row__badge--installed">In Library</span>}
          {isCompleted && !isInstalled && <span className="download-list-row__badge download-list-row__badge--ready">Ready to install</span>}
          {isFailed && <span className="download-list-row__badge download-list-row__badge--failed">Failed</span>}
        </div>
        {/* Progress bar (small) */}
        {!isCompleted && (
          <div className="download-list-row__progress-bar">
            <div
              className={isDownloading ? "fill-active" : isPaused ? "fill-paused" : isFailed ? "fill-failed" : "fill-other"}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <div className="download-list-row__meta">
          {isCompleted ? (
            <span>Completed {relativeTime(entry.completedAt)}</span>
          ) : (
            <span>
              {formatBytes(entry.downloadedBytes)} / {formatBytes(entry.totalBytes)}
              {isDownloading && entry.speedBps > 0 && <span className="speed"> · {formatBytes(entry.speedBps)}/s</span>}
              {isPaused && <span className="paused"> · paused</span>}
            </span>
          )}
          <span className="download-list-row__pct">{pct.toFixed(0)}%</span>
        </div>
      </div>
      <div className="download-list-row__actions">
        {isCompleted && !isInstalled && (
          <button
            className="dl-action install"
            title="Install to library"
            onClick={async () => {
              const res = await window.nexus.installDownload(entry.gameId, entry.sourceId);
              if (res.ok) {
                toast("success", `${entry.gameTitle} installed`, "Now appears in your library.");
                onRefresh();
                onLibraryChanged();
              } else {
                toast("error", "Install failed", res.error ?? "Unknown error");
              }
            }}
          >
            <Icon.Download size={12} /> Install
          </button>
        )}
        {isInstalled && (
          <button className="dl-action open-lib" title="Open Library" onClick={onLibraryChanged}>
            <Icon.Library size={12} /> Library
          </button>
        )}
        {isCompleted && entry.installPath && (
          <button
            className="dl-action folder"
            title="Open folder"
            onClick={() => window.nexus.openDownloadFolder(entry.gameId, entry.sourceId)}
          >
            <Icon.Folder size={12} />
          </button>
        )}
        {isDownloading && (
          <button
            className="dl-action pause"
            title="Pause"
            onClick={async () => { await window.nexus.pauseDownload(entry.gameId, entry.sourceId); onRefresh(); }}
          >
            <Icon.Play size={12} />
          </button>
        )}
        {isPaused && (
          <button
            className="dl-action resume"
            title="Resume"
            onClick={async () => { await window.nexus.resumeDownload(entry.gameId, entry.sourceId); onRefresh(); }}
          >
            <Icon.Play size={12} />
          </button>
        )}
        {isFailed && (
          <button
            className="dl-action retry"
            title="Retry"
            onClick={async () => { await window.nexus.resumeDownload(entry.gameId, entry.sourceId); onRefresh(); }}
          >
            <Icon.Download size={12} />
          </button>
        )}
        <button
          className="dl-action cancel"
          title="Cancel"
          onClick={async () => { await window.nexus.cancelDownload(entry.gameId, entry.sourceId); onRefresh(); }}
        >
          <Icon.Close size={12} />
        </button>
        <button
          className="dl-action remove"
          title="Remove record"
          onClick={async () => { await window.nexus.removeDownload(entry.gameId, entry.sourceId); onRefresh(); }}
        >
          <Icon.Trash size={12} />
        </button>
      </div>
    </div>
  );
}
