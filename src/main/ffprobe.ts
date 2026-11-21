// v10.0.0 — FFprobe probing + playback-strategy resolution.
//
// This module is PURE Node (no electron import) so it can be unit-tested and
// exercised by the integration harness. It shells out to the system `ffprobe`
// and `ffmpeg` binaries (bundled with the app on Windows; on the dev/sandbox
// host they're on PATH).
//
// Two responsibilities:
//
//   1. probeFile(filePath) → MediaProbeInfo
//      Runs `ffprobe -print_format json -show_format -show_streams <path>` and
//      distills the result into the fields the playback decider + the UI need:
//      container family, video codec, audio codec, resolution, audio channel
//      count, subtitle presence, duration. Failures (missing ffprobe, unreadable
//      file) return { probeError } instead of throwing — a probe failure must
//      never break a scan.
//
//   2. playbackStrategyFor(item, probe) → "direct" | "remux" | "transcode"
//      Decides how the LAN server + in-app player should serve this file:
//        • "direct"     — the browser can play the file as-is (MP4/WebM with a
//                         browser-supported codec). Serve via /stream/:id (206
//                         Range, seekable).
//        • "remux"      — the CODECS are browser-supported but the CONTAINER
//                         isn't (e.g. MKV with H.264+AAC). Remux to fragmented
//                         MP4 via ffmpeg `-c copy` (fast, lossless). Served via
//                         /play/:id?strategy=remux (chunked fMP4, plays from
//                         start; seek restarts the stream at an offset).
//        • "transcode"  — a codec the browser can't decode (HEVC/H.265, VC-1,
//                         MPEG-2, FLAC-in-video, AV1 on older Chromiums).
//                         ffmpeg re-encodes video to H.264 + audio to AAC into
//                         fragmented MP4. CPU-heavy but universally playable.
//
// The decider is conservative: when in doubt (no probe, unknown codec) it
// falls back to "remux" (cheap, works for the vast majority of MKVs whose
// codecs ARE browser-supported) rather than "transcode" (which would peg a
// CPU unnecessarily).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const execFileP = promisify(execFile);

/** Where to find ffprobe/ffmpeg. In a packaged Windows app these are bundled
 *  under resources/ffmpeg/{ffprobe,ffmpeg}.exe; on the dev host / sandbox
 *  they're on PATH. We resolve lazily so a missing binary doesn't crash the
 *  scan — probeFile returns probeError instead. */
function bin(name: "ffprobe" | "ffmpeg"): string {
  // Packaged: process.resourcesPath/ffmpeg/<name>.exe (Windows) or <name> (linux/mac)
  // We check a couple of well-known locations; fall back to PATH.
  const candidates: string[] = [];
  try {
    const rp = (process as { resourcesPath?: string }).resourcesPath;
    if (rp) {
      candidates.push(`${rp}/ffmpeg/${name}.exe`);
      candidates.push(`${rp}/ffmpeg/${name}`);
    }
  } catch { /* ignore */ }
  candidates.push(name); // PATH lookup
  for (const c of candidates) {
    try {
      if (c === name) return name; // let the OS resolve PATH at exec time
      if (existsSync(c)) return c;
    } catch { /* ignore */ }
  }
  return name;
}

export interface MediaProbeInfo {
  /** Best-effort container family: "mp4" | "mkv" | "webm" | "mov" | "avi" | ... */
  container: string | null;
  /** Video stream codec name from ffprobe: "h264" | "hevc" | "vp9" | "av1" | ... */
  videoCodec: string | null;
  /** Audio stream codec name: "aac" | "mp3" | "ac3" | "flac" | "opus" | ... */
  audioCodec: string | null;
  /** Display width in pixels (video). */
  width: number | null;
  /** Display height in pixels (video). */
  height: number | null;
  /** Audio channel count (2 = stereo, 6 = 5.1). */
  audioChannels: number | null;
  /** Number of subtitle streams (any type). */
  subtitleStreams: number;
  /** Duration in seconds (from format.duration). */
  durationSec: number | null;
  /** Bit rate in bits/sec (format.bit_rate). */
  bitRate: number | null;
  /** Non-fatal probe error (missing ffprobe, unreadable file, etc.). The row
   *  is still indexed; playback falls back to a safe default. */
  probeError: string | null;
}

const EMPTY: MediaProbeInfo = {
  container: null, videoCodec: null, audioCodec: null,
  width: null, height: null, audioChannels: null,
  subtitleStreams: 0, durationSec: null, bitRate: null, probeError: null,
};

/** Run ffprobe on a file and distill the JSON into MediaProbeInfo. Never
 *  throws — returns probeError on any failure. */
export async function probeFile(filePath: string): Promise<MediaProbeInfo> {
  try {
    const { stdout } = await execFileP(
      bin("ffprobe"),
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { encoding: "utf-8", maxBuffer: 4 * 1024 * 1024, timeout: 20000 },
    );
    const j = JSON.parse(stdout) as {
      format?: { format_name?: string; duration?: string; bit_rate?: string };
      streams?: Array<{
        codec_type?: string; codec_name?: string;
        width?: number; height?: number;
        channels?: number;
      }>;
    };
    const streams = j.streams ?? [];
    const v = streams.find((s) => s.codec_type === "video");
    const a = streams.find((s) => s.codec_type === "audio");
    const subs = streams.filter((s) => s.codec_type === "subtitle").length;
    const fmt = j.format ?? {};
    // format_name is a comma-list like "mov,mp4,m4a,3gp,3g2,mj2" or
    // "matroska,webm". Reduce to the most specific family token.
    const container = reduceContainer(fmt.format_name ?? null);
    return {
      container,
      videoCodec: v?.codec_name ?? null,
      audioCodec: a?.codec_name ?? null,
      width: v?.width ?? null,
      height: v?.height ?? null,
      audioChannels: a?.channels ?? null,
      subtitleStreams: subs,
      durationSec: fmt.duration ? Number(fmt.duration) : null,
      bitRate: fmt.bit_rate ? Number(fmt.bit_rate) : null,
      probeError: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Distinguish "binary missing" from "file unreadable" for diagnostics.
    const isMissing = /ENOENT|not found|spawn/i.test(msg) && !/exit/i.test(msg);
    return {
      ...EMPTY,
      probeError: isMissing
        ? "ffprobe not available — install or bundle ffmpeg to enable codec-aware playback"
        : `probe failed: ${msg.split("\n")[0].slice(0, 160)}`,
    };
  }
}

/** Map ffprobe's format_name comma-list to a single canonical container token. */
function reduceContainer(formatName: string | null): string | null {
  if (!formatName) return null;
  const names = formatName.split(",").map((s) => s.trim().toLowerCase());
  // Order matters — first match wins.
  if (names.includes("matroska")) return "mkv";
  if (names.includes("mov")) return "mov";
  if (names.includes("mp4") || names.includes("m4a") || names.includes("3gp")) return "mp4";
  if (names.includes("webm")) return "webm";
  if (names.includes("avi")) return "avi";
  if (names.includes("flv")) return "flv";
  if (names.includes("mpeg")) return "mpeg";
  if (names.includes("ts")) return "ts";
  return names[0] ?? null;
}

// ─── Playback strategy ─────────────────────────────────────────────────────

export type PlaybackStrategy = "direct" | "remux" | "transcode";

/** Codecs Chromium/Edge/Safari/Firefox decode natively in an HTML5 <video>. */
const BROWSER_VIDEO_CODECS = new Set([
  "h264", "avc", "avc1",            // H.264 — universal
  "vp8", "vp9",                     // WebM codecs — Chrome/Firefox/Edge
  "av1",                            // modern Chromium + Firefox
  "h263",                           // rare, but supported
]);
const BROWSER_AUDIO_CODECS = new Set([
  "aac",                            // universal (MP4)
  "mp3",                            // universal
  "opus",                           // Chrome/Firefox/Edge (WebM)
  "vorbis",                         // Chrome/Firefox/Edge (WebM)
]);
/** Containers the browser can play directly via <video src>. */
const BROWSER_CONTAINERS = new Set(["mp4", "webm", "mov"]);

/** Decide how to serve an item. Falls back to "remux" when unsure (cheap +
 *  works for most MKVs whose codecs ARE browser-supported). Returns "direct"
 *  only when both container AND codecs are known-browser-supported. Returns
 *  "transcode" when a codec is known-unsupported (HEVC, VC-1, MPEG-2, etc.). */
export function playbackStrategyFor(opts: {
  container: string | null;     // item.container (from ext) or probe.container
  videoCodec: string | null;
  audioCodec: string | null;
}): PlaybackStrategy {
  const v = (opts.videoCodec ?? "").toLowerCase();
  const a = (opts.audioCodec ?? "").toLowerCase();
  const c = (opts.container ?? "").toLowerCase();
  // Known-unsupported video codecs → must transcode.
  const TRANSCODE_VIDEO = new Set([
    "hevc", "h265", "h266", "vvc",   // HEVC — no universal browser support
    "vc1", "vc-1", "wmv3", "wmv2",   // Windows Media / VC-1
    "mpeg2video", "mpeg2",           // MPEG-2
    "theora",                        // legacy WebM
    "msmpeg4", "msmpeg4v2",
    "vp6", "vp7",
  ]);
  const TRANSCODE_AUDIO = new Set([
    "ac3", "eac3", "dts", "dts-hd", "truehd", // surround codecs browsers lack
    "pcm_s16le", "pcm_s24le", "pcm_bluray",
    "alac", "flac",                  // FLAC/ALAC in MP4 not universally supported
    "mp2",
  ]);
  if (TRANSCODE_VIDEO.has(v) || TRANSCODE_AUDIO.has(a)) return "transcode";
  // Direct play only when container is browser-native AND both codecs are
  // browser-supported (or unknown — in which case direct is a reasonable bet
  // for .mp4/.webm/.mov).
  if (BROWSER_CONTAINERS.has(c)) {
    const vOk = !v || BROWSER_VIDEO_CODECS.has(v);
    const aOk = !a || BROWSER_AUDIO_CODECS.has(a);
    if (vOk && aOk) return "direct";
  }
  // Otherwise remux (MKV/MOV/AVI with H.264+AAC etc.) — lossless, fast.
  return "remux";
}

/** The ffmpeg args for a remux (copy codecs) or transcode (re-encode to
 *  H.264+AAC) into fragmented MP4 piped to stdout. `startSec` (optional)
 *  seeks the input before reading — used to restart the stream at an offset
 *  when the user seeks. The output is fMP4 (`frag_keyframe+empty_moov`) which
 *  Chromium's media stack can play progressively as bytes arrive. */
export function ffmpegStreamArgs(
  filePath: string,
  strategy: "remux" | "transcode",
  startSec: number | null,
): string[] {
  const args: string[] = [];
  if (startSec != null && Number.isFinite(startSec) && startSec > 0) {
    args.push("-ss", String(startSec));
  }
  args.push("-i", filePath);
  if (strategy === "remux") {
    args.push("-c:v", "copy", "-c:a", "copy");
  } else {
    args.push(
      "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
      "-profile:v", "high", "-level", "4.1",
      "-c:a", "aac", "-b:a", "192k",
      // Avoid burning subtitles in; drop them for the transcode (keeps it fast).
      "-sn",
    );
  }
  // Fragmented MP4 so the browser can start playing before the full stream is
  // buffered. faststart moves the moov atom but for piped output we use
  // frag_keyframe+empty_moov (no moov needed up front; default duration flag
  // avoids a warning). dash turns on segmenting compatible with fMP4.
  args.push("-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-");
  return args;
}
