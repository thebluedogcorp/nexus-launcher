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

  const row = conn.prepare("SELECT value FROM meta WHERE key = 'schemaVersion'").get() as
    | { value?: string }
    | undefined;
  if (!row?.value) {
    conn.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('schemaVersion', '2')").run();
  } else {
    conn.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('schemaVersion', '2')").run();
  }
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

export function listGames(opts: ListOptions = {}): Game[] {
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
  return rows.map(rowToGame);
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
  return getGame(id);
}

export function deleteGame(id: number): void {
  db().prepare("DELETE FROM games WHERE id = ?").run(id);
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
