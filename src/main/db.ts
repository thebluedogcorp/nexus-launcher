// Local SQLite database layer (better-sqlite3, synchronous).
//
// The DB lives under the user's per-app data directory:
//   Windows: %APPDATA%\NEXUS\nexus.db
//   macOS:   ~/Library/Application Support/NEXUS/nexus.db
//   Linux:   ~/.config/NEXUS/nexus.db
//
// better-sqlite3 is a native addon. In a packaged app it must be loaded from
// the unpacked location (app.asar.unpacked/node_modules/better-sqlite3) — we
// require it lazily and resolve the unpacked path explicitly so it never
// throws at module-load time and blanks the window.

import { app } from "electron";
import { join, dirname } from "path";
import { mkdirSync, existsSync } from "fs";
import type { Game, DetectedGame, LauncherSettings, Collection, CollectionKind, MediaItem, MediaLibrary, MediaLibraryCategory, MediaLibraryPath, MediaProgress, MediaServerConfig, MediaContinueWatchingItem } from "@shared/types";
// v4.4.1 — CRITICAL: the main process is compiled to CommonJS, and Node's
// runtime resolver does NOT understand the @shared/* path alias (only tsc
// type-checking + the Vite-bundled renderer do). These are VALUE imports
// (DEFAULT_THEME + PRESET_THEMES are runtime objects), so they MUST use a
// relative path — otherwise the packaged app crashes on startup with
// "Cannot find module '@shared/theme-types'". Type-only imports are erased
// at emit and are safe to leave on the alias, but we use relative here too
// for unambiguity.
import type { ThemeConfig, SavedTheme } from "../shared/theme-types";
import { DEFAULT_THEME } from "../shared/theme-types";
import { PRESET_THEMES } from "../shared/theme-presets";

type BetterSqlite3Module = typeof import("better-sqlite3");
type SqliteDatabase = import("better-sqlite3").Database;

let _DatabaseCtor: BetterSqlite3Module | null = null;
let _db: SqliteDatabase | null = null;

function loadBetterSqlite3(): BetterSqlite3Module {
  if (_DatabaseCtor) return _DatabaseCtor;
  // 1. Normal require (dev + packaged when asarUnpack is configured).
  try {
    _DatabaseCtor = require("better-sqlite3") as BetterSqlite3Module;
    return _DatabaseCtor;
  } catch (e1) {
    // 2. Packaged fallback: resolve from app.asar.unpacked absolute path.
    try {
      const candidate = join(
        process.resourcesPath || "",
        "app.asar.unpacked",
        "node_modules",
        "better-sqlite3",
      );
      if (existsSync(candidate)) {
        _DatabaseCtor = require(candidate) as BetterSqlite3Module;
        return _DatabaseCtor;
      }
    } catch {
      // fall through
    }
    throw new Error(
      `better-sqlite3 could not be loaded.\n  direct: ${e1 instanceof Error ? e1.message : e1}\n  unpacked fallback also failed.\n  resourcesPath=${process.resourcesPath}`,
    );
  }
}

function dbPath(): string {
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "nexus.db");
}

function db(): SqliteDatabase {
  if (_db) return _db;
  const Database = loadBetterSqlite3();
  const p = dbPath();
  const conn = new Database(p);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  migrate(conn);
  _db = conn;
  return conn;
}

function migrate(conn: import("better-sqlite3").Database) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      title                 TEXT NOT NULL,
      platform              TEXT NOT NULL DEFAULT 'manual',
      source                TEXT NOT NULL DEFAULT 'manual',
      executable            TEXT,
      installDir             TEXT,
      launchCommand         TEXT,
      coverImage            TEXT,
      bannerImage           TEXT,
      screenshots           TEXT,
      description           TEXT,
      developer             TEXT,
      publisher             TEXT,
      releaseDate           TEXT,
      rating                REAL,
      ratingCount           INTEGER,
      genres                TEXT,
      tags                  TEXT,
      rawgId                INTEGER,
      steamAppId            TEXT,
      epicAppName           TEXT,
      gogId                 TEXT,
      battlenetUid          TEXT,
      eaOfferId             TEXT,
      ubisoftId             TEXT,
      riotId                TEXT,
      xboxPackageFamilyName TEXT,
      xboxAppId             TEXT,
      playtimeSec           INTEGER NOT NULL DEFAULT 0,
      launchCount           INTEGER NOT NULL DEFAULT 0,
      lastPlayedAt          TEXT,
      sizeBytes             INTEGER,
      favorite              INTEGER NOT NULL DEFAULT 0,
      hidden                INTEGER NOT NULL DEFAULT 0,
      installedAt           TEXT,
      createdAt             TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt             TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform);
    CREATE INDEX IF NOT EXISTS idx_games_favorite ON games(favorite);
    CREATE INDEX IF NOT EXISTS idx_games_lastPlayed ON games(lastPlayedAt);
    CREATE INDEX IF NOT EXISTS idx_games_steamAppId ON games(steamAppId);
    CREATE INDEX IF NOT EXISTS idx_games_epicAppName ON games(epicAppName);
    CREATE INDEX IF NOT EXISTS idx_games_gogId ON games(gogId);
    CREATE INDEX IF NOT EXISTS idx_games_battlenetUid ON games(battlenetUid);
    CREATE INDEX IF NOT EXISTS idx_games_ubisoftId ON games(ubisoftId);
    CREATE INDEX IF NOT EXISTS idx_games_riotId ON games(riotId);
    CREATE INDEX IF NOT EXISTS idx_games_xboxPFN ON games(xboxPackageFamilyName);
  `);
  // Idempotent column additions for existing DBs created before v1.1.
  addColumnIfMissing(conn, "games", "bannerImage", "TEXT");
  addColumnIfMissing(conn, "games", "screenshots", "TEXT");
  // v2.0 columns — 50 features schema
  addColumnIfMissing(conn, "games", "completionStatus", "TEXT");     // playing, completed, backlog, abandoned, wishlist, ""
  addColumnIfMissing(conn, "games", "userRating", "INTEGER");        // 1-5 user stars
  addColumnIfMissing(conn, "games", "tags", "TEXT");                  // pipe-separated custom tags
  addColumnIfMissing(conn, "games", "notes", "TEXT");                // user notes
  addColumnIfMissing(conn, "games", "lastSessionAt", "TEXT");        // last play session timestamp
  addColumnIfMissing(conn, "games", "sessionMinutes", "INTEGER DEFAULT 0"); // last session length
  addColumnIfMissing(conn, "games", "sortOrder", "INTEGER DEFAULT 0");     // manual drag reorder

  // Collections table — user-defined game groups
  conn.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#4ade80',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS collection_games (
      collectionId INTEGER NOT NULL,
      gameId INTEGER NOT NULL,
      PRIMARY KEY (collectionId, gameId),
      FOREIGN KEY (collectionId) REFERENCES collections(id) ON DELETE CASCADE,
      FOREIGN KEY (gameId) REFERENCES games(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS play_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gameId INTEGER NOT NULL,
      startedAt TEXT NOT NULL,
      endedAt TEXT,
      minutes INTEGER DEFAULT 0,
      FOREIGN KEY (gameId) REFERENCES games(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT DEFAULT 'trophy',
      unlockedAt TEXT,
      progress INTEGER DEFAULT 0,
      maxProgress INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS overlay_profiles (
      gameId INTEGER PRIMARY KEY,
      config TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (gameId) REFERENCES games(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      builtin INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- v9.3.0 (M1) — Local Media Server.
    -- Stores video files discovered by scanning the user's configured folders.
    -- Each row maps 1:1 to a real file on disk and is streamed back to the
    -- in-app HTML5 player via the custom nexus-media:// protocol. The
    -- launcher serves ONLY files on the user's local disk — no third-party
    -- stream hosts, no piracy sources.
    --
    -- E1 — the schema is expanded with libraryId + TMDB metadata + TV
    -- season/episode fields + lock flag. The new columns are added via
    -- addColumnIfMissing below so existing DBs upgrade in place.
    CREATE TABLE IF NOT EXISTS media (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      filePath    TEXT NOT NULL UNIQUE,
      fileSize    INTEGER NOT NULL,
      fileExt     TEXT NOT NULL,
      container   TEXT NOT NULL,
      dir         TEXT NOT NULL,
      durationSec REAL,
      scannedAt   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_media_title ON media(title);
    CREATE INDEX IF NOT EXISTS idx_media_dir   ON media(dir);

    -- E1 — Libraries + their root folders.
    CREATE TABLE IF NOT EXISTS media_libraries (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      category  TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_media_libraries_category ON media_libraries(category);

    CREATE TABLE IF NOT EXISTS media_library_paths (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      libraryId  INTEGER NOT NULL,
      path       TEXT NOT NULL,
      UNIQUE(libraryId, path),
      FOREIGN KEY (libraryId) REFERENCES media_libraries(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_media_library_paths_lib ON media_library_paths(libraryId);

    -- E1 — Per-item playback progress (continue-watching).
    CREATE TABLE IF NOT EXISTS media_progress (
      mediaId     INTEGER PRIMARY KEY,
      positionSec REAL NOT NULL,
      durationSec REAL,
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_media_progress_updated ON media_progress(updatedAt);

    -- E1 — Saved server configs (port + libraries + auth code). Started/stopped
    -- at runtime; the live HTTP server instances live in media-server.ts.
    CREATE TABLE IF NOT EXISTS media_servers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      port       INTEGER NOT NULL,
      libraryIds TEXT NOT NULL DEFAULT '',
      authCode   TEXT,
      createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  addColumnIfMissing(conn, "games", "completionStatus", "TEXT");
  addColumnIfMissing(conn, "games", "userRating", "INTEGER");
  addColumnIfMissing(conn, "games", "tags", "TEXT");
  addColumnIfMissing(conn, "games", "notes", "TEXT");
  addColumnIfMissing(conn, "games", "lastSessionAt", "TEXT");
  addColumnIfMissing(conn, "games", "sessionMinutes", "INTEGER DEFAULT 0");
  addColumnIfMissing(conn, "games", "sortOrder", "INTEGER DEFAULT 0");
  // v4.5.0 — install state. Default 1 (existing detected games are installed).
  addColumnIfMissing(conn, "games", "installed", "INTEGER NOT NULL DEFAULT 1");
  // v4.6.0 — trailer URL (RAWG clip mp4) for the muted preview.
  addColumnIfMissing(conn, "games", "trailerUrl", "TEXT");

  // v4.3.0 — Collections: icon, kind, description, pinned, sortOrder.
  // The collections table existed since v2.0 with just (id, name, color, createdAt).
  // We add the new columns idempotently so existing user collections keep working.
  // v4.3.1 — the icon column stores an icon KEY (e.g. "folder", "trophy"),
  // resolved to a lucide SVG in the renderer. Never an emoji.
  addColumnIfMissing(conn, "collections", "icon", "TEXT DEFAULT 'folder'");
  addColumnIfMissing(conn, "collections", "kind", "TEXT DEFAULT 'manual'");
  addColumnIfMissing(conn, "collections", "description", "TEXT");
  addColumnIfMissing(conn, "collections", "pinned", "INTEGER DEFAULT 0");
  addColumnIfMissing(conn, "collections", "sortOrder", "INTEGER DEFAULT 0");

  // E1 — Media table expansion (libraryId + TMDB metadata + TV grouping +
  // lock). All nullable so existing rows keep working until re-scanned.
  addColumnIfMissing(conn, "media", "libraryId",  "INTEGER");
  addColumnIfMissing(conn, "media", "tmdbId",     "INTEGER");
  addColumnIfMissing(conn, "media", "mediaType",  "TEXT");
  addColumnIfMissing(conn, "media", "year",       "INTEGER");
  addColumnIfMissing(conn, "media", "overview",   "TEXT");
  addColumnIfMissing(conn, "media", "posterPath",  "TEXT");
  addColumnIfMissing(conn, "media", "backdropPath","TEXT");
  addColumnIfMissing(conn, "media", "genres",     "TEXT");
  addColumnIfMissing(conn, "media", "runtimeMin", "INTEGER");
  addColumnIfMissing(conn, "media", "rating",     "REAL");
  addColumnIfMissing(conn, "media", "matchedAt",  "TEXT");
  addColumnIfMissing(conn, "media", "locked",     "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(conn, "media", "tvShowId",   "INTEGER");
  addColumnIfMissing(conn, "media", "season",     "INTEGER");
  addColumnIfMissing(conn, "media", "episode",    "INTEGER");
  // Indexes for the new columns (no-op if already present).
  try { conn.exec("CREATE INDEX IF NOT EXISTS idx_media_libraryId ON media(libraryId);"); } catch { /* ignore */ }
  try { conn.exec("CREATE INDEX IF NOT EXISTS idx_media_tvShowId ON media(tvShowId);"); } catch { /* ignore */ }
  try { conn.exec("CREATE INDEX IF NOT EXISTS idx_media_tmdbId   ON media(tmdbId);"); } catch { /* ignore */ }
  try { conn.exec("CREATE INDEX IF NOT EXISTS idx_media_scannedAt ON media(scannedAt);"); } catch { /* ignore */ }

  // v4.3.0 — Seed the built-in Smart Collections (auto:*) on first run.
  // These are read-only virtual collections whose membership is computed from
  // the games table at read time. They have stable negative ids so the seed is
  // idempotent across reinstalls.
  // v4.3.1 — icons are now lucide KEYS, not emojis. We UPSERT so existing
  // rows (seeded in v4.3.0 with emojis) get their icon + name refreshed.
  const SMART_COLLECTIONS: Array<{ id: number; name: string; icon: string; kind: CollectionKind; description: string; sortOrder: number }> = [
    { id: -1, name: "All Games", icon: "library", kind: "manual", description: "Every game in your library", sortOrder: -100 },
    { id: -2, name: "Favorites", icon: "star", kind: "auto:favorites", description: "Games you've starred", sortOrder: -99 },
    { id: -3, name: "Recently Played", icon: "clock", kind: "auto:recent", description: "Played in the last 30 days", sortOrder: -98 },
    { id: -4, name: "Currently Playing", icon: "gamepad", kind: "auto:playing", description: "Games marked as Playing", sortOrder: -97 },
    { id: -5, name: "Backlog", icon: "clipboard", kind: "auto:backlog", description: "Games you plan to play", sortOrder: -96 },
    { id: -6, name: "Never Played", icon: "sparkles", kind: "auto:never", description: "Games you haven't launched yet", sortOrder: -95 },
    { id: -7, name: "Top 10 Played", icon: "trophy", kind: "auto:top", description: "Your most-played games", sortOrder: -94 },
  ];
  // UPSERT: insert if absent, otherwise refresh icon/name/description/kind/sortOrder.
  // This upgrades v4.3.0 seeds (which had emoji icons) to the new key-based icons.
  const upsertSmart = conn.prepare(
    "INSERT INTO collections (id, name, icon, kind, description, sortOrder, pinned, color) " +
    "VALUES (?, ?, ?, ?, ?, ?, 1, '') " +
    "ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon, kind=excluded.kind, description=excluded.description, sortOrder=excluded.sortOrder"
  );
  for (const sc of SMART_COLLECTIONS) {
    upsertSmart.run(sc.id, sc.name, sc.icon, sc.kind, sc.description, sc.sortOrder);
  }

  // v4.4.0 — Seed the built-in theme presets on first run. Each preset has a
  // stable preset id; we store the preset id in the `name` column of a
  // dedicated builtin row keyed by a sentinel so the seeder is idempotent.
  // We use a meta key 'presetsSeeded' to avoid re-seeding (presets are
  // immutable; re-seeding would clobber any user edits to builtin rows, but
  // builtin rows are read-only by convention so this is just a guard).
  const presetsSeeded = conn.prepare("SELECT value FROM meta WHERE key = 'presetsSeeded'").get() as { value?: string } | undefined;
  if (!presetsSeeded) {
    const seedStmt = conn.prepare("INSERT INTO themes (name, config, builtin) VALUES (?, ?, 1)");
    for (const p of PRESET_THEMES) {
      seedStmt.run(p.id, JSON.stringify(p.theme));
    }
    conn.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('presetsSeeded', '1')").run();
  }

  const row = conn.prepare("SELECT value FROM meta WHERE key = 'schemaVersion'").get() as
    | { value?: string }
    | undefined;
  conn.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('schemaVersion', '4')").run();
}

function addColumnIfMissing(
  conn: import("better-sqlite3").Database,
  table: string,
  column: string,
  type: string,
): void {
  const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
  }
}

interface GameRow {
  id: number;
  title: string;
  platform: string;
  source: string;
  executable: string | null;
  installDir: string | null;
  launchCommand: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  trailerUrl: string | null;
  screenshots: string | null;
  description: string | null;
  developer: string | null;
  publisher: string | null;
  releaseDate: string | null;
  rating: number | null;
  ratingCount: number | null;
  genres: string | null;
  tags: string | null;
  rawgId: number | null;
  steamAppId: string | null;
  epicAppName: string | null;
  gogId: string | null;
  battlenetUid: string | null;
  eaOfferId: string | null;
  ubisoftId: string | null;
  riotId: string | null;
  xboxPackageFamilyName: string | null;
  xboxAppId: string | null;
  playtimeSec: number;
  launchCount: number;
  lastPlayedAt: string | null;
  sizeBytes: number | null;
  favorite: number;
  hidden: number;
  installedAt: string | null;
  installed: number;            // v4.5.0 — 0 = not installed, 1 = installed
  createdAt: string;
  updatedAt: string;
  completionStatus: string | null;
  userRating: number | null;
  notes: string | null;
  lastSessionAt: string | null;
  sessionMinutes: number;
  sortOrder: number;
}

function rowToGame(r: GameRow): Game {
  return {
    id: r.id,
    title: r.title,
    platform: r.platform as Game["platform"],
    source: r.source as Game["source"],
    executable: r.executable,
    installDir: r.installDir,
    launchCommand: r.launchCommand,
    coverImage: r.coverImage,
    bannerImage: r.bannerImage,
    trailerUrl: r.trailerUrl ?? null,
    screenshots: r.screenshots ? r.screenshots.split("|").filter(Boolean) : [],
    description: r.description,
    developer: r.developer,
    publisher: r.publisher,
    releaseDate: r.releaseDate,
    rating: r.rating,
    ratingCount: r.ratingCount,
    genres: r.genres ? r.genres.split("|").map((s) => s.trim()).filter(Boolean) : [],
    tags: r.tags ? r.tags.split("|").map((s) => s.trim()).filter(Boolean) : [],
    rawgId: r.rawgId,
    steamAppId: r.steamAppId,
    epicAppName: r.epicAppName,
    gogId: r.gogId,
    battlenetUid: r.battlenetUid,
    eaOfferId: r.eaOfferId,
    ubisoftId: r.ubisoftId,
    riotId: r.riotId,
    xboxPackageFamilyName: r.xboxPackageFamilyName,
    xboxAppId: r.xboxAppId,
    playtimeSec: r.playtimeSec,
    launchCount: r.launchCount,
    lastPlayedAt: r.lastPlayedAt,
    sizeBytes: r.sizeBytes,
    favorite: !!r.favorite,
    hidden: !!r.hidden,
    installedAt: r.installedAt,
    installed: r.installed === 1,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    completionStatus: (r.completionStatus || "") as Game["completionStatus"],
    userRating: r.userRating ?? null,
    notes: r.notes ?? null,
    lastSessionAt: r.lastSessionAt,
    sessionMinutes: r.sessionMinutes ?? 0,
    sortOrder: r.sortOrder ?? 0,
  };
}


// ===== Games =====

export interface ListOptions {
  platform?: string;
  favOnly?: boolean;
  query?: string;
  showHidden?: boolean;
  sort?: "recent" | "name" | "playtime" | "rating";
}

// In-memory cache for listGames results — avoids re-querying SQLite on every
// filter change. Invalidated on any write operation.
let _listCache: { key: string; data: Game[] } | null = null;

function listCacheKey(opts: ListOptions): string {
  return JSON.stringify(opts);
}

function invalidateListCache(): void {
  _listCache = null;
}

export function listGames(opts: ListOptions = {}): Game[] {
  const cacheKey = listCacheKey(opts);
  if (_listCache && _listCache.key === cacheKey) {
    return _listCache.data;
  }
  const conn = db();
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.platform && opts.platform !== "all") {
    where.push("platform = @platform");
    params.platform = opts.platform;
  }
  if (opts.favOnly) {
    where.push("favorite = 1");
  }
  if (opts.query && opts.query.trim()) {
    where.push("title LIKE @q");
    params.q = `%${opts.query.trim()}%`;
  }
  if (!opts.showHidden) {
    where.push("hidden = 0");
  }
  const order =
    opts.sort === "name"
      ? "title ASC"
      : opts.sort === "playtime"
        ? "playtimeSec DESC"
        : opts.sort === "rating"
          ? "rating DESC"
          : "lastPlayedAt DESC NULLS LAST";
  const sql = `SELECT * FROM games ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order}`;
  const rows = conn.prepare(sql).all(params) as GameRow[];
  const data = rows.map(rowToGame);
  _listCache = { key: cacheKey, data };
  return data;
}

export function getGame(id: number): Game | null {
  const conn = db();
  const row = conn.prepare("SELECT * FROM games WHERE id = ?").get(id) as
    | GameRow
    | undefined;
  return row ? rowToGame(row) : null;
}

export function createGame(input: {
  title: string;
  platform: Game["platform"];
  executable?: string | null;
  installDir?: string | null;
  launchCommand?: string | null;
  coverImage?: string | null;
  bannerImage?: string | null;
  trailerUrl?: string | null;
  screenshots?: string[];
  description?: string | null;
  developer?: string | null;
  publisher?: string | null;
  releaseDate?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  genres?: string[];
  rawgId?: number | null;
  sizeBytes?: number | null;
  source?: Game["source"];
  steamAppId?: string | null;
  epicAppName?: string | null;
  gogId?: string | null;
  battlenetUid?: string | null;
  eaOfferId?: string | null;
  ubisoftId?: string | null;
  riotId?: string | null;
  xboxPackageFamilyName?: string | null;
  xboxAppId?: string | null;
}): Game {
  const conn = db();
  // v4.5.3 — compute the REAL install state at insert time (don't rely on the
  // column default of 1). A manually-added game with no executable on disk +
  // no game-protocol launchCommand is NOT installed → the card shows Get.
  const installedNow = computeInstalled({
    executable: input.executable ?? null,
    installDir: input.installDir ?? null,
    launchCommand: input.launchCommand ?? null,
  }) ? 1 : 0;
  const stmt = conn.prepare(`
    INSERT INTO games (
      title, platform, source, executable, installDir, launchCommand,
      coverImage, bannerImage, trailerUrl, screenshots, description, developer, publisher, releaseDate, rating, ratingCount,
      genres, rawgId, sizeBytes,
      steamAppId, epicAppName, gogId, battlenetUid, eaOfferId, ubisoftId, riotId,
      xboxPackageFamilyName, xboxAppId, installedAt, installed
    ) VALUES (
      @title, @platform, @source, @executable, @installDir, @launchCommand,
      @coverImage, @bannerImage, @trailerUrl, @screenshots, @description, @developer, @publisher, @releaseDate, @rating, @ratingCount,
      @genres, @rawgId, @sizeBytes,
      @steamAppId, @epicAppName, @gogId, @battlenetUid, @eaOfferId, @ubisoftId, @riotId,
      @xboxPackageFamilyName, @xboxAppId, datetime('now'), @installed
    )
  `);
  const info = stmt.run({
    title: input.title,
    platform: input.platform,
    source: input.source ?? "manual",
    executable: input.executable ?? null,
    installDir: input.installDir ?? null,
    launchCommand: input.launchCommand ?? null,
    coverImage: input.coverImage ?? null,
    bannerImage: input.bannerImage ?? null,
    trailerUrl: input.trailerUrl ?? null,
    screenshots: input.screenshots?.length ? input.screenshots.join("|") : null,
    description: input.description ?? null,
    developer: input.developer ?? null,
    publisher: input.publisher ?? null,
    releaseDate: input.releaseDate ?? null,
    rating: input.rating ?? null,
    ratingCount: input.ratingCount ?? null,
    genres: input.genres?.length ? input.genres.join("|") : null,
    rawgId: input.rawgId ?? null,
    sizeBytes: input.sizeBytes ?? null,
    steamAppId: input.steamAppId ?? null,
    epicAppName: input.epicAppName ?? null,
    gogId: input.gogId ?? null,
    battlenetUid: input.battlenetUid ?? null,
    eaOfferId: input.eaOfferId ?? null,
    ubisoftId: input.ubisoftId ?? null,
    riotId: input.riotId ?? null,
    xboxPackageFamilyName: input.xboxPackageFamilyName ?? null,
    xboxAppId: input.xboxAppId ?? null,
    installed: installedNow,
  });
  invalidateListCache();
  return getGame(Number(info.lastInsertRowid))!;
}

export function updateGame(id: number, patch: Record<string, unknown>): Game | null {
  const conn = db();
  const allowed: Record<string, string> = {
    title: "title",
    platform: "platform",
    executable: "executable",
    installDir: "installDir",
    launchCommand: "launchCommand",
    coverImage: "coverImage",
    bannerImage: "bannerImage",
    trailerUrl: "trailerUrl",
    screenshots: "screenshots",
    description: "description",
    developer: "developer",
    publisher: "publisher",
    releaseDate: "releaseDate",
    rating: "rating",
    ratingCount: "ratingCount",
    rawgId: "rawgId",
    sizeBytes: "sizeBytes",
    steamAppId: "steamAppId",
    epicAppName: "epicAppName",
    gogId: "gogId",
    battlenetUid: "battlenetUid",
    eaOfferId: "eaOfferId",
    ubisoftId: "ubisoftId",
    riotId: "riotId",
    xboxPackageFamilyName: "xboxPackageFamilyName",
    xboxAppId: "xboxAppId",
    favorite: "favorite",
    hidden: "hidden",
    completionStatus: "completionStatus",
    userRating: "userRating",
    notes: "notes",
    sortOrder: "sortOrder",
  };
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(patch)) {
    const col = allowed[k];
    if (!col) continue;
    if (col === "favorite" || col === "hidden") {
      params[col] = v ? 1 : 0;
    } else if (col === "genres" || col === "tags" || col === "screenshots") {
      params[col] = Array.isArray(v) ? v.join("|") : v;
    } else {
      params[col] = v;
    }
    sets.push(`${col} = @${col}`);
  }
  if (sets.length === 0) return getGame(id);
  sets.push("updatedAt = datetime('now')");
  conn.prepare(`UPDATE games SET ${sets.join(", ")} WHERE id = @id`).run(params);
  // v4.5.3 — if the patch touched executable/installDir/launchCommand, recompute
  // the install state so the card flips Play<->Get immediately (no restart needed).
  if (patch.executable !== undefined || patch.installDir !== undefined || patch.launchCommand !== undefined) {
    try { verifyInstalled(id); } catch { /* ignore */ }
  }
  invalidateListCache();
  return getGame(id);
}

export function deleteGame(id: number): void {
  db().prepare("DELETE FROM games WHERE id = ?").run(id);
  invalidateListCache();
}

export function recordLaunch(id: number, minutes: number): Game | null {
  const conn = db();
  const seconds = Math.round(minutes * 60);
  conn.prepare(`
    UPDATE games
    SET launchCount = launchCount + 1,
        playtimeSec = playtimeSec + @seconds,
        lastPlayedAt = datetime('now'),
        updatedAt = datetime('now')
    WHERE id = @id
  `).run({ id, seconds });
  invalidateListCache();
  return getGame(id);
}

// ===== Import from scan =====

/** Find an existing game row that matches a detected game (by native id or title). */
export function findExisting(d: DetectedGame): Game | null {
  const conn = db();
  let row: GameRow | undefined;
  if (d.steamAppId) {
    row = conn.prepare("SELECT * FROM games WHERE steamAppId = ?").get(d.steamAppId) as
      | GameRow
      | undefined;
  }
  if (!row && d.epicAppName) {
    row = conn.prepare("SELECT * FROM games WHERE epicAppName = ?").get(d.epicAppName) as
      | GameRow
      | undefined;
  }
  if (!row && d.gogId) {
    row = conn.prepare("SELECT * FROM games WHERE gogId = ?").get(d.gogId) as
      | GameRow
      | undefined;
  }
  if (!row && d.battlenetUid) {
    row = conn.prepare("SELECT * FROM games WHERE battlenetUid = ?").get(d.battlenetUid) as
      | GameRow
      | undefined;
  }
  if (!row && d.eaOfferId) {
    row = conn.prepare("SELECT * FROM games WHERE eaOfferId = ?").get(d.eaOfferId) as
      | GameRow
      | undefined;
  }
  if (!row && d.ubisoftId) {
    row = conn.prepare("SELECT * FROM games WHERE ubisoftId = ?").get(d.ubisoftId) as
      | GameRow
      | undefined;
  }
  if (!row && d.riotId) {
    row = conn.prepare("SELECT * FROM games WHERE riotId = ?").get(d.riotId) as
      | GameRow
      | undefined;
  }
  if (!row && d.xboxPackageFamilyName) {
    row = conn
      .prepare("SELECT * FROM games WHERE xboxPackageFamilyName = ?")
      .get(d.xboxPackageFamilyName) as GameRow | undefined;
  }
  if (!row) {
    row = conn.prepare("SELECT * FROM games WHERE title = ? COLLATE NOCASE").get(d.title) as
      | GameRow
      | undefined;
  }
  return row ? rowToGame(row) : null;
}

export function importDetected(items: DetectedGame[]): Game[] {
  const out: Game[] = [];
  for (const d of items) {
    if (findExisting(d)) continue;
    const created = createGame({
      title: d.title,
      platform: d.platform,
      source: "auto",
      executable: d.executable,
      installDir: d.installDir,
      launchCommand: d.launchCommand,
      sizeBytes: d.sizeBytes,
      steamAppId: d.steamAppId ?? null,
      epicAppName: d.epicAppName ?? null,
      gogId: d.gogId ?? null,
      battlenetUid: d.battlenetUid ?? null,
      eaOfferId: d.eaOfferId ?? null,
      ubisoftId: d.ubisoftId ?? null,
      riotId: d.riotId ?? null,
      xboxPackageFamilyName: d.xboxPackageFamilyName ?? null,
      xboxAppId: d.xboxAppId ?? null,
    });
    out.push(created);
  }
  invalidateListCache();
  return out;
}

// ===== Stats =====

export function getStats(): {
  totalGames: number;
  byPlatform: Record<string, number>;
  totalPlaytimeSec: number;
  totalLaunches: number;
  totalSizeBytes: number;
  favorites: number;
  avgRating: number | null;
  playedToday: number;
} {
  const conn = db();
  const rows = conn
    .prepare(
      "SELECT platform, playtimeSec, launchCount, favorite, sizeBytes, rating, lastPlayedAt FROM games WHERE hidden = 0",
    )
    .all() as Array<{
      platform: string;
      playtimeSec: number;
      launchCount: number;
      favorite: number;
      sizeBytes: number | null;
      rating: number | null;
      lastPlayedAt: string | null;
    }>;
  const byPlatform: Record<string, number> = {};
  let totalPlaytime = 0;
  let totalLaunches = 0;
  let totalSize = 0;
  let favorites = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  let recent = 0;
  for (const r of rows) {
    byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1;
    totalPlaytime += r.playtimeSec;
    totalLaunches += r.launchCount;
    totalSize += r.sizeBytes ?? 0;
    if (r.favorite) favorites++;
    if (r.rating !== null) {
      ratingSum += r.rating;
      ratingCount++;
    }
    if (r.lastPlayedAt && r.lastPlayedAt >= dayAgo) recent++;
  }
  return {
    totalGames: rows.length,
    byPlatform,
    totalPlaytimeSec: totalPlaytime,
    totalLaunches,
    totalSizeBytes: totalSize,
    favorites,
    avgRating: ratingCount ? ratingSum / ratingCount : null,
    playedToday: recent,
  };
}

// ===== Settings =====

export function getSetting(key: string): string | null {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value?: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db()
    .prepare(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function getAllSettings(): LauncherSettings {
  return {
    rawgApiKey: getSetting("rawgApiKey") ?? "",
    autoScanOnStart: getSetting("autoScanOnStart") === "true",
    defaultSort: (getSetting("defaultSort") as LauncherSettings["defaultSort"]) ?? "recent",
    scanPaths: getSetting("scanPaths") ?? "",
    launchOnStartup: getSetting("launchOnStartup") === "true",
    closeBehavior: (getSetting("closeBehavior") as LauncherSettings["closeBehavior"]) ?? "ask",
    uiMode: (getSetting("uiMode") as LauncherSettings["uiMode"]) ?? "console",
    // v4.3.0 — platform visibility + sidebar collapse
    hiddenPlatforms: getSetting("hiddenPlatforms") ?? "",
    sidebarCollapsed: getSetting("sidebarCollapsed") === "true",
    // v4.4.0 — active theme id (0 = default, not yet saved)
    activeThemeId: Number(getSetting("activeThemeId") ?? "0") || 0,
    // v9.3.0 (M1) — Local Media Server settings.
    mediaPaths: getSetting("mediaPaths") ?? "",
    mediaAccessCode: getSetting("mediaAccessCode") ?? "",
  };
}

export function setAllSettings(s: Partial<LauncherSettings>): LauncherSettings {
  if (s.rawgApiKey !== undefined) setSetting("rawgApiKey", s.rawgApiKey);
  if (s.autoScanOnStart !== undefined)
    setSetting("autoScanOnStart", String(s.autoScanOnStart));
  if (s.defaultSort !== undefined) setSetting("defaultSort", s.defaultSort);
  if (s.scanPaths !== undefined) setSetting("scanPaths", s.scanPaths);
  if (s.launchOnStartup !== undefined) setSetting("launchOnStartup", String(s.launchOnStartup));
  if (s.closeBehavior !== undefined) setSetting("closeBehavior", s.closeBehavior);
  if (s.uiMode !== undefined) setSetting("uiMode", s.uiMode);
  if (s.hiddenPlatforms !== undefined) setSetting("hiddenPlatforms", s.hiddenPlatforms);
  if (s.sidebarCollapsed !== undefined) setSetting("sidebarCollapsed", String(s.sidebarCollapsed));
  if (s.activeThemeId !== undefined) setSetting("activeThemeId", String(s.activeThemeId));
  // v9.3.0 (M1) — Local Media Server settings.
  if (s.mediaPaths !== undefined) setSetting("mediaPaths", s.mediaPaths);
  if (s.mediaAccessCode !== undefined) setSetting("mediaAccessCode", s.mediaAccessCode);
  return getAllSettings();
}

// ===== v4.4.0 Themes =====

interface ThemeRow {
  id: number;
  name: string;
  config: string;
  builtin: number;
  createdAt: string;
}

function rowToTheme(r: ThemeRow): SavedTheme {
  let config: ThemeConfig;
  try {
    config = JSON.parse(r.config);
  } catch {
    config = JSON.parse(JSON.stringify(DEFAULT_THEME));
  }
  // For builtin themes the `name` column holds the preset id ("preset-…");
  // the display name lives in config.name. For user themes both agree.
  return {
    id: r.id,
    name: r.builtin === 1 ? (config.name ?? r.name) : r.name,
    config,
    builtin: r.builtin === 1,
    createdAt: r.createdAt,
  };
}

export function listThemes(): SavedTheme[] {
  const conn = db();
  const rows = conn.prepare("SELECT id, name, config, builtin, createdAt FROM themes ORDER BY builtin DESC, name ASC").all() as ThemeRow[];
  return rows.map(rowToTheme);
}

export function getTheme(id: number): SavedTheme | null {
  const conn = db();
  const row = conn.prepare("SELECT id, name, config, builtin, createdAt FROM themes WHERE id = ?").get(id) as ThemeRow | undefined;
  return row ? rowToTheme(row) : null;
}

export function createTheme(name: string, config: ThemeConfig): SavedTheme {
  const conn = db();
  const info = conn.prepare("INSERT INTO themes (name, config, builtin) VALUES (?, ?, 0)").run(name, JSON.stringify(config));
  return getTheme(Number(info.lastInsertRowid))!;
}

export function updateTheme(id: number, patch: { name?: string; config?: ThemeConfig }): SavedTheme | null {
  const conn = db();
  const cur = getTheme(id);
  if (!cur) return null;
  if (cur.builtin) return cur; // builtins are read-only
  if (patch.name !== undefined) conn.prepare("UPDATE themes SET name = ? WHERE id = ?").run(patch.name, id);
  if (patch.config !== undefined) conn.prepare("UPDATE themes SET config = ? WHERE id = ?").run(JSON.stringify(patch.config), id);
  return getTheme(id);
}

export function deleteTheme(id: number): void {
  const cur = getTheme(id);
  if (!cur || cur.builtin) return; // never delete builtins
  db().prepare("DELETE FROM themes WHERE id = ?").run(id);
}

/** Duplicate a theme (builtin or user) into a new editable personal copy. */
export function duplicateTheme(id: number, newName: string): SavedTheme | null {
  const cur = getTheme(id);
  if (!cur) return null;
  return createTheme(newName, { ...cur.config, name: newName });
}

// ===== v4.5.0 Downloads + install verification =====

// v4.5.3 — A launchCommand counts as "installed" ONLY if it's a known game
// protocol (steam://, com.epicgames.launcher://, gog://, battlenet://, …)
// — NOT http(s)://, which is a store/web link, not a launchable install.
const GAME_PROTOCOL_SCHEMES = new Set([
  "steam", "com.epicgames.launcher", "epic", "gog", "gogalaxy",
  "battlenet", "blizzard", "origin2", "origin", "uplay", "ubisoft",
  "valorant", "riot", "shell", "xbox", "ms-xbox",
]);
export function isLaunchableGameUri(url: string | null | undefined): boolean {
  if (!url) return false;
  const m = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url);
  if (!m) return false;
  return GAME_PROTOCOL_SCHEMES.has(m[1].toLowerCase());
}

/** Compute whether a game (by its stored fields) is actually installed. */
function computeInstalled(g: { executable: string | null; installDir: string | null; launchCommand: string | null }): boolean {
  if (g.executable && existsSync(g.executable)) return true;
  if (g.installDir && existsSync(g.installDir)) return true;
  if (isLaunchableGameUri(g.launchCommand)) return true;
  return false;
}

/** Verify whether a game is actually installed on disk + update the flag. */
export function verifyInstalled(gameId: number): boolean {
  const g = db().prepare("SELECT platform, executable, installDir, launchCommand FROM games WHERE id = ?").get(gameId) as
    { platform: string; executable: string | null; installDir: string | null; launchCommand: string | null } | undefined;
  if (!g) return false;
  const installed = computeInstalled(g);
  db().prepare("UPDATE games SET installed = ?, updatedAt = ? WHERE id = ?").run(installed ? 1 : 0, new Date().toISOString(), gameId);
  return installed;
}

/** Batch-verify all games; returns the list whose installed flag changed. */
export function verifyAllInstalled(): Array<{ id: number; title: string; installed: boolean }> {
  const conn = db();
  const games = conn.prepare("SELECT id, title, platform, executable, installDir, launchCommand FROM games").all() as
    Array<{ id: number; title: string; platform: string; executable: string | null; installDir: string | null; launchCommand: string | null }>;
  const changed: Array<{ id: number; title: string; installed: boolean }> = [];
  const now = new Date().toISOString();
  for (const g of games) {
    const installed = computeInstalled(g);
    const cur = conn.prepare("SELECT installed FROM games WHERE id = ?").get(g.id) as { installed: number } | undefined;
    if (cur && (cur.installed === 1) !== installed) {
      conn.prepare("UPDATE games SET installed = ?, updatedAt = ? WHERE id = ?").run(installed ? 1 : 0, now, g.id);
      changed.push({ id: g.id, title: g.title, installed });
    }
  }
  return changed;
}

// ===== v2.0 Features =====

/** Export the entire library as JSON (backup). */
export function exportLibrary(): string {
  const conn = db();
  const games = conn.prepare("SELECT * FROM games").all() as GameRow[];
  const collections = conn.prepare("SELECT * FROM collections").all() as Array<{ id: number; name: string; color: string; createdAt: string }>;
  const collectionGames = conn.prepare("SELECT * FROM collection_games").all() as Array<{ collectionId: number; gameId: number }>;
  const sessions = conn.prepare("SELECT * FROM play_sessions").all() as Array<{ id: number; gameId: number; startedAt: string; endedAt: string | null; minutes: number }>;
  return JSON.stringify({ version: 3, games: games.map(rowToGame), collections, collectionGames, sessions, exportedAt: new Date().toISOString() }, null, 2);
}

/** Import a library JSON backup (merge — doesn't delete existing games). */
export function importLibrary(json: string): { imported: number; skipped: number } {
  const data = JSON.parse(json) as { games?: Game[]; collections?: unknown[]; sessions?: unknown[] };
  let imported = 0;
  let skipped = 0;
  if (!data.games) return { imported: 0, skipped: 0 };
  for (const g of data.games) {
    const existing = findExisting({ title: g.title, platform: g.platform, executable: g.executable ?? null, installDir: g.installDir ?? null, launchCommand: g.launchCommand ?? null, sizeBytes: g.sizeBytes ?? null } as DetectedGame);
    if (existing) { skipped++; continue; }
    createGame({
      title: g.title,
      platform: g.platform,
      source: g.source,
      executable: g.executable,
      installDir: g.installDir,
      launchCommand: g.launchCommand,
      coverImage: g.coverImage,
      bannerImage: g.bannerImage,
      screenshots: g.screenshots,
      description: g.description,
      developer: g.developer,
      publisher: g.publisher,
      releaseDate: g.releaseDate,
      rating: g.rating,
      ratingCount: g.ratingCount,
      genres: g.genres,
      rawgId: g.rawgId,
      sizeBytes: g.sizeBytes,
      steamAppId: g.steamAppId,
      epicAppName: g.epicAppName,
      gogId: g.gogId,
      battlenetUid: g.battlenetUid,
      eaOfferId: g.eaOfferId,
      ubisoftId: g.ubisoftId,
      riotId: g.riotId,
      xboxPackageFamilyName: g.xboxPackageFamilyName,
      xboxAppId: g.xboxAppId,
    });
    imported++;
  }
  return { imported, skipped };
}

/** Check which games have missing install directories (uninstalled but still in library). */
export function checkMissingGames(): Array<{ id: number; title: string; installDir: string | null; executable: string | null }> {
  const conn = db();
  const games = conn.prepare("SELECT id, title, installDir, executable FROM games").all() as Array<{ id: number; title: string; installDir: string | null; executable: string | null }>;
  const missing: Array<{ id: number; title: string; installDir: string | null; executable: string | null }> = [];
  for (const g of games) {
    if (g.executable && !existsSync(g.executable)) {
      missing.push(g);
    } else if (g.installDir && !existsSync(g.installDir) && !g.executable) {
      missing.push(g);
    }
  }
  return missing;
}

/** Detailed stats for the stats dashboard. */
export function getDetailedStats(): {
  totalGames: number;
  totalPlaytimeSec: number;
  totalLaunches: number;
  totalSizeBytes: number;
  avgRating: number | null;
  favorites: number;
  hidden: number;
  byPlatform: Record<string, number>;
  byStatus: Record<string, number>;
  byGenre: Record<string, number>;
  topPlayed: Array<{ id: number; title: string; playtimeSec: number }>;
  recentlyPlayed: Array<{ id: number; title: string; lastPlayedAt: string | null }>;
  recentlyAdded: Array<{ id: number; title: string; createdAt: string }>;
  largestGames: Array<{ id: number; title: string; sizeBytes: number | null }>;
  neverPlayed: number;
  completionRate: number;
} {
  const conn = db();
  const rows = conn.prepare("SELECT * FROM games").all() as GameRow[];
  const games = rows.map(rowToGame);
  const byPlatform: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byGenre: Record<string, number> = {};
  let totalPlaytime = 0;
  let totalLaunches = 0;
  let totalSize = 0;
  let favorites = 0;
  let hidden = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let neverPlayed = 0;
  let completed = 0;
  for (const g of games) {
    byPlatform[g.platform] = (byPlatform[g.platform] || 0) + 1;
    const status = g.completionStatus || "unsorted";
    byStatus[status] = (byStatus[status] || 0) + 1;
    if (status === "completed") completed++;
    for (const genre of g.genres) byGenre[genre] = (byGenre[genre] || 0) + 1;
    totalPlaytime += g.playtimeSec;
    totalLaunches += g.launchCount;
    totalSize += g.sizeBytes ?? 0;
    if (g.favorite) favorites++;
    if (g.hidden) hidden++;
    if (g.rating !== null) { ratingSum += g.rating; ratingCount++; }
    if (g.playtimeSec === 0) neverPlayed++;
  }
  return {
    totalGames: games.length,
    totalPlaytimeSec: totalPlaytime,
    totalLaunches,
    totalSizeBytes: totalSize,
    avgRating: ratingCount ? ratingSum / ratingCount : null,
    favorites,
    hidden,
    byPlatform,
    byStatus,
    byGenre,
    topPlayed: games.sort((a, b) => b.playtimeSec - a.playtimeSec).slice(0, 10).map((g) => ({ id: g.id, title: g.title, playtimeSec: g.playtimeSec })),
    recentlyPlayed: games.filter((g) => g.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? "")).slice(0, 10).map((g) => ({ id: g.id, title: g.title, lastPlayedAt: g.lastPlayedAt })),
    recentlyAdded: games.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 10).map((g) => ({ id: g.id, title: g.title, createdAt: g.createdAt })),
    largestGames: games.filter((g) => g.sizeBytes).sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)).slice(0, 10).map((g) => ({ id: g.id, title: g.title, sizeBytes: g.sizeBytes })),
    neverPlayed,
    completionRate: games.length > 0 ? (completed / games.length) * 100 : 0,
  };
}

/** Record a play session. */
export function recordSession(gameId: number, minutes: number): void {
  const conn = db();
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  conn.prepare("INSERT INTO play_sessions (gameId, startedAt, endedAt, minutes) VALUES (?, ?, ?, ?)").run(gameId, now, now, minutes);
  conn.prepare("UPDATE games SET lastSessionAt = ?, sessionMinutes = ? WHERE id = ?").run(now, minutes, gameId);
}

// ===== Collections (v4.3.0 — extended) =====
// A collection is either:
//   - manual: membership stored in collection_games junction (user-curated)
//   - auto:* : membership computed from the games table at read time
// Smart Collections are seeded with negative ids on migrate() (see above).

export interface CollectionRow {
  id: number;
  name: string;
  icon: string;
  color: string;
  kind: string;
  description: string | null;
  pinned: number;
  sortOrder: number;
  createdAt: string;
  gameCount: number;
}

/** Resolve a Smart Collection kind → SQL fragment matching the games table. */
function autoCollectionWhere(kind: string): string | null {
  switch (kind) {
    case "auto:favorites":
      return "favorite = 1";
    case "auto:recent":
      // lastPlayedAt within the last 30 days
      return "lastPlayedAt IS NOT NULL AND lastPlayedAt >= datetime('now','-30 days')";
    case "auto:playing":
      return "completionStatus = 'playing'";
    case "auto:backlog":
      return "completionStatus = 'backlog'";
    case "auto:never":
      return "lastPlayedAt IS NULL";
    case "auto:top":
      return "playtimeSec > 0";
    default:
      return null; // manual or unknown → use junction
  }
}

function rowToCollection(r: CollectionRow): Collection {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon ?? "folder",
    color: r.color ?? "",
    kind: (r.kind as CollectionKind) ?? "manual",
    description: r.description ?? null,
    pinned: r.pinned === 1,
    sortOrder: r.sortOrder ?? 0,
    gameCount: r.gameCount ?? 0,
    createdAt: r.createdAt,
  };
}

export function listCollections(): Collection[] {
  const conn = db();
  // Manual collections: count via the junction. Smart collections: count via
  // the auto-where clause. We compute counts in JS to handle both cleanly.
  const all = conn.prepare(
    "SELECT id, name, icon, color, kind, description, pinned, sortOrder, createdAt FROM collections"
  ).all() as Array<Omit<CollectionRow, "gameCount">>;

  const countStmt = conn.prepare("SELECT COUNT(*) as n FROM games WHERE hidden = 0");
  const autoCountStmt = (where: string) =>
    conn.prepare(`SELECT COUNT(*) as n FROM games WHERE hidden = 0 AND ${where}`).get() as { n: number };
  const manualCountStmt = conn.prepare(
    "SELECT COUNT(*) as n FROM collection_games cg JOIN games g ON g.id = cg.gameId WHERE cg.collectionId = ? AND g.hidden = 0"
  );

  const out: Collection[] = [];
  for (const r of all) {
    let gameCount = 0;
    if (r.id === -1) {
      // "All Games" special
      gameCount = (countStmt.get() as { n: number }).n;
    } else {
      const w = autoCollectionWhere(r.kind);
      if (w) {
        gameCount = autoCountStmt(w).n;
      } else {
        gameCount = (manualCountStmt.get(r.id) as { n: number }).n;
      }
    }
    out.push(rowToCollection({ ...r, gameCount }));
  }
  // Sort: pinned first, then sortOrder asc, then name asc.
  out.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export interface CreateCollectionInput {
  name: string;
  icon?: string;
  color?: string;
  description?: string;
}

export function createCollection(input: CreateCollectionInput): Collection {
  const conn = db();
  const icon = input.icon || "folder";
  const color = input.color || "";
  const info = conn.prepare(
    "INSERT INTO collections (name, icon, color, kind, description, pinned, sortOrder) VALUES (?, ?, ?, 'manual', ?, 0, 0)"
  ).run(input.name, icon, color, input.description ?? null);
  const id = Number(info.lastInsertRowid);
  const row = conn.prepare(
    "SELECT id, name, icon, color, kind, description, pinned, sortOrder, createdAt FROM collections WHERE id = ?"
  ).get(id) as Omit<CollectionRow, "gameCount">;
  return rowToCollection({ ...row, gameCount: 0 });
}

export interface UpdateCollectionInput {
  name?: string;
  icon?: string;
  color?: string;
  description?: string;
  pinned?: boolean;
  sortOrder?: number;
}

export function updateCollection(id: number, patch: UpdateCollectionInput): Collection | null {
  const conn = db();
  const cur = conn.prepare("SELECT id FROM collections WHERE id = ?").get(id);
  if (!cur) return null;
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name); }
  if (patch.icon !== undefined) { sets.push("icon = ?"); vals.push(patch.icon); }
  if (patch.color !== undefined) { sets.push("color = ?"); vals.push(patch.color); }
  if (patch.description !== undefined) { sets.push("description = ?"); vals.push(patch.description); }
  if (patch.pinned !== undefined) { sets.push("pinned = ?"); vals.push(patch.pinned ? 1 : 0); }
  if (patch.sortOrder !== undefined) { sets.push("sortOrder = ?"); vals.push(patch.sortOrder); }
  if (sets.length > 0) {
    vals.push(id);
    conn.prepare(`UPDATE collections SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
  const row = conn.prepare(
    "SELECT id, name, icon, color, kind, description, pinned, sortOrder, createdAt FROM collections WHERE id = ?"
  ).get(id) as Omit<CollectionRow, "gameCount">;
  // recompute count
  const w = autoCollectionWhere(row.kind);
  let gameCount = 0;
  if (row.id === -1) {
    gameCount = (conn.prepare("SELECT COUNT(*) as n FROM games WHERE hidden = 0").get() as { n: number }).n;
  } else if (w) {
    gameCount = (conn.prepare(`SELECT COUNT(*) as n FROM games WHERE hidden = 0 AND ${w}`).get() as { n: number }).n;
  } else {
    gameCount = (conn.prepare("SELECT COUNT(*) as n FROM collection_games cg JOIN games g ON g.id = cg.gameId WHERE cg.collectionId = ? AND g.hidden = 0").get(id) as { n: number }).n;
  }
  return rowToCollection({ ...row, gameCount });
}

export function addGameToCollection(collectionId: number, gameId: number): void {
  // Only manual collections accept junction rows. Smart collections are virtual.
  db().prepare("INSERT OR IGNORE INTO collection_games (collectionId, gameId) VALUES (?, ?)").run(collectionId, gameId);
}

export function removeGameFromCollection(collectionId: number, gameId: number): void {
  db().prepare("DELETE FROM collection_games WHERE collectionId = ? AND gameId = ?").run(collectionId, gameId);
}

export function deleteCollection(id: number): void {
  // Never delete the built-in Smart Collections (negative ids).
  if (id < 0) return;
  db().prepare("DELETE FROM collections WHERE id = ?").run(id);
}

/** Reorder manual collections by passing the desired id order. */
export function reorderCollections(ids: number[]): void {
  const conn = db();
  const stmt = conn.prepare("UPDATE collections SET sortOrder = ? WHERE id = ?");
  ids.forEach((id, i) => stmt.run(i, id));
}

/** Resolve the games in a collection (manual via junction, smart via query). */
export function getGamesInCollection(collectionId: number): Game[] {
  const conn = db();
  const col = conn.prepare("SELECT kind FROM collections WHERE id = ?").get(collectionId) as { kind: string } | undefined;
  if (!col) return [];

  // Special-case "All Games"
  if (collectionId === -1) {
    const rows = conn.prepare("SELECT * FROM games WHERE hidden = 0 ORDER BY sortOrder ASC, title ASC").all() as GameRow[];
    return rows.map(rowToGame);
  }

  const w = autoCollectionWhere(col.kind);
  let rows: GameRow[];
  if (w) {
    let order = "ORDER BY lastPlayedAt DESC";
    if (col.kind === "auto:top") order = "ORDER BY playtimeSec DESC LIMIT 10";
    if (col.kind === "auto:favorites") order = "ORDER BY title ASC";
    if (col.kind === "auto:backlog" || col.kind === "auto:playing" || col.kind === "auto:never") order = "ORDER BY title ASC";
    rows = conn.prepare(`SELECT * FROM games WHERE hidden = 0 AND ${w} ${order}`).all() as GameRow[];
  } else {
    rows = conn.prepare(`
      SELECT g.* FROM games g
      JOIN collection_games cg ON g.id = cg.gameId
      WHERE cg.collectionId = ? AND g.hidden = 0
      ORDER BY cg.rowid ASC
    `).all(collectionId) as GameRow[];
  }
  return rows.map(rowToGame);
}

/** Which collection ids contain a given game (for the "Add to collection" menu). */
export function getCollectionsForGame(gameId: number): number[] {
  const conn = db();
  const rows = conn.prepare("SELECT collectionId FROM collection_games WHERE gameId = ?").all(gameId) as Array<{ collectionId: number }>;
  return rows.map((r) => r.collectionId);
}

// ===== Achievements =====

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxProgress: number;
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: "first_game", name: "Welcome Aboard", description: "Add your first game to the library", icon: "gamepad", maxProgress: 1 },
  { id: "ten_games", name: "Collector", description: "Have 10 games in your library", icon: "library", maxProgress: 10 },
  { id: "fifty_games", name: "Library Master", description: "Have 50 games in your library", icon: "trophy", maxProgress: 50 },
  { id: "first_play", name: "Let's Play", description: "Launch a game for the first time", icon: "play", maxProgress: 1 },
  { id: "ten_launches", name: "Gamer", description: "Launch games 10 times total", icon: "target", maxProgress: 10 },
  { id: "hundred_launches", name: "Dedicated", description: "Launch games 100 times total", icon: "flame", maxProgress: 100 },
  { id: "first_fav", name: "Favorites", description: "Favorite your first game", icon: "star", maxProgress: 1 },
  { id: "ten_favs", name: "Curator", description: "Favorite 10 games", icon: "heart", maxProgress: 10 },
  { id: "first_complete", name: "Finished", description: "Mark a game as Completed", icon: "check", maxProgress: 1 },
  { id: "ten_complete", name: "Completionist", description: "Mark 10 games as Completed", icon: "award", maxProgress: 10 },
  { id: "first_rating", name: "Critic", description: "Rate your first game", icon: "pencil", maxProgress: 1 },
  { id: "first_scan", name: "Explorer", description: "Run your first system scan", icon: "search", maxProgress: 1 },
  { id: "first_patch", name: "Enricher", description: "Patch metadata for a game", icon: "sparkles", maxProgress: 1 },
  { id: "ten_hours", name: "Marathon", description: "Play for 10 hours total", icon: "clock", maxProgress: 600 },
  { id: "hundred_hours", name: "Centurion", description: "Play for 100 hours total", icon: "hourglass", maxProgress: 6000 },
  { id: "all_platforms", name: "United", description: "Have games from all 8 platforms", icon: "globe", maxProgress: 8 },
  { id: "first_edit", name: "Customizer", description: "Edit a game's details", icon: "settings", maxProgress: 1 },
  { id: "first_collection", name: "Organizer", description: "Create your first collection", icon: "folder", maxProgress: 1 },
  { id: "export_backup", name: "Safe Keeper", description: "Export your library", icon: "save", maxProgress: 1 },
  { id: "deep_scan", name: "Deep Diver", description: "Run a deep filesystem scan", icon: "waves", maxProgress: 1 },
];

export function getAchievements(): Array<AchievementDef & { unlockedAt: string | null; progress: number }> {
  const conn = db();
  // v4.3.1 — UPSERT every achievement def so the icon column gets refreshed
  // from the old emoji value (v4.3.0) to the new lucide KEY. name/description/
  // maxProgress are refreshed too in case of copy edits.
  const upsertAch = conn.prepare(
    "INSERT INTO achievements (id, name, description, icon, maxProgress) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, icon=excluded.icon, maxProgress=excluded.maxProgress"
  );
  for (const def of ACHIEVEMENT_DEFS) {
    upsertAch.run(def.id, def.name, def.description, def.icon, def.maxProgress);
  }
  const rows = conn.prepare("SELECT * FROM achievements ORDER BY id").all() as Array<{ id: string; name: string; description: string; icon: string; unlockedAt: string | null; progress: number; maxProgress: number }>;
  return rows;
}

export function unlockAchievement(id: string): boolean {
  const conn = db();
  const row = conn.prepare("SELECT unlockedAt FROM achievements WHERE id = ?").get(id) as { unlockedAt: string | null } | undefined;
  if (row?.unlockedAt) return false; // already unlocked
  conn.prepare("UPDATE achievements SET unlockedAt = datetime('now'), progress = maxProgress WHERE id = ?").run(id);
  return true; // newly unlocked
}

export function updateAchievementProgress(id: string, progress: number): boolean {
  const conn = db();
  const row = conn.prepare("SELECT unlockedAt, maxProgress FROM achievements WHERE id = ?").get(id) as { unlockedAt: string | null; maxProgress: number } | undefined;
  if (!row) return false;
  if (row.unlockedAt) return false; // already unlocked
  const newProgress = Math.min(progress, row.maxProgress);
  conn.prepare("UPDATE achievements SET progress = ? WHERE id = ?").run(newProgress, id);
  if (newProgress >= row.maxProgress) {
    conn.prepare("UPDATE achievements SET unlockedAt = datetime('now') WHERE id = ?").run(id);
    return true; // newly unlocked
  }
  return false;
}

/** Check all achievements against current library stats and unlock/update as needed.
 *  Returns a list of newly unlocked achievement IDs. */
export function checkAchievements(): string[] {
  const stats = getStats();
  const newlyUnlocked: string[] = [];
  const games = listGames({ showHidden: true });
  const completed = games.filter((g) => g.completionStatus === "completed").length;
  const rated = games.filter((g) => g.userRating !== null).length;
  const platforms = new Set(games.map((g) => g.platform)).size;

  const checks: Array<{ id: string; progress: number; max: number }> = [
    { id: "first_game", progress: Math.min(stats.totalGames, 1), max: 1 },
    { id: "ten_games", progress: stats.totalGames, max: 10 },
    { id: "fifty_games", progress: stats.totalGames, max: 50 },
    { id: "ten_launches", progress: stats.totalLaunches, max: 10 },
    { id: "hundred_launches", progress: stats.totalLaunches, max: 100 },
    { id: "ten_favs", progress: stats.favorites, max: 10 },
    { id: "ten_complete", progress: completed, max: 10 },
    { id: "first_rating", progress: Math.min(rated, 1), max: 1 },
    { id: "ten_hours", progress: Math.round(stats.totalPlaytimeSec / 60), max: 600 },
    { id: "hundred_hours", progress: Math.round(stats.totalPlaytimeSec / 60), max: 6000 },
    { id: "all_platforms", progress: platforms, max: 8 },
  ];

  for (const check of checks) {
    if (updateAchievementProgress(check.id, check.progress)) {
      newlyUnlocked.push(check.id);
    }
  }
  return newlyUnlocked;
}

// ===== Overlay Profiles (per-game overlay configuration) =====

export interface OverlayProfile {
  gameId: number;
  config: OverlayConfig;
  createdAt: string;
  updatedAt: string;
}

export interface OverlayConfig {
  // Which widgets are enabled for this game
  widgets: {
    fps: boolean;
    cpuGpu: boolean;
    ramVram: boolean;
    perfGraph: boolean;
    network: boolean;
    clock: boolean;
    sessionTimer: boolean;
    gameInfo: boolean;
    audioLevel: boolean;
    notes: boolean;
    crosshair: boolean;
    quickLinks: boolean;
  };
  // Per-game custom links
  links: Array<{ label: string; url: string; icon?: string }>;
  // Per-game notes
  notes: string;
  // Crosshair settings
  crosshair: {
    enabled: boolean;
    style: "cross" | "dot" | "circle" | "t-cross";
    color: string;
    size: number;
    opacity: number;
    posX: number; // 0-100 (percentage of screen)
    posY: number;
  };
  // Overlay position + size
  position: {
    x: number; // pixels from left
    y: number; // pixels from top
    width: number;
    height: number;
  };
  // Overlay appearance
  appearance: {
    opacity: number;     // 0-100
    compact: boolean;     // compact mode (smaller widgets)
    accentColor: string;  // hex color
    showLabels: boolean;  // show widget labels
  };
  // Hotkey (game-specific override, empty = use global default)
  hotkey: string;
}

export function getOverlayProfile(gameId: number): OverlayConfig | null {
  const conn = db();
  const row = conn.prepare("SELECT config FROM overlay_profiles WHERE gameId = ?").get(gameId) as
    | { config?: string }
    | undefined;
  if (!row?.config) return null;
  try {
    return JSON.parse(row.config) as OverlayConfig;
  } catch {
    return null;
  }
}

export function setOverlayProfile(gameId: number, config: OverlayConfig): void {
  const conn = db();
  const configStr = JSON.stringify(config);
  conn.prepare(`
    INSERT INTO overlay_profiles (gameId, config, updatedAt)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(gameId) DO UPDATE SET config = excluded.config, updatedAt = datetime('now')
  `).run(gameId, configStr);
}

export function deleteOverlayProfile(gameId: number): void {
  db().prepare("DELETE FROM overlay_profiles WHERE gameId = ?").run(gameId);
}

export function getAllOverlayProfiles(): Array<{ gameId: number; gameTitle: string; config: OverlayConfig }> {
  const conn = db();
  const rows = conn.prepare(`
    SELECT op.gameId, op.config, g.title as gameTitle
    FROM overlay_profiles op
    LEFT JOIN games g ON op.gameId = g.id
    ORDER BY g.title
  `).all() as Array<{ gameId: number; config: string; gameTitle: string | null }>;
  const result: Array<{ gameId: number; gameTitle: string; config: OverlayConfig }> = [];
  for (const row of rows) {
    try {
      const config = JSON.parse(row.config) as OverlayConfig;
      result.push({ gameId: row.gameId, gameTitle: row.gameTitle ?? "Unknown", config });
    } catch {
      // skip invalid profiles
    }
  }
  return result;
}

export function getDefaultOverlayConfig(): OverlayConfig {
  return {
    widgets: {
      fps: true,
      cpuGpu: true,
      ramVram: false,
      perfGraph: false,
      network: false,
      clock: true,
      sessionTimer: true,
      gameInfo: true,
      audioLevel: false,
      notes: false,
      crosshair: false,
      quickLinks: true,
    },
    links: [
      { label: "Game Wiki", url: "https://www.google.com/search?q={game}+wiki" },
    ],
    notes: "",
    crosshair: {
      enabled: false,
      style: "cross",
      color: "#00ff00",
      size: 20,
      opacity: 80,
      posX: 50,
      posY: 50,
    },
    position: { x: 20, y: 20, width: 320, height: 400 },
    appearance: {
      opacity: 85,
      compact: false,
      accentColor: "#2dd4bf",
      showLabels: true,
    },
    hotkey: "",
  };
}

// ===== v9.3.0 (M1) — Local Media Server =====
//
// CRUD for the `media` table. Each row maps 1:1 to a real video file on the
// user's disk (no third-party stream hosts). The main-process media module
// scans configured folders and upserts discovered files here; the
// `nexus-media://` protocol handler reads rows by id and streams the bytes
// back to the in-app HTML5 player with HTTP Range support so seeking works.
//
// E1 — extended with libraryId + TMDB metadata + TV season/episode grouping
// + per-item playback progress + library + server-config tables. All
// functions are synchronous (better-sqlite3 style).

interface MediaRow {
  id: number;
  title: string;
  filePath: string;
  fileSize: number;
  fileExt: string;
  container: string;
  dir: string;
  durationSec: number | null;
  scannedAt: string;
  // E1 — nullable on existing rows; addColumnIfMissing backfills them.
  libraryId?: number | null;
  tmdbId?: number | null;
  mediaType?: string | null;
  year?: number | null;
  overview?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  genres?: string | null;
  runtimeMin?: number | null;
  rating?: number | null;
  matchedAt?: string | null;
  locked?: number | null;
  tvShowId?: number | null;
  season?: number | null;
  episode?: number | null;
}

/** Canonical media SELECT column list (E1 expanded). */
const MEDIA_SELECT_COLS =
  "id, title, filePath, fileSize, fileExt, container, dir, durationSec, scannedAt, " +
  "libraryId, tmdbId, mediaType, year, overview, posterPath, backdropPath, genres, " +
  "runtimeMin, rating, matchedAt, locked, tvShowId, season, episode";

function rowToMedia(r: MediaRow): MediaItem {
  return {
    id: r.id,
    title: r.title,
    filePath: r.filePath,
    fileSize: r.fileSize,
    fileExt: r.fileExt,
    container: r.container,
    dir: r.dir,
    durationSec: r.durationSec === null || r.durationSec === undefined ? null : Number(r.durationSec),
    scannedAt: r.scannedAt,
    libraryId: r.libraryId ?? null,
    tmdbId: r.tmdbId ?? null,
    mediaType: (r.mediaType === "movie" || r.mediaType === "tv") ? r.mediaType : null,
    year: r.year ?? null,
    overview: r.overview ?? null,
    posterPath: r.posterPath ?? null,
    backdropPath: r.backdropPath ?? null,
    genres: r.genres ? r.genres.split(",").map((s) => s.trim()).filter(Boolean) : [],
    runtimeMin: r.runtimeMin ?? null,
    rating: r.rating ?? null,
    matchedAt: r.matchedAt ?? null,
    locked: !!r.locked,
    tvShowId: r.tvShowId ?? null,
    season: r.season ?? null,
    episode: r.episode ?? null,
  };
}

export interface UpsertMediaInput {
  title: string;
  filePath: string;
  fileSize: number;
  fileExt: string;
  container: string;
  dir: string;
  libraryId?: number | null;
  mediaType?: "movie" | "tv" | null;
  tvShowId?: number | null;
  season?: number | null;
  episode?: number | null;
  year?: number | null;
}

/**
 * Insert a media file if its filePath isn't already indexed. If it IS present,
 * refresh title / size / ext / container / dir (and bump scannedAt) so a
 * re-scan keeps the row current without losing the stable id (the protocol
 * handler relies on the id being stable across re-scans). Returns true if a
 * new row was inserted, false if an existing row was updated.
 *
 * E1 — also persists libraryId + mediaType + TV season/episode fields when
 * supplied (the scanner parses S01E01 / 1x01 patterns). TMDB metadata is
 * NOT touched here — use upsertMediaMetadata() for that (so a re-scan never
 * clobbers a user's TMDB match).
 */
export function upsertMediaFile(f: UpsertMediaInput): boolean {
  const conn = db();
  const existing = conn.prepare("SELECT id, fileSize, title, libraryId, mediaType, season, episode FROM media WHERE filePath = ?").get(f.filePath) as
    | { id: number; fileSize: number; title: string; libraryId: number | null; mediaType: string | null; season: number | null; episode: number | null }
    | undefined;
  if (existing) {
    // Refresh only file-system-derived fields + libraryId. Preserve TMDB
    // metadata + locked flag. Scanner-derived mediaType/season/episode are
    // refreshed only if the existing row didn't already have them (so a
    // manually re-tagged row isn't reset by a re-scan).
    const mediaTypeToWrite = existing.mediaType ?? f.mediaType ?? null;
    const seasonToWrite = existing.season ?? f.season ?? null;
    const episodeToWrite = existing.episode ?? f.episode ?? null;
    conn.prepare(
      "UPDATE media SET title = ?, fileSize = ?, fileExt = ?, container = ?, dir = ?, " +
      "libraryId = COALESCE(?, libraryId), mediaType = ?, season = ?, episode = ?, " +
      "scannedAt = datetime('now') WHERE id = ?",
    ).run(
      f.title, f.fileSize, f.fileExt, f.container, f.dir,
      f.libraryId ?? null, mediaTypeToWrite, seasonToWrite, episodeToWrite,
      existing.id,
    );
    return false;
  }
  conn.prepare(
    "INSERT INTO media (title, filePath, fileSize, fileExt, container, dir, libraryId, mediaType, tvShowId, season, episode, year) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    f.title, f.filePath, f.fileSize, f.fileExt, f.container, f.dir,
    f.libraryId ?? null, f.mediaType ?? null, f.tvShowId ?? null,
    f.season ?? null, f.episode ?? null, f.year ?? null,
  );
  return true;
}

export function listMedia(opts?: { q?: string; dir?: string }): MediaItem[] {
  const conn = db();
  const q = (opts?.q ?? "").trim();
  const dir = (opts?.dir ?? "").trim();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q) {
    where.push("title LIKE ?");
    params.push(`%${q}%`);
  }
  if (dir) {
    where.push("dir = ?");
    params.push(dir);
  }
  const sql = where.length > 0
    ? `SELECT ${MEDIA_SELECT_COLS} FROM media WHERE ${where.join(" AND ")} ORDER BY title COLLATE NOCASE ASC`
    : `SELECT ${MEDIA_SELECT_COLS} FROM media ORDER BY title COLLATE NOCASE ASC`;
  const rows = conn.prepare(sql).all(...params) as MediaRow[];
  return rows.map(rowToMedia);
}

export function getMedia(id: number): MediaItem | null {
  const conn = db();
  const row = conn.prepare(
    `SELECT ${MEDIA_SELECT_COLS} FROM media WHERE id = ?`,
  ).get(id) as MediaRow | undefined;
  return row ? rowToMedia(row) : null;
}

export function deleteMedia(id: number): void {
  db().prepare("DELETE FROM media WHERE id = ?").run(id);
}

export function clearMedia(): void {
  db().prepare("DELETE FROM media").run();
}

/**
 * Remove rows whose filePath is no longer present on disk (the file was
 * deleted/moved between scans). `keepFilePaths` is the set of paths discovered
 * in the latest scan. Returns the count of removed rows.
 */
export function removeStaleMedia(keepFilePaths: string[]): number {
  const conn = db();
  // Three strategies depending on input size — all avoid SQL injection by
  // binding the keep list as parameters (never string-interpolated).
  if (keepFilePaths.length === 0) {
    const info = conn.prepare("DELETE FROM media").run();
    return Number(info.changes ?? 0);
  }
  if (keepFilePaths.length <= 999) {
    const placeholders = keepFilePaths.map(() => "?").join(",");
    const info = conn.prepare(`DELETE FROM media WHERE filePath NOT IN (${placeholders})`).run(...keepFilePaths);
    return Number(info.changes ?? 0);
  }
  // > 999 paths: SQLite has a parameter limit, so fall back to deleting in
  // batches of 999 against NOT IN. We collect every id present in the DB,
  // diff against the keep set in JS, then delete the survivors by id.
  const allRows = conn.prepare("SELECT id, filePath FROM media").all() as Array<{ id: number; filePath: string }>;
  const keepSet = new Set(keepFilePaths);
  const toDelete = allRows.filter((r) => !keepSet.has(r.filePath)).map((r) => r.id);
  let removed = 0;
  const delStmt = conn.prepare("DELETE FROM media WHERE id = ?");
  for (const id of toDelete) {
    removed += Number(delStmt.run(id).changes ?? 0);
  }
  return removed;
}

/**
 * Remove stale rows for a SINGLE library (only paths that belong to that
 * library's root folders, scoped by libraryId). Used by scanLibrary().
 */
export function removeStaleMediaForLibrary(libraryId: number, keepFilePaths: string[]): number {
  const conn = db();
  if (keepFilePaths.length === 0) {
    const info = conn.prepare("DELETE FROM media WHERE libraryId = ?").run(libraryId);
    return Number(info.changes ?? 0);
  }
  // Collect this library's rows + diff against the keep set in JS, then
  // delete the survivors by id. (Avoids the SQLite 999-param limit + scopes
  // the delete to one library so a scan of library A never nukes library B.)
  const rows = conn.prepare("SELECT id, filePath FROM media WHERE libraryId = ?").all(libraryId) as
    Array<{ id: number; filePath: string }>;
  const keepSet = new Set(keepFilePaths);
  const toDelete = rows.filter((r) => !keepSet.has(r.filePath)).map((r) => r.id);
  let removed = 0;
  const delStmt = conn.prepare("DELETE FROM media WHERE id = ?");
  for (const id of toDelete) {
    removed += Number(delStmt.run(id).changes ?? 0);
  }
  return removed;
}

// ── E1 — Media metadata patch (TMDB identification result) ──────────────────
//
// Updates a single media row with TMDB-derived metadata. NEVER touches the
// filePath / fileSize / fileExt / container / dir / scannedAt columns (those
// belong to the scanner). Respects the `locked` flag — if a row is locked,
// the patch is silently dropped (the user explicitly locked the metadata).
export function upsertMediaMetadata(id: number, patch: {
  tmdbId?: number | null;
  mediaType?: "movie" | "tv" | null;
  title?: string;
  year?: number | null;
  overview?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  genres?: string[] | null;
  runtimeMin?: number | null;
  rating?: number | null;
  locked?: boolean | null;
  tvShowId?: number | null;
  season?: number | null;
  episode?: number | null;
  matchedAt?: string | null;
}): MediaItem | null {
  const conn = db();
  const cur = conn.prepare("SELECT locked FROM media WHERE id = ?").get(id) as { locked?: number } | undefined;
  if (!cur) return null;
  if (cur.locked === 1 && patch.locked !== false) {
    // Row is locked — respect it.
    return getMedia(id);
  }
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.tmdbId !== undefined) { sets.push("tmdbId = ?"); params.push(patch.tmdbId ?? null); }
  if (patch.mediaType !== undefined) { sets.push("mediaType = ?"); params.push(patch.mediaType ?? null); }
  if (patch.title !== undefined) { sets.push("title = ?"); params.push(patch.title); }
  if (patch.year !== undefined) { sets.push("year = ?"); params.push(patch.year ?? null); }
  if (patch.overview !== undefined) { sets.push("overview = ?"); params.push(patch.overview ?? null); }
  if (patch.posterPath !== undefined) { sets.push("posterPath = ?"); params.push(patch.posterPath ?? null); }
  if (patch.backdropPath !== undefined) { sets.push("backdropPath = ?"); params.push(patch.backdropPath ?? null); }
  if (patch.genres !== undefined) { sets.push("genres = ?"); params.push((patch.genres ?? []).join(",")); }
  if (patch.runtimeMin !== undefined) { sets.push("runtimeMin = ?"); params.push(patch.runtimeMin ?? null); }
  if (patch.rating !== undefined) { sets.push("rating = ?"); params.push(patch.rating ?? null); }
  if (patch.tvShowId !== undefined) { sets.push("tvShowId = ?"); params.push(patch.tvShowId ?? null); }
  if (patch.season !== undefined) { sets.push("season = ?"); params.push(patch.season ?? null); }
  if (patch.episode !== undefined) { sets.push("episode = ?"); params.push(patch.episode ?? null); }
  if (patch.locked !== undefined) { sets.push("locked = ?"); params.push(patch.locked ? 1 : 0); }
  // Always stamp the matchedAt when a TMDB patch is applied (caller can override).
  sets.push("matchedAt = COALESCE(?, matchedAt)");
  params.push(patch.matchedAt ?? null);
  if (sets.length === 0) return getMedia(id);
  params.push(id);
  conn.prepare(`UPDATE media SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  return getMedia(id);
}

// ── E1 — Per-library queries + TV episode grouping ──────────────────────────

export interface ListMediaByLibraryOpts {
  q?: string;
  sort?: "title" | "year" | "added" | "rating";
  mediaType?: "movie" | "tv";
  limit?: number;
}

export function listMediaByLibrary(libraryId: number, opts: ListMediaByLibraryOpts = {}): MediaItem[] {
  const conn = db();
  const where: string[] = ["libraryId = ?"];
  const params: (string | number)[] = [libraryId];
  // Exclude episode rows from the default library view (they're shown via
  // the TV detail page's episode list). Show rows have tvShowId IS NULL.
  where.push("tvShowId IS NULL");
  if (opts.q && opts.q.trim()) {
    where.push("title LIKE ?");
    params.push(`%${opts.q.trim()}%`);
  }
  if (opts.mediaType) {
    where.push("mediaType = ?");
    params.push(opts.mediaType);
  }
  const orderBy = (() => {
    switch (opts.sort) {
      case "year":   return "year DESC NULLS LAST, title COLLATE NOCASE ASC";
      case "added":  return "scannedAt DESC, title COLLATE NOCASE ASC";
      case "rating": return "rating DESC NULLS LAST, title COLLATE NOCASE ASC";
      default:       return "title COLLATE NOCASE ASC";
    }
  })();
  let sql = `SELECT ${MEDIA_SELECT_COLS} FROM media WHERE ${where.join(" AND ")} ORDER BY ${orderBy}`;
  if (opts.limit && opts.limit > 0) {
    sql += ` LIMIT ${Math.floor(opts.limit)}`;
  }
  const rows = conn.prepare(sql).all(...params) as MediaRow[];
  return rows.map(rowToMedia);
}

/** List TV shows in a library (mediaType='tv' AND tvShowId IS NULL). */
export function listTvShows(libraryId: number): MediaItem[] {
  const conn = db();
  const rows = conn.prepare(
    `SELECT ${MEDIA_SELECT_COLS} FROM media WHERE libraryId = ? AND mediaType = 'tv' AND tvShowId IS NULL ORDER BY title COLLATE NOCASE ASC`,
  ).all(libraryId) as MediaRow[];
  return rows.map(rowToMedia);
}

/** List episodes for a TV show, optionally filtered by season. */
export function listEpisodes(tvShowId: number, season?: number): MediaItem[] {
  const conn = db();
  const rows = season === undefined
    ? conn.prepare(
      `SELECT ${MEDIA_SELECT_COLS} FROM media WHERE tvShowId = ? ORDER BY season ASC NULLS LAST, episode ASC NULLS LAST`,
    ).all(tvShowId) as MediaRow[]
    : conn.prepare(
      `SELECT ${MEDIA_SELECT_COLS} FROM media WHERE tvShowId = ? AND season = ? ORDER BY episode ASC NULLS LAST`,
    ).all(tvShowId, season) as MediaRow[];
  return rows.map(rowToMedia);
}

/** Returns the seasons present for a show (distinct season numbers, sorted). */
export function listSeasons(tvShowId: number): number[] {
  const conn = db();
  const rows = conn.prepare(
    "SELECT DISTINCT season FROM media WHERE tvShowId = ? AND season IS NOT NULL ORDER BY season ASC",
  ).all(tvShowId) as Array<{ season: number }>;
  return rows.map((r) => Number(r.season));
}

/** Find or create a synthetic "show" media row for a TV series. */
export function findOrCreateTvShow(libraryId: number, name: string, year?: number | null): number {
  const conn = db();
  // Match by library + lowercased name + mediaType='tv' + tvShowId IS NULL.
  const existing = conn.prepare(
    "SELECT id FROM media WHERE libraryId = ? AND mediaType = 'tv' AND tvShowId IS NULL AND LOWER(title) = LOWER(?) LIMIT 1",
  ).get(libraryId, name.trim()) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = conn.prepare(
    "INSERT INTO media (title, filePath, fileSize, fileExt, container, dir, libraryId, mediaType, year) " +
    "VALUES (?, ?, 0, '', 'tv', '', ?, 'tv', ?)",
  ).run(name.trim(), name.trim() + " (show)", libraryId, year ?? null);
  return Number(info.lastInsertRowid);
}

/** Find a media row by libraryId + filePath (used by the scanner to attach
 *  episode rows under the right show after upserting). */
export function findMediaByPath(filePath: string): MediaItem | null {
  const conn = db();
  const row = conn.prepare(`SELECT ${MEDIA_SELECT_COLS} FROM media WHERE filePath = ?`).get(filePath) as
    MediaRow | undefined;
  return row ? rowToMedia(row) : null;
}

/** Find an episode row by show + season + episode (for the LAN API's
 *  "play S01E05" lookup). Returns the row, or null if no such episode. */
export function findEpisode(tvShowId: number, season: number, episode: number): MediaItem | null {
  const conn = db();
  const row = conn.prepare(
    `SELECT ${MEDIA_SELECT_COLS} FROM media WHERE tvShowId = ? AND season = ? AND episode = ? LIMIT 1`,
  ).get(tvShowId, season, episode) as MediaRow | undefined;
  return row ? rowToMedia(row) : null;
}

// ── E1 — Recently added + continue-watching ─────────────────────────────────

export function listRecentlyAdded(limit = 24): MediaItem[] {
  const conn = db();
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  // Skip synthetic show rows (fileSize = 0 + container 'tv' + dir '').
  const rows = conn.prepare(
    `SELECT ${MEDIA_SELECT_COLS} FROM media WHERE tvShowId IS NULL AND NOT (fileSize = 0 AND container = 'tv' AND dir = '') ORDER BY scannedAt DESC LIMIT ${n}`,
  ).all() as MediaRow[];
  return rows.map(rowToMedia);
}

export function recordProgress(mediaId: number, positionSec: number, durationSec?: number | null): void {
  const conn = db();
  conn.prepare(
    "INSERT INTO media_progress (mediaId, positionSec, durationSec, updatedAt) " +
    "VALUES (?, ?, ?, datetime('now')) " +
    "ON CONFLICT(mediaId) DO UPDATE SET positionSec = excluded.positionSec, " +
    "durationSec = COALESCE(excluded.durationSec, media_progress.durationSec), updatedAt = datetime('now')",
  ).run(mediaId, positionSec, durationSec ?? null);
}

export function getProgress(mediaId: number): MediaProgress | null {
  const conn = db();
  const row = conn.prepare(
    "SELECT mediaId, positionSec, durationSec, updatedAt FROM media_progress WHERE mediaId = ?",
  ).get(mediaId) as
    | { mediaId: number; positionSec: number; durationSec: number | null; updatedAt: string }
    | undefined;
  if (!row) return null;
  return {
    mediaId: row.mediaId,
    positionSec: Number(row.positionSec),
    durationSec: row.durationSec === null ? null : Number(row.durationSec),
    updatedAt: row.updatedAt,
  };
}

export interface ContinueWatchingRow {
  mediaId: number;
  positionSec: number;
  durationSec: number | null;
  updatedAt: string;
}

export function listContinueWatching(limit = 24): MediaContinueWatchingItem[] {
  const conn = db();
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  // Join media + progress; only items with positionSec < 95% of duration (so
  // finished items fall off the rail). Items with no duration are always shown.
  const cleanRows = conn.prepare(
    `SELECT m.id, m.title, m.filePath, m.fileSize, m.fileExt, m.container, m.dir, m.durationSec, m.scannedAt, ` +
    `m.libraryId, m.tmdbId, m.mediaType, m.year, m.overview, m.posterPath, m.backdropPath, m.genres, ` +
    `m.runtimeMin, m.rating, m.matchedAt, m.locked, m.tvShowId, m.season, m.episode, ` +
    `p.positionSec AS p_pos, p.durationSec AS p_dur, p.updatedAt AS p_at ` +
    `FROM media_progress p JOIN media m ON m.id = p.mediaId ` +
    `WHERE (p.durationSec IS NULL OR p.positionSec < p.durationSec * 0.95) ` +
    `ORDER BY p.updatedAt DESC LIMIT ${n}`,
  ).all() as Array<MediaRow & { p_pos: number; p_dur: number | null; p_at: string }>;
  return cleanRows.map((r) => ({
    media: rowToMedia(r),
    positionSec: Number(r.p_pos),
    durationSec: r.p_dur === null || r.p_dur === undefined ? null : Number(r.p_dur),
    updatedAt: r.p_at,
  }));
}

// ── E1 — Libraries CRUD ─────────────────────────────────────────────────────

interface LibraryRow {
  id: number;
  name: string;
  category: string;
  createdAt: string;
}

function rowToLibrary(r: LibraryRow, paths: string[], itemCount: number): MediaLibrary {
  return {
    id: r.id,
    name: r.name,
    category: r.category as MediaLibraryCategory,
    createdAt: r.createdAt,
    paths,
    itemCount,
  };
}

export function listLibraries(): MediaLibrary[] {
  const conn = db();
  const libs = conn.prepare("SELECT id, name, category, createdAt FROM media_libraries ORDER BY id ASC").all() as LibraryRow[];
  const pathRows = conn.prepare("SELECT libraryId, path FROM media_library_paths ORDER BY id ASC").all() as
    Array<{ libraryId: number; path: string }>;
  const pathsByLib = new Map<number, string[]>();
  for (const p of pathRows) {
    const arr = pathsByLib.get(p.libraryId) ?? [];
    arr.push(p.path);
    pathsByLib.set(p.libraryId, arr);
  }
  const countRows = conn.prepare(
    "SELECT libraryId, COUNT(*) AS cnt FROM media WHERE libraryId IS NOT NULL GROUP BY libraryId",
  ).all() as Array<{ libraryId: number; cnt: number }>;
  const countByLib = new Map<number, number>();
  for (const c of countRows) countByLib.set(c.libraryId, Number(c.cnt));
  return libs.map((l) => rowToLibrary(l, pathsByLib.get(l.id) ?? [], countByLib.get(l.id) ?? 0));
}

export function createLibrary(name: string, category: MediaLibraryCategory): MediaLibrary {
  const conn = db();
  const cleanName = name.trim() || "Untitled Library";
  const info = conn.prepare(
    "INSERT INTO media_libraries (name, category) VALUES (?, ?)",
  ).run(cleanName, category);
  const id = Number(info.lastInsertRowid);
  return rowToLibrary(
    { id, name: cleanName, category, createdAt: new Date().toISOString().replace("T", " ").slice(0, 19) },
    [],
    0,
  );
}

export function deleteLibrary(id: number): void {
  const conn = db();
  // ON DELETE CASCADE on media_library_paths handles the junction; we also
  // null out media.libraryId (episodes + show rows keep their metadata, just
  // orphaned from the library — they're cleaned up by removeStaleMedia later).
  conn.prepare("UPDATE media SET libraryId = NULL WHERE libraryId = ?").run(id);
  conn.prepare("DELETE FROM media_libraries WHERE id = ?").run(id);
}

export function addLibraryPath(libraryId: number, path: string): void {
  const conn = db();
  const clean = (path ?? "").trim();
  if (!clean) return;
  conn.prepare(
    "INSERT OR IGNORE INTO media_library_paths (libraryId, path) VALUES (?, ?)",
  ).run(libraryId, clean);
}

export function removeLibraryPath(libraryId: number, path: string): void {
  const conn = db();
  conn.prepare(
    "DELETE FROM media_library_paths WHERE libraryId = ? AND path = ?",
  ).run(libraryId, (path ?? "").trim());
}

export function listLibraryPaths(libraryId: number): MediaLibraryPath[] {
  const conn = db();
  return conn.prepare(
    "SELECT id, libraryId, path FROM media_library_paths WHERE libraryId = ? ORDER BY id ASC",
  ).all(libraryId) as MediaLibraryPath[];
}

// ── E1 — Media server configs ───────────────────────────────────────────────

interface ServerConfigRow {
  id: number;
  name: string;
  port: number;
  libraryIds: string;
  authCode: string | null;
  createdAt: string;
}

function rowToServerConfig(r: ServerConfigRow): MediaServerConfig {
  return {
    id: r.id,
    name: r.name,
    port: Number(r.port),
    libraryIds: r.libraryIds
      ? r.libraryIds.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
      : [],
    authCode: r.authCode ?? null,
    createdAt: r.createdAt,
  };
}

export function listServerConfigs(): MediaServerConfig[] {
  const conn = db();
  const rows = conn.prepare(
    "SELECT id, name, port, libraryIds, authCode, createdAt FROM media_servers ORDER BY id ASC",
  ).all() as ServerConfigRow[];
  return rows.map(rowToServerConfig);
}

export function createServerConfig(
  name: string,
  port: number,
  libraryIds: number[],
  authCode: string | null,
): MediaServerConfig {
  const conn = db();
  const cleanName = name.trim() || "Media Server";
  const safePort = Math.max(1, Math.min(65535, Math.floor(port)));
  const idsStr = (libraryIds ?? []).filter((n) => Number.isFinite(n) && n > 0).join(",");
  const info = conn.prepare(
    "INSERT INTO media_servers (name, port, libraryIds, authCode) VALUES (?, ?, ?, ?)",
  ).run(cleanName, safePort, idsStr, authCode && authCode.trim() ? authCode.trim() : null);
  const id = Number(info.lastInsertRowid);
  return rowToServerConfig({
    id, name: cleanName, port: safePort, libraryIds: idsStr,
    authCode: authCode && authCode.trim() ? authCode.trim() : null,
    createdAt: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
}

export function deleteServerConfig(id: number): void {
  db().prepare("DELETE FROM media_servers WHERE id = ?").run(id);
}

export function getServerConfig(id: number): MediaServerConfig | null {
  const conn = db();
  const row = conn.prepare(
    "SELECT id, name, port, libraryIds, authCode, createdAt FROM media_servers WHERE id = ?",
  ).get(id) as ServerConfigRow | undefined;
  return row ? rowToServerConfig(row) : null;
}
