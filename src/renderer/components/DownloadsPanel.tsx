// v4.5.0 — DownloadsPanel. The download manager view. Lists active/queued/
// completed/failed downloads with per-job progress, speed/ETA, and
// pause/resume/cancel/retry/clear controls. Sits above the app as a
// full-screen overlay (z-page), like Settings/Theme Studio.

import { useEffect, useState } from "react";
import type { DownloadJob } from "@shared/types";
import { useDownloads, type DownloadProgress } from "../lib/useDownloads";
import { Icon } from "./Icons";
import { formatSize } from "../lib/helpers";

interface Props {
  onClose: () => void;
}

function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function JobRow({ job, prog }: { job: DownloadJob; prog: DownloadProgress | undefined }) {
  const downloaded = prog?.downloadedBytes ?? job.downloadedBytes;
  const total = prog?.totalBytes ?? job.totalBytes;
  const pct = total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
  const isQueued = job.status === "queued";
  const isActive = job.status === "downloading";
  const isPaused = job.status === "paused";
  const isFailed = job.status === "failed";
  const isCancelled = job.status === "cancelled";
  const isCompleted = job.status === "completed";
  const terminal = isCompleted || isFailed || isCancelled;

  return (
    <div className={`dl-row dl-${job.status}`}>
      <div className="dl-row-main">
        <div className="dl-row-title" title={job.gameTitle}>{job.gameTitle}</div>
        <div className="dl-row-meta">
          <span>{job.sourceName}</span>
          <span className="dl-dot">·</span>
          <span>{formatSize(downloaded)}{total ? ` / ${formatSize(total)}` : ""}</span>
          {pct !== null && <><span className="dl-dot">·</span><span>{pct}%</span></>}
          {isFailed && job.error && <><span className="dl-dot">·</span><span className="dl-err" title={job.error}>{job.error.slice(0, 60)}{job.error.length > 60 ? "…" : ""}</span></>}
        </div>
        {(isActive || isQueued || isPaused) && (
          <div className="dl-bar"><div style={{ width: `${pct ?? 0}%` }} /></div>
        )}
      </div>
      <div className="dl-row-actions">
        {(isActive || isQueued) && <button className="dl-ctrl" onClick={() => window.nexus.pauseDownload(job.id)} title="Pause"><Icon.Download size={13} style={{ transform: "rotate(90deg)" }} /></button>}
        {isPaused && <button className="dl-ctrl" onClick={() => window.nexus.resumeDownload(job.id)} title="Resume"><Icon.Play size={13} /></button>}
        {(isActive || isQueued || isPaused) && <button className="dl-ctrl danger" onClick={() => window.nexus.cancelDownload(job.id)} title="Cancel"><Icon.Close size={13} /></button>}
        {(isFailed || isCancelled) && <button className="dl-ctrl" onClick={() => window.nexus.retryDownload(job.id)} title="Retry"><Icon.Refresh size={13} /></button>}
        {terminal && <button className="dl-ctrl" onClick={() => window.nexus.clearDownload(job.id)} title="Clear"><Icon.Trash size={13} /></button>}
      </div>
    </div>
  );
}

export function DownloadsPanel({ onClose }: Props) {
  const { downloads, progress, refresh } = useDownloads();
  const [, force] = useState(0);

  // Re-render every 500ms while there are active downloads (for ETA/speed smoothness).
  useEffect(() => {
    const hasActive = downloads.some((d) => d.status === "downloading");
    if (!hasActive) return;
    const t = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [downloads]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const active = downloads.filter((d) => ["downloading", "queued", "paused"].includes(d.status)).sort((a, b) => a.id - b.id);
  const completed = downloads.filter((d) => d.status === "completed").sort((a, b) => b.id - a.id);
  const failed = downloads.filter((d) => ["failed", "cancelled"].includes(d.status)).sort((a, b) => b.id - a.id);

  const totalBytes = downloads.reduce((s, d) => s + (d.totalBytes ?? 0), 0);
  const doneBytes = downloads.reduce((s, d) => s + d.downloadedBytes, 0);
  const overallPct = totalBytes > 0 ? Math.round((doneBytes / totalBytes) * 100) : 0;

  return (
    <div className="game-page dl-panel">
      <button className="gp-back" onClick={onClose}><Icon.Chevron size={18} style={{ transform: "rotate(180deg)" }} /></button>
      <div style={{ padding: "40px 48px 80px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em" }}>Downloads</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => void refresh()} title="Refresh"><Icon.Refresh size={13} /></button>
          </div>
        </div>

        {downloads.length > 0 && (
          <div className="dl-overall" style={{ marginBottom: 24 }}>
            <div className="dl-overall-label">Overall progress</div>
            <div className="dl-bar dl-bar-lg"><div style={{ width: `${overallPct}%` }} /></div>
            <div className="dl-overall-meta">{formatSize(doneBytes)} of {formatSize(totalBytes)} · {overallPct}%</div>
          </div>
        )}

        {downloads.length === 0 ? (
          <div className="empty" style={{ minHeight: 300 }}>
            <div className="box"><Icon.Download size={34} /></div>
            <h3>No downloads yet</h3>
            <p>Find a game in your library that isn't installed and click <strong>Get</strong> to start a download.</p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div className="dl-section">
                <div className="dl-section-title"><span className="bar" />Active & Queued</div>
                {active.map((j) => <JobRow key={j.id} job={j} prog={progress[j.id]} />)}
              </div>
            )}
            {failed.length > 0 && (
              <div className="dl-section">
                <div className="dl-section-title"><span className="bar" />Failed & Cancelled</div>
                {failed.map((j) => <JobRow key={j.id} job={j} prog={progress[j.id]} />)}
              </div>
            )}
            {completed.length > 0 && (
              <div className="dl-section">
                <div className="dl-section-title"><span className="bar" />Completed</div>
                {completed.map((j) => <JobRow key={j.id} job={j} prog={progress[j.id]} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
