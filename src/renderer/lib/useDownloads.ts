// v4.5.0 — useDownloads hook. Subscribes to download progress/add/remove events
// from the main process and exposes a live downloads list + a per-game
// progress map for the renderer to drive game-card + downloads-panel UI.

import { useEffect, useState, useCallback } from "react";
import type { DownloadJob } from "@shared/types";

export interface DownloadProgress {
  id: number;
  status: string;
  downloadedBytes: number;
  totalBytes?: number | null;
  error?: string | null;
}

export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadJob[]>([]);
  const [progress, setProgress] = useState<Record<number, DownloadProgress>>({});

  const refresh = useCallback(async () => {
    try { setDownloads(await window.nexus.listDownloads()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void refresh();
    const offAdded = window.nexus.onDownloadAdded(() => void refresh());
    const offRemoved = window.nexus.onDownloadRemoved(() => void refresh());
    const offCompleted = window.nexus.onDownloadCompleted(() => { void refresh(); });
    const offProgress = window.nexus.onDownloadProgress((p: DownloadProgress) => {
      setProgress((prev) => ({ ...prev, [p.id]: p }));
      // Terminal states trigger a full-list refresh.
      if (p.status === "completed" || p.status === "failed" || p.status === "cancelled") void refresh();
    });
    return () => { offAdded?.(); offRemoved?.(); offCompleted?.(); offProgress?.(); };
  }, [refresh]);

  const activeForGame = useCallback((gameId: number): DownloadJob | null => {
    const list = downloads
      .filter((d) => d.gameId === gameId && ["queued", "downloading", "paused"].includes(d.status))
      .sort((a, b) => b.id - a.id);
    return list[0] ?? null;
  }, [downloads]);

  const progressForGame = useCallback((gameId: number): DownloadProgress | null => {
    const job = activeForGame(gameId);
    if (!job) return null;
    return progress[job.id] ?? {
      id: job.id,
      status: job.status,
      downloadedBytes: job.downloadedBytes,
      totalBytes: job.totalBytes,
    };
  }, [activeForGame, progress]);

  return { downloads, progress, refresh, activeForGame, progressForGame };
}
