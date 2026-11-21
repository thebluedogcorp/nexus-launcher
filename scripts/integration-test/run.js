// Integration test — reproduces the user's EXACT reported scenario end-to-end:
//
//   "library shows 2 movies (TMDB-identified) but server Web UI shows nothing;
//    phone on Wi-Fi can't reach the PC server; QR doesn't open."
//
// This harness imports the REAL compiled main-process modules (db.js, media.js,
// media-server.js) unchanged, points better-sqlite3 at a throwaway DB, generates
// two REAL .mkv files with ffmpeg (H.264 video + AAC audio), and walks the full
// 6-state pipeline the spec requires us to distinguish:
//
//   1. DISCOVER   — scanDirectory finds the MKV files
//   2. INDEX      — upsertMediaFile writes rows (libraryId set)
//   3. IDENTIFY   — (TMDB is network-dependent; skipped here, metadata is
//                   applied manually to mimic a successful TMDB match)
//   4. LIBRARY    — listLibraries shows itemCount=2; listMediaByLibrary=2
//   5. SERVER     — createServerConfig + startMediaServer binds 0.0.0.0; the
//                   HTTP API (/api/libraries, /api/library/:id) returns the items
//   6. PLAYABLE   — GET /stream/:id with Range returns 206 + Content-Range
//
// If every assertion passes, the backend pipeline is SOUND and the user's
// "server shows nothing" is a RENDERER/UX issue (wrong library selected, auth
// code not in QR URL, server not actually started from the UI, etc.). If any
// assertion fails, we've found the real backend bug.
//
// Run: node --require ./electron-stub.js run.js

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const http = require("node:http");

// Disable undici keep-alive so each fetch opens a fresh socket. The test does
// stop+restart cycles on the same port; without this, undici's connection pool
// reuses a socket to the just-closed server instance → "other side closed".
try {
  const { Agent, setGlobalDispatcher } = require("undici");
  setGlobalDispatcher(new Agent({ allowKeepAlive: false, keepAliveTimeout: 0, keepAliveMaxTimeout: 0 }));
} catch { /* older node — keep-alive defaults are fine */ }

// ── 0. Fresh temp workspace ────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-itest-"));
process.env.NEXUS_USERDATA = path.join(TMP, "userdata");
fs.mkdirSync(process.env.NEXUS_USERDATA, { recursive: true });
const MEDIA_DIR = path.join(TMP, "movies");
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const FFMPEG = "/usr/bin/ffmpeg";
const FFPROBE = "/usr/bin/ffprobe";

// Two real MKV files with H.264 video + AAC audio, ~2s each. Named like real
// releases so the filename parser (parseMediaName) exercises its real logic.
const MKV_FILES = [
  { name: "The.Matrix.1999.1080p.mkv", title: "The Matrix", year: 1999 },
  { name: "Inception.2010.720p.mkv", title: "Inception", year: 2010 },
];

function log(state, msg) { console.log(`[${state}] ${msg}`); }
function assert(cond, msg) { if (!cond) { console.error(`\n  FAIL: ${msg}\n`); process.exitCode = 1; throw new Error(msg); } console.log(`  OK: ${msg}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ── 0a. Generate real MKV files with ffmpeg ──────────────────────────────
  log("0", `Generating 2 real MKV files in ${MEDIA_DIR}`);
  for (const f of MKV_FILES) {
    const out = path.join(MEDIA_DIR, f.name);
    execFileSync(FFMPEG, [
      "-y",
      "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=24",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "96k",
      "-shortest",
      out,
    ], { stdio: ["ignore", "ignore", "ignore"] });
    const st = fs.statSync(out);
    assert(st.size > 1000, `ffmpeg produced ${f.name} (${st.size} bytes)`);
  }

  // ── 1. Import the REAL compiled modules ──────────────────────────────────
  log("1", "Importing real compiled db.js / media.js / media-server.js");
  const db = require(path.resolve(__dirname, "..", "..", "dist-electron", "main", "db.js"));
  const media = require(path.resolve(__dirname, "..", "..", "dist-electron", "main", "media.js"));
  const srv = require(path.resolve(__dirname, "..", "..", "dist-electron", "main", "media-server.js"));
  log("1", `db keys: ${Object.keys(db).filter(k=>/media|librar|server/i.test(k)).join(", ")}`);

  // ── 2. DISCOVER — scanDirectory finds the MKV files ───────────────────────
  log("DISCOVER", "scanDirectory(MEDIA_DIR)");
  const found = await media.scanDirectory(MEDIA_DIR);
  assert(found.length === 2, `scanDirectory found 2 video files (got ${found.length})`);
  assert(found.every(f => f.container === "mkv"), `all found files have container=mkv`);
  assert(found.every(f => f.fileExt === ".mkv"), `all found files have fileExt=.mkv`);

  // ── 3. INDEX + LIBRARY-ASSIGN — create library, add path, scan ────────────
  log("LIBRARY", "createLibrary('Movies', 'movie')");
  const lib = db.createLibrary("Movies", "movie");
  assert(typeof lib.id === "number" && lib.id > 0, `library created with id=${lib.id}`);
  db.addLibraryPath(lib.id, MEDIA_DIR);
  const paths = db.listLibraryPaths(lib.id);
  assert(paths.length === 1 && paths[0].path === MEDIA_DIR, `library path added`);

  log("INDEX", `scanLibrary(${lib.id})`);
  const summary = await media.scanLibrary(lib.id);
  console.log("  scan summary:", summary);
  assert(summary.scanned === 2, `scanLibrary scanned 2 (got ${summary.scanned})`);
  assert(summary.added === 2, `scanLibrary added 2 (got ${summary.added})`);

  // ── 4. LIBRARY VIEW — listLibraries itemCount + listMediaByLibrary ────────
  log("LIBRARY", "listLibraries() + listMediaByLibrary(id)");
  const libs = db.listLibraries();
  const movies = libs.find(l => l.id === lib.id);
  assert(!!movies, `library present in listLibraries`);
  assert(movies.itemCount === 2, `library itemCount === 2 (got ${movies.itemCount}) — THIS IS THE KEY ASSERTION matching the user's "library shows 2 movies"`);

  const items = db.listMediaByLibrary(lib.id, {});
  assert(items.length === 2, `listMediaByLibrary returns 2 (got ${items.length}) — THIS IS THE KEY ASSERTION matching "server should expose 2"`);
  assert(items.every(it => it.libraryId === lib.id), `every item has libraryId set`);
  assert(items.every(it => it.mediaType === "movie"), `every item typed as movie`);
  // Filenames parsed: "The Matrix 1999" → title "The Matrix" + year 1999.
  const matrix = items.find(it => /matrix/i.test(it.title));
  assert(!!matrix, `parseMediaName extracted "The Matrix" title`);
  assert(matrix.year === 1999, `parseMediaName extracted year 1999 (got ${matrix.year})`);

  // Apply fake TMDB metadata (mimics a successful autoIdentify) so posters show.
  db.upsertMediaMetadata(items[0].id, { tmdbId: 603, mediaType: "movie", year: 1999, overview: "A computer hacker learns about the true nature of reality.", posterPath: "/f89U3ADr1oiB1s9GkPOEi9x7GqR.jpg", genres: ["Action","Sci-Fi"], runtimeMin: 136, rating: 8.2 });
  db.upsertMediaMetadata(items[1].id, { tmdbId: 27205, mediaType: "movie", year: 2010, overview: "A thief who steals corporate secrets through dream-sharing technology.", posterPath: "/9gk7adHYeDvHkCSEqAvQXVzfxgJ.jpg", genres: ["Action","Sci-Fi"], runtimeMin: 148, rating: 8.4 });

  // ── 5. SERVER EXPOSE — createServerConfig + startMediaServer ──────────────
  // Pick a free port dynamically.
  const port = await new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
  log("SERVER", `createServerConfig('Test', ${port}, [${lib.id}], null)`);
  const cfg = db.createServerConfig("Test Server", port, [lib.id], null);
  assert(cfg.libraryIds.length === 1 && cfg.libraryIds[0] === lib.id, `server config exposes the movie library (libraryIds=[${cfg.libraryIds.join(",")}])`);

  log("SERVER", `startMediaServer(${cfg.id})`);
  const start = await srv.startMediaServer(cfg.id);
  assert(start.ok === true, `startMediaServer returned ok=true (got ${JSON.stringify(start)})`);
  assert(typeof start.url === "string" && start.url.startsWith("http://"), `server URL is real http:// (got ${start.url})`);
  assert(typeof start.lanIp === "string" && start.lanIp.length > 0, `lanIp detected (got ${start.lanIp})`);
  console.log(`  server URL: ${start.url}  (lanIp=${start.lanIp})`);

  // Real status check — must reflect server.listening === true.
  const status = srv.getMediaServerStatus(cfg.id);
  assert(status.running === true, `getMediaServerStatus().running === true (real listening state)`);
  assert(status.url === start.url, `status URL matches start URL`);

  // ── 6. HTTP API — /api/libraries + /api/library/:id (THE KEY TEST) ────────
  const fetchJson = async (urlPath) => {
    const u = new URL(urlPath, start.url);
    const r = await fetch(u.toString());
    return { status: r.status, body: await r.json() };
  };

  log("SERVER-API", "GET /api/libraries");
  const libsApi = await fetchJson("/api/libraries");
  assert(libsApi.status === 200, `/api/libraries → 200 (got ${libsApi.status})`);
  assert(Array.isArray(libsApi.body) && libsApi.body.length === 1, `/api/libraries returns 1 exposed library (got ${JSON.stringify(libsApi.body)}) — THIS MATCHES THE USER'S "server Web UI shows nothing": if this were empty, that's the bug`);
  assert(libsApi.body[0].itemCount === 2, `/api/libraries[0].itemCount === 2 (got ${libsApi.body[0].itemCount})`);

  log("SERVER-API", `GET /api/library/${lib.id}`);
  const libApi = await fetchJson(`/api/library/${lib.id}`);
  assert(libApi.status === 200, `/api/library/:id → 200 (got ${libApi.status})`);
  assert(libApi.body.items && libApi.body.items.length === 2, `/api/library/:id returns 2 items (got ${libApi.body.items?.length}) — if 0 here, the server↔library sync is broken`);
  assert(libApi.body.items[0].posterUrl && libApi.body.items[0].posterUrl.includes("image.tmdb.org"), `item has TMDB poster URL (got ${libApi.body.items[0].posterUrl})`);
  assert(!("filePath" in libApi.body.items[0]), `publicMedia strips filePath (path-traversal safety)`);

  // ── 7. PLAYABLE — /stream/:id with Range → 206 ────────────────────────────
  const itemId = items[0].id;
  log("PLAYABLE", `GET /stream/${itemId} with Range: bytes=0-1023`);
  const streamUrl = new URL(`/stream/${itemId}`, start.url).toString();
  const streamRes = await fetch(streamUrl, { headers: { Range: "bytes=0-1023" } });
  assert(streamRes.status === 206, `/stream/:id with Range → 206 (got ${streamRes.status})`);
  assert(streamRes.headers.get("content-range"), `206 has Content-Range header (got ${streamRes.headers.get("content-range")})`);
  assert(streamRes.headers.get("accept-ranges") === "bytes", `206 has Accept-Ranges: bytes`);
  const buf = Buffer.from(await streamRes.arrayBuffer());
  assert(buf.length === 1024, `206 body length === 1024 (got ${buf.length})`);
  assert(buf.slice(4,5).toString() !== "", `streamed bytes are non-empty`);

  // Full-file (no Range) → 200
  log("PLAYABLE", `GET /stream/${itemId} (no Range) → 200`);
  const fullRes = await fetch(streamUrl);
  assert(fullRes.status === 200, `/stream/:id no Range → 200 (got ${fullRes.status})`);
  const fullSize = Number(fullRes.headers.get("content-length"));
  assert(fullSize > 1000, `full Content-Length > 1000 (got ${fullSize})`);

  // ── 8. HEALTH — the index HTML UI loads ───────────────────────────────────
  log("HEALTH", "GET / (browseable UI)");
  const indexRes = await fetch(start.url);
  assert(indexRes.status === 200, `GET / → 200`);
  const html = await indexRes.text();
  assert(html.includes("NEXUS Media Server"), `index HTML contains the app title`);
  assert(html.includes("loadLibs"), `index HTML ships the client JS that calls /api/libraries`);

  // ── 9. FFPROBE the real MKV (proves the container/codec is knowable) ──────
  log("FFPROBE", "probe one MKV");
  const probeOut = execFileSync(FFPROBE, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path.join(MEDIA_DIR, MKV_FILES[0].name)], { encoding: "utf-8" });
  const probe = JSON.parse(probeOut);
  assert(probe.format.format_name.includes("matroska"), `ffprobe reports matroska-family container (got ${probe.format.format_name})`);
  const vStream = probe.streams.find(s => s.codec_type === "video");
  const aStream = probe.streams.find(s => s.codec_type === "audio");
  assert(vStream && vStream.codec_name === "h264", `video stream codec=h264 (got ${vStream?.codec_name})`);
  assert(aStream && aStream.codec_name === "aac", `audio stream codec=aac (got ${aStream?.codec_name})`);
  console.log(`  probe: ${vStream.width}x${vStream.height} ${vStream.codec_name}/${aStream.codec_name}, duration=${probe.format.duration}s`);

  // ── 9b. v10.0.0 — FFprobe persistence + playback strategy ─────────────────
  log("PROBE-PERSIST", "verify scanner persisted codec/resolution onto media rows");
  const matrixRow = db.getMedia(matrix.id);
  assert(matrixRow.videoCodec === "h264", `media row videoCodec persisted = h264 (got ${matrixRow.videoCodec})`);
  assert(matrixRow.audioCodec === "aac", `media row audioCodec persisted = aac (got ${matrixRow.audioCodec})`);
  assert(matrixRow.width === 320 && matrixRow.height === 240, `media row resolution persisted 320x240 (got ${matrixRow.width}x${matrixRow.height})`);
  assert(matrixRow.durationSec !== null && matrixRow.durationSec > 1.5, `media row durationSec persisted (got ${matrixRow.durationSec})`);

  const ffprobeMod = require(path.resolve(__dirname, "..", "..", "dist-electron", "main", "ffprobe.js"));
  const strat = ffprobeMod.playbackStrategyFor;
  assert(strat({ container: "mp4", videoCodec: "h264", audioCodec: "aac" }) === "direct", `strategy(mp4/h264/aac) = direct`);
  assert(strat({ container: "mkv", videoCodec: "h264", audioCodec: "aac" }) === "remux", `strategy(mkv/h264/aac) = remux — MKV container isn't browser-native even with supported codecs`);
  assert(strat({ container: "mkv", videoCodec: "hevc", audioCodec: "ac3" }) === "transcode", `strategy(mkv/hevc/ac3) = transcode — HEVC + AC3 both unsupported`);
  assert(strat({ container: "webm", videoCodec: "vp9", audioCodec: "opus" }) === "direct", `strategy(webm/vp9/opus) = direct`);

  // ── 9c. v10.0.0 — /api/health ─────────────────────────────────────────────
  log("HEALTH", "GET /api/health");
  const health = await fetchJson("/api/health");
  assert(health.status === 200, `/api/health → 200`);
  assert(health.body.ok === true, `/api/health.ok === true`);
  assert(health.body.librariesExposed === 1, `/api/health.librariesExposed === 1`);
  assert(health.body.itemsExposed === 2, `/api/health.itemsExposed === 2`);
  assert(Array.isArray(health.body.lanIps) && health.body.lanIps.length >= 1, `/api/health.lanIps is a non-empty array`);
  assert(health.body.version === "10.0.0", `/api/health.version === 10.0.0`);

  // ── 9d. v10.0.0 — /api/probe/:id ──────────────────────────────────────────
  log("PROBE-API", `GET /api/probe/${itemId}`);
  const probeApi = await fetchJson(`/api/probe/${itemId}`);
  assert(probeApi.status === 200, `/api/probe/:id → 200`);
  assert(probeApi.body.videoCodec === "h264", `/api/probe videoCodec = h264`);
  assert(probeApi.body.playbackStrategy === "remux", `/api/probe playbackStrategy = remux (MKV→fMP4) — THE KEY v10 ASSERTION: MKV now has a playable strategy`);

  // ── 9e. v10.0.0 — /play/:id SMART endpoint (ffmpeg remux → fMP4) ──────────
  // THE CRITICAL v10 TEST: an MKV (which browsers can't play natively) is now
  // served as fragmented MP4 via ffmpeg `-c copy` remux. The response must be
  // 200, video/mp4, X-NEXUS-Strategy: remux, with a non-empty body that starts
  // with an fMP4 box header (ftyp/moof/styp).
  log("PLAY-SMART", `GET /play/${itemId} (MKV → fMP4 remux via ffmpeg)`);
  const playUrl = new URL(`/play/${itemId}`, start.url).toString();
  const playRes = await fetch(playUrl);
  assert(playRes.status === 200, `/play/:id → 200 (got ${playRes.status})`);
  assert(playRes.headers.get("content-type") === "video/mp4", `/play/:id Content-Type = video/mp4 (got ${playRes.headers.get("content-type")})`);
  assert(playRes.headers.get("x-nexus-strategy") === "remux", `/play/:id X-NEXUS-Strategy = remux (got ${playRes.headers.get("x-nexus-strategy")})`);
  const playBuf = Buffer.from(await playRes.arrayBuffer());
  assert(playBuf.length > 100, `/play/:id body non-empty (got ${playBuf.length} bytes)`);
  const boxType = playBuf.slice(4, 8).toString("latin1");
  assert(boxType === "ftyp" || boxType === "moof" || boxType === "styp", `/play/:id body starts with fMP4 box (got "${boxType}") — proves ffmpeg remux produced valid fragmented MP4`);

  // ── 9f. v10.0.0 — multi-IP detection ──────────────────────────────────────
  log("LAN-IPS", "detectLanIps() returns a sorted array");
  const lanIps = srv.detectLanIps();
  assert(Array.isArray(lanIps) && lanIps.length >= 1, `detectLanIps returns non-empty array (got ${JSON.stringify(lanIps)})`);
  const st2 = srv.getMediaServerStatus(cfg.id);
  assert(Array.isArray(st2.urls) && st2.urls.length === lanIps.length, `status.urls has one entry per LAN IP (${st2.urls.length} vs ${lanIps.length})`);
  assert(Array.isArray(st2.qrUrls) && st2.qrUrls.length === st2.urls.length, `status.qrUrls matches urls length`);

  // ── 9g. v10.0.0 — QR encodes auth code when set ───────────────────────────
  log("QR-AUTH", "create a server WITH auth code; verify QR URL includes ?code=");
  const port3 = await new Promise((resolve) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const cfgAuth = db.createServerConfig("Auth Server", port3, [lib.id], "SECRET123");
  const startAuth = await srv.startMediaServer(cfgAuth.id);
  assert(startAuth.ok === true, `auth-coded server starts ok`);
  const stAuth = srv.getMediaServerStatus(cfgAuth.id);
  assert(stAuth.qrUrls.every((u) => u.includes("?code=SECRET123")), `every QR URL includes ?code=SECRET123 (got ${JSON.stringify(stAuth.qrUrls)}) — fixes the "QR doesn't open" bug`);
  const unauthLibs = await fetch(new URL("/api/libraries", startAuth.url).toString());
  assert(unauthLibs.status === 401, `un-auth'd request to auth server → 401 (got ${unauthLibs.status})`);
  const authedLibs = await fetch(new URL("/api/libraries?code=SECRET123", startAuth.url).toString());
  assert(authedLibs.status === 200, `auth'd request with ?code → 200`);
  srv.stopMediaServer(cfgAuth.id);

  // ── 9h. v10.0.0 — updateServerConfig (fix "server shows nothing" UX) ─────
  log("SERVER-UPDATE", "updateServerConfig to change exposed libraries");
  const lib2 = db.createLibrary("Empty", "movie");
  const updated = db.updateServerConfig(cfg.id, { libraryIds: [lib2.id] });
  assert(updated && updated.libraryIds.length === 1 && updated.libraryIds[0] === lib2.id, `updateServerConfig patched libraryIds to [${lib2.id}]`);
  srv.stopMediaServer(cfg.id);
  await sleep(400); // let the old server's sockets fully close before rebind
  const restart = await srv.startMediaServer(cfg.id);
  assert(restart.ok === true, `server restarts after config update`);
  await sleep(200); // let the new server settle before fetching
  const libsAfter = await fetchJson("/api/libraries");
  assert(libsAfter.body.length === 1 && libsAfter.body[0].id === lib2.id, `/api/libraries now exposes only the patched library — proves updateServerConfig fixed the "wrong library exposed" case`);
  // Patch back to the movie library + restart so the cleanup section operates
  // on a running server.
  db.updateServerConfig(cfg.id, { libraryIds: [lib.id] });
  srv.stopMediaServer(cfg.id);
  await sleep(400);
  await srv.startMediaServer(cfg.id);

  // ── 10. Cleanup ──────────────────────────────────────────────────────────
  log("CLEANUP", "stopMediaServer");
  const stopped = srv.stopMediaServer(cfg.id);
  assert(stopped === true, `stopMediaServer returns true`);
  const statusAfter = srv.getMediaServerStatus(cfg.id);
  assert(statusAfter.running === false, `status reflects stopped after stopMediaServer`);

  // ── 11. NEGATIVE TEST: server config with NO libraries → empty API ────────
  // This reproduces the case where the user creates a server but doesn't select
  // the library — which is the most likely real-world cause of "server shows
  // nothing". Proves the server behaves correctly (empty) in that case, so the
  // fix must be UX (default-select libraries), not backend.
  const port2 = await new Promise((resolve) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const cfg2 = db.createServerConfig("Empty Server", port2, [], null);
  const start2 = await srv.startMediaServer(cfg2.id);
  assert(start2.ok === true, `empty-library server starts ok`);
  const emptyLibs = await fetchJson2(start2.url, "/api/libraries");
  assert(Array.isArray(emptyLibs.body) && emptyLibs.body.length === 0, `empty-library server /api/libraries → [] (this is the "server shows nothing" state)`);
  srv.stopMediaServer(cfg2.id);
  console.log(`\n  NOTE: a server config with libraryIds=[] correctly returns an empty library list.`);
  console.log(`  This confirms the backend is sound — the user's "server shows nothing" was almost`);
  console.log(`  certainly a UX issue: the library wasn't selected when the server config was created,`);
  console.log(`  OR the server wasn't actually started, OR an auth code blocked the QR URL.`);

  console.log("\n=== ALL ASSERTIONS PASSED ===\n");
  // Leave the temp dir for inspection on failure; clean on success.
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
})().catch((e) => {
  console.error("\n=== TEST FAILED ===\n", e);
  process.exit(1);
});

async function fetchJson2(baseUrl, urlPath) {
  const u = new URL(urlPath, baseUrl);
  const r = await fetch(u.toString());
  return { status: r.status, body: await r.json() };
}
