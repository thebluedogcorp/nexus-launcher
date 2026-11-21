// v9.3.0 (M1) — MediaView: the in-app local media server UI.
//
// Ported from the Next.js reference (src/components/media/media-view.tsx) to
// the Electron architecture:
//   • React Query + fetch("/api/media") → useEffect/useState + window.nexus.mediaList
//   • useMediaScan → window.nexus.mediaScan
//   • player src `/api/media/:id/stream` → `nexus-media://media/:id/stream`
//     (resolved via window.nexus.mediaStreamUrl, though the URL is stable and
//     can also be set directly).
//
// The library grid + scan button + share panel + player modal all live here.
// Only the user's own files are ever served — no third-party stream hosts.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaItem, MediaScanSummary } from "@shared/types";
import { Icon } from "../Icons";
import { formatSize } from "../../lib/helpers";
import { loadMedia, scanMedia, clearAllMedia } from "../../lib/media-ipc";
import { MediaPlayer } from "./MediaPlayer";
import { MediaShare } from "./MediaShare";

interface MediaViewProps {
  /** Current settings (so we know whether mediaPaths is empty). */
  settings: { mediaPaths: string; mediaAccessCode: string } | null;
  /** Navigate to the Settings → Media tab. */
  onConfigure: () => void;
  /** Return to the mode selector / games mode. */
  onBack?: () => void;
}

export function MediaView({ settings, onConfigure, onBack }: MediaViewProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [playing, setPlaying] = useState<MediaItem | null>(null);
  const [toast, setToast] = useState<{ kind: "info" | "success" | "error"; msg: string } | null>(null);

  const mediaPaths = settings?.mediaPaths ?? "";
  const hasPaths = mediaPaths.trim().length > 0;

  // Debounced reload: refetch when the query string settles (300ms) so we
  // don't spam IPC on every keystroke.
  const refresh = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const list = await loadMedia(q);
      setItems(list);
    } catch (e) {
      setToast({ kind: "error", msg: "Couldn't load media: " + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void refresh(query); }, 300);
    return () => clearTimeout(t);
  }, [query, refresh]);

  // Initial load.
  useEffect(() => { void refresh(""); }, [refresh]);

  const stats = useMemo(() => {
    const totalSize = items.reduce((a, m) => a + m.fileSize, 0);
    const dirs = new Set(items.map((m) => m.dir));
    return { count: items.length, totalSize, dirCount: dirs.size };
  }, [items]);

  const handleScan = useCallback(async () => {
    if (!hasPaths) {
      setToast({ kind: "error", msg: "No media paths configured — add folders in Settings → Media first." });
      return;
    }
    setScanning(true);
    try {
      const summary: MediaScanSummary = await scanMedia();
      setToast({
        kind: "success",
        msg: `Scan complete: ${summary.scanned} found · ${summary.added} added · ${summary.updated} updated · ${summary.removed} removed`,
      });
      await refresh(query);
    } catch (e) {
      setToast({ kind: "error", msg: "Scan failed: " + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setScanning(false);
    }
  }, [hasPaths, query, refresh]);

  const handleClear = useCallback(async () => {
    if (!confirm("Clear every media item from the library? Files on disk are NOT deleted.")) return;
    try {
      await clearAllMedia();
      await refresh(query);
      setToast({ kind: "success", msg: "Media library cleared." });
    } catch (e) {
      setToast({ kind: "error", msg: "Clear failed: " + (e instanceof Error ? e.message : String(e)) });
    }
  }, [query, refresh]);

  // Auto-dismiss toast after 4s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="ent-page nx-media-page">
      {/* Hero */}
      <div className="ent-page-head">
        <div>
          {onBack && (
            <button className="tb-logo nx-media-back" onClick={onBack} title="Back to mode selector" aria-label="Back">
              <Icon.ArrowLeft size={16} />
            </button>
          )}
          <div className="ent-page-label">
            <Icon.HardDrive size={11} />
            <span style={{ marginLeft: 6 }}>Local Media Server · streams only files on this machine</span>
          </div>
          <h1 className="ent-page-title">Your Library</h1>
        </div>
        <div className="ent-page-side">
          <Stat icon={<Icon.Film size={13} />} label="Items" value={String(stats.count)} />
          <Stat icon={<Icon.HardDrive size={13} />} label="Size" value={formatSize(stats.totalSize)} />
          <Stat icon={<Icon.Folder size={13} />} label="Folders" value={String(stats.dirCount)} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="nx-media-toolbar">
        <div className="nx-media-search">
          <Icon.Search size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your media…"
          />
        </div>
        <button
          className="nx-media-btn primary"
          onClick={() => void handleScan()}
          disabled={scanning}
          title="Scan configured folders for video files"
        >
          {scanning ? <Icon.Spinner size={14} /> : <Icon.Scan size={14} />}
          <span>{scanning ? "Scanning…" : "Scan Library"}</span>
        </button>
        <button
          className="nx-media-btn"
          onClick={onConfigure}
          title="Open Settings → Media to configure folders + access code"
        >
          <Icon.Folder size={14} /> <span>Configure Folders</span>
        </button>
        {items.length > 0 && (
          <button
            className="nx-media-btn danger"
            onClick={() => void handleClear()}
            disabled={scanning}
            title="Remove every media item from the library (files on disk are NOT deleted)"
          >
            <Icon.Trash size={14} /> <span>Clear</span>
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`nx-media-toast ${toast.kind}`}>
          {toast.kind === "success" ? <Icon.CheckCircle size={14} /> : toast.kind === "error" ? <Icon.Info size={14} /> : <Icon.Info size={14} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="ent-empty">
          <Icon.Spinner size={32} />
          <p>Loading your media…</p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState hasPaths={hasPaths} onScan={() => void handleScan()} onConfig={onConfigure} scanning={scanning} />
      ) : (
        <div className="nx-media-grid">
          {items.map((m) => (
            <MediaCard key={m.id} item={m} onPlay={() => setPlaying(m)} />
          ))}
        </div>
      )}

      {/* Share panel (QR + access code). Always shown — it's how LAN sharing works. */}
      <MediaShare settings={settings} />

      {/* Footer */}
      <footer className="nx-media-foot">
        <span><strong>NEXUS</strong> Media Server · streams only files on this machine</span>
        <span>No cloud · No telemetry · LAN-only</span>
      </footer>

      {/* Player modal */}
      {playing && <MediaPlayer item={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}

function MediaCard({ item, onPlay }: { item: MediaItem; onPlay: () => void }) {
  return (
    <button className="nx-media-card" onClick={onPlay} title={`Play ${item.title}`}>
      <div className="nx-media-card-thumb">
        <Icon.Film size={28} />
        <span className="nx-media-card-container">{item.container}</span>
      </div>
      <div className="nx-media-card-body">
        <p className="nx-media-card-title">{item.title}</p>
        <p className="nx-media-card-meta">{formatSize(item.fileSize)}</p>
      </div>
    </button>
  );
}

function EmptyState({
  hasPaths,
  onScan,
  onConfig,
  scanning,
}: {
  hasPaths: boolean;
  onScan: () => void;
  onConfig: () => void;
  scanning: boolean;
}) {
  return (
    <div className="ent-empty nx-media-empty">
      <Icon.HardDrive size={36} />
      <p>No media yet</p>
      <span>
        {hasPaths
          ? "Scan your folders to populate the library, or add more paths in Settings."
          : "Configure the folders that hold your movies, shows, and clips — then scan."}
      </span>
      <div className="nx-media-empty-actions">
        {!hasPaths && (
          <button className="nx-media-btn primary" onClick={onConfig}>
            <Icon.Folder size={14} /> <span>Configure Folders</span>
          </button>
        )}
        <button className="nx-media-btn" onClick={onScan} disabled={scanning}>
          {scanning ? <Icon.Spinner size={14} /> : <Icon.Scan size={14} />} <span>Scan Now</span>
        </button>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="nx-media-stat">
      <span className="nx-media-stat-ico">{icon}</span>
      <span className="nx-media-stat-label">{label}</span>
      <span className="nx-media-stat-value">{value}</span>
    </span>
  );
}
