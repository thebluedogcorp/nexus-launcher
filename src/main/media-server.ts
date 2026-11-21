// E1 — REAL HTTP media server.
//
// A genuine Node `http.Server` that:
//   • binds to 0.0.0.0:<port> so it's reachable from any device on the LAN
//   • serves a self-contained browseable HTML UI at `GET /`
//   • exposes JSON API endpoints (`/api/libraries`, `/api/library/:id`,
//     `/api/item/:id`) listing media from the user's exposed libraries
//   • streams files at `GET /stream/:id` with HTTP Range support
//     (206 Partial Content + Content-Range + Accept-Ranges) by looking up
//     the media row's filePath in the local DB — NEVER accepts a raw path
//     from the client (path-traversal protection by construction)
//   • optional `?code=<authCode>` (or `Authorization: Bearer <code>`)
//     gating when the server config has an authCode set
//
// Running instances live in a module-level Map keyed by config id. The
// status reflects the REAL process state (the `http.Server.listening`
// flag + the address it actually bound to). The QR code in the renderer
// encodes the real `http://<lanIp>:<port>` URL — never a fake.
//
// All served bytes come from the user's own disk via the local DB; no
// third-party stream hosts, no piracy.

import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import type {
  MediaServerConfig,
  MediaServerStartResult,
  MediaServerStatus,
  MediaItem,
  MediaLibrary,
  MediaPlaybackStrategy,
} from "@shared/types";
import {
  getServerConfig,
  listServerConfigs,
  listLibraries,
  listMediaByLibrary,
  listTvShows,
  listEpisodes,
  listSeasons,
  getMedia,
} from "./db";
import { extInfo, playbackStrategyFor } from "./media";
import { ffmpegStreamArgs } from "./ffprobe";

// ─── Helpers ─────────────────────────────────────────────────────────────

/** v10.0.0 — Robust LAN IPv4 enumeration.
 *
 *  Returns EVERY non-internal IPv4 on the host, sorted by reachability
 *  preference so the most-likely-reachable address comes first:
 *
 *    1. RFC1918 private ranges (192.168.x / 10.x / 172.16-31.x) — the ones a
 *       phone on the same Wi-Fi/Ethernet LAN can actually route to.
 *    2. CGNAT / shared address space (100.64-127.x).
 *    3. Everything else (link-local 169.254 is excluded as non-routable).
 *
 *  We do NOT filter by interface name (vmnet / vboxnet / vEthernet / WSL /
 *  docker / br-) because on some setups (Hyper-V default switch, WSL2 mirrored
 *  networking) the virtual adapter IS the one the user wants, and filtering it
 *  out would hide a working address. Instead we return ALL candidates and let
 *  the UI show each with its own QR — the user picks the one their device can
 *  reach. This directly fixes the user's "phone on Wi-Fi can't reach PC on
 *  Ethernet" report: the Ethernet IP is now surfaced as a candidate URL.
 */
export function detectLanIps(): string[] {
  const out: string[] = [];
  try {
    const ifs = networkInterfaces();
    for (const list of Object.values(ifs)) {
      if (!list) continue;
      for (const ni of list) {
        if (ni.family !== "IPv4" || ni.internal) continue;
        // Skip link-local (169.254.x) — not routable.
        if (ni.address.startsWith("169.254.")) continue;
        out.push(ni.address);
      }
    }
  } catch {
    /* ignore */
  }
  // De-duplicate + sort by preference.
  const uniq = Array.from(new Set(out));
  const rank = (ip: string): number => {
    if (ip.startsWith("192.168.")) return 0;
    if (ip.startsWith("10.")) return 1;
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return 2;
    if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(ip)) return 3;
    return 4;
  };
  uniq.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return uniq;
}

/** Back-compat — the first (best-ranked) LAN IP, or null. */
export function detectLanIp(): string | null {
  return detectLanIps()[0] ?? null;
}

/** Build the auth-code-augmented QR URL for a base URL. When the server has an
 *  authCode, the QR MUST encode `http://ip:port/?code=<code>` — otherwise the
 *  scanned phone hits 401 on every API call and shows a blank page (this was
 *  one of the user's reported bugs: "QR doesn't open"). */
function qrUrlFor(baseUrl: string, cfg: MediaServerConfig): string {
  if (!cfg.authCode) return baseUrl;
  return `${baseUrl}/?code=${encodeURIComponent(cfg.authCode)}`;
}

/** TMDB poster URL builder (the LAN UI embeds posters via image.tmdb.org). */
function tmdbPosterUrl(posterPath: string | null | undefined, size = "w500"): string | null {
  if (!posterPath) return null;
  return `https://image.tmdb.org/t/p/${size}${posterPath}`;
}

/** Resolve the playback strategy for an item, preferring the FFprobe'd
 *  container/codec over the extension-derived container. */
function strategyForItem(m: MediaItem): MediaPlaybackStrategy {
  // Use the probe's container when available (it's more accurate than the
  // extension-derived one — e.g. an .mkv might actually be a webm family).
  const container = m.videoCodec || m.audioCodec ? m.container : m.container;
  return playbackStrategyFor({
    container,
    videoCodec: m.videoCodec,
    audioCodec: m.audioCodec,
  });
}

/** Strip an item to the JSON shape served to LAN clients (no filePath!). */
function publicMedia(m: MediaItem): Record<string, unknown> {
  return {
    id: m.id,
    title: m.title,
    container: m.container,
    fileSize: m.fileSize,
    durationSec: m.durationSec,
    libraryId: m.libraryId,
    mediaType: m.mediaType,
    year: m.year,
    overview: m.overview,
    posterUrl: tmdbPosterUrl(m.posterPath, "w500"),
    backdropUrl: tmdbPosterUrl(m.backdropPath, "w1280"),
    genres: m.genres,
    runtimeMin: m.runtimeMin,
    rating: m.rating,
    tvShowId: m.tvShowId,
    season: m.season,
    episode: m.episode,
    scannedAt: m.scannedAt,
    // v10.0.0 — technical metadata + the resolved playback strategy so the
    // LAN Web UI knows whether to hit /stream/:id (direct) or /play/:id
    // (remux/transcode).
    videoCodec: m.videoCodec,
    audioCodec: m.audioCodec,
    width: m.width,
    height: m.height,
    audioChannels: m.audioChannels,
    subtitleStreams: m.subtitleStreams,
    bitRate: m.bitRate,
    probeError: m.probeError,
    playbackStrategy: strategyForItem(m),
  };
}

// ─── Running server registry ──────────────────────────────────────────────

interface RunningServer {
  configId: number;
  server: http.Server;
  cfg: MediaServerConfig;
  url: string;          // best-ranked base URL (http://<bestIp>:<port>)
  urls: string[];       // ALL candidate base URLs
  lanIps: string[];     // ALL candidate IPs (same order as urls)
  qrUrls: string[];     // auth-code-augmented QR URL per candidate
  port: number;
  lanIp: string;        // best-ranked IP (back-compat)
  startedAt: string;
  error: string | null;
}

const running = new Map<number, RunningServer>();

/** Build the canonical "everything OK" status object for a running server. */
function runningStatus(r: RunningServer): MediaServerStatus {
  return {
    running: true,
    url: r.url,
    port: r.port,
    lanIp: r.lanIp,
    urls: r.urls,
    lanIps: r.lanIps,
    qrUrls: r.qrUrls,
    startedAt: r.startedAt,
    error: null,
  };
}

/** Build the canonical "not running" status (with optional error tail). */
function stoppedStatus(error: string | null = null): MediaServerStatus {
  return {
    running: false,
    url: null,
    port: null,
    lanIp: null,
    urls: [],
    lanIps: [],
    qrUrls: [],
    startedAt: null,
    error,
  };
}

// ─── Auth ──────────────────────────────────────────────────────────────────

function isAuthorized(req: http.IncomingMessage, cfg: MediaServerConfig): boolean {
  if (!cfg.authCode) return true;
  const url = new URL(req.url ?? "/", "http://localhost");
  const codeParam = url.searchParams.get("code");
  if (codeParam && codeParam === cfg.authCode) return true;
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token && token === cfg.authCode) return true;
  }
  // Cookie: nx_code=...
  const cookie = req.headers["cookie"];
  if (cookie && typeof cookie === "string") {
    for (const part of cookie.split(";")) {
      const [k, v] = part.split("=", 2).map((s) => s.trim());
      if (k === "nx_code" && v === cfg.authCode) return true;
    }
  }
  return false;
}

function unauthorized(res: http.ServerResponse): void {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "unauthorized" }));
}

// ─── Range streaming ────────────────────────────────────────────────────────

/** Parse an HTTP `Range` header. Returns null if absent/invalid. */
function parseRange(rangeHeader: string | null | undefined, size: number): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];
  if (startStr === "" && endStr === "") return null;
  let start: number;
  let end: number;
  if (startStr === "") {
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

/** Stream a media file with HTTP Range support. Path-traversal-safe: the
 *  `id` is resolved to a media row in the DB; we never read a path from the
 *  client. */
function streamMediaFile(id: number, req: http.IncomingMessage, res: http.ServerResponse): void {
  const item = getMedia(id);
  if (!item) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }
  // Synthetic show rows (fileSize = 0 + container 'tv' + dir '') are not
  // streamable — they're groupings of episodes.
  if (item.container === "tv" && item.fileSize === 0 && !item.dir) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "this is a TV show grouping row, not a file" }));
    return;
  }
  let size: number;
  try {
    const st = statSync(item.filePath);
    if (!st.isFile()) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not a file" }));
      return;
    }
    size = st.size;
  } catch {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "file missing on disk" }));
    return;
  }

  const { mime } = extInfo(item.fileExt);
  const range = parseRange(req.headers["range"] ?? null, size);

  if (range) {
    const { start, end } = range;
    const contentLength = end - start + 1;
    res.writeHead(206, {
      "Content-Type": mime,
      "Content-Length": String(contentLength),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    });
    createReadStream(item.filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Length": String(size),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });
  createReadStream(item.filePath).pipe(res);
}

// ─── ffmpeg remux/transcode (v10.0.0) ────────────────────────────────────────

/** Pipe a media file through ffmpeg into fragmented MP4 so the browser can
 *  play containers/codecs it doesn't natively support (MKV, HEVC, etc.).
 *
 *  • strategy="remux"     — `ffmpeg -i input -c copy -f mp4 -movflags frag…`
 *    (lossless, fast — for MKV-with-H.264+AAC).
 *  • strategy="transcode" — re-encode video to H.264 + audio to AAC (for
 *    HEVC / VC-1 / MPEG-2 / FLAC-in-video, etc.). CPU-heavy.
 *
 *  `?start=<seconds>` seeks the input before reading so the player can restart
 *  the stream at an offset when the user seeks (fMP4 piped output isn't
 *  Range-seekable). The response is chunked `video/mp4` — the browser starts
 *  playing as bytes arrive.
 *
 *  The ffmpeg child is killed if the client disconnects so we don't leak
 *  processes or burn CPU after the tab closes. */
function playMediaFile(id: number, req: http.IncomingMessage, res: http.ServerResponse): void {
  const item = getMedia(id);
  if (!item) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }
  if (item.container === "tv" && item.fileSize === 0 && !item.dir) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "this is a TV show grouping row, not a file" }));
    return;
  }
  try {
    const st = statSync(item.filePath);
    if (!st.isFile()) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not a file" }));
      return;
    }
  } catch {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "file missing on disk" }));
    return;
  }

  const strategy = strategyForItem(item);
  // If the file is directly playable, fall through to the Range-capable raw
  // streamer so the browser keeps seek support.
  if (strategy === "direct") {
    streamMediaFile(id, req, res);
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const startQ = url.searchParams.get("start");
  const startSec = startQ != null && Number.isFinite(Number(startQ)) ? Math.max(0, Number(startQ)) : null;

  const args = ffmpegStreamArgs(item.filePath, strategy, startSec);
  const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "ignore"] });

  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Cache-Control": "no-store",
    // No Content-Length (chunked/streamed). No Accept-Ranges (not Range-
    // seekable — seek restarts the stream at ?start=<seconds>).
    "X-NEXUS-Strategy": strategy,
  });

  ff.stdout.on("data", (chunk: Buffer) => {
    if (!res.write(chunk)) {
      ff.stdout.pause();
      res.once("drain", () => ff.stdout.resume());
    }
  });
  ff.stdout.on("end", () => { try { res.end(); } catch { /* ignore */ } });
  ff.stdout.on("error", () => { try { res.destroy(); } catch { /* ignore */ } });
  ff.on("error", () => { try { res.destroy(); } catch { /* ignore */ } });
  ff.on("exit", (code) => {
    if (code != null && code !== 0) {
      // Non-zero exit (e.g. truncated input) — end the response cleanly so the
      // browser keeps whatever it already buffered.
      try { res.end(); } catch { /* ignore */ }
    }
  });

  // Kill ffmpeg if the client closes the connection (tab closed, seek
  // restart, etc.) so we never leak a transcode process.
  req.on("close", () => {
    try { ff.kill("SIGKILL"); } catch { /* already dead */ }
  });
  res.on("error", () => {
    try { ff.kill("SIGKILL"); } catch { /* already dead */ }
  });
}

// ─── HTML UI ─────────────────────────────────────────────────────────────

/** The browseable HTML page served at `GET /`. Self-contained — no external
 *  CSS/JS deps. Talks to the JSON endpoints + plays media via the SMART
 *  /play/:id endpoint (which auto-selects Direct Play / remux / transcode).
 *  Shows every candidate LAN URL so a phone on Wi-Fi can pick the one that
 *  reaches the Ethernet-connected PC. */
function buildIndexHtml(cfg: MediaServerConfig, lanIps: string[], port: number): string {
  const authQs = cfg.authCode ? `?code=${encodeURIComponent(cfg.authCode)}` : "";
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cfg.name} — NEXUS Media Server</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#0a0a0b;color:rgba(255,255,255,.92);font-family:'Inter','Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  header{padding:18px 22px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center;background:#0e0e10}
  h1{margin:0;font-size:18px;font-weight:700}
  h1 small{color:rgba(255,255,255,.5);font-weight:400;margin-left:6px}
  main{padding:18px 22px;max-width:1200px;margin:0 auto}
  .rail{display:flex;gap:14px;overflow-x:auto;padding-bottom:6px;margin-bottom:24px}
  .card{flex:0 0 160px;background:#161618;border:1px solid rgba(255,255,255,.06);border-radius:10px;overflow:hidden;cursor:pointer;transition:transform .12s}
  .card:hover{transform:translateY(-2px)}
  .card img{display:block;width:100%;height:240px;object-fit:cover;background:#0a0a0b}
  .card .ph{display:flex;align-items:center;justify-content:center;height:240px;background:linear-gradient(135deg,#1a1a1d,#0e0e10);color:rgba(255,255,255,.35);font-size:11px;text-align:center;padding:0 8px}
  .card .meta{padding:8px 10px}
  .card .meta b{display:block;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card .meta span{color:rgba(255,255,255,.5);font-size:11px}
  .detail{display:grid;grid-template-columns:240px 1fr;gap:18px;background:#161618;border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px;margin-bottom:24px}
  .detail img{width:240px;height:360px;object-fit:cover;border-radius:8px;background:#0a0a0b}
  .detail h2{margin:0 0 4px}
  .detail .year{color:rgba(255,255,255,.55);font-size:13px;margin-bottom:8px}
  .detail .genres{color:#f43f5e;font-size:12px;margin-bottom:8px}
  .detail p{margin:0 0 12px;font-size:13px;line-height:1.55;color:rgba(255,255,255,.78)}
  .detail .tech{font-size:11px;color:rgba(255,255,255,.45);margin:0 0 12px;font-family:ui-monospace,Menlo,Consolas,monospace}
  .ep{display:grid;grid-template-columns:40px 1fr auto;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05);align-items:center;cursor:pointer}
  .ep:hover{background:rgba(255,255,255,.03)}
  .ep .n{color:#f43f5e;font-weight:700}
  button.play{background:#f43f5e;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
  button.play:hover{background:#fb7185}
  .empty{color:rgba(255,255,255,.4);font-size:13px;text-align:center;padding:48px 0}
  .help{background:#131316;border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:14px 16px;margin:0 auto 24px;max-width:1200px}
  .help h3{margin:0 0 8px;font-size:13px;color:rgba(255,255,255,.85)}
  .help p{margin:0 0 6px;font-size:12px;color:rgba(255,255,255,.6);line-height:1.5}
  .help .urls{display:flex;flex-direction:column;gap:6px;margin-top:8px}
  .help .urlrow{display:flex;align-items:center;gap:10px;font-size:12px}
  .help code{background:#0a0a0b;padding:6px 9px;border-radius:6px;color:#f43f5e;font-family:ui-monospace,Menlo,Consolas,monospace}
  footer{padding:14px 22px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:rgba(255,255,255,.4);text-align:center}
  video{display:block;width:100%;max-width:1100px;margin:0 auto;background:#000;border-radius:8px}
  #player-wrap{margin-bottom:24px}
  a.back{color:#f43f5e;text-decoration:none;font-size:13px;display:inline-block;margin-bottom:10px}
</style></head><body>
<header><h1>${cfg.name} <small>· ${lanIps[0] ?? "127.0.0.1"}:${port}${lanIps.length > 1 ? ` +${lanIps.length - 1} more` : ""}</small></h1><span style="font-size:11px;color:rgba(255,255,255,.45)">NEXUS Media Server</span></header>
<main>
  <div class="help">
    <h3>Can't connect from your phone?</h3>
    <p>This server is reachable on every address below — pick the one your device is on the same network as. If your PC is on Ethernet and your phone on Wi-Fi (same router), try each until one loads.</p>
    <div class="urls">${lanIps.map((ip) => `<div class="urlrow"><code>http://${ip}:${port}${cfg.authCode ? `/?code=${encodeURIComponent(cfg.authCode)}` : ""}</code></div>`).join("")}</div>
    <p style="margin-top:8px">Still nothing? Allow port ${port} through Windows Defender Firewall (Control Panel → System and Security → Allow an app through Windows Firewall), and make sure both devices are on the same network.</p>
  </div>
  <div id="app"><div class="empty">Loading…</div></div>
  <div id="player-wrap" style="display:none"><a class="back" href="#" id="close-player">← Back</a><video id="player" controls autoplay></video></div>
</main>
<footer>Served from this PC's local library · LAN-only · No cloud · No telemetry</footer>
<script>
  var AUTH_QS = ${JSON.stringify(authQs)};
  var BASE = location.origin;
  function el(tag, props, kids){var e=document.createElement(tag);if(props)for(var k in props){if(k==='class')e.className=props[k];else if(k==='html')e.innerHTML=props[k];else e.setAttribute(k,props[k])}(kids||[]).forEach(function(k){e.appendChild(typeof k==='string'?document.createTextNode(k):k)});return e}
  function loadLibs(){
    fetch(BASE+'/api/libraries'+AUTH_QS).then(function(r){return r.json()}).then(function(libs){
      var app=document.getElementById('app');app.innerHTML='';
      if(!libs.length){app.appendChild(el('div',{class:'empty',html:'No libraries exposed.'}));return}
      var rail=el('div',{class:'rail'});
      libs.forEach(function(lib){
        var card=el('div',{class:'card'},[el('div',{class:'ph',html:lib.name}),el('div',{class:'meta'},[el('b',{},[lib.name]),el('span',{},[lib.itemCount+' items'])])]);
        card.onclick=function(){loadLibrary(lib.id,lib.name)};rail.appendChild(card)
      });
      app.appendChild(rail);
    }).catch(function(){document.getElementById('app').appendChild(el('div',{class:'empty',html:'Failed to load.'}))});
  }
  function loadLibrary(id,name){
    fetch(BASE+'/api/library/'+id+AUTH_QS).then(function(r){return r.json()}).then(function(data){
      var app=document.getElementById('app');app.innerHTML='';
      app.appendChild(el('a',{class:'back',href:'#',onclick:'loadLibs();return false'},['← Libraries']));
      app.appendChild(el('h2',{},[name+' ']));
      if(!data.items||!data.items.length){app.appendChild(el('div',{class:'empty',html:'No media in this library.'}));return}
      var rail=el('div',{class:'rail'});
      data.items.forEach(function(m){
        var kids=[];
        if(m.posterUrl){kids.push(el('img',{src:m.posterUrl,alt:m.title}))}else{kids.push(el('div',{class:'ph',html:m.title}))}
        kids.push(el('div',{class:'meta'},[el('b',{},[m.title]),el('span',{},[m.year||'',m.year?' · ':'',m.runtimeMin?m.runtimeMin+'min':''].join(''))]));
        var card=el('div',{class:'card'},kids);card.onclick=function(){openItem(m.id)};rail.appendChild(card)
      });
      app.appendChild(rail);
    });
  }
  function openItem(id){
    fetch(BASE+'/api/item/'+id+AUTH_QS).then(function(r){return r.json()}).then(function(item){
      var app=document.getElementById('app');app.innerHTML='';
      app.appendChild(el('a',{class:'back',href:'#',onclick:'loadLibs();return false'},['← Libraries']));
      var d=el('div',{class:'detail'});
      var left=el('div',{});if(item.posterUrl){left.appendChild(el('img',{src:item.posterUrl}))}else{left.appendChild(el('div',{class:'ph',html:item.title}))}
      var strat=item.playbackStrategy||'remux';
      var stratLabel=strat==='direct'?'Direct Play':(strat==='transcode'?'Transcoding':'Remuxing');
      var right=el('div',{},[
        el('h2',{},[item.title]),
        el('div',{class:'year'},[item.year||'',item.runtimeMin?(item.year?' · ':'')+item.runtimeMin+'min':''].join('')),
        item.genres&&item.genres.length?el('div',{class:'genres'},[item.genres.join(' · ')]):el('div',{}),
        el('p',{},[item.overview||'No description.']),
        el('div',{class:'tech'},[item.videoCodec||'?', ' · ', item.audioCodec||'?', ' · ', (item.width&&item.height)?item.width+'x'+item.height:'', ' · ', stratLabel].join('')),
        el('button',{class:'play',onclick:'playStream('+item.id+')'},['▶ Play'])
      ]);
      d.appendChild(left);d.appendChild(right);app.appendChild(d);
      if(item.mediaType==='tv'&&item.seasons){
        var eps=el('div',{},[el('h3',{},['Episodes'])]);
        item.seasons.forEach(function(s){
          eps.appendChild(el('h4',{},['Season '+s.season]));
          (s.episodes||[]).forEach(function(e){
            var row=el('div',{class:'ep',onclick:'playStream('+e.id+')'},[el('div',{class:'n'},[String(e.episode)]),el('div',{},[el('b',{},[e.title]),el('div',{},[e.overview?e.overview.slice(0,120)+(e.overview.length>120?'…':''):''])]),el('div',{},[el('span',{},[e.runtimeMin?e.runtimeMin+'min':''])])]);
            eps.appendChild(row)
          })
        });
        app.appendChild(eps)
      }
    });
  }
  function playStream(id){
    var w=document.getElementById('player-wrap');w.style.display='block';
    var v=document.getElementById('player');v.src=BASE+'/play/'+id+AUTH_QS;
    v.scrollIntoView({behavior:'smooth'});
    document.getElementById('close-player').onclick=function(){w.style.display='none';v.pause();v.removeAttribute('src');v.load();return false};
  }
  loadLibs();
</script>
</body></html>`;
}

// ─── HTTP handler ──────────────────────────────────────────────────────────

/** The resolved shape of an exposed library (its config + the items list). */
function exposedLibraries(cfg: MediaServerConfig): MediaLibrary[] {
  const all = listLibraries();
  const ids = new Set(cfg.libraryIds);
  return all.filter((l) => ids.has(l.id));
}

function handleApi(req: http.IncomingMessage, res: http.ServerResponse, cfg: MediaServerConfig): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;
  // /api/libraries
  if (pathname === "/api/libraries") {
    const libs = exposedLibraries(cfg).map((l) => ({
      id: l.id, name: l.name, category: l.category, itemCount: l.itemCount,
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(libs));
    return true;
  }
  // /api/library/:id
  const libMatch = /^\/api\/library\/(\d+)$/.exec(pathname);
  if (libMatch) {
    const id = Number(libMatch[1]);
    const libs = exposedLibraries(cfg);
    if (!libs.some((l) => l.id === id)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "library not exposed" }));
      return true;
    }
    const movies = listMediaByLibrary(id, {}).map(publicMedia);
    const shows = listTvShows(id).map(publicMedia);
    // Shows already include episode grouping; movies are flat. Merge both,
    // excluding movies that are actually episode rows (they're never returned
    // by listMediaByLibrary because it filters tvShowId IS NULL).
    const items = [...shows, ...movies];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id, items }));
    return true;
  }
  // v10.0.0 — /api/health — a lightweight liveness probe for the server
  // dashboard's "real status" check + for clients to confirm reachability
  // before attempting playback. Returns the port, all LAN IPs, the count of
  // exposed libraries, and the uptime.
  if (pathname === "/api/health") {
    const libs = exposedLibraries(cfg);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      name: cfg.name,
      port: cfg.port,
      lanIps: detectLanIps(),
      librariesExposed: libs.length,
      itemsExposed: libs.reduce((n, l) => n + l.itemCount, 0),
      authRequired: !!cfg.authCode,
      version: "10.0.0",
    }));
    return true;
  }
  // v10.0.0 — /api/probe/:id — the persisted FFprobe technical metadata + the
  // resolved playback strategy for an item. Lets clients show codec badges +
  // pre-fetch the right endpoint before building the <video> src.
  const probeMatch = /^\/api\/probe\/(\d+)$/.exec(pathname);
  if (probeMatch) {
    const id = Number(probeMatch[1]);
    const item = getMedia(id);
    if (!item) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return true;
    }
    const libs = exposedLibraries(cfg);
    if (item.libraryId && !libs.some((l) => l.id === item.libraryId)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not exposed" }));
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(publicMedia(item)));
    return true;
  }
  // /api/item/:id
  const itemMatch = /^\/api\/item\/(\d+)$/.exec(pathname);
  if (itemMatch) {
    const id = Number(itemMatch[1]);
    const item = getMedia(id);
    if (!item) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return true;
    }
    // Only serve detail if the item belongs to one of the exposed libraries.
    const libs = exposedLibraries(cfg);
    if (item.libraryId && !libs.some((l) => l.id === item.libraryId)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not exposed" }));
      return true;
    }
    const out: Record<string, unknown> = publicMedia(item);
    if (item.mediaType === "tv" && !item.tvShowId) {
      // It's a show row — list seasons + episodes.
      const seasonNumbers = listSeasons(id);
      const seasons = seasonNumbers.map((sn) => ({
        season: sn,
        episodes: listEpisodes(id, sn).map(publicMedia),
      }));
      out.seasons = seasons;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out));
    return true;
  }
  return false;
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Start a REAL http.Server bound to 0.0.0.0:<port>. Returns the real
 * `http://<lanIp>:<port>` URL on success, or `{ ok: false, error }` on
 * port-conflict / bind failure. ASYNC — the server's listening event is
 * awaited so port-conflict errors are surfaced as `error: "port-in-use"`.
 */
export async function startMediaServer(configId: number): Promise<MediaServerStartResult> {
  const cfg = getServerConfig(configId);
  if (!cfg) return { ok: false, error: "config-not-found" };
  // If already running, return its existing URL.
  const existing = running.get(configId);
  if (existing && existing.server.listening) {
    return { ok: true, port: existing.port, lanIp: existing.lanIp, url: existing.url };
  }

  const lanIps = detectLanIps();
  const lanIp = lanIps[0] ?? "127.0.0.1";
  const port = cfg.port;
  // Build ALL candidate base URLs + auth-code-augmented QR URLs (one per LAN
  // IP). The UI shows each with its own QR so a phone on Wi-Fi can pick the
  // one that reaches an Ethernet-connected PC.
  const urls = lanIps.map((ip) => `http://${ip}:${port}`);
  if (urls.length === 0) urls.push(`http://127.0.0.1:${port}`);
  const qrUrls = urls.map((u) => qrUrlFor(u, cfg));

  const server = http.createServer((req, res) => {
    try {
      if (!isAuthorized(req, cfg)) {
        unauthorized(res);
        return;
      }
      const url = new URL(req.url ?? "/", "http://localhost");
      const pathname = url.pathname;
      if (req.method !== "GET") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "method not allowed" }));
        return;
      }
      if (pathname === "/" || pathname === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(buildIndexHtml(cfg, lanIps, port));
        return;
      }
      if (pathname.startsWith("/api/")) {
        if (handleApi(req, res, cfg)) return;
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      const streamMatch = /^\/stream\/(\d+)$/.exec(pathname);
      if (streamMatch) {
        streamMediaFile(Number(streamMatch[1]), req, res);
        return;
      }
      // v10.0.0 — SMART playback endpoint. Picks Direct Play (delegates to
      // /stream's 206 Range path) or remux/transcode (ffmpeg → fMP4) based on
      // the item's probed codecs. This is what makes MKV actually play in a
      // browser (Chrome/Safari/Edge don't decode the MKV container natively).
      const playMatch = /^\/play\/(\d+)$/.exec(pathname);
      if (playMatch) {
        playMediaFile(Number(playMatch[1]), req, res);
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  });

  // Bind to 0.0.0.0 so the server is reachable from any device on the LAN.
  // Wrap in a Promise so EADDRINUSE is caught before we resolve.
  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      reject(err);
    };
    server.once("error", onError);
    server.listen(port, "0.0.0.0", () => {
      server.removeListener("error", onError);
      resolve();
    });
  }).catch((err: NodeJS.ErrnoException) => {
    // Translate EADDRINUSE to the spec'd error string.
    if (err && err.code === "EADDRINUSE") {
      throw new Error("port-in-use");
    }
    throw err;
  });

  // Register the running entry. The REAL running state lives on
  // `server.listening` (which is now true).
  const entry: RunningServer = {
    configId,
    server,
    cfg,
    url: urls[0],
    urls,
    lanIps: lanIps.length ? lanIps : ["127.0.0.1"],
    qrUrls,
    port,
    lanIp,
    startedAt: new Date().toISOString(),
    error: null,
  };
  running.set(configId, entry);

  // On unexpected close/error, drop the running entry so the status reflects
  // reality (the renderer polls getMediaServerStatus).
  server.on("error", (err: NodeJS.ErrnoException) => {
    const e = running.get(configId);
    if (e) e.error = err.code === "EADDRINUSE" ? "port-in-use" : (err.message || String(err));
    try { server.close(); } catch { /* ignore */ }
    running.delete(configId);
  });
  server.on("close", () => {
    // If the close was user-initiated (stopMediaServer), it already removed
    // the entry. If it crashed, remove it here as a safety net.
    if (running.get(configId) === entry) running.delete(configId);
  });

  return { ok: true, port, lanIp, url: entry.url };
}

/** Stop a running server by config id. Returns true if a server was stopped. */
export function stopMediaServer(configId: number): boolean {
  const entry = running.get(configId);
  if (!entry) return false;
  running.delete(configId);
  try {
    entry.server.close();
  } catch {
    /* ignore */
  }
  return true;
}

/** Real status — reflects the http.Server's actual listening state. */
export function getMediaServerStatus(configId: number): MediaServerStatus {
  const entry = running.get(configId);
  if (!entry) {
    // Surface a stored error if the config exists (e.g. last start failed
    // with port-in-use). We don't persist errors, so this is best-effort.
    const cfg = getServerConfig(configId);
    return stoppedStatus(cfg ? null : "config-not-found");
  }
  if (!entry.server.listening) {
    return stoppedStatus(entry.error ?? "not-listening");
  }
  return runningStatus(entry);
}

/** Stop ALL running servers. Called from app.on('before-quit'). */
export function stopAllMediaServers(): void {
  for (const id of Array.from(running.keys())) {
    stopMediaServer(id);
  }
}

/** Whether any server is currently running (used by the renderer to gate
 *  the "stop all on quit" logic). */
export function anyMediaServerRunning(): boolean {
  for (const entry of running.values()) {
    if (entry.server.listening) return true;
  }
  return false;
}

/** List the configs + their live statuses (for the server dashboard). */
export function listServerStatuses(): Array<{ config: MediaServerConfig; status: MediaServerStatus }> {
  const configs = listServerConfigs();
  return configs.map((c) => ({ config: c, status: getMediaServerStatus(c.id) }));
}

// Re-export for index.ts cleanup wiring.
export { listServerConfigs };
