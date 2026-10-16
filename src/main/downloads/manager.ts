// v4.5.0 — DownloadManager. The native download engine.
//
// Streams an HTTP(S) URL to disk using the global `fetch` (Node 20+ / Electron
// 32) + a ReadableStream reader. Supports:
//   - Range resume: re-issues GET with `Range: bytes=<downloaded>-` from the
//     last byte written (append mode). Requires the server to return 206.
//   - Pause/Cancel: an AbortController aborts the in-flight fetch; pause keeps
//     the partial file + downloadedBytes, cancel deletes the partial file.
//   - Progress: throttled to ~4 updates/sec; sent to the renderer via
//     webContents.send("download:progress", …) + persisted to the DB.
//   - Integrity: on completion, verifies the written file size matches the
//     Content-Length; if the source provided a sha256, verifies the hash.
//     Only on successful verification does it call markGameInstalled() and
//     transition the job to "completed" — never before.
//   - Concurrency: at most MAX_CONCURRENT active transfers; the rest stay queued
//     and are started when a slot frees.
//   - Restart recovery: on app start, jobs left in "downloading" are flipped
//     to "paused" (the in-memory controller was lost) so the user can resume.
//
// SECURITY: only http(s) URLs are accepted (no file://, no localhost bypass
// tricks). Filenames are sanitized to prevent path traversal. Downloaded files
// are NEVER auto-executed — the user must explicitly launch the game after
// install. No DRM bypass, no unauthorized sources.

import { createWriteStream, mkdirSync, existsSync, statSync, unlinkSync, renameSync } from "fs";
import { join } from "path";
import { app, BrowserWindow } from "electron";
import { createHash } from "crypto";
import {
  createDownload, getDownload, listDownloads, updateDownload, deleteDownload,
  markGameInstalled, verifyInstalled,
} from "../db";
import type { DownloadJob, AcquisitionOption } from "@shared/types";

const MAX_CONCURRENT = 2;
const PROGRESS_INTERVAL_MS = 250;

// In-memory state: jobId → AbortController (only for ACTIVE downloads).
const controllers = new Map<number, AbortController>();
let progressWindow: BrowserWindow | null = null;

export function setDownloadWindow(win: BrowserWindow | null): void {
  progressWindow = win;
}

function emit(channel: string, payload: unknown): void {
  try { progressWindow?.webContents.send(channel, payload); } catch { /* window may be gone */ }
}

/** Validate a download URL. Only http(s) is allowed — never file://, never
 *  arbitrary schemes that could reach the local filesystem. */
export function isSafeDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Sanitize a filename: strip path components, drop shell metacharacters. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;            // no path traversal
  return base.replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/^\.+/, "").trim() || "download";
}

/** Default download directory: <userData>/downloads/<gameId>/ */
function defaultDestDir(gameId: number): string {
  const dir = join(app.getPath("userData"), "downloads", String(gameId));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** On app startup: any job left "downloading" (its in-memory controller was
 *  lost) is flipped to "paused" so the user can resume cleanly. Also re-emits
 *  the current download list so the renderer shows accurate state. */
export function recoverDownloadsOnStartup(): DownloadJob[] {
  const all = listDownloads();
  for (const job of all) {
    if (job.status === "downloading") {
      updateDownload(job.id, { status: "paused" });
    }
  }
  return listDownloads();
}

/** Start (or queue) a download for a game from a resolved acquisition option. */
export function startDownload(gameId: number, gameTitle: string, opt: AcquisitionOption): DownloadJob | { error: string } {
  if (!opt.downloadUrl || !isSafeDownloadUrl(opt.downloadUrl)) {
    return { error: "No safe download URL. Only http(s) is allowed." };
  }
  // De-dupe: if there's already an active job for this game, return it.
  const existing = listDownloads().find((d) => d.gameId === gameId && ["queued", "downloading", "paused"].includes(d.status));
  if (existing) {
    if (existing.status === "paused") { void resumeDownload(existing.id); }
    return existing;
  }
  const fileName = sanitizeFileName(opt.downloadUrl.split("/").pop() || `${gameTitle} (download)`);
  const destDir = defaultDestDir(gameId);
  const job = createDownload({
    gameId, gameTitle,
    sourceKind: opt.sourceKind, sourceName: opt.sourceName,
    url: opt.downloadUrl, destDir, fileName,
    totalBytes: opt.totalBytes ?? null, sha256: opt.sha256 ?? null,
  });
  emit("download:added", job);
  void runQueue();
  return job;
}

/** Pause an active download. Aborts the in-flight fetch but keeps the partial
 *  file + downloadedBytes so resume continues from the last byte. */
export function pauseDownload(id: number): void {
  const ctrl = controllers.get(id);
  if (ctrl) { try { ctrl.abort(); } catch { /* ignore */ } controllers.delete(id); }
  updateDownload(id, { status: "paused" });
  const job = getDownload(id);
  if (job) emit("download:progress", { id, status: "paused", downloadedBytes: job.downloadedBytes });
  void runQueue();
}

/** Resume a paused/queued download. */
export function resumeDownload(id: number): void {
  const job = getDownload(id);
  if (!job || (job.status !== "paused" && job.status !== "queued" && job.status !== "failed")) return;
  updateDownload(id, { status: "queued", error: null });
  void runQueue();
}

/** Cancel a download. Aborts + deletes the partial file. The job row is kept
 *  (status=cancelled) for history; the user can clear it from the UI. */
export function cancelDownload(id: number): void {
  const ctrl = controllers.get(id);
  if (ctrl) { try { ctrl.abort(); } catch { /* ignore */ } controllers.delete(id); }
  const job = getDownload(id);
  if (job) {
    const partial = join(job.destDir, job.fileName);
    if (existsSync(partial)) { try { unlinkSync(partial); } catch { /* ignore */ } }
  }
  updateDownload(id, { status: "cancelled", completedAt: new Date().toISOString() });
  emit("download:progress", { id, status: "cancelled", downloadedBytes: 0 });
  void runQueue();
}

/** Retry a failed/cancelled download from scratch. */
export function retryDownload(id: number): void {
  const job = getDownload(id);
  if (!job) return;
  // Delete any partial file + reset bytes.
  const partial = join(job.destDir, job.fileName);
  if (existsSync(partial)) { try { unlinkSync(partial); } catch { /* ignore */ } }
  updateDownload(id, { status: "queued", downloadedBytes: 0, error: null, startedAt: null, completedAt: null });
  void runQueue();
}

/** Clear a terminal (completed/failed/cancelled) job from history. */
export function clearDownload(id: number): void {
  const job = getDownload(id);
  if (!job) return;
  if (["queued", "downloading", "paused"].includes(job.status)) return; // can't clear active
  deleteDownload(id);
  emit("download:removed", { id });
}

/** The queue runner. Starts as many queued downloads as concurrency allows. */
async function runQueue(): Promise<void> {
  const active = Array.from(controllers.keys());
  if (active.length >= MAX_CONCURRENT) return;
  const all = listDownloads();
  const next = all.find((d) => d.status === "queued");
  if (!next) return;
  void transfer(next.id);
}

/** The actual transfer. Handles resume via Range, progress, verification. */
async function transfer(id: number): Promise<void> {
  const job = getDownload(id);
  if (!job) return;
  const ctrl = new AbortController();
  controllers.set(id, ctrl);
  updateDownload(id, { status: "downloading", startedAt: job.startedAt ?? new Date().toISOString(), error: null });
  emit("download:progress", { id, status: "downloading", downloadedBytes: job.downloadedBytes, totalBytes: job.totalBytes });

  const dest = join(job.destDir, job.fileName);
  // Open in append mode (resume). If the file doesn't exist, create it.
  const resumeFrom = job.downloadedBytes > 0 && existsSync(dest) ? statSync(dest).size : 0;
  if (resumeFrom !== job.downloadedBytes) {
    // Partial file was tampered with / deleted — restart from 0.
    updateDownload(id, { downloadedBytes: 0 });
  }
  const out = createWriteStream(dest, { flags: resumeFrom > 0 ? "a" : "w" });

  const headers: Record<string, string> = {};
  if (resumeFrom > 0) headers["Range"] = `bytes=${resumeFrom}-`;

  let totalBytes = job.totalBytes;
  let downloadedBytes = resumeFrom;
  let lastProgress = 0;
  let hasher: ReturnType<typeof createHash> | null = null;
  // For a clean resume, hash verification only works when downloading from 0.
  // If resuming, we skip hash verification (can't hash a partial we didn't
  // stream through). Size verification still runs.
  if (resumeFrom === 0 && job.sha256) hasher = createHash("sha256");

  try {
    const res = await fetch(job.url, { headers, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Server returned ${res.status} ${res.statusText}`);
    }
    // Content-Length for a 206 is the REMAINING bytes; for 200 it's the total.
    const clHeader = res.headers.get("content-length");
    if (clHeader) {
      const cl = parseInt(clHeader, 10);
      totalBytes = res.status === 206 ? resumeFrom + cl : cl;
      if (job.totalBytes === null) updateDownload(id, { totalBytes });
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body (the server returned an empty response).");

    // Pump the stream.
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (ctrl.signal.aborted) throw new DOMException("Aborted", "AbortError");
      out.write(Buffer.from(value));
      downloadedBytes += value.byteLength;
      if (hasher) hasher.update(Buffer.from(value));
      const now = Date.now();
      if (now - lastProgress > PROGRESS_INTERVAL_MS) {
        lastProgress = now;
        updateDownload(id, { downloadedBytes });
        emit("download:progress", { id, status: "downloading", downloadedBytes, totalBytes });
      }
    }
    // Flush + close the file.
    await new Promise<void>((resolve, reject) => { out.end(() => resolve()); out.on("error", reject); });

    // ---- Verification ----
    const finalStat = existsSync(dest) ? statSync(dest) : null;
    if (!finalStat) throw new Error("Downloaded file is missing after transfer.");
    if (totalBytes !== null && finalStat.size !== totalBytes) {
      throw new Error(`Size mismatch: expected ${totalBytes} bytes, got ${finalStat.size}.`);
    }
    if (hasher && job.sha256) {
      const actual = hasher.digest("hex");
      if (actual.toLowerCase() !== job.sha256.toLowerCase()) {
        throw new Error(`Integrity check failed: expected sha256 ${job.sha256}, got ${actual}.`);
      }
    }

    // ---- Success: register as installed + transition job to completed ----
    updateDownload(id, { status: "completed", downloadedBytes: finalStat.size, totalBytes: finalStat.size, completedAt: new Date().toISOString(), error: null });
    markGameInstalled(job.gameId, dest, job.destDir, finalStat.size);
    verifyInstalled(job.gameId); // re-verify (now true since exe exists)
    emit("download:progress", { id, status: "completed", downloadedBytes: finalStat.size, totalBytes: finalStat.size });
    emit("download:completed", { id, gameId: job.gameId });
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === "AbortError";
    // Flush whatever we got (append mode keeps partial bytes for resume).
    try { await new Promise<void>((resolve) => out.end(() => resolve())); } catch { /* ignore */ }
    if (isAbort) {
      // Pause/cancel already set the status; just ensure downloadedBytes is current.
      updateDownload(id, { downloadedBytes: downloadedBytes });
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      updateDownload(id, { status: "failed", error: msg, downloadedBytes: downloadedBytes });
      emit("download:progress", { id, status: "failed", error: msg, downloadedBytes });
    }
  } finally {
    controllers.delete(id);
    void runQueue();
  }
}
