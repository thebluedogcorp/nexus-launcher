// v9.3.0 (M1) — Local Media Server (main process).
//
// This module wires the user's local video library into the Electron app:
//
//   • `scanDirectory` walks a folder (depth-limited) and returns every video
//     file it finds (skipping hidden entries + non-video extensions).
//   • `scanMediaLibrary` runs a scan over all configured folders, upserts the
//     discovered files into the `media` table, and removes stale rows.
//   • `registerMediaProtocol` registers a custom `nexus-media://` scheme that
//     streams files back to the in-app HTML5 player with full HTTP Range
//     support (206 Partial Content) so video seeking works.
//
// E1 — added `scanLibrary(libraryId)` which scans ONE library's root folders,
// parses SxxExx / xyy patterns to set mediaType='tv' + season + episode and
// groups episodes under a synthetic "show" media row, and emits live scan
// progress to the renderer via the `media:scanProgress` IPC channel.
//
// No piracy. No third-party stream hosts (CineSrc / 2embed / vidsrc / bingr /
// allmovieland — none of these). The protocol serves ONLY files on the user's
// own disk, looked up by id from the local SQLite DB.

import { protocol, BrowserWindow } from "electron";
import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { MediaScanSummary, MediaScanProgress } from "@shared/types";
import {
  upsertMediaFile,
  removeStaleMedia,
  removeStaleMediaForLibrary,
  getMedia,
  listLibraryPaths,
  findOrCreateTvShow,
} from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// Extension metadata — ported from the Next.js reference (src/lib/media.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const VIDEO_EXTS = [
  ".mp4", ".mkv", ".webm", ".mov", ".avi", ".flv",
  ".wmv", ".m4v", ".ts", ".mpg", ".mpeg", ".m2ts",
] as const;

export const videoExtSet: ReadonlySet<string> = new Set<string>(VIDEO_EXTS);

/** Map a file extension (lowercased, with leading dot) to container + MIME. */
export function extInfo(ext: string): { container: string; mime: string } {
  const e = ext.toLowerCase();
  switch (e) {
    case ".mp4":  return { container: "mp4",  mime: "video/mp4" };
    case ".mkv":  return { container: "mkv",  mime: "video/x-matroska" };
    case ".webm": return { container: "webm", mime: "video/webm" };
    case ".mov":  return { container: "mov",  mime: "video/quicktime" };
    case ".avi":  return { container: "avi",  mime: "video/x-msvideo" };
    case ".flv":  return { container: "flv",  mime: "video/x-flv" };
    case ".wmv":  return { container: "wmv",  mime: "video/x-ms-wmv" };
    case ".m4v":  return { container: "m4v",  mime: "video/x-m4v" };
    case ".ts":   return { container: "ts",   mime: "video/mp2t" };
    case ".mpg":
    case ".mpeg": return { container: "mpeg", mime: "video/mpeg" };
    case ".m2ts": return { container: "m2ts", mime: "video/mp2t" };
    default:
      return { container: e.replace(".", "") || "unknown", mime: "application/octet-stream" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovered file shape (port of DiscoveredFile from src/lib/media.ts).
// ─────────────────────────────────────────────────────────────────────────────

export interface DiscoveredFile {
  title: string;
  filePath: string;
  fileName: string;
  fileExt: string;
  fileSize: number;
  dir: string;
  container: string;
}

/** Recursively walk a directory (depth-limited) for video files. */
export async function scanDirectory(root: string, maxDepth = 6): Promise<DiscoveredFile[]> {
  const out: DiscoveredFile[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission error, missing dir, etc. — skip silently.
    }
    for (const ent of entries) {
      // Skip hidden entries (.DS_Store, .git, dotfiles, etc.).
      if (ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (!videoExtSet.has(ext)) continue;
        try {
          const st = await fs.stat(full);
          if (!st.isFile() || st.size === 0) continue;
          const { container } = extInfo(ext);
          out.push({
            title: path.basename(ent.name, ext),
            filePath: full,
            fileName: ent.name,
            fileExt: ext,
            fileSize: st.size,
            dir,
            container,
          });
        } catch {
          /* stat failed — skip */
        }
      }
    }
  }

  await walk(root, 0);
  return out;
}

/**
 * Walk every configured path, upsert discovered files into the DB, and remove
 * stale rows (files that no longer exist on disk). Returns a summary count.
 */
export async function scanMediaLibrary(paths: string[]): Promise<MediaScanSummary> {
  const clean = Array.from(
    new Set(
      (paths ?? [])
        .map((p) => (p ?? "").trim())
        .filter(Boolean),
    ),
  );

  let scanned = 0;
  let added = 0;
  let updated = 0;
  const keepFilePaths: string[] = [];

  for (const root of clean) {
    const found = await scanDirectory(root);
    for (const f of found) {
      scanned++;
      keepFilePaths.push(f.filePath);
      const inserted = upsertMediaFile({
        title: f.title,
        filePath: f.filePath,
        fileSize: f.fileSize,
        fileExt: f.fileExt,
        container: f.container,
        dir: f.dir,
      });
      if (inserted) added++;
      else updated++;
    }
  }

  const removed = removeStaleMedia(keepFilePaths);
  return { scanned, added, updated, removed };
}

// ─────────────────────────────────────────────────────────────────────────────
// E1 — Per-library scanner + filename parsing.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of parsing a video filename into a (clean) title + optional year +
 * optional TV season/episode markers. Examples:
 *   "The.Matrix.1999.1080p.mp4"            → { title: "The Matrix", year: 1999 }
 *   "Breaking Bad - S02E03 -720p.mkv"      → { title: "Breaking Bad", season: 2, episode: 3 }
 *   "Mr.Robot.1x05.mp4"                     → { title: "Mr Robot", season: 1, episode: 5 }
 *   "Show.Name.S01E01E02.mp4"               → { title: "Show Name", season: 1, episode: 1 }
 */
export interface ParsedMediaName {
  title: string;
  year: number | null;
  season: number | null;
  episode: number | null;
  isTv: boolean;
}

const SEASON_EPISODE_RE = [
  // S01E01 / s01e01 / S01E01E02 (we only take the first episode)
  /[Ss](\d{1,2})[Ee](\d{1,3})/,
  // 1x05 / 12x23
  /(\d{1,2})x(\d{1,3})/,
];
const YEAR_RE = /[\(\[]?(19\d{2}|20\d{2})[\)\]]?/;

/** Strip extension + dots/underscores → spaces, then collapse. */
function cleanName(raw: string): string {
  return raw
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse a video file's basename into title / year / season / episode. */
export function parseMediaName(fileNameOrBasenameNoExt: string): ParsedMediaName {
  let s = fileNameOrBasenameNoExt;
  let season: number | null = null;
  let episode: number | null = null;
  for (const re of SEASON_EPISODE_RE) {
    const m = re.exec(s);
    if (m) {
      season = Number(m[1]);
      episode = Number(m[2]);
      // Drop everything from the match onward — the show name is what's left.
      s = s.slice(0, m.index);
      break;
    }
  }
  let year: number | null = null;
  if (!season) {
    // Year is only meaningful for non-TV rows (TV episodes' years would be the
    // episode air year, which we don't want as the row's `year`).
    const ym = YEAR_RE.exec(s);
    if (ym) {
      year = Number(ym[1]);
      s = s.slice(0, ym.index) + s.slice(ym.index + ym[0].length);
    }
  }
  // Strip common release-tag junk at the tail (resolution, codec, source).
  // We do this AFTER extracting year/season/episode so those keep priority.
  const junkIdx = s.search(/\b(1080p|720p|480p|2160p|4K|HDR|10bit|x264|h264|h265|x265|HEVC|WEBRip|WEB-DL|BRRip|BluRay|BDRip|DVDRip|CAM|TS|TC)\b/i);
  if (junkIdx >= 0) s = s.slice(0, junkIdx);
  const title = cleanName(s).replace(/^-+|-+$/g, "").trim();
  return {
    title: title || cleanName(fileNameOrBasenameNoExt),
    year,
    season,
    episode,
    isTv: season !== null && episode !== null,
  };
}

/** Broadcast scan progress to every renderer window. */
function emitScanProgress(p: MediaScanProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("media:scanProgress", p);
  }
}

/**
 * Scan ONE library's root folders. Walks each path, parses filenames for TV
 * markers, upserts movies directly + episodes grouped under a synthetic show
 * row, and removes stale rows whose files are no longer on disk. Emits live
 * progress events. Returns a summary.
 */
export async function scanLibrary(libraryId: number): Promise<MediaScanSummary> {
  const roots = listLibraryPaths(libraryId).map((p) => p.path);
  if (roots.length === 0) {
    return { scanned: 0, added: 0, updated: 0, removed: 0 };
  }

  let scanned = 0;
  let added = 0;
  let updated = 0;
  const keepFilePaths: string[] = [];

  for (const root of roots) {
    const found = await scanDirectory(root);
    emitScanProgress({ libraryId, discovered: found.length, indexed: 0, current: root });
    let i = 0;
    for (const f of found) {
      scanned++;
      keepFilePaths.push(f.filePath);
      i++;
      const parsed = parseMediaName(f.title);
      if (parsed.isTv) {
        // Find or create a synthetic show row for this show name, then upsert
        // the episode row with tvShowId pointing at it. findOrCreateTvShow
        // stamps the show row with the same libraryId.
        const showId = findOrCreateTvShow(libraryId, parsed.title, null);
        const inserted = upsertMediaFile({
          title: f.title,
          filePath: f.filePath,
          fileSize: f.fileSize,
          fileExt: f.fileExt,
          container: f.container,
          dir: f.dir,
          libraryId,
          mediaType: "tv",
          tvShowId: showId,
          season: parsed.season,
          episode: parsed.episode,
        });
        if (inserted) added++;
        else updated++;
      } else {
        const inserted = upsertMediaFile({
          title: parsed.title || f.title,
          filePath: f.filePath,
          fileSize: f.fileSize,
          fileExt: f.fileExt,
          container: f.container,
          dir: f.dir,
          libraryId,
          mediaType: "movie",
          year: parsed.year,
        });
        if (inserted) added++;
        else updated++;
      }
      if (i % 5 === 0 || i === found.length) {
        emitScanProgress({
          libraryId,
          discovered: found.length,
          indexed: i,
          current: f.fileName,
        });
      }
    }
  }

  // Reconcile: remove this library's rows whose files no longer exist in the
  // scanned set. SCOPED to this library — other libraries are untouched.
  const removed = removeStaleMediaForLibrary(libraryId, keepFilePaths);
  emitScanProgress({ libraryId, discovered: scanned, indexed: scanned, current: null });
  return { scanned, added, updated, removed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom protocol — `nexus-media://media/<id>/stream`
//
// Registered as privileged (standard + stream + supportFetchAPI) BEFORE
// app.isReady() — see src/main/index.ts. The handler:
//
//   1. Parses the URL path `/media/<id>/stream`.
//   2. Looks up the media row by id (returns 404 if absent).
//   3. Stats the file (returns 404 if missing on disk).
//   4. Reads the `Range` header (if any) and responds with either:
//        • 206 Partial Content + Content-Range + Accept-Ranges + Content-Length
//          (body = a ReadableStream from fs.createReadStream({start,end})),
//        • 200 OK with the full file (no Range header).
//      Either way the body is a web ReadableStream (Readable.toWeb) wrapping
//      the Node fs read stream, so the Chromium media stack can pipe it
//      straight into an HTML5 <video> element. Range support is what makes
//      video seeking work.
// ─────────────────────────────────────────────────────────────────────────────

export const MEDIA_SCHEME = "nexus-media";

/** Renderer-facing helper — the stable URL the in-app player uses as `src`. */
export function mediaStreamUrl(id: number): string {
  return `${MEDIA_SCHEME}://media/${id}/stream`;
}

/** Parse `nexus-media://media/<id>/stream` → id, or null if malformed. */
function parseMediaId(url: string): number | null {
  // The URL is standard/privileged, so it parses like a normal URL.
  // `url` is the full `nexus-media://media/<id>/stream` string.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // pathname for `nexus-media://media/12/stream` is `/media/12/stream`.
  const parts = parsed.pathname.split("/").filter(Boolean);
  // Expected: ["media", "<id>", "stream"]
  if (parts.length < 2 || parts[0] !== "media") return null;
  const idNum = Number(parts[1]);
  if (!Number.isFinite(idNum) || idNum <= 0) return null;
  return idNum;
}

/**
 * Parse an HTTP `Range` header (`bytes=0-499`, `bytes=500-`, `bytes=-500`).
 * Returns null if the header is absent or syntactically invalid. The returned
 * `{start, end}` is INCLUSIVE on both ends (matches the HTTP spec) and within
 * `[0, size-1]`.
 */
function parseRange(rangeHeader: string | null | undefined, size: number): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  // Only `bytes=` ranges are supported (the only unit HTTP defines).
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];
  let start: number;
  let end: number;
  if (startStr === "" && endStr === "") {
    return null; // unsatisfiable — `bytes=-` is malformed.
  }
  if (startStr === "") {
    // `bytes=-N` → last N bytes.
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startStr);
    if (!Number.isFinite(start) || start < 0 || start >= size) return null;
    end = endStr === "" ? size - 1 : Number(endStr);
    if (!Number.isFinite(end) || end < start) return null;
    if (end >= size) end = size - 1;
  }
  return { start, end };
}

/** Build a web ReadableStream<Uint8Array> from a Node fs read stream. */
function nodeStreamToWebResponse(start: number, end: number, filePath: string): ReadableStream<Uint8Array> {
  // fs.createReadStream with `{start, end}` reads [start, end] INCLUSIVE —
  // matching the HTTP Range convention.
  const nodeStream = createReadStream(filePath, { start, end });
  // Readable.toWeb wraps a Node readable into a WHATWG ReadableStream
  // (available on Node 17+; Electron 32 ships Node 20, so always present).
  return Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
}

/** Register the `nexus-media://` protocol handler. MUST be called after app ready. */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (req) => {
    const id = parseMediaId(req.url);
    if (id === null) {
      return new Response("Bad media URL", { status: 400 });
    }
    const item = getMedia(id);
    if (!item) {
      return new Response("Media item not found", { status: 404 });
    }
    let size: number;
    try {
      const st = await fs.stat(item.filePath);
      if (!st.isFile()) {
        return new Response("Not a file", { status: 404 });
      }
      size = st.size;
    } catch {
      return new Response("File missing on disk", { status: 404 });
    }

    const { mime } = extInfo(item.fileExt);
    // req is a Fetch API Request; req.headers is a Headers instance. The
    // Range header is what the HTML5 <video> element sends when seeking.
    const rangeHeader = req.headers?.get("range") ?? null;
    const range = parseRange(rangeHeader, size);

    if (range) {
      const { start, end } = range;
      const contentLength = end - start + 1;
      const body = nodeStreamToWebResponse(start, end, item.filePath);
      // 206 Partial Content — the chromium media stack uses this + the
      // Content-Range header to satisfy seek requests.
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(contentLength),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    }

    // No Range header → full file.
    const body = nodeStreamToWebResponse(0, Math.max(0, size - 1), item.filePath);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  });
}

/**
 * Module-load-time side effect: register `nexus-media` as a privileged scheme.
 *
 * `protocol.registerSchemesAsPrivileged` MUST be called before `app.isReady()`
 * — importing this module at the top of `src/main/index.ts` (which evaluates
 * before `app.whenReady().then(...)`) guarantees that ordering. The
 * `standard: true` privilege makes the URL parse like a normal URL (so
 * `new URL("nexus-media://media/12/stream")` works in the handler); `stream:
 * true` + `supportFetchAPI: true` lets the renderer fetch / pipe it into an
 * HTML5 <video> element.
 *
 * Calling `registerSchemesAsPrivileged` more than once with the same scheme
 * across app restarts is fine (it only affects the current process). Calling
 * it after app ready throws — hence the module-top placement.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
      corsEnabled: true,
    },
  },
]);
