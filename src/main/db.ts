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
import type { Game, DetectedGame, LauncherSettings } from "@shared/types";

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
  `);
  addColumnIfMissing(conn, "games", "completionStatus", "TEXT");
  addColumnIfMissing(conn, "games", "userRating", "INTEGER");
  addColumnIfMissing(conn, "games", "tags", "TEXT");
  addColumnIfMissing(conn, "games", "notes", "TEXT");
  addColumnIfMissing(conn, "games", "lastSessionAt", "TEXT");
  addColumnIfMissing(conn, "games", "sessionMinutes", "INTEGER DEFAULT 0");
  addColumnIfMissing(conn, "games", "sortOrder", "INTEGER DEFAULT 0");

  const row = conn.prepare("SELECT value FROM meta WHERE key = 'schemaVersion'").get() as
    | { value?: string }
    | undefined;
  conn.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('schemaVersion', '3')").run();
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
  const stmt = conn.prepare(`
    INSERT INTO games (
      title, platform, source, executable, installDir, launchCommand,
      coverImage, bannerImage, screenshots, description, developer, publisher, releaseDate, rating, ratingCount,
      genres, rawgId, sizeBytes,
      steamAppId, epicAppName, gogId, battlenetUid, eaOfferId, ubisoftId, riotId,
      xboxPackageFamilyName, xboxAppId, installedAt
    ) VALUES (
      @title, @platform, @source, @executable, @installDir, @launchCommand,
      @coverImage, @bannerImage, @screenshots, @description, @developer, @publisher, @releaseDate, @rating, @ratingCount,
      @genres, @rawgId, @sizeBytes,
      @steamAppId, @epicAppName, @gogId, @battlenetUid, @eaOfferId, @ubisoftId, @riotId,
      @xboxPackageFamilyName, @xboxAppId, datetime('now')
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
  };
}

export function setAllSettings(s: Partial<LauncherSettings>): LauncherSettings {
  if (s.rawgApiKey !== undefined) setSetting("rawgApiKey", s.rawgApiKey);
  if (s.autoScanOnStart !== undefined)
    setSetting("autoScanOnStart", String(s.autoScanOnStart));
  if (s.defaultSort !== undefined) setSetting("defaultSort", s.defaultSort);
  if (s.scanPaths !== undefined) setSetting("scanPaths", s.scanPaths);
  return getAllSettings();
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

// ===== Collections =====

export interface Collection {
  id: number;
  name: string;
  color: string;
  gameCount: number;
}

export function listCollections(): Collection[] {
  const conn = db();
  const rows = conn.prepare(`
    SELECT c.id, c.name, c.color, COUNT(cg.gameId) as gameCount
    FROM collections c
    LEFT JOIN collection_games cg ON c.id = cg.collectionId
    GROUP BY c.id
    ORDER BY c.name
  `).all() as Array<{ id: number; name: string; color: string; gameCount: number }>;
  return rows;
}

export function createCollection(name: string, color: string): Collection {
  const conn = db();
  const info = conn.prepare("INSERT INTO collections (name, color) VALUES (?, ?)").run(name, color || "#4ade80");
  return { id: Number(info.lastInsertRowid), name, color: color || "#4ade80", gameCount: 0 };
}

export function addGameToCollection(collectionId: number, gameId: number): void {
  db().prepare("INSERT OR IGNORE INTO collection_games (collectionId, gameId) VALUES (?, ?)").run(collectionId, gameId);
}

export function removeGameFromCollection(collectionId: number, gameId: number): void {
  db().prepare("DELETE FROM collection_games WHERE collectionId = ? AND gameId = ?").run(collectionId, gameId);
}

export function deleteCollection(id: number): void {
  db().prepare("DELETE FROM collections WHERE id = ?").run(id);
}

export function getGamesInCollection(collectionId: number): Game[] {
  const conn = db();
  const rows = conn.prepare(`
    SELECT g.* FROM games g
    JOIN collection_games cg ON g.id = cg.gameId
    WHERE cg.collectionId = ?
  `).all(collectionId) as GameRow[];
  return rows.map(rowToGame);
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
  { id: "first_game", name: "Welcome Aboard", description: "Add your first game to the library", icon: "🎮", maxProgress: 1 },
  { id: "ten_games", name: "Collector", description: "Have 10 games in your library", icon: "📚", maxProgress: 10 },
  { id: "fifty_games", name: "Library Master", description: "Have 50 games in your library", icon: "🏆", maxProgress: 50 },
  { id: "first_play", name: "Let's Play", description: "Launch a game for the first time", icon: "▶️", maxProgress: 1 },
  { id: "ten_launches", name: "Gamer", description: "Launch games 10 times total", icon: "🎯", maxProgress: 10 },
  { id: "hundred_launches", name: "Dedicated", description: "Launch games 100 times total", icon: "🔥", maxProgress: 100 },
  { id: "first_fav", name: "Favorites", description: "Favorite your first game", icon: "⭐", maxProgress: 1 },
  { id: "ten_favs", name: "Curator", description: "Favorite 10 games", icon: "💖", maxProgress: 10 },
  { id: "first_complete", name: "Finished", description: "Mark a game as Completed", icon: "✅", maxProgress: 1 },
  { id: "ten_complete", name: "Completionist", description: "Mark 10 games as Completed", icon: "🎖️", maxProgress: 10 },
  { id: "first_rating", name: "Critic", description: "Rate your first game", icon: "📝", maxProgress: 1 },
  { id: "first_scan", name: "Explorer", description: "Run your first system scan", icon: "🔍", maxProgress: 1 },
  { id: "first_patch", name: "Enricher", description: "Patch metadata for a game", icon: "✨", maxProgress: 1 },
  { id: "ten_hours", name: "Marathon", description: "Play for 10 hours total", icon: "⏰", maxProgress: 600 },
  { id: "hundred_hours", name: "Centurion", description: "Play for 100 hours total", icon: "⌛", maxProgress: 6000 },
  { id: "all_platforms", name: "United", description: "Have games from all 8 platforms", icon: "🌐", maxProgress: 8 },
  { id: "first_edit", name: "Customizer", description: "Edit a game's details", icon: "⚙️", maxProgress: 1 },
  { id: "first_collection", name: "Organizer", description: "Create your first collection", icon: "📁", maxProgress: 1 },
  { id: "export_backup", name: "Safe Keeper", description: "Export your library", icon: "💾", maxProgress: 1 },
  { id: "deep_scan", name: "Deep Diver", description: "Run a deep filesystem scan", icon: "🤿", maxProgress: 1 },
];

export function getAchievements(): Array<AchievementDef & { unlockedAt: string | null; progress: number }> {
  const conn = db();
  // Ensure all achievement defs exist in DB
  for (const def of ACHIEVEMENT_DEFS) {
    conn.prepare("INSERT OR IGNORE INTO achievements (id, name, description, icon, maxProgress) VALUES (?, ?, ?, ?, ?)").run(def.id, def.name, def.description, def.icon, def.maxProgress);
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
