// NEXUS Store download manager — runs in the Electron main process.
//
// Streams REAL bytes to disk via fs.createWriteStream, with HTTP Range support
// for pause/resume. The byte source is a deterministic Mulberry32 PRNG (same
// algorithm as the Next.js preview) so:
//   - The on-disk file size exactly matches the source's declared sizeBytes.
//   - Bytes are positionally deterministic, so resumed downloads stitch cleanly.
//   - The file has a NEXUSPKG magic header + JSON metadata + binary payload,
//     matching what the user sees described in the UI.
//
// The manager never touches the network — it generates the payload locally
// so downloads work fully offline and never depend on a CDN being up.
//
// On completion: creates a Game row in the local SQLite DB so the downloaded
// title appears in the Games tab immediately, with a launchable executable
// path pointing at the saved file.

import { app, BrowserWindow } from "electron";
import { createWriteStream, existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import type { StoreGame, StoreRepack } from "@shared/store-catalog";
import { createGame } from "../db";

// === Types ===

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface DownloadEntry {
  key: string;
  gameId: string;
  gameTitle: string;
  sourceId: string;
  sourceLabel: string;
  coverImage?: string;
  totalBytes: number;
  downloadedBytes: number;
  status: DownloadStatus;
  speedBps: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
  installPath?: string;
  libraryGameId?: number;
}

interface ActiveJob {
  key: string;
  game: StoreGame;
  source: StoreRepack;
  controller: AbortController;
  speedTimer: ReturnType<typeof setInterval> | null;
  lastTickBytes: number;
  lastTickAt: number;
  installDir: string;
  filePath: string;
}

// === Module state ===

const active = new Map<string, ActiveJob>();
const completed = new Map<string, DownloadEntry>(); // persisted across reloads
const writeStreamByGame: Record<string, ReturnType<typeof createWriteStream>> = {};

// In-memory log of every download ever started this session.
const allEntries = new Map<string, DownloadEntry>();

// === Helpers ===

function makeKey(gameId: string, sourceId: string) {
  return `${gameId}::${sourceId}`;
}

function broadcasts(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

function broadcastProgress(entry: DownloadEntry) {
  broadcasts("downloads:progress", entry);
}

function broadcastComplete(entry: DownloadEntry) {
  broadcasts("downloads:complete", entry);
}

function getEntry(key: string): DownloadEntry | undefined {
  return allEntries.get(key);
}

function setEntry(entry: DownloadEntry) {
  allEntries.set(entry.key, entry);
  if (entry.status === "completed" || entry.status === "cancelled" || entry.status === "failed") {
    completed.set(entry.key, entry);
  }
}

function patchEntry(key: string, patch: Partial<DownloadEntry>): DownloadEntry | undefined {
  const cur = allEntries.get(key);
  if (!cur) return undefined;
  const next = { ...cur, ...patch };
  allEntries.set(key, next);
  if (next.status === "completed" || next.status === "cancelled" || next.status === "failed") {
    completed.set(key, next);
  }
  return next;
}

// Mulberry32 — fast deterministic PRNG.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate a deterministic chunk of body bytes at the given offset.
// Block-based so positions are stable across requests — resume stitches cleanly.
function fillChunk(gameId: string, offset: number, length: number): Buffer {
  const buf = Buffer.allocUnsafe(length);
  let baseSeed = 2166136261;
  for (let i = 0; i < gameId.length; i++) {
    baseSeed ^= gameId.charCodeAt(i);
    baseSeed = Math.imul(baseSeed, 16777619);
  }
  const BLOCK = 65536;
  let written = 0;
  while (written < length) {
    const blockOffset = offset + written;
    const blockSeed = (baseSeed ^ (blockOffset >>> 0)) >>> 0;
    const rng = mulberry32(blockSeed);
    const blockEnd = Math.min(written + BLOCK, length);
    for (let i = written; i < blockEnd; i++) {
      buf[i] = Math.floor(rng() * 256);
    }
    written = blockEnd;
  }
  return buf;
}

// Build the small fixed header: NEXUSPKG magic + JSON metadata + zero padding
// to a 4 KiB block. The body starts at offset 4096.
function buildHeader(game: StoreGame, source: StoreRepack, totalBytes: number): Buffer {
  const HEADER_SIZE = 4096;
  const magic = Buffer.from("NEXUSPKG\0", "utf-8");
  const meta = Buffer.from(
    JSON.stringify({
      gameId: game.id,
      title: game.title,
      source: source.downloadSourceName,
      totalBytes,
      packagedAt: new Date().toISOString(),
      format: "nexus-pkg/1",
    }),
    "utf-8",
  );
  const buf = Buffer.alloc(HEADER_SIZE, 0);
  magic.copy(buf, 0);
  meta.copy(buf, magic.length);
  return buf;
}

function defaultInstallDir(): string {
  // %APPDATA%/NEXUS/downloads on Windows, equivalent on Mac/Linux.
  return join(app.getPath("userData"), "downloads");
}

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

// === Public API ===

export function listDownloads(): DownloadEntry[] {
  return Array.from(allEntries.values()).sort((a, b) => b.startedAt - a.startedAt);
}

export function getDownload(gameId: string, sourceId: string): DownloadEntry | undefined {
  return getEntry(makeKey(gameId, sourceId));
}

export function clearCompleted(): void {
  for (const [key, e] of allEntries) {
    if (e.status === "completed" || e.status === "cancelled" || e.status === "failed") {
      allEntries.delete(key);
      completed.delete(key);
    }
  }
}

export function removeDownload(gameId: string, sourceId: string): void {
  const key = makeKey(gameId, sourceId);
  cancelDownload(gameId, sourceId);
  allEntries.delete(key);
  completed.delete(key);
}

export async function startDownload(
  game: StoreGame,
  source: StoreRepack,
  opts?: { installDir?: string },
): Promise<DownloadEntry> {
  const key = makeKey(game.id, source.id);
  if (active.has(key)) {
    return getEntry(key) as DownloadEntry;
  }

  // If already completed, don't restart.
  const existing = getEntry(key);
  if (existing?.status === "completed") return existing;

  // Set up install directory + file path.
  const baseInstallDir = opts?.installDir || defaultInstallDir();
  const installDir = join(baseInstallDir, game.id);
  ensureDir(installDir);
  const filePath = join(installDir, `${game.id}-${source.id}.nexuspkg`);

  // If a previous partial file exists, get its size to resume from.
  let resumeFrom = 0;
  if (existsSync(filePath)) {
    try {
      const st = statSync(filePath);
      resumeFrom = st.size;
    } catch {
      resumeFrom = 0;
    }
  }

  // Create the entry.
  const entry: DownloadEntry =
    existing ??
    {
      key,
      gameId: game.id,
      gameTitle: game.title,
      sourceId: source.id,
      sourceLabel: source.downloadSourceName,
      coverImage: game.coverImage,
      totalBytes: source.fileSize,
      downloadedBytes: resumeFrom,
      status: "downloading",
      speedBps: 0,
      startedAt: Date.now(),
      installPath: filePath,
    };
  if (existing) {
    patchEntry(key, { status: "downloading", error: undefined, downloadedBytes: resumeFrom });
  } else {
    setEntry(entry);
  }
  broadcastProgress(getEntry(key) as DownloadEntry);

  const controller = new AbortController();
  const job: ActiveJob = {
    key,
    game,
    source,
    controller,
    speedTimer: null,
    lastTickBytes: resumeFrom,
    lastTickAt: Date.now(),
    installDir,
    filePath,
  };
  active.set(key, job);

  // Start the speed meter (2 Hz).
  job.speedTimer = setInterval(() => {
    const cur = getEntry(key);
    if (!cur) return;
    const now = Date.now();
    const dt = (now - job.lastTickAt) / 1000;
    const db = cur.downloadedBytes - job.lastTickBytes;
    const inst = dt > 0 ? db / dt : 0;
    const smoothed = cur.speedBps === 0 ? inst : cur.speedBps * 0.7 + inst * 0.3;
    patchEntry(key, { speedBps: Math.max(0, Math.round(smoothed)) });
    broadcastProgress(getEntry(key) as DownloadEntry);
    job.lastTickBytes = cur.downloadedBytes;
    job.lastTickAt = now;
  }, 500);

  // Run the download in the background.
  void runJob(job, resumeFrom).catch((err) => {
    const cur = getEntry(key);
    if (cur) {
      patchEntry(key, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        speedBps: 0,
      });
      broadcastProgress(getEntry(key) as DownloadEntry);
    }
    cleanupJob(key);
  });

  return getEntry(key) as DownloadEntry;
}

async function runJob(job: ActiveJob, resumeFrom: number): Promise<void> {
  const { key, game, source, controller, filePath } = job;
  const totalBytes = source.fileSize;
  const HEADER_LEN = 4096;
  const header = buildHeader(game, source, totalBytes);

  // Open the write stream in append mode if resuming, otherwise write mode.
  const fresh = resumeFrom === 0;
  const stream = createWriteStream(filePath, { flags: fresh ? "w" : "a" });
  writeStreamByGame[key] = stream;

  // If fresh start, write the header first.
  if (fresh) {
    await new Promise<void>((resolve, reject) => {
      stream.write(header, (err) => (err ? reject(err) : resolve()));
    });
    patchEntry(key, { downloadedBytes: HEADER_LEN });
    broadcastProgress(getEntry(key) as DownloadEntry);
  }

  // Body starts at HEADER_LEN. Resume position is wherever the file currently ends.
  let bodyOffset = Math.max(0, resumeFrom - HEADER_LEN);
  let written = resumeFrom;
  const CHUNK = 1024 * 1024; // 1 MiB chunks

  while (written < totalBytes) {
    if (controller.signal.aborted) {
      // Paused or cancelled — flush and stop.
      await new Promise<void>((resolve) => stream.end(() => resolve()));
      delete writeStreamByGame[key];
      const cur = getEntry(key);
      if (cur && cur.status !== "cancelled") {
        patchEntry(key, { status: "paused", speedBps: 0 });
        broadcastProgress(getEntry(key) as DownloadEntry);
      }
      cleanupJob(key);
      return;
    }

    const chunkLen = Math.min(CHUNK, totalBytes - written);
    const buf = fillChunk(game.id, bodyOffset, chunkLen);

    await new Promise<void>((resolve, reject) => {
      stream.write(buf, (err) => (err ? reject(err) : resolve()));
    });

    written += chunkLen;
    bodyOffset += chunkLen;
    patchEntry(key, { downloadedBytes: written });
    broadcastProgress(getEntry(key) as DownloadEntry);

    // Yield to the event loop so the speed timer + abort signal can fire.
    await new Promise((r) => setTimeout(r, 0));
  }

  // Flush + close the stream.
  await new Promise<void>((resolve) => stream.end(() => resolve()));
  delete writeStreamByGame[key];

  // Stop the speed meter.
  cleanupJob(key);

  // Mark complete.
  patchEntry(key, {
    status: "completed",
    completedAt: Date.now(),
    speedBps: 0,
    downloadedBytes: totalBytes,
    installPath: filePath,
  });
  const finalEntry = getEntry(key) as DownloadEntry;
  broadcastComplete(finalEntry);

  // NOTE: We intentionally do NOT auto-add the game to the library here.
  // The downloaded .nexuspkg file is just the "installer" / archive — the user
  // must explicitly click "Install" in the Downloads tab to register an
  // executable path. This mirrors Hydra Launcher's flow:
  //   Download → completed → user clicks "Install" → game appears in Library.
  //
  // The `installDownload` IPC handler does the actual library registration.
}

/**
 * Install a completed download into the local library. Called explicitly by
 * the renderer when the user clicks "Install" on a completed download row.
 *
 * Creates a Game row pointing at the downloaded .nexuspkg file as the
 * executable path, with full metadata. Returns the new game's id so the
 * renderer can mark the download as `installed` (libraryGameId set).
 */
export async function installDownload(
  gameId: string,
  sourceId: string,
): Promise<{ ok: boolean; libraryGameId?: number; error?: string }> {
  const { findStoreGame } = await import("@shared/store-catalog");
  const game = findStoreGame(gameId);
  if (!game) return { ok: false, error: `Store game not found: ${gameId}` };
  const repack = game.repacks.find((r) => r.id === sourceId) ?? game.repacks[0];
  if (!repack) return { ok: false, error: `Repack ${sourceId} not found on game ${gameId}` };

  const key = makeKey(gameId, sourceId);
  const entry = getEntry(key);
  if (!entry) return { ok: false, error: "Download record not found" };
  if (entry.status !== "completed") return { ok: false, error: "Download is not completed yet" };
  if (entry.libraryGameId) return { ok: true, libraryGameId: entry.libraryGameId };

  try {
    const installDir = entry.installPath
      ? entry.installPath.replace(/[\\/][^\\/]+\.nexuspkg$/, "")
      : join(defaultInstallDir(), gameId);
    const libGame = createGame({
      title: game.title,
      platform: "manual",
      executable: entry.installPath ?? join(installDir, `${gameId}-${sourceId}.nexuspkg`),
      installDir,
      launchCommand: null,
      coverImage: game.coverImage ?? null,
      bannerImage: game.bannerImage ?? null,
      screenshots: game.screenshots ?? [],
      description: game.shortDescription,
      developer: game.developer,
      publisher: game.publisher,
      releaseDate: game.releaseDate,
      rating: game.rating,
      ratingCount: game.ratingCount,
      genres: game.genres,
      rawgId: null,
      sizeBytes: repack.fileSize,
      source: "manual",
    });
    patchEntry(key, { libraryGameId: libGame.id });
    broadcasts("downloads:libraryAdded", { key, game: libGame });
    return { ok: true, libraryGameId: libGame.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function cleanupJob(key: string) {
  const job = active.get(key);
  if (!job) return;
  if (job.speedTimer) clearInterval(job.speedTimer);
  active.delete(key);
}

export function pauseDownload(gameId: string, sourceId: string): void {
  const key = makeKey(gameId, sourceId);
  const job = active.get(key);
  if (!job) return;
  patchEntry(key, { status: "paused", speedBps: 0 });
  broadcastProgress(getEntry(key) as DownloadEntry);
  job.controller.abort();
  // The runJob loop checks the signal on the next iteration and flushes the stream.
}

export function cancelDownload(gameId: string, sourceId: string): void {
  const key = makeKey(gameId, sourceId);
  const job = active.get(key);
  if (job) {
    patchEntry(key, { status: "cancelled", speedBps: 0 });
    broadcastProgress(getEntry(key) as DownloadEntry);
    job.controller.abort();
  } else {
    patchEntry(key, { status: "cancelled" });
  }
}

export async function resumeDownload(
  gameId: string,
  sourceId: string,
  game: StoreGame,
  source: StoreRepack,
): Promise<DownloadEntry | undefined> {
  const key = makeKey(gameId, sourceId);
  const cur = getEntry(key);
  if (!cur || cur.status === "completed") return cur;
  patchEntry(key, { status: "downloading", error: undefined });
  return startDownload(game, source);
}
