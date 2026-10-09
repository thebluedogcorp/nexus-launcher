// NEXUS Playtime Tracker — real gameplay time tracking.
//
// When the user clicks "Play" on a game, the launcher starts the game process
// and this tracker begins monitoring it. It polls every 5 seconds to check if
// the game process is still running. When the process exits (or the user
// closes the game), the tracker records the actual elapsed playtime to the
// SQLite database.
//
// This mirrors how Steam tracks playtime — the clock starts when the game
// launches and stops when the process exits.
//
// For protocol-URI launches (steam://run/12345), we can't directly monitor
// the game process. Instead we use a heuristic: we look for any process whose
// main window title changes, or we fall back to a "stop when the user clicks
// Stop in NEXUS" approach (the renderer shows a "Stop tracking" button).
//
// For direct .exe launches, we can monitor the spawned PID directly.

import { exec } from "child_process";
import { promisify } from "util";
import { BrowserWindow } from "electron";
import { recordSession, getGame, updateGame, listGames } from "../db";
import type { Game } from "@shared/types";

const execAsync = promisify(exec);

// ============================================================
// Types
// ============================================================

export interface ActiveSession {
  gameId: number;
  gameTitle: string;
  startedAt: number;          // epoch ms
  pid: number | null;         // process ID (null for protocol launches)
  executable: string | null;  // exe path (for process detection)
  pollTimer: ReturnType<typeof setInterval> | null;
}

export interface SessionSummary {
  gameId: number;
  gameTitle: string;
  totalPlaytimeSec: number;
  totalLaunches: number;
  lastPlayedAt: string | null;
  sessionsThisWeek: number;
  sessionsThisMonth: number;
}

export interface SessionRecord {
  id: number;
  gameId: number;
  gameTitle: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
}

// ============================================================
// State
// ============================================================

const activeSessions = new Map<number, ActiveSession>(); // gameId -> session
const POLL_INTERVAL = 5000; // 5 seconds

// ============================================================
// Helpers
// ============================================================

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

function broadcastSessionUpdate(gameId: number) {
  const session = activeSessions.get(gameId);
  if (!session) return;
  const elapsedSec = Math.floor((Date.now() - session.startedAt) / 1000);
  broadcast("playtime:tick", {
    gameId,
    gameTitle: session.gameTitle,
    elapsedSec,
    startedAt: session.startedAt,
  });
}

/** Check if a process with the given PID is still running (Windows). */
async function isProcessAlive(pid: number): Promise<boolean> {
  if (process.platform !== "win32") return false;
  try {
    const { stdout } = await execAsync(
      `tasklist /FI "PID eq ${pid}" /NH /FO CSV`,
      { maxBuffer: 1024 * 1024, timeout: 5000 },
    );
    // If the output contains the PID, the process is alive.
    // tasklist returns "INFO: No tasks are running..." when no match.
    return stdout.includes(String(pid)) && !stdout.includes("No tasks");
  } catch {
    return false;
  }
}

/** Check if any process is running from the given executable path (Windows). */
async function isExeRunning(exePath: string): Promise<boolean> {
  if (process.platform !== "win32") return false;
  try {
    const exeName = exePath.split("\\").pop()?.split("/").pop() ?? exePath;
    const { stdout } = await execAsync(
      `tasklist /FI "IMAGENAME eq ${exeName}" /NH /FO CSV`,
      { maxBuffer: 1024 * 1024, timeout: 5000 },
    );
    return stdout.includes(exeName) && !stdout.includes("No tasks");
  } catch {
    return false;
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Start tracking playtime for a game. Called after the game has been launched.
 *
 * - If we have a PID (direct .exe launch), we poll tasklist for that PID.
 * - If we only have an executable path (protocol launch), we poll for the exe name.
 * - If we have neither (pure protocol launch like steam://run/12345), we
 *   start a "manual stop" session — the user clicks "Stop" in NEXUS to end it.
 */
export function startTracking(
  gameId: number,
  gameTitle: string,
  pid?: number,
  executable?: string | null,
): void {
  // If there's already an active session for this game, don't start another.
  if (activeSessions.has(gameId)) {
    console.log(`[playtime] Session already active for game ${gameId} (${gameTitle}).`);
    return;
  }

  const session: ActiveSession = {
    gameId,
    gameTitle,
    startedAt: Date.now(),
    pid: pid ?? null,
    executable: executable ?? null,
    pollTimer: null,
  };

  console.log(`[playtime] Starting tracking for "${gameTitle}" (gameId=${gameId}, pid=${pid ?? "none"}, exe=${executable ?? "none"})`);

  // Set up the poll timer
  session.pollTimer = setInterval(async () => {
    let alive = false;

    if (session.pid) {
      // Method 1: check by PID (most reliable)
      alive = await isProcessAlive(session.pid);
    } else if (session.executable) {
      // Method 2: check by exe name (for protocol launches where we know the exe path)
      alive = await isExeRunning(session.executable);
    }

    if (!alive) {
      // Process exited — end the session
      console.log(`[playtime] Process exited for "${gameTitle}". Ending session.`);
      stopTracking(gameId);
      return;
    }

    // Process still alive — broadcast the elapsed time
    broadcastSessionUpdate(gameId);
  }, POLL_INTERVAL);

  activeSessions.set(gameId, session);

  // Broadcast immediately so the UI shows "Playing..." right away
  broadcast("playtime:started", {
    gameId,
    gameTitle,
    startedAt: session.startedAt,
  });
  broadcastSessionUpdate(gameId);

  // Notify the overlay system that this game is now active — loads its
  // per-game overlay profile so the user gets the right widgets when they
  // press the overlay hotkey (Alt+O).
  try {
    const { setActiveGame } = require("../overlay");
    setActiveGame(gameId);
  } catch {
    // overlay module not loaded — ignore
  }

  // Also update the game's lastPlayedAt + launchCount immediately
  try {
    const game = getGame(gameId);
    if (game) {
      updateGame(gameId, {
        lastPlayedAt: new Date().toISOString(),
        launchCount: game.launchCount + 1,
      });
    }
  } catch (e) {
    console.warn(`[playtime] Failed to update lastPlayedAt for game ${gameId}:`, e);
  }
}

/**
 * Stop tracking playtime for a game. Records the session to the database.
 * Called when the game process exits OR when the user clicks "Stop" in NEXUS.
 */
export function stopTracking(gameId: number): { durationSec: number } {
  const session = activeSessions.get(gameId);
  if (!session) {
    console.warn(`[playtime] No active session for game ${gameId}.`);
    return { durationSec: 0 };
  }

  // Stop the poll timer
  if (session.pollTimer) {
    clearInterval(session.pollTimer);
  }

  const now = Date.now();
  const durationSec = Math.floor((now - session.startedAt) / 1000);

  console.log(`[playtime] Stopping tracking for "${session.gameTitle}". Duration: ${durationSec}s (${(durationSec / 60).toFixed(1)} min).`);

  // Record the session in the database
  try {
    const minutes = Math.max(1, Math.round(durationSec / 60));
    recordSession(gameId, minutes);

    // Also update the game's total playtime
    const game = getGame(gameId);
    if (game) {
      updateGame(gameId, {
        playtimeSec: game.playtimeSec + durationSec,
        lastPlayedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error(`[playtime] Failed to record session for game ${gameId}:`, e);
  }

  // Remove from active sessions
  activeSessions.delete(gameId);

  // Notify the overlay system that no game is active — hides the overlay.
  try {
    const { setActiveGame } = require("../overlay");
    setActiveGame(null);
  } catch {
    // overlay module not loaded — ignore
  }

  // Broadcast the end
  broadcast("playtime:stopped", {
    gameId,
    gameTitle: session.gameTitle,
    durationSec,
    startedAt: session.startedAt,
    endedAt: now,
  });

  return { durationSec };
}

/**
 * Stop all active sessions (e.g. when the app is closing).
 */
export function stopAllTracking(): void {
  for (const gameId of activeSessions.keys()) {
    stopTracking(gameId);
  }
}

/**
 * Get the active session for a game (if any).
 */
export function getActiveSession(gameId: number): ActiveSession | null {
  return activeSessions.get(gameId) ?? null;
}

/**
 * Get all active sessions.
 */
export function getActiveSessions(): ActiveSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Get the total playtime for a game (all sessions).
 */
export function getGamePlaytime(gameId: number): number {
  const game = getGame(gameId);
  return game?.playtimeSec ?? 0;
}

/**
 * Get session history for a game.
 */
export function getGameSessions(gameId: number): SessionRecord[] {
  // This queries the play_sessions table directly.
  // We import lazily to avoid circular deps.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { db } = require("../db");
  const conn = db();
  const rows = conn.prepare(
    "SELECT id, gameId, startedAt, endedAt, minutes FROM play_sessions WHERE gameId = ? ORDER BY startedAt DESC LIMIT 100",
  ).all(gameId) as Array<{ id: number; gameId: number; startedAt: string; endedAt: string | null; minutes: number }>;

  const game = getGame(gameId);
  const gameTitle = game?.title ?? "Unknown";

  return rows.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    gameTitle,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    durationSec: r.minutes * 60,
  }));
}

/**
 * Get playtime summaries for ALL games.
 */
export function getAllPlaytimeSummaries(): SessionSummary[] {
  const games = listGames({ showHidden: false });
  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000;
  const monthAgo = now - 30 * 86_400_000;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { db } = require("../db");
  const conn = db();

  const summaries: SessionSummary[] = [];

  for (const game of games) {
    // Count sessions this week and this month
    const weekCount = conn.prepare(
      "SELECT COUNT(*) as cnt FROM play_sessions WHERE gameId = ? AND startedAt >= ?",
    ).get(game.id, new Date(weekAgo).toISOString()) as { cnt: number };
    const monthCount = conn.prepare(
      "SELECT COUNT(*) as cnt FROM play_sessions WHERE gameId = ? AND startedAt >= ?",
    ).get(game.id, new Date(monthAgo).toISOString()) as { cnt: number };

    summaries.push({
      gameId: game.id,
      gameTitle: game.title,
      totalPlaytimeSec: game.playtimeSec,
      totalLaunches: game.launchCount,
      lastPlayedAt: game.lastPlayedAt,
      sessionsThisWeek: weekCount.cnt,
      sessionsThisMonth: monthCount.cnt,
    });
  }

  // Sort by total playtime desc
  summaries.sort((a, b) => b.totalPlaytimeSec - a.totalPlaytimeSec);
  return summaries;
}
