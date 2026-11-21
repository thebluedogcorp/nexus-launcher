// E1 — Entertainment shell: the real local-media platform UI.
//
// Replaces the v9.3.0 media-browser placeholder with a full entertainment
// experience backed by REAL functionality:
//
//   • Onboarding (first run) — guided library setup.
//   • Dashboard — continue-watching + recently-added + per-library rails,
//     all from real IPC data.
//   • Library management — create/delete libraries, add/remove folders
//     (native picker), rescan, per-library grid with search + sort.
//   • Media detail — backdrop + poster + metadata + Play (in-app player via
//     nexus-media://) + Identify (TMDB search → pick → apply, all server-side).
//   • Server dashboard — create server configs (port + libraries + auth code),
//     Start/Stop with REAL status polling, real LAN URL display + QR (only
//     when running), port-conflict error feedback.
//   • Settings — Media Libraries / Server / Playback / Appearance / Metadata.
//     Appearance is wired to the existing theme system (presets + live
//     preview + persistence). Theme changes don't leak into Gaming — Gaming
//     applies its own theme on startup so a re-launch resets the gaming side.
//
// This component is rendered by MediaView (which keeps the original props
// signature so App.tsx stays compatible).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type {
  MediaItem,
  MediaLibrary,
  MediaLibraryCategory,
  MediaServerConfig,
  MediaServerStatus,
  MediaTmdbCandidate,
} from "@shared/types";
import { Icon } from "../Icons";
import { formatSize } from "../../lib/helpers";
import {
  listLibraries,
  createLibrary,
  deleteLibrary,
  addLibraryPath,
  removeLibraryPath,
  listMediaByLibrary,
  listTvShows,
  listEpisodes,
  listSeasons,
  scanLibrary,
  onMediaScanProgress,
  autoIdentifyMedia,
  searchTmdbForMedia,
  identifyMediaAs,
  listContinueWatching,
  listRecentlyAdded,
  recordProgress,
  getProgress,
  listServerConfigs,
  createServerConfig,
  deleteServerConfig,
  startMediaServer,
  stopMediaServer,
  getMediaServerStatus,
} from "../../lib/media-ipc";
import { MediaPlayer } from "./MediaPlayer";
import { useThemeStore } from "../../lib/theme-store";
import { applyTheme } from "../../lib/applyTheme";
import { DEFAULT_THEME } from "@shared/theme-types";

type Tab = "dashboard" | "libraries" | "servers" | "settings";

interface EntertainmentProps {
  settings?: { mediaPaths: string; mediaAccessCode: string } | null;
  onConfigure?: () => void;
  onBack?: () => void;
}

const CATEGORY_LABELS: Record<MediaLibraryCategory, string> = {
  movies: "Movies",
  tv: "TV Shows",
  anime: "Anime",
  documentaries: "Documentaries",
  personal: "Personal",
  custom: "Custom",
};
const CATEGORY_LIST: MediaLibraryCategory[] = ["movies", "tv", "anime", "documentaries", "personal", "custom"];

export function Entertainment({ onBack }: EntertainmentProps) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [libraries, setLibraries] = useState<MediaLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  // When the user picks a library or item, we render those as overlays over
  // the current tab (no separate route — keeps things simple).
  const [openLibrary, setOpenLibrary] = useState<MediaLibrary | null>(null);
  const [openItem, setOpenItem] = useState<MediaItem | null>(null);
  const [playingItem, setPlayingItem] = useState<MediaItem | null>(null);
  // Onboarding: shown only when there are no libraries + the user hasn't
  // dismissed the welcome screen.
  const [showOnboarding, setShowOnboarding] = useState(false);

  const refreshLibraries = useCallback(async () => {
    setLoading(true);
    try {
      const libs = await listLibraries();
      setLibraries(libs);
      if (libs.length === 0 && !localStorage.getItem("nx-ent-onboarded")) {
        setShowOnboarding(true);
      } else {
        setShowOnboarding(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshLibraries(); }, [refreshLibraries]);

  // If a library was open and got deleted/changed, drop it.
  useEffect(() => {
    if (openLibrary && !libraries.some((l) => l.id === openLibrary.id)) {
      setOpenLibrary(null);
    }
  }, [libraries, openLibrary]);

  if (showOnboarding) {
    return (
      <Onboarding
        onComplete={async () => {
          localStorage.setItem("nx-ent-onboarded", "1");
          setShowOnboarding(false);
          await refreshLibraries();
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="ent-page nx-ent-shell">
      <div className="ent-page-head nx-ent-head">
        <div>
          {onBack && (
            <button className="tb-logo nx-media-back" onClick={onBack} title="Back to mode selector" aria-label="Back">
              <Icon.ArrowLeft size={16} />
            </button>
          )}
          <div className="ent-page-label">
            <Icon.HardDrive size={11} />
            <span style={{ marginLeft: 6 }}>NEXUS Entertainment · local media server · streams only files on this machine</span>
          </div>
          <h1 className="ent-page-title">Entertainment</h1>
        </div>
        <div className="ent-page-side nx-ent-tabs">
          <TabBtn label="Dashboard" icon={<Icon.Home size={13} />} active={tab === "dashboard"} onClick={() => setTab("dashboard")} />
          <TabBtn label="Libraries" icon={<Icon.Library size={13} />} active={tab === "libraries"} onClick={() => setTab("libraries")} />
          <TabBtn label="Servers" icon={<Icon.Share size={13} />} active={tab === "servers"} onClick={() => setTab("servers")} />
          <TabBtn label="Settings" icon={<Icon.Settings size={13} />} active={tab === "settings"} onClick={() => setTab("settings")} />
        </div>
      </div>

      {loading ? (
        <div className="ent-empty"><Icon.Spinner size={28} /><p>Loading…</p></div>
      ) : tab === "dashboard" ? (
        <Dashboard
          libraries={libraries}
          onOpenLibrary={(l) => setOpenLibrary(l)}
          onOpenItem={(m) => setOpenItem(m)}
          onPlay={(m) => setPlayingItem(m)}
          refreshKey={libraries.length}
        />
      ) : tab === "libraries" ? (
        <LibraryManager libraries={libraries} onChange={refreshLibraries} onOpen={(l) => setOpenLibrary(l)} />
      ) : tab === "servers" ? (
        <ServerDashboard libraries={libraries} />
      ) : (
        <EntSettings libraries={libraries} onChange={refreshLibraries} />
      )}

      {openLibrary && (
        <LibraryDetail library={openLibrary} onBack={() => setOpenLibrary(null)} onOpenItem={(m) => setOpenItem(m)} />
      )}
      {openItem && !openLibrary && (
        <MediaDetailOverlay
          item={openItem}
          onClose={() => setOpenItem(null)}
          onPlay={(m) => setPlayingItem(m)}
          onUpdated={() => { /* could refresh rails */ }}
        />
      )}
      {openItem && openLibrary && (
        <MediaDetailOverlay
          item={openItem}
          onClose={() => setOpenItem(null)}
          onPlay={(m) => setPlayingItem(m)}
          onUpdated={() => { /* could refresh rails */ }}
        />
      )}
      {playingItem && <MediaPlayer item={playingItem} onClose={() => setPlayingItem(null)} />}
    </div>
  );
}

function TabBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button className={`nx-ent-tab${active ? " active" : ""}`} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  );
}

// ── Onboarding ──────────────────────────────────────────────────────────────

function Onboarding({ onComplete, onBack }: { onComplete: () => void; onBack?: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("Movies");
  const [category, setCategory] = useState<MediaLibraryCategory>("movies");
  const [paths, setPaths] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState<string | null>(null);
  const [libraryId, setLibraryId] = useState<number | null>(null);
  const [identifyStatus, setIdentifyStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickFolder = useCallback(async () => {
    const r = await window.nexus.pickFolder({ title: "Pick a media folder" });
    if (r.ok && r.path) {
      setPaths((prev) => Array.from(new Set([...prev, r.path as string])));
    }
  }, []);

  const handleCreate = useCallback(async () => {
    setError(null);
    if (!name.trim()) { setError("Name your library."); return; }
    if (paths.length === 0) { setError("Add at least one folder."); return; }
    try {
      const lib = await createLibrary(name.trim(), category);
      for (const p of paths) await addLibraryPath(lib.id, p);
      setLibraryId(lib.id);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [name, category, paths]);

  const handleScan = useCallback(async () => {
    if (libraryId === null) return;
    setScanning(true); setError(null);
    try {
      const summary = await scanLibrary(libraryId);
      setScanSummary(`Found ${summary.scanned} · added ${summary.added} · updated ${summary.updated} · removed ${summary.removed}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }, [libraryId]);

  const handleAutoIdentify = useCallback(async () => {
    if (libraryId === null) return;
    setScanning(true); setIdentifyStatus("Identifying…");
    try {
      // Auto-identify the first 10 unmatched items in the library.
      const items = await listMediaByLibrary(libraryId, { limit: 50 });
      let matched = 0, candidates = 0;
      for (const m of items.slice(0, 10)) {
        if (m.tmdbId) continue;
        const r = await autoIdentifyMedia(m.id);
        if (r.matched) matched++;
        else if (r.candidates.length > 0) candidates++;
      }
      setIdentifyStatus(`Auto-identified ${matched}. ${candidates} need manual review.`);
    } catch (e) {
      setIdentifyStatus("Identification failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setScanning(false);
    }
  }, [libraryId]);

  return (
    <div className="ent-page nx-ent-onboarding">
      <div className="ent-page-head">
        <div>
          {onBack && (
            <button className="tb-logo nx-media-back" onClick={onBack} title="Back"><Icon.ArrowLeft size={16} /></button>
          )}
          <div className="ent-page-label"><Icon.Sparkles size={11} /><span style={{ marginLeft: 6 }}>Welcome to NEXUS Entertainment</span></div>
          <h1 className="ent-page-title">Set up your library</h1>
        </div>
      </div>
      <div className="nx-ent-onboard-card">
        <ol className="nx-ent-steps">
          <li className={step === 1 ? "active" : step > 1 ? "done" : ""}>1. Pick folders</li>
          <li className={step === 2 ? "active" : step > 2 ? "done" : ""}>2. Name + categorize</li>
          <li className={step === 3 ? "active" : step > 3 ? "done" : ""}>3. Scan</li>
          <li className={step === 4 ? "active" : ""}>4. Identify (optional)</li>
        </ol>

        {step === 1 && (
          <div className="nx-ent-step-body">
            <p>Add the folders that hold your videos. Files stay where they are — NEXUS just indexes them.</p>
            <button className="nx-media-btn primary" onClick={() => void pickFolder()}><Icon.Folder size={14} /><span>Pick Folder</span></button>
            <ul className="nx-ent-paths">
              {paths.map((p) => <li key={p}>{p} <button className="nx-media-btn danger" onClick={() => setPaths(paths.filter((x) => x !== p))}><Icon.Trash size={12} /></button></li>)}
            </ul>
            <div className="nx-ent-step-actions">
              <button className="nx-media-btn" disabled={paths.length === 0} onClick={() => setStep(2)}>Next →</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="nx-ent-step-body">
            <p>Name this library and pick what kind of media it holds.</p>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Movies" />
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as MediaLibraryCategory)}>
              {CATEGORY_LIST.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
            {error && <p className="nx-ent-error">{error}</p>}
            <div className="nx-ent-step-actions">
              <button className="nx-media-btn" onClick={() => setStep(1)}>← Back</button>
              <button className="nx-media-btn primary" onClick={() => void handleCreate()}>Create + continue →</button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="nx-ent-step-body">
            <p>Scan the folders you added. NEXUS indexes every video file (mp4, mkv, webm, …) — TV episodes are detected from S01E01 / 1x01 patterns.</p>
            <button className="nx-media-btn primary" disabled={scanning} onClick={() => void handleScan()}>
              {scanning ? <Icon.Spinner size={14} /> : <Icon.Scan size={14} />}<span>{scanning ? "Scanning…" : "Scan Now"}</span>
            </button>
            {scanSummary && <p className="nx-ent-success">{scanSummary}</p>}
            {error && <p className="nx-ent-error">{error}</p>}
            <div className="nx-ent-step-actions">
              <button className="nx-media-btn" onClick={() => setStep(4)}>Skip / Next →</button>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="nx-ent-step-body">
            <p>Optionally auto-identify your movies + shows against TMDB (poster, overview, year, genres). The TMDB API key stays on this PC — never sent anywhere.</p>
            <button className="nx-media-btn primary" disabled={scanning} onClick={() => void handleAutoIdentify()}>
              {scanning ? <Icon.Spinner size={14} /> : <Icon.Wand size={14} />}<span>{scanning ? "Identifying…" : "Auto-Identify"}</span>
            </button>
            {identifyStatus && <p className="nx-ent-success">{identifyStatus}</p>}
            <div className="nx-ent-step-actions">
              <button className="nx-media-btn primary" onClick={() => void onComplete()}>Finish →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard({
  libraries,
  onOpenLibrary,
  onOpenItem,
  onPlay,
  refreshKey,
}: {
  libraries: MediaLibrary[];
  onOpenLibrary: (l: MediaLibrary) => void;
  onOpenItem: (m: MediaItem) => void;
  onPlay: (m: MediaItem) => void;
  refreshKey: number;
}) {
  const [continueWatching, setContinueWatching] = useState<{ media: MediaItem; positionSec: number; durationSec: number | null }[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<MediaItem[]>([]);
  const [perLib, setPerLib] = useState<Array<{ library: MediaLibrary; items: MediaItem[] }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cw, ra] = await Promise.all([
          listContinueWatching(12),
          listRecentlyAdded(24),
        ]);
        if (cancelled) return;
        setContinueWatching(cw);
        setRecentlyAdded(ra);
        // One rail per library — load the first 24 items in each.
        const libItems = await Promise.all(
          libraries.map(async (l) => ({ library: l, items: await listMediaByLibrary(l.id, { limit: 24 }) })),
        );
        if (cancelled) return;
        setPerLib(libItems);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [libraries, refreshKey]);

  if (loading) {
    return <div className="ent-empty"><Icon.Spinner size={28} /><p>Loading your library…</p></div>;
  }

  if (libraries.length === 0) {
    return (
      <div className="ent-empty">
        <Icon.Library size={36} />
        <p>No libraries yet</p>
        <span>Create a library in the Libraries tab to get started.</span>
      </div>
    );
  }

  return (
    <div className="nx-ent-dashboard">
      {continueWatching.length > 0 && (
        <Rail
          title="Continue Watching"
          icon={<Icon.History size={14} />}
          items={continueWatching.map((c) => c.media)}
          onOpen={onOpenItem}
          onPlay={onPlay}
          badge={(m) => {
            const c = continueWatching.find((x) => x.media.id === m.id);
            if (!c || !c.durationSec) return null;
            const pct = Math.min(100, Math.round((c.positionSec / c.durationSec) * 100));
            return <span className="nx-ent-progress-pill">{pct}%</span>;
          }}
        />
      )}
      <Rail title="Recently Added" icon={<Icon.Sparkles size={14} />} items={recentlyAdded} onOpen={onOpenItem} onPlay={onPlay} />
      {perLib.map(({ library, items }) => (
        <Rail
          key={library.id}
          title={library.name}
          subtitle={`${CATEGORY_LABELS[library.category]} · ${library.itemCount} items`}
          icon={<Icon.Library size={14} />}
          items={items}
          onOpen={onOpenItem}
          onPlay={onPlay}
          onHeaderClick={() => onOpenLibrary(library)}
        />
      ))}
    </div>
  );
}

function Rail({
  title,
  subtitle,
  icon,
  items,
  onOpen,
  onPlay,
  onHeaderClick,
  badge,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  items: MediaItem[];
  onOpen: (m: MediaItem) => void;
  onPlay: (m: MediaItem) => void;
  onHeaderClick?: () => void;
  badge?: (m: MediaItem) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section className="nx-ent-rail">
      <header className={onHeaderClick ? "nx-ent-rail-head clickable" : "nx-ent-rail-head"} onClick={onHeaderClick}>
        <span className="nx-ent-rail-ico">{icon}</span>
        <h3>{title}</h3>
        {subtitle && <span className="nx-ent-rail-sub">{subtitle}</span>}
      </header>
      <div className="nx-ent-rail-row">
        {items.slice(0, 24).map((m) => (
          <PosterCard key={m.id} item={m} onOpen={() => onOpen(m)} onPlay={() => onPlay(m)} badge={badge ? badge(m) : null} />
        ))}
      </div>
    </section>
  );
}

function PosterCard({ item, onOpen, onPlay, badge }: { item: MediaItem; onOpen: () => void; onPlay: () => void; badge?: React.ReactNode }) {
  const poster = item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : null;
  return (
    <div className="nx-ent-card" onClick={onOpen} title={item.title}>
      <div className="nx-ent-card-poster">
        {poster ? <img src={poster} alt={item.title} loading="lazy" /> : <div className="nx-ent-card-ph"><Icon.Film size={24} /></div>}
        <button className="nx-ent-card-play" onClick={(e) => { e.stopPropagation(); onPlay(); }} aria-label="Play">
          <Icon.Play size={14} />
        </button>
        {badge}
      </div>
      <div className="nx-ent-card-meta">
        <b>{item.title}</b>
        <span>{[item.year || "", item.mediaType === "tv" ? "TV" : item.mediaType === "movie" ? "Movie" : ""].filter(Boolean).join(" · ")}</span>
      </div>
    </div>
  );
}

// ── Library Manager ──────────────────────────────────────────────────────────

function LibraryManager({ libraries, onChange, onOpen }: { libraries: MediaLibrary[]; onChange: () => void; onOpen: (l: MediaLibrary) => void }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<MediaLibraryCategory>("movies");

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    await createLibrary(name.trim(), category);
    setName("");
    setCategory("movies");
    setCreating(false);
    onChange();
  }, [name, category, onChange]);

  return (
    <div className="nx-ent-libmgr">
      <div className="nx-ent-toolbar">
        <h2>Libraries</h2>
        <button className="nx-media-btn primary" onClick={() => setCreating(!creating)}>
          <Icon.Plus size={14} /><span>New Library</span>
        </button>
      </div>
      {creating && (
        <div className="nx-ent-create-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Library name" />
          <select value={category} onChange={(e) => setCategory(e.target.value as MediaLibraryCategory)}>
            {CATEGORY_LIST.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <button className="nx-media-btn primary" onClick={() => void handleCreate()} disabled={!name.trim()}><Icon.Check size={13} /><span>Create</span></button>
          <button className="nx-media-btn" onClick={() => setCreating(false)}>Cancel</button>
        </div>
      )}
      <div className="nx-ent-liblist">
        {libraries.length === 0 && <div className="ent-empty"><Icon.Library size={28} /><p>No libraries yet.</p></div>}
        {libraries.map((l) => (
          <LibraryRow key={l.id} library={l} onChange={onChange} onOpen={() => onOpen(l)} />
        ))}
      </div>
    </div>
  );
}

function LibraryRow({ library, onChange, onOpen }: { library: MediaLibrary; onChange: () => void; onOpen: () => void }) {
  const [paths, setPaths] = useState<string[]>(library.paths);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setPaths(library.paths); }, [library.paths]);

  const pickFolder = useCallback(async () => {
    const r = await window.nexus.pickFolder({ title: `Add folder to ${library.name}` });
    if (r.ok && r.path) {
      await addLibraryPath(library.id, r.path as string);
      setPaths((prev) => Array.from(new Set([...prev, r.path as string])));
      onChange();
    }
  }, [library.id, library.name, onChange]);

  const handleScan = useCallback(async () => {
    setScanning(true); setScanResult(null);
    try {
      const s = await scanLibrary(library.id);
      setScanResult(`Found ${s.scanned} · added ${s.added} · updated ${s.updated} · removed ${s.removed}`);
      onChange();
    } finally {
      setScanning(false);
    }
  }, [library.id, onChange]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete "${library.name}"? Files on disk are NOT touched.`)) return;
    await deleteLibrary(library.id);
    onChange();
  }, [library.id, library.name, onChange]);

  return (
    <div className="nx-ent-librow">
      <div className="nx-ent-librow-head">
        <button className="nx-ent-librow-open" onClick={onOpen}>
          <Icon.Library size={16} />
          <div>
            <b>{library.name}</b>
            <span>{CATEGORY_LABELS[library.category]} · {library.itemCount} items · {paths.length} folder{paths.length === 1 ? "" : "s"}</span>
          </div>
        </button>
        <div className="nx-ent-librow-actions">
          <button className="nx-media-btn" onClick={() => void handleScan()} disabled={scanning} title="Rescan">
            {scanning ? <Icon.Spinner size={13} /> : <Icon.Scan size={13} />}<span>Scan</span>
          </button>
          <button className="nx-media-btn" onClick={() => setExpanded(!expanded)} title="Manage folders">
            <Icon.Folder size={13} /><span>Folders</span>
          </button>
          <button className="nx-media-btn danger" onClick={() => void handleDelete()} title="Delete library">
            <Icon.Trash size={13} />
          </button>
        </div>
      </div>
      {scanResult && <p className="nx-ent-scan-result">{scanResult}</p>}
      {expanded && (
        <div className="nx-ent-librow-folders">
          <ul>
            {paths.length === 0 && <li className="nx-ent-no-paths">No folders yet — add one to start scanning.</li>}
            {paths.map((p) => (
              <li key={p}>
                <code>{p}</code>
                <button className="nx-media-btn danger" onClick={async () => {
                  await removeLibraryPath(library.id, p);
                  setPaths(paths.filter((x) => x !== p));
                  onChange();
                }}><Icon.Trash size={11} /></button>
              </li>
            ))}
          </ul>
          <button className="nx-media-btn primary" onClick={() => void pickFolder()}>
            <Icon.Plus size={13} /><span>Add Folder</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Library Detail (grid view) ───────────────────────────────────────────────

function LibraryDetail({ library, onBack, onOpenItem }: { library: MediaLibrary; onBack: () => void; onOpenItem: (m: MediaItem) => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"title" | "year" | "added" | "rating">("title");
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const opts: { q?: string; sort?: "title" | "year" | "added" | "rating"; mediaType?: "movie" | "tv" } = { sort };
      if (q.trim()) opts.q = q.trim();
      if (filter !== "all") opts.mediaType = filter;
      // For TV libraries we want shows; for movie libraries, movies. listMediaByLibrary
      // already excludes episode rows (tvShowId IS NULL).
      const list = await listMediaByLibrary(library.id, opts);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [library.id, q, sort, filter]);

  useEffect(() => {
    const t = setTimeout(() => { void refresh(); }, 200);
    return () => clearTimeout(t);
  }, [refresh]);

  return (
    <div className="nx-ent-libdetail-overlay">
      <div className="nx-ent-libdetail-bar">
        <button className="tb-logo nx-media-back" onClick={onBack}><Icon.ArrowLeft size={16} /></button>
        <h2>{library.name}</h2>
        <span className="nx-ent-libdetail-cat">{CATEGORY_LABELS[library.category]}</span>
        <div className="nx-ent-libdetail-tools">
          <div className="nx-media-search"><Icon.Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" /></div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as "all" | "movie" | "tv")}>
            <option value="all">All</option>
            <option value="movie">Movies</option>
            <option value="tv">TV</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as "title" | "year" | "added" | "rating")}>
            <option value="title">Title A–Z</option>
            <option value="year">Year</option>
            <option value="added">Recently added</option>
            <option value="rating">Rating</option>
          </select>
        </div>
      </div>
      {loading ? (
        <div className="ent-empty"><Icon.Spinner size={28} /><p>Loading…</p></div>
      ) : items.length === 0 ? (
        <div className="ent-empty"><Icon.Library size={32} /><p>No items match.</p></div>
      ) : (
        <div className="nx-ent-grid">
          {items.map((m) => <PosterCard key={m.id} item={m} onOpen={() => onOpenItem(m)} onPlay={() => onOpenItem(m)} />)}
        </div>
      )}
    </div>
  );
}

// ── Media Detail Overlay ──────────────────────────────────────────────────────

function MediaDetailOverlay({ item, onClose, onPlay, onUpdated }: { item: MediaItem; onClose: () => void; onPlay: (m: MediaItem) => void; onUpdated: () => void }) {
  const [current, setCurrent] = useState(item);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [activeSeason, setActiveSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<MediaItem[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const [identifyOpen, setIdentifyOpen] = useState(false);
  const [candidates, setCandidates] = useState<MediaTmdbCandidate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { setCurrent(item); }, [item]);

  // If it's a TV show row, load seasons.
  useEffect(() => {
    if (current.mediaType !== "tv" || current.tvShowId) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await listSeasons(current.id);
        if (cancelled) return;
        setSeasons(s);
        if (s.length > 0) setActiveSeason(s[0]);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [current]);

  // Load episodes for the active season.
  useEffect(() => {
    if (activeSeason === null) { setEpisodes([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const eps = await listEpisodes(current.id, activeSeason);
        if (!cancelled) setEpisodes(eps);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [current.id, activeSeason]);

  const handleAutoIdentify = useCallback(async () => {
    setIdentifying(true);
    try {
      const r = await autoIdentifyMedia(current.id);
      if (r.applied) setCurrent(r.applied);
      if (r.candidates.length > 0) {
        setCandidates(r.candidates);
        setSearchQuery(current.title);
        setIdentifyOpen(true);
      }
      onUpdated();
    } finally {
      setIdentifying(false);
    }
  }, [current, onUpdated]);

  const handleSearch = useCallback(async () => {
    setIdentifying(true);
    try {
      const results = await searchTmdbForMedia(searchQuery, current.mediaType ?? undefined);
      setCandidates(results);
    } finally {
      setIdentifying(false);
    }
  }, [searchQuery, current.mediaType]);

  const handlePick = useCallback(async (c: MediaTmdbCandidate) => {
    setIdentifying(true);
    try {
      const updated = await identifyMediaAs(current.id, c.tmdbId, c.mediaType);
      if (updated) setCurrent(updated);
      setIdentifyOpen(false);
      onUpdated();
    } finally {
      setIdentifying(false);
    }
  }, [current, onUpdated]);

  const backdrop = current.backdropPath ? `https://image.tmdb.org/t/p/w1280${current.backdropPath}` : null;
  const poster = current.posterPath ? `https://image.tmdb.org/t/p/w500${current.posterPath}` : null;

  return (
    <div className="nx-ent-detail-overlay" role="dialog" aria-modal="true">
      <div className="nx-ent-detail-bar">
        <button className="tb-logo nx-media-back" onClick={onClose}><Icon.ArrowLeft size={16} /></button>
        <span className="ent-player-badge">{current.container || current.mediaType || "?"}</span>
        <div className="ent-player-title">{current.title}</div>
        <button className="ent-player-close" onClick={onClose}><Icon.Close size={18} /></button>
      </div>
      <div className="nx-ent-detail-body">
        {backdrop && <div className="nx-ent-detail-backdrop" style={{ backgroundImage: `url(${backdrop})` }} />}
        <div className="nx-ent-detail-card">
          <div className="nx-ent-detail-poster">
            {poster ? <img src={poster} alt={current.title} /> : <div className="nx-ent-card-ph"><Icon.Film size={36} /></div>}
          </div>
          <div className="nx-ent-detail-meta">
            <h2>{current.title}</h2>
            <div className="nx-ent-detail-sub">
              {[current.year || "", current.runtimeMin ? `${current.runtimeMin}min` : "", current.rating ? `★ ${current.rating}` : ""].filter(Boolean).join(" · ")}
            </div>
            {current.genres.length > 0 && <div className="nx-ent-detail-genres">{current.genres.join(" · ")}</div>}
            <p className="nx-ent-detail-overview">{current.overview || "No description. Use Identify to fetch from TMDB."}</p>
            <div className="nx-ent-detail-actions">
              <button className="nx-media-btn primary" onClick={() => onPlay(current)} disabled={!current.container || (current.container === "tv" && current.fileSize === 0)}>
                <Icon.Play size={14} /><span>{current.tvShowId ? "Play Episode" : current.mediaType === "tv" && !current.tvShowId ? "Pick an episode below" : "Play"}</span>
              </button>
              <button className="nx-media-btn" onClick={() => void handleAutoIdentify()} disabled={identifying}>
                {identifying ? <Icon.Spinner size={13} /> : <Icon.Wand size={13} />}<span>Identify</span>
              </button>
              <button className="nx-media-btn" onClick={() => { setSearchQuery(current.title); setIdentifyOpen(!identifyOpen); }}>
                <Icon.Search size={13} /><span>Search TMDB</span>
              </button>
            </div>
          </div>
        </div>

        {current.mediaType === "tv" && !current.tvShowId && (
          <div className="nx-ent-detail-eps">
            <div className="nx-ent-detail-seasons">
              {seasons.map((s) => (
                <button key={s} className={`nx-ent-season${activeSeason === s ? " active" : ""}`} onClick={() => setActiveSeason(s)}>Season {s}</button>
              ))}
              {seasons.length === 0 && <p className="nx-ent-no-eps">No episodes scanned yet — add the show's episode files to your library folders and rescan.</p>}
            </div>
            <div className="nx-ent-ep-list">
              {episodes.map((ep) => (
                <div key={ep.id} className="nx-ent-ep" onClick={() => onPlay(ep)}>
                  <div className="nx-ent-ep-n">{ep.episode ?? "?"}</div>
                  <div className="nx-ent-ep-meta"><b>{ep.title}</b><span>{ep.overview ? ep.overview.slice(0, 140) + (ep.overview.length > 140 ? "…" : "") : ""}</span></div>
                  <div className="nx-ent-ep-runtime">{ep.runtimeMin ? `${ep.runtimeMin}min` : ""}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {identifyOpen && (
          <div className="nx-ent-identify-panel">
            <h3>Identify via TMDB</h3>
            <div className="nx-media-search">
              <Icon.Search size={14} />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search movies / TV…" />
              <button className="nx-media-btn primary" onClick={() => void handleSearch()} disabled={identifying}>
                {identifying ? <Icon.Spinner size={13} /> : <Icon.Search size={13} />}<span>Search</span>
              </button>
            </div>
            <div className="nx-ent-candidate-list">
              {candidates.length === 0 && <p className="nx-ent-no-eps">No results yet — search above.</p>}
              {candidates.map((c) => (
                <button key={`${c.mediaType}-${c.tmdbId}`} className="nx-ent-candidate" onClick={() => void handlePick(c)}>
                  {c.posterPath ? <img src={`https://image.tmdb.org/t/p/w185${c.posterPath}`} alt={c.title} /> : <div className="nx-ent-card-ph"><Icon.Film size={20} /></div>}
                  <div>
                    <b>{c.title}</b>
                    <span>{[c.year || "", c.mediaType].filter(Boolean).join(" · ")}</span>
                    <span>{c.overview ? c.overview.slice(0, 120) + (c.overview.length > 120 ? "…" : "") : ""}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Server Dashboard ──────────────────────────────────────────────────────

function ServerDashboard({ libraries }: { libraries: MediaLibrary[] }) {
  const [configs, setConfigs] = useState<MediaServerConfig[]>([]);
  const [statuses, setStatuses] = useState<Map<number, MediaServerStatus>>(new Map());
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Home Server");
  const [port, setPort] = useState(8181);
  const [selectedLibs, setSelectedLibs] = useState<Set<number>>(new Set());
  const [authCode, setAuthCode] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const refresh = useCallback(async () => {
    const list = await listServerConfigs();
    setConfigs(list);
    const sts = await Promise.all(list.map(async (c) => [c.id, await getMediaServerStatus(c.id)] as const));
    setStatuses(new Map(sts));
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Poll running server statuses every 2s so the UI reflects the real
  // http.Server.listening state (not a fake boolean).
  useEffect(() => {
    pollRef.current = setInterval(() => { void refresh(); }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    setError(null);
    if (selectedLibs.size === 0) { setError("Pick at least one library to expose."); return; }
    try {
      await createServerConfig(name.trim() || "Media Server", port, Array.from(selectedLibs), authCode.trim() || null);
      setName("Home Server"); setPort(8181); setSelectedLibs(new Set()); setAuthCode(""); setCreating(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [name, port, selectedLibs, authCode, refresh]);

  const handleStart = useCallback(async (id: number) => {
    setBusy(id); setError(null);
    try {
      const r = await startMediaServer(id);
      if (!r.ok) setError(r.error ?? "Failed to start");
      await refresh();
    } finally { setBusy(null); }
  }, [refresh]);

  const handleStop = useCallback(async (id: number) => {
    setBusy(id);
    try {
      await stopMediaServer(id);
      await refresh();
    } finally { setBusy(null); }
  }, [refresh]);

  return (
    <div className="nx-ent-servers">
      <div className="nx-ent-toolbar">
        <h2>Media Servers</h2>
        <button className="nx-media-btn primary" onClick={() => setCreating(!creating)}>
          <Icon.Plus size={14} /><span>New Server</span>
        </button>
      </div>
      {error && <p className="nx-ent-error">{error}</p>}
      {creating && (
        <div className="nx-ent-create-server">
          <h3>New server config</h3>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <label>Port</label>
          <input type="number" min={1024} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} />
          <label>Access code (optional)</label>
          <input value={authCode} onChange={(e) => setAuthCode(e.target.value)} placeholder="Leave blank for no auth" />
          <label>Libraries to expose</label>
          <div className="nx-ent-lib-checks">
            {libraries.length === 0 && <p>No libraries yet — create one first.</p>}
            {libraries.map((l) => (
              <label key={l.id} className="nx-ent-check">
                <input
                  type="checkbox"
                  checked={selectedLibs.has(l.id)}
                  onChange={(e) => {
                    setSelectedLibs((prev) => {
                      const n = new Set(prev);
                      if (e.target.checked) n.add(l.id); else n.delete(l.id);
                      return n;
                    });
                  }}
                />
                <span>{l.name} <small>({CATEGORY_LABELS[l.category]})</small></span>
              </label>
            ))}
          </div>
          <div className="nx-ent-step-actions">
            <button className="nx-media-btn primary" onClick={() => void handleCreate()}><Icon.Check size={13} /><span>Create</span></button>
            <button className="nx-media-btn" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="nx-ent-server-list">
        {configs.length === 0 && !creating && (
          <div className="ent-empty"><Icon.Share size={32} /><p>No server configs yet.</p><span>Create one to start streaming to your LAN.</span></div>
        )}
        {configs.map((c) => {
          const st = statuses.get(c.id) ?? { running: false, url: null, port: null, lanIp: null, startedAt: null, error: null };
          return (
            <ServerRow
              key={c.id}
              config={c}
              status={st}
              busy={busy === c.id}
              onStart={() => void handleStart(c.id)}
              onStop={() => void handleStop(c.id)}
              onDelete={async () => {
                if (!confirm(`Delete server "${c.name}"?`)) return;
                await deleteServerConfig(c.id); await refresh();
              }}
              libraries={libraries}
            />
          );
        })}
      </div>
    </div>
  );
}

function ServerRow({
  config,
  status,
  busy,
  onStart,
  onStop,
  onDelete,
  libraries,
}: {
  config: MediaServerConfig;
  status: MediaServerStatus;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
  libraries: MediaLibrary[];
}) {
  const exposedNames = config.libraryIds
    .map((id) => libraries.find((l) => l.id === id)?.name ?? `#${id}`)
    .join(", ");
  const url = status.url ?? `http://<lan-ip>:${config.port}`;
  return (
    <div className={`nx-ent-server-row${status.running ? " running" : ""}`}>
      <div className="nx-ent-server-head">
        <div>
          <span className={`nx-ent-status-dot ${status.running ? "on" : "off"}`} />
          <b>{config.name}</b>
          <span className="nx-ent-server-port">:{config.port}</span>
          {config.authCode && <span className="nx-ent-server-auth" title="Auth code set"><Icon.Lock size={11} /></span>}
        </div>
        <div className="nx-ent-server-actions">
          {status.running ? (
            <button className="nx-media-btn danger" onClick={onStop} disabled={busy}>{busy ? <Icon.Spinner size={13} /> : <Icon.Close size={13} />}<span>Stop</span></button>
          ) : (
            <button className="nx-media-btn primary" onClick={onStart} disabled={busy}>{busy ? <Icon.Spinner size={13} /> : <Icon.Play size={13} />}<span>Start</span></button>
          )}
          <button className="nx-media-btn danger" onClick={onDelete} title="Delete config"><Icon.Trash size={13} /></button>
        </div>
      </div>
      <div className="nx-ent-server-body">
        <div className="nx-ent-server-url-col">
          {/* REAL URL — only render the QR when the server is actually running. */}
          {status.running ? (
            <div className="nx-ent-server-qr">
              <QRCodeSVG value={url} size={140} level="M" />
              <p className="nx-ent-server-qr-cap">Scan to open on a LAN device</p>
            </div>
          ) : (
            <div className="nx-ent-server-qr nx-ent-server-qr-off">
              <Icon.Lock size={36} />
              <p>Server stopped</p>
              <p className="nx-ent-server-qr-cap">Start it to generate the QR.</p>
            </div>
          )}
          <div className="nx-ent-server-url-info">
            <label>URL</label>
            <code className="nx-ent-server-url">{url}</code>
            <button className="nx-media-btn" onClick={() => { try { navigator.clipboard.writeText(url); } catch { /* ignore */ } }}>
              <Icon.Tag size={12} /><span>Copy</span>
            </button>
            {status.running && (
              <button className="nx-media-btn" onClick={() => void window.nexus.openExternal(url)}>
                <Icon.ExternalLink size={12} /><span>Open</span>
              </button>
            )}
          </div>
        </div>
        <div className="nx-ent-server-meta">
          <p><b>Libraries exposed:</b> {exposedNames || "(none)"}</p>
          {config.authCode && <p><b>Access code:</b> <code>{config.authCode}</code></p>}
          {status.error && <p className="nx-ent-error"><b>Error:</b> {status.error}</p>}
          {status.startedAt && <p><b>Started:</b> {new Date(status.startedAt).toLocaleTimeString()}</p>}
          {!status.running && !status.error && <p className="nx-ent-server-stopped">Stopped.</p>}
        </div>
      </div>
    </div>
  );
}

// ── Entertainment Settings ───────────────────────────────────────────────────

function EntSettings({ libraries, onChange }: { libraries: MediaLibrary[]; onChange: () => void }) {
  const [section, setSection] = useState<"libraries" | "server" | "playback" | "appearance" | "metadata">("libraries");
  return (
    <div className="nx-ent-settings">
      <aside className="nx-ent-settings-nav">
        <button className={section === "libraries" ? "active" : ""} onClick={() => setSection("libraries")}>Media Libraries</button>
        <button className={section === "server" ? "active" : ""} onClick={() => setSection("server")}>Media Server</button>
        <button className={section === "playback" ? "active" : ""} onClick={() => setSection("playback")}>Playback</button>
        <button className={section === "appearance" ? "active" : ""} onClick={() => setSection("appearance")}>Appearance</button>
        <button className={section === "metadata" ? "active" : ""} onClick={() => setSection("metadata")}>Metadata</button>
      </aside>
      <div className="nx-ent-settings-body">
        {section === "libraries" && (
          <div>
            <p>Manage your libraries in the Libraries tab — this is just a read-only summary.</p>
            <ul className="nx-ent-settings-libs">
              {libraries.map((l) => (
                <li key={l.id}><b>{l.name}</b> · {CATEGORY_LABELS[l.category]} · {l.itemCount} items · {l.paths.length} folder{l.paths.length === 1 ? "" : "s"}</li>
              ))}
              {libraries.length === 0 && <li>No libraries yet.</li>}
            </ul>
            <button className="nx-media-btn" onClick={onChange}>Refresh</button>
          </div>
        )}
        {section === "server" && (
          <div>
            <p>Configure servers in the Servers tab. The server is a real Node http.Server bound to 0.0.0.0:&lt;port&gt; — LAN clients reach it at http://&lt;your-LAN-IP&gt;:&lt;port&gt;.</p>
            <p>The QR code in the Servers tab encodes that REAL URL — never a fake. It only renders when the server is actually running.</p>
          </div>
        )}
        {section === "playback" && (
          <div>
            <p>Resume + continue-watching are automatic. When you open a video you've partially watched, NEXUS seeks to your saved position. Progress is recorded every 5 seconds while playing + on close.</p>
            <p>Unsupported containers (MKV, AVI, FLV, WMV, TS, MPG, MPEG, M2TS) are shown with their file path so you can open them in your system media player. Transcoding is deferred.</p>
          </div>
        )}
        {section === "appearance" && <AppearanceSection />}
        {section === "metadata" && (
          <div>
            <p>TMDB identification runs entirely on this PC — the API key never leaves the main process. Auto-Identify searches TMDB by title + year + (for TV) season/episode, picks the best match by title similarity, and only commits when confidence is high. Low-confidence matches return candidates for manual review.</p>
            <p>Use the Identify button on any media detail page to manually pick a TMDB match.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AppearanceSection() {
  const store = useThemeStore();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void store.load().then(() => setLoaded(true));
  }, [store]);

  if (!loaded) {
    return <div className="ent-empty"><Icon.Spinner size={20} /><p>Loading themes…</p></div>;
  }
  return (
    <div>
      <p>Pick a built-in theme preset. It applies live to NEXUS Entertainment immediately. The deep visual customizer lives in the Theme Studio (Settings → Appearance in Games mode).</p>
      <p className="nx-ent-theme-note"><Icon.Info size={11} /> <span>Gaming applies its own theme on app startup, so changing the theme here won't break the Games mode on the next launch.</span></p>
      <div className="nx-ent-theme-grid">
        {store.themes.map((t) => (
          <button
            key={t.id}
            className={`nx-ent-theme-card${t.id === store.activeId ? " active" : ""}`}
            onClick={() => { void store.selectTheme(t.id); void store.commit(); }}
            style={{ background: (t.config.colors.bg ?? "#000"), color: (t.config.colors.text ?? "#fff"), borderColor: (t.config.colors.accent ?? "#888") }}
          >
            <span className="nx-ent-theme-swatch" style={{ background: (t.config.colors.accent ?? "#888") }} />
            <b>{t.name}</b>
            <small>{t.config.mode}{t.builtin ? " · built-in" : ""}</small>
          </button>
        ))}
      </div>
      <button className="nx-media-btn" onClick={() => applyTheme(DEFAULT_THEME)}>Reset to default</button>
    </div>
  );
}
