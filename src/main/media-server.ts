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
import { networkInterfaces } from "node:os";
import type {
  MediaServerConfig,
  MediaServerStartResult,
  MediaServerStatus,
  MediaItem,
  MediaLibrary,
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
import { extInfo } from "./media";

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Find the host's primary LAN IPv4 (first non-internal IPv4). */
export function detectLanIp(): string | null {
  try {
    const ifs = networkInterfaces();
    for (const list of Object.values(ifs)) {
      if (!list) continue;
      for (const ni of list) {
        if (ni.family === "IPv4" && !ni.internal) {
          return ni.address;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** TMDB poster URL builder (the LAN UI embeds posters via image.tmdb.org). */
function tmdbPosterUrl(posterPath: string | null | undefined, size = "w500"): string | null {
  if (!posterPath) return null;
  return `https://image.tmdb.org/t/p/${size}${posterPath}`;
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
  };
}

// ─── Running server registry ──────────────────────────────────────────────

interface RunningServer {
  configId: number;
  server: http.Server;
  url: string;
  port: number;
  lanIp: string;
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

// ─── HTML UI ─────────────────────────────────────────────────────────────

/** The browseable HTML page served at `GET /`. Self-contained — no external
 *  CSS/JS deps. Talks to the JSON endpoints + plays media via /stream/:id. */
function buildIndexHtml(cfg: MediaServerConfig, lanIp: string, port: number): string {
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
  .ep{display:grid;grid-template-columns:40px 1fr auto;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05);align-items:center;cursor:pointer}
  .ep:hover{background:rgba(255,255,255,.03)}
  .ep .n{color:#f43f5e;font-weight:700}
  button.play{background:#f43f5e;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
  button.play:hover{background:#fb7185}
  .empty{color:rgba(255,255,255,.4);font-size:13px;text-align:center;padding:48px 0}
  footer{padding:14px 22px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:rgba(255,255,255,.4);text-align:center}
  video{display:block;width:100%;max-width:1100px;margin:0 auto;background:#000;border-radius:8px}
  #player-wrap{margin-bottom:24px}
  a.back{color:#f43f5e;text-decoration:none;font-size:13px;display:inline-block;margin-bottom:10px}
</style></head><body>
<header><h1>${cfg.name} <small>· http://${lanIp}:${port}</small></h1><span style="font-size:11px;color:rgba(255,255,255,.45)">NEXUS Media Server</span></header>
<main>
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
      var right=el('div',{},[
        el('h2',{},[item.title]),
        el('div',{class:'year'},[item.year||'',item.runtimeMin?(item.year?' · ':'')+item.runtimeMin+'min':''].join('')),
        item.genres&&item.genres.length?el('div',{class:'genres'},[item.genres.join(' · ')]):el('div',{}),
        el('p',{},[item.overview||'No description.']),
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
    var v=document.getElementById('player');v.src=BASE+'/stream/'+id+AUTH_QS;
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

  const lanIp = detectLanIp() ?? "127.0.0.1";
  const port = cfg.port;

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
        res.end(buildIndexHtml(cfg, lanIp, port));
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
    url: `http://${lanIp}:${port}`,
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
