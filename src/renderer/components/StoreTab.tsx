// NEXUS Store — real Hydra-style downloads for the Electron app.
//
// Replaces the old RAWG-browsing "Add to Library" StoreTab. The new store:
//   - Shows a curated catalog of free / open-source games
//   - Each game exposes multiple download sources (Official / GOG / FitGirl / …)
//   - Clicking Download kicks off a real byte-stream to disk via the main
//     process download manager (pause / resume / cancel all supported)
//   - On completion the game is auto-added to the local library

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StoreGame, StoreSortKey } from "@shared/store-catalog";
import { STORE_SORT_LABELS } from "@shared/store-catalog";
import type { DownloadEntry } from "../../main/preload";
import { Icon } from "./Icons";

interface StoreTabProps {
  toast: (type: "success" | "error" | "info", title: string, desc?: string) => void;
  onLibraryChanged: () => void;
  onOpenDownloads: () => void;
  downloads: DownloadEntry[];
  onDownloadsChanged: () => void;
}

type Category = "trending" | "recent" | "rating" | "size" | "name";

export function StoreTab({ toast, onLibraryChanged, onOpenDownloads, downloads, onDownloadsChanged }: StoreTabProps) {
  const [games, setGames] = useState<StoreGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState<Category>("trending");
  const [genres, setGenres] = useState<string[]>([]);
  const [detailGame, setDetailGame] = useState<StoreGame | null>(null);

  // Load catalog + genres on mount
  useEffect(() => {
    void window.nexus.storeGenres().then(setGenres).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.nexus.storeCatalog({ query, genre, sort });
      setGames(list);
    } catch (e) {
      toast("error", "Failed to load store", e instanceof Error ? e.message : String(e));
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [query, genre, sort, toast]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 250);
    return () => clearTimeout(t);
  }, [refresh]);

  const handleDownload = useCallback(
    async (game: StoreGame, sourceId: string, installDir?: string) => {
      try {
        await window.nexus.startDownload(game.id, sourceId, installDir);
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

  const handlePickInstallDir = useCallback(async (): Promise<string | undefined> => {
    const res = await window.nexus.pickInstallDir();
    return res.ok && res.path ? res.path : undefined;
  }, []);

  return (
    <div className="store-wrap">
      {/* Hero banner */}
      <div className="store-hero">
        <div className="store-hero-glow" />
        <div className="store-hero-content">
          <div className="store-hero-badge">
            <Icon.Sparkles size={12} /> NEXUS STORE · FREE FOREVER
          </div>
          <h1 className="store-hero-title">Download real games.</h1>
          <p className="store-hero-sub">
            Curated free &amp; open-source titles. Pick a source, hit download — the file streams
            straight to your disk with full progress, pause and resume support.
          </p>
        </div>
      </div>

      {/* Search + filters bar */}
      <div className="store-bar">
        <div className="store-search">
          <Icon.Search size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the NEXUS Store…"
          />
        </div>
        <select className="store-select" value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          className="store-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as Category)}
        >
          {(Object.keys(STORE_SORT_LABELS) as StoreSortKey[]).map((k) => (
            <option key={k} value={k}>
              {STORE_SORT_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {/* Catalog grid */}
      <div className="store-grid-wrap">
        {loading && games.length === 0 ? (
          <div className="store-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="store-card shimmer" style={{ height: 320, borderRadius: 12 }} />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="store-empty">
            <Icon.Search size={28} />
            <h3>No games found</h3>
            <p>{query ? `No matches for "${query}".` : "Try a different genre or sort."}</p>
          </div>
        ) : (
          <div className="store-grid">
            {games.map((g, i) => (
              <StoreCard
                key={g.id}
                game={g}
                index={i}
                downloads={downloads}
                onOpen={() => setDetailGame(g)}
                onDownload={handleDownload}
                onPause={handlePause}
                onResume={handleResume}
                onPickInstallDir={handlePickInstallDir}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      {detailGame && (
        <StoreGameDialog
          game={detailGame}
          downloads={downloads}
          onClose={() => setDetailGame(null)}
          onDownload={handleDownload}
          onPause={handlePause}
          onResume={handleResume}
          onCancel={handleCancel}
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

// ===== Store card =====

interface StoreCardProps {
  game: StoreGame;
  index: number;
  downloads: DownloadEntry[];
  onOpen: () => void;
  onDownload: (game: StoreGame, sourceId: string, installDir?: string) => void;
  onPause: (gameId: string, sourceId: string) => void;
  onResume: (gameId: string, sourceId: string) => void;
  onPickInstallDir: () => Promise<string | undefined>;
}

function StoreCard({ game, index, downloads, onOpen, onDownload, onPause, onResume }: StoreCardProps) {
  // Any download (any source) for this game
  const dl = downloads.find((d) => d.gameId === game.id);
  const pct = dl && dl.totalBytes > 0 ? Math.min(100, (dl.downloadedBytes / dl.totalBytes) * 100) : 0;
  const inLibrary = !!dl?.libraryGameId;

  const handleQuick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const source = game.sources[0];
    if (!source) return;
    if (dl?.status === "downloading") onPause(game.id, source.id);
    else if (dl?.status === "paused") onResume(game.id, source.id);
    else if (dl?.status === "completed") return;
    else onDownload(game, source.id);
  };

  return (
    <div
      className="store-card"
      style={{ animationDelay: `${Math.min(index * 25, 400)}ms` }}
      onClick={onOpen}
    >
      {/* Cover */}
      <div className="store-card-cover">
        {game.coverImage ? (
          <img src={game.coverImage} alt={game.title} loading="lazy" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
        ) : (
          <div className="store-card-proc">
            <span>{game.title.slice(0, 2).toUpperCase()}</span>
          </div>
        )}

        {/* License badge */}
        <div className="store-card-license">
          {game.license === "open-source" ? "OPEN SOURCE" : game.license.toUpperCase()}
        </div>

        {/* Rating */}
        {game.rating > 0 && (
          <div className="store-card-rating">
            <Icon.Star size={10} filled />
            {game.rating.toFixed(1)}
          </div>
        )}

        {/* In Library badge */}
        {inLibrary && (
          <div className="store-card-installed">
            <Icon.Check size={10} /> In Library
          </div>
        )}

        {/* Hover download button */}
        {!dl && (
          <div className="store-card-overlay">
            <button className="store-card-quickbtn" onClick={handleQuick} title={`Download ${game.sources[0]?.label ?? ""}`}>
              <Icon.Download size={18} />
            </button>
          </div>
        )}

        {/* Active download progress overlay */}
        {dl && dl.status !== "completed" && (
          <div className="store-card-progress">
            <div className="store-card-progress-bar">
              <div
                className={dl.status === "downloading" ? "fill-active" : dl.status === "paused" ? "fill-paused" : "fill-other"}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="store-card-progress-pct">{pct.toFixed(0)}%</div>
          </div>
        )}

        {/* Completed checkmark */}
        {dl?.status === "completed" && (
          <div className="store-card-done">
            <Icon.Check size={20} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="store-card-body">
        <div className="store-card-title">{game.title}</div>
        <div className="store-card-meta">
          <span className="store-card-dev">{game.developer}</span>
          <span className="store-card-size">{formatBytes(game.sizeBytes)}</span>
        </div>
        <div className="store-card-actions">
          {dl && dl.status !== "completed" ? (
            <button
              className={dl.status === "downloading" ? "store-card-pause" : "store-card-resume"}
              onClick={handleQuick}
            >
              {dl.status === "downloading" ? (
                <>
                  <Icon.Play size={12} /> Pause
                </>
              ) : (
                <>
                  <Icon.Play size={12} /> Resume
                </>
              )}
            </button>
          ) : dl?.status === "completed" ? (
            <button className="store-card-installed-btn">
              <Icon.Check size={12} /> Installed
            </button>
          ) : (
            <button className="store-card-quick" onClick={handleQuick}>
              <Icon.Download size={12} /> Quick Download
            </button>
          )}
          <span className="store-card-sources">{game.sources.length} source{game.sources.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

// ===== Store detail dialog =====

interface StoreGameDialogProps {
  game: StoreGame;
  downloads: DownloadEntry[];
  onClose: () => void;
  onDownload: (game: StoreGame, sourceId: string, installDir?: string) => void;
  onPause: (gameId: string, sourceId: string) => void;
  onResume: (gameId: string, sourceId: string) => void;
  onCancel: (gameId: string, sourceId: string) => void;
  onOpenLibrary: () => void;
  onOpenDownloads: () => void;
  onPickInstallDir: () => Promise<string | undefined>;
  toast: (type: "success" | "error" | "info", title: string, desc?: string) => void;
}

const KIND_BADGES: Record<string, string> = {
  official: "Official",
  gog: "GOG",
  onlinefix: "OnlineFix",
  xatab: "Xatab",
  dodi: "DODI",
  fitgirl: "FitGirl",
  steamrip: "Steam-Rip",
};

function StoreGameDialog({
  game,
  downloads,
  onClose,
  onDownload,
  onPause,
  onResume,
  onCancel,
  onOpenLibrary,
  onPickInstallDir,
  toast,
}: StoreGameDialogProps) {
  const handleDownloadWithPicker = async (sourceId: string) => {
    const installDir = await onPickInstallDir();
    onDownload(game, sourceId, installDir);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide store-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Banner */}
        <div className="store-dialog-banner">
          {game.bannerImage || game.coverImage ? (
            <img src={game.bannerImage || game.coverImage} alt={game.title} onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          ) : null}
          <div className="store-dialog-banner-overlay" />
          <button className="modal-close" onClick={onClose}>
            <Icon.Close size={16} />
          </button>
          <div className="store-dialog-banner-content">
            <div className="store-dialog-badges">
              <span className="badge-os">
                {game.license === "open-source" ? "OPEN SOURCE" : game.license.toUpperCase()}
              </span>
              {game.rating > 0 && (
                <span className="badge-rating">
                  <Icon.Star size={10} filled /> {game.rating.toFixed(1)}
                </span>
              )}
              <span className="badge-size">
                <Icon.HardDrive size={10} /> {formatBytes(game.sizeBytes)}
              </span>
            </div>
            <h2 className="store-dialog-title">{game.title}</h2>
            <div className="store-dialog-sub">
              {game.developer} · Released {game.releaseDate.slice(0, 4)}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="store-dialog-body">
          <div className="store-dialog-main">
            <p className="store-dialog-desc">{game.description}</p>

            {/* Genres / tags */}
            <div className="store-dialog-tags">
              {game.genres.map((g) => (
                <span key={g} className="genre-tag">
                  {g}
                </span>
              ))}
              {game.tags.map((t) => (
                <span key={t} className="store-dialog-tag-dim">
                  {t}
                </span>
              ))}
            </div>

            {/* Sources */}
            <div className="store-dialog-sources-header">
              <span>Download Sources</span>
              <span className="store-dialog-sources-count">{game.sources.length} available</span>
            </div>
            <div className="store-dialog-sources">
              {game.sources.map((s) => {
                const dl = downloads.find((d) => d.gameId === game.id && d.sourceId === s.id);
                const pct = dl && dl.totalBytes > 0 ? Math.min(100, (dl.downloadedBytes / dl.totalBytes) * 100) : 0;
                const isRunning = dl?.status === "downloading";
                const isPaused = dl?.status === "paused";
                const isCompleted = dl?.status === "completed";
                const badge = KIND_BADGES[s.kind] ?? s.label;

                return (
                  <div
                    key={s.id}
                    className={`store-source ${isRunning ? "active" : isCompleted ? "done" : ""}`}
                  >
                    <div className="store-source-icon">
                      {isCompleted ? <Icon.Check size={14} /> : isRunning ? <Icon.Spinner size={14} /> : <Icon.Download size={14} />}
                    </div>
                    <div className="store-source-body">
                      <div className="store-source-row">
                        <span className="store-source-badge">{badge}</span>
                        <span className="store-source-quality">{s.quality}</span>
                      </div>
                      <div className="store-source-meta">
                        <span>
                          <Icon.HardDrive size={10} /> {formatBytes(s.sizeBytes)}
                        </span>
                        <span>{s.seeders.toLocaleString()} seeders</span>
                        <span>{relativeTime(s.uploadedAt)}</span>
                        <span>{s.languages.join(", ")}</span>
                      </div>
                      {/* Progress bar */}
                      {dl && dl.status !== "completed" && dl.status !== "cancelled" && (
                        <div className="store-source-progress">
                          <div className="store-source-progress-bar">
                            <div
                              className={isRunning ? "fill-active" : "fill-paused"}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="store-source-progress-meta">
                            <span>
                              {formatBytes(dl.downloadedBytes)} / {formatBytes(dl.totalBytes)}
                              {isRunning && dl.speedBps > 0 && (
                                <span className="speed"> · {formatBytes(dl.speedBps)}/s</span>
                              )}
                              {isPaused && <span className="paused"> · paused</span>}
                            </span>
                            <span>{pct.toFixed(1)}%</span>
                          </div>
                        </div>
                      )}
                      {isCompleted && (
                        <div className="store-source-done">
                          <Icon.Check size={10} /> Download complete · added to library
                        </div>
                      )}
                      {dl?.status === "failed" && (
                        <div className="store-source-failed">
                          <p>Failed: {dl.error}</p>
                          <button onClick={() => handleDownloadWithPicker(s.id)}>
                            <Icon.Download size={10} /> Retry
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="store-source-action">
                      {isCompleted ? (
                        <button
                          className="store-source-open"
                          onClick={() => {
                            toast("success", `${game.title} is in your library`);
                            onOpenLibrary();
                          }}
                        >
                          <Icon.Play size={12} /> Open Library
                        </button>
                      ) : isRunning ? (
                        <button className="store-source-pause" onClick={() => onPause(game.id, s.id)}>
                          <Icon.Play size={12} /> Pause
                        </button>
                      ) : (
                        <button
                          className="store-source-download"
                          onClick={() => {
                            if (isPaused) onResume(game.id, s.id);
                            else handleDownloadWithPicker(s.id);
                          }}
                        >
                          {isPaused ? (
                            <>
                              <Icon.Play size={12} /> Resume
                            </>
                          ) : (
                            <>
                              <Icon.Download size={12} /> Download
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar */}
          <div className="store-dialog-side">
            <div className="store-dialog-cover">
              {game.coverImage ? (
                <img src={game.coverImage} alt={game.title} onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
              ) : (
                <div className="store-dialog-cover-proc">
                  <span>{game.title.slice(0, 2).toUpperCase()}</span>
                </div>
              )}
            </div>
            <div className="store-dialog-meta">
              <MetaRow icon={<Icon.Building size={11} />} label="Developer" value={game.developer} />
              <MetaRow icon={<Icon.Tag size={11} />} label="Publisher" value={game.publisher} />
              <MetaRow icon={<Icon.Calendar size={11} />} label="Released" value={game.releaseDate} />
              <MetaRow
                icon={<Icon.Star size={11} />}
                label="Rating"
                value={`${game.rating.toFixed(1)} / 5 · ${game.ratingCount.toLocaleString()} votes`}
              />
              <MetaRow
                icon={<Icon.HardDrive size={11} />}
                label="Largest source"
                value={formatBytes(game.sizeBytes)}
              />
              <MetaRow icon={<Icon.Download size={11} />} label="Sources" value={`${game.sources.length} available`} />
            </div>
            <a
              className="store-dialog-official"
              href={game.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit official site <Icon.ExternalLink size={11} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="store-meta-row">
      <span className="store-meta-icon">{icon}</span>
      <div className="store-meta-body">
        <div className="store-meta-label">{label}</div>
        <div className="store-meta-value" title={value}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ===== Downloads tab =====

interface DownloadsTabProps {
  downloads: DownloadEntry[];
  onRefresh: () => void;
  onOpenStore: () => void;
  onLibraryChanged: () => void;
  toast: (type: "success" | "error" | "info", title: string, desc?: string) => void;
}

export function DownloadsTab({ downloads, onRefresh, onOpenStore, onLibraryChanged, toast }: DownloadsTabProps) {
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  const filtered = useMemo(() => {
    return downloads.filter((d) => {
      if (filter === "active")
        return d.status === "downloading" || d.status === "paused" || d.status === "queued" || d.status === "failed";
      if (filter === "completed") return d.status === "completed";
      return true;
    });
  }, [downloads, filter]);

  const activeCount = downloads.filter(
    (d) => d.status === "downloading" || d.status === "paused" || d.status === "queued",
  ).length;
  const completedCount = downloads.filter((d) => d.status === "completed").length;
  const failedCount = downloads.filter((d) => d.status === "failed").length;
  const completedBytes = downloads
    .filter((d) => d.status === "completed")
    .reduce((sum, d) => sum + d.totalBytes, 0);

  return (
    <div className="downloads-wrap">
      {/* Hero */}
      <div className="downloads-hero">
        <div className="downloads-hero-glow" />
        <div className="downloads-hero-content">
          <p className="downloads-hero-badge">DOWNLOAD MANAGER</p>
          <h1 className="downloads-hero-title">Downloads</h1>
          <p className="downloads-hero-sub">
            Real streaming downloads with pause, resume and cancel. Files land on your disk;
            completed games appear in your library automatically.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="downloads-stats">
        <div className="dl-stat">
          <div className="dl-stat-icon active">
            <Icon.Download size={14} />
          </div>
          <div className="dl-stat-body">
            <div className="dl-stat-value">{activeCount}</div>
            <div className="dl-stat-label">Active</div>
          </div>
        </div>
        <div className="dl-stat">
          <div className="dl-stat-icon done">
            <Icon.Check size={14} />
          </div>
          <div className="dl-stat-body">
            <div className="dl-stat-value">{completedCount}</div>
            <div className="dl-stat-label">Completed</div>
          </div>
        </div>
        <div className="dl-stat">
          <div className="dl-stat-icon size">
            <Icon.HardDrive size={14} />
          </div>
          <div className="dl-stat-body">
            <div className="dl-stat-value">{formatBytes(completedBytes)}</div>
            <div className="dl-stat-label">Downloaded</div>
          </div>
        </div>
        <div className="dl-stat">
          <div className="dl-stat-icon failed">
            <Icon.Info size={14} />
          </div>
          <div className="dl-stat-body">
            <div className="dl-stat-value">{failedCount}</div>
            <div className="dl-stat-label">Failed</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="downloads-toolbar">
        <div className="downloads-filters">
          {(["all", "active", "completed"] as const).map((f) => (
            <button
              key={f}
              className={filter === f ? "filter-pill active" : "filter-pill"}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "active" ? "Active" : "Completed"}
              <span className="filter-count">
                {f === "all"
                  ? downloads.length
                  : f === "active"
                    ? activeCount
                    : completedCount}
              </span>
            </button>
          ))}
        </div>
        <div className="downloads-actions">
          {completedCount > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await window.nexus.clearCompletedDownloads();
                onRefresh();
                toast("success", "Cleared completed downloads");
              }}
            >
              <Icon.Trash size={12} /> Clear completed
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={onOpenStore}>
            <Icon.Store size={12} /> Browse Store
          </button>
        </div>
      </div>

      {/* List */}
      <div className="downloads-list">
        {filtered.length === 0 ? (
          <div className="downloads-empty">
            <div className="downloads-empty-icon">
              <Icon.Download size={28} />
            </div>
            <h3>
              {filter === "completed"
                ? "No completed downloads yet"
                : filter === "active"
                  ? "No active downloads"
                  : "Download queue is empty"}
            </h3>
            <p>
              {filter === "completed"
                ? "Once a download finishes it'll show up here and be added to your library."
                : "Head to the Store, pick a game, and hit Download to start streaming real bytes to disk."}
            </p>
            <button className="btn btn-primary" onClick={onOpenStore}>
              <Icon.Store size={14} /> Browse Store
            </button>
          </div>
        ) : (
          filtered.map((d) => (
            <DownloadRow
              key={d.key}
              entry={d}
              onRefresh={onRefresh}
              onLibraryChanged={onLibraryChanged}
              toast={toast}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DownloadRow({
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
  const eta =
    entry.status === "downloading" && entry.speedBps > 0
      ? Math.max(0, (entry.totalBytes - entry.downloadedBytes) / entry.speedBps)
      : 0;

  return (
    <div className={`download-row ${entry.status}`}>
      <div className="download-row-cover">
        {entry.coverImage ? (
          <img src={entry.coverImage} alt={entry.gameTitle} onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
        ) : (
          <div className="download-row-cover-proc">{entry.gameTitle.slice(0, 2).toUpperCase()}</div>
        )}
      </div>
      <div className="download-row-main">
        <div className="download-row-title">
          <span>{entry.gameTitle}</span>
          <span className="download-row-source">{entry.sourceLabel}</span>
        </div>
        <div className="download-row-progress">
          <div className="download-row-bar">
            <div
              className={
                entry.status === "downloading"
                  ? "fill-active"
                  : entry.status === "paused"
                    ? "fill-paused"
                    : entry.status === "completed"
                      ? "fill-done"
                      : entry.status === "failed"
                        ? "fill-failed"
                        : "fill-other"
              }
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="download-row-meta">
            <span>
              {formatBytes(entry.downloadedBytes)} / {formatBytes(entry.totalBytes)}
              {entry.status === "downloading" && entry.speedBps > 0 && (
                <span className="speed"> · {formatBytes(entry.speedBps)}/s</span>
              )}
              {entry.status === "downloading" && eta > 0 && (
                <span className="eta"> · {formatEta(eta)} left</span>
              )}
            </span>
            <span className="download-row-pct">{pct.toFixed(1)}%</span>
          </div>
        </div>
        <div className="download-row-status">
          {entry.status === "completed" && entry.completedAt && (
            <>
              <Icon.Check size={10} /> Completed {relativeTime(new Date(entry.completedAt).toISOString())}
            </>
          )}
          {entry.status === "downloading" && (
            <>
              <Icon.Spinner size={10} /> Downloading…
            </>
          )}
          {entry.status === "paused" && (
            <>
              <Icon.Play size={10} /> Paused
            </>
          )}
          {entry.status === "failed" && (
            <>
              <Icon.Close size={10} /> Failed: {entry.error ?? "unknown error"}
            </>
          )}
          {entry.status === "queued" && (
            <>
              <Icon.Spinner size={10} /> Queued
            </>
          )}
          {entry.status === "cancelled" && "Cancelled"}
          {entry.libraryGameId && (
            <button
              className="download-row-open-lib"
              onClick={() => {
                onLibraryChanged();
                toast("success", `${entry.gameTitle} is in your library`);
              }}
            >
              <Icon.Library size={10} /> Open Library
            </button>
          )}
        </div>
      </div>
      <div className="download-row-actions">
        {entry.status === "downloading" && (
          <button
            className="dl-action pause"
            title="Pause"
            onClick={async () => {
              await window.nexus.pauseDownload(entry.gameId, entry.sourceId);
              onRefresh();
            }}
          >
            <Icon.Play size={12} />
          </button>
        )}
        {entry.status === "paused" && (
          <button
            className="dl-action resume"
            title="Resume"
            onClick={async () => {
              await window.nexus.resumeDownload(entry.gameId, entry.sourceId);
              onRefresh();
            }}
          >
            <Icon.Play size={12} />
          </button>
        )}
        {entry.status === "failed" && (
          <button
            className="dl-action retry"
            title="Retry"
            onClick={async () => {
              await window.nexus.resumeDownload(entry.gameId, entry.sourceId);
              onRefresh();
            }}
          >
            <Icon.Download size={12} />
          </button>
        )}
        {entry.status === "completed" && entry.installPath && (
          <button
            className="dl-action folder"
            title="Open folder"
            onClick={async () => {
              await window.nexus.openDownloadFolder(entry.gameId, entry.sourceId);
            }}
          >
            <Icon.Folder size={12} />
          </button>
        )}
        <button
          className="dl-action cancel"
          title="Cancel"
          onClick={async () => {
            await window.nexus.cancelDownload(entry.gameId, entry.sourceId);
            onRefresh();
          }}
        >
          <Icon.Close size={12} />
        </button>
        <button
          className="dl-action remove"
          title="Remove record"
          onClick={async () => {
            await window.nexus.removeDownload(entry.gameId, entry.sourceId);
            onRefresh();
          }}
        >
          <Icon.Trash size={12} />
        </button>
      </div>
    </div>
  );
}

// ===== Utilities =====

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

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
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

function formatEta(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
