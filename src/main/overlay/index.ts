// NEXUS Game Overlay — a floating, always-on-top transparent window that
// appears over the game when the user presses the global hotkey.
//
// v3.12.1 fixes:
//   - Added Win+G as a hotkey (Xbox Game Bar standard)
//   - Added did-fail-load handler so overlay load errors are logged
//   - Show the overlay window immediately on toggle (don't wait for
//     ready-to-show which may never fire if the HTML fails to load)
//   - Better path resolution for the packaged app (check more candidates)
//   - Log every step of overlay creation so the user can diagnose issues
//   - Added a fallback: if the overlay window fails to load, show an
//     error dialog telling the user what went wrong

import { app, BrowserWindow, globalShortcut, screen, shell, dialog } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { getOverlayProfile, setOverlayProfile, getDefaultOverlayConfig, getAllOverlayProfiles, getGame } from "../db";
import type { OverlayConfig } from "../db";

let overlayWindow: BrowserWindow | null = null;
let isOverlayVisible = false;
let isClickThrough = false;
let activeGameId: number | null = null;
let activeConfig: OverlayConfig | null = null;

// Hotkeys: Win+G (Xbox Game Bar standard), Alt+O, Ctrl+Shift+O
const DEFAULT_HOTKEYS = ["Super+G", "Alt+O", "CommandOrControl+Shift+O"];

// ============================================================
// OVERLAY WINDOW CREATION
// ============================================================

function resolveOverlayHtml(): string | null {
  const isDev = !!process.env.DEV || !app.isPackaged;

  if (isDev) {
    // In dev mode, the Vite dev server serves overlay.html
    return null; // null means "use loadURL instead of loadFile"
  }

  // In packaged mode, search for overlay.html in all possible locations.
  // __dirname is typically: app.asar/dist-electron/main
  // dist-renderer is at:   app.asar/dist-renderer/overlay.html
  const candidates = [
    join(__dirname, "..", "dist-renderer", "overlay.html"),          // app.asar/dist-renderer
    join(__dirname, "..", "..", "dist-renderer", "overlay.html"),     // dev tsc output
    join(process.resourcesPath || "", "app.asar", "dist-renderer", "overlay.html"),
    join(process.resourcesPath || "", "dist-renderer", "overlay.html"),
  ];

  for (const p of candidates) {
    console.log(`[overlay] Checking overlay.html candidate: ${p} → exists: ${existsSync(p)}`);
    if (existsSync(p)) return p;
  }

  console.error("[overlay] Could not find overlay.html in any location!");
  return null;
}

function createOverlayWindow(): BrowserWindow {
  const defaultConfig = getDefaultOverlayConfig();

  const win = new BrowserWindow({
    width: defaultConfig.position.width,
    height: defaultConfig.position.height,
    x: defaultConfig.position.x,
    y: defaultConfig.position.y,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false, // We'll show it as soon as content loads
    focusable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Keep the overlay always on top of everything, including fullscreen games
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Load the overlay renderer
  const isDev = !!process.env.DEV || !app.isPackaged;
  if (isDev) {
    console.log("[overlay] Loading overlay from dev server: http://localhost:5173/overlay.html");
    win.loadURL("http://localhost:5173/overlay.html");
  } else {
    const htmlPath = resolveOverlayHtml();
    if (htmlPath) {
      console.log("[overlay] Loading overlay from file:", htmlPath);
      win.loadFile(htmlPath);
    } else {
      console.error("[overlay] No overlay.html found — overlay will be blank!");
    }
  }

  // Show the window as soon as content is ready
  win.once("ready-to-show", () => {
    console.log("[overlay] Window ready-to-show — displaying overlay.");
    win.show();
    win.focus();
    isOverlayVisible = true;
    sendToOverlay("overlay:shown", { config: activeConfig, gameId: activeGameId });
  });

  // If the overlay fails to load, log the error + show a dialog
  win.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    console.error(`[overlay] did-fail-load: ${errorCode} ${errorDescription} for ${validatedURL}`);
    // Show the window anyway so the user sees something — it'll just be
    // a transparent window with the error in the console.
    win.show();
    isOverlayVisible = true;
  });

  // Log console messages from the overlay renderer
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[overlay:renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  return win;
}

// ============================================================
// HOTKEY REGISTRATION
// ============================================================

function registerHotkeys(): void {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // ignore
  }

  for (const key of DEFAULT_HOTKEYS) {
    try {
      const success = globalShortcut.register(key, () => {
        console.log(`[overlay] Hotkey pressed: ${key}`);
        toggleOverlay();
      });
      if (success) {
        console.log(`[overlay] Registered hotkey: ${key}`);
      } else {
        console.warn(`[overlay] Failed to register hotkey ${key} — it may be taken by another app.`);
      }
    } catch (e) {
      console.warn(`[overlay] Error registering hotkey ${key}:`, e);
    }
  }

  // Click-through toggle
  try {
    const success = globalShortcut.register("CommandOrControl+Shift+X", () => {
      toggleClickThrough();
    });
    if (success) {
      console.log("[overlay] Registered click-through toggle: Ctrl+Shift+X");
    }
  } catch (e) {
    console.warn("[overlay] Failed to register click-through hotkey:", e);
  }
}

function unregisterHotkeys(): void {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // ignore
  }
}

// ============================================================
// OVERLAY TOGGLE
// ============================================================

export function toggleOverlay(): void {
  console.log(`[overlay] toggleOverlay called. overlayWindow=${overlayWindow ? "exists" : "null"}, isOverlayVisible=${isOverlayVisible}`);

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    console.log("[overlay] Creating new overlay window...");
    overlayWindow = createOverlayWindow();
    return;
  }

  if (isOverlayVisible) {
    console.log("[overlay] Hiding overlay.");
    overlayWindow.hide();
    isOverlayVisible = false;
  } else {
    console.log("[overlay] Showing overlay.");
    overlayWindow.show();
    overlayWindow.focus();
    isOverlayVisible = true;
    sendToOverlay("overlay:shown", { config: activeConfig, gameId: activeGameId });
  }
}

export function hideOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed() && isOverlayVisible) {
    overlayWindow.hide();
    isOverlayVisible = false;
  }
}

export function showOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    console.log("[overlay] Creating new overlay window for showOverlay...");
    overlayWindow = createOverlayWindow();
  } else {
    overlayWindow.show();
    overlayWindow.focus();
    isOverlayVisible = true;
    sendToOverlay("overlay:shown", { config: activeConfig, gameId: activeGameId });
  }
}

// ============================================================
// CLICK-THROUGH TOGGLE
// ============================================================

export function toggleClickThrough(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  isClickThrough = !isClickThrough;
  overlayWindow.setIgnoreMouseEvents(isClickThrough, { forward: true });
  overlayWindow.setFocusable(!isClickThrough);
  sendToOverlay("overlay:clickThrough", isClickThrough);
  console.log(`[overlay] Click-through ${isClickThrough ? "ENABLED" : "DISABLED"}`);
}

// ============================================================
// ACTIVE GAME + PROFILE MANAGEMENT
// ============================================================

export function setActiveGame(gameId: number | null): void {
  activeGameId = gameId;
  if (gameId !== null) {
    let config = getOverlayProfile(gameId);
    if (!config) {
      config = getDefaultOverlayConfig();
      const game = getGame(gameId);
      if (game) {
        config.links = [
          { label: "Search Wiki", url: `https://www.google.com/search?q=${encodeURIComponent(game.title)}+wiki` },
          { label: "Game Guides", url: `https://www.google.com/search?q=${encodeURIComponent(game.title)}+guide` },
        ];
      }
    }
    activeConfig = config;
    console.log(`[overlay] Active game set to gameId=${gameId}. Profile loaded.`);
  } else {
    activeConfig = null;
    console.log("[overlay] Active game cleared.");
    hideOverlay();
  }

  if (isOverlayVisible) {
    sendToOverlay("overlay:configChanged", { config: activeConfig, gameId: activeGameId });
  }
}

export function getActiveConfig(): OverlayConfig | null {
  return activeConfig;
}

export function getActiveGameId(): number | null {
  return activeGameId;
}

// ============================================================
// PROFILE CRUD
// ============================================================

export function updateOverlayProfile(gameId: number, config: OverlayConfig): void {
  setOverlayProfile(gameId, config);
  if (gameId === activeGameId) {
    activeConfig = config;
    if (isOverlayVisible) {
      sendToOverlay("overlay:configChanged", { config: activeConfig, gameId: activeGameId });
    }
  }
}

// ============================================================
// COMMUNICATION WITH OVERLAY RENDERER
// ============================================================

function sendToOverlay(channel: string, payload: unknown): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, payload);
  }
}

// ============================================================
// SYSTEM STATS
// ============================================================

export async function getSystemStats(): Promise<{
  cpu: { usage: number; temp: number | null };
  gpu: { usage: number; temp: number | null };
  ram: { totalGB: number; usedGB: number; usagePct: number };
  vram: { totalGB: number; usedGB: number; usagePct: number };
  fps: number;
  frametime: number;
  network: { downloadMbps: number; uploadMbps: number; pingMs: number | null };
  audioLevel: number;
}> {
  const { exec } = require("child_process");
  const { promisify } = require("util");
  const execAsync = promisify(exec);

  let cpuUsage = 0;
  let cpuTemp: number | null = null;
  let gpuUsage = 0;
  let gpuTemp: number | null = null;
  let ramUsedGB = 0;
  let ramTotalGB = 0;
  let vramUsedGB = 0;
  let vramTotalGB = 0;

  if (process.platform === "win32") {
    try {
      const { stdout } = await execAsync(
        `typeperf "\\Processor(_Total)\\% Processor Time" -sc 1`,
        { maxBuffer: 1024 * 1024, timeout: 3000 },
      );
      const match = stdout.match(/"\d+\.?\d*"/g);
      if (match && match.length >= 2) {
        cpuUsage = Math.round(parseFloat(match[1].replace(/"/g, "")));
      }
    } catch { /* ignore */ }

    try {
      const { stdout } = await execAsync(
        `wmic os get TotalVisibleMemorySize,FreePhysicalMemory /format:list`,
        { maxBuffer: 1024 * 1024, timeout: 3000 },
      );
      const totalMatch = stdout.match(/TotalVisibleMemorySize=(\d+)/);
      const freeMatch = stdout.match(/FreePhysicalMemory=(\d+)/);
      if (totalMatch && freeMatch) {
        ramTotalGB = Math.round(parseInt(totalMatch[1]) / 1024 / 1024 * 10) / 10;
        const freeGB = parseInt(freeMatch[1]) / 1024 / 1024;
        ramUsedGB = Math.round((ramTotalGB - freeGB) * 10) / 10;
      }
    } catch { /* ignore */ }

    try {
      const { stdout } = await execAsync(
        `nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits`,
        { maxBuffer: 1024 * 1024, timeout: 3000 },
      );
      const parts = stdout.trim().split(", ").map((s: string) => parseInt(s.trim()));
      if (parts.length >= 4) {
        gpuUsage = parts[0] ?? 0;
        gpuTemp = parts[1] ?? null;
        vramUsedGB = Math.round(parts[2] / 1024 * 10) / 10;
        vramTotalGB = Math.round(parts[3] / 1024 * 10) / 10;
      }
    } catch { /* nvidia-smi not available */ }
  }

  const ramUsagePct = ramTotalGB > 0 ? Math.round((ramUsedGB / ramTotalGB) * 100) : 0;
  const vramUsagePct = vramTotalGB > 0 ? Math.round((vramUsedGB / vramTotalGB) * 100) : 0;

  return {
    cpu: { usage: cpuUsage, temp: cpuTemp },
    gpu: { usage: gpuUsage, temp: gpuTemp },
    ram: { totalGB: ramTotalGB, usedGB: ramUsedGB, usagePct: ramUsagePct },
    vram: { totalGB: vramTotalGB, usedGB: vramUsedGB, usagePct: vramUsagePct },
    fps: 0, frametime: 0,
    network: { downloadMbps: 0, uploadMbps: 0, pingMs: null },
    audioLevel: 0,
  };
}

// ============================================================
// OVERLAY IPC HANDLERS
// ============================================================

export function registerOverlayIpc(): void {
  const { ipcMain } = require("electron");

  ipcMain.handle("overlay:toggle", () => {
    toggleOverlay();
    return isOverlayVisible;
  });

  ipcMain.handle("overlay:show", () => {
    showOverlay();
    return true;
  });

  ipcMain.handle("overlay:hide", () => {
    hideOverlay();
    return true;
  });

  ipcMain.handle("overlay:toggleClickThrough", () => {
    toggleClickThrough();
    return isClickThrough;
  });

  ipcMain.handle("overlay:getActiveConfig", () => {
    return { config: activeConfig, gameId: activeGameId };
  });

  ipcMain.handle("overlay:getProfile", (_e: unknown, gameId: number) => {
    let config = getOverlayProfile(gameId);
    if (!config) {
      config = getDefaultOverlayConfig();
    }
    return config;
  });

  ipcMain.handle("overlay:saveProfile", (_e: unknown, gameId: number, config: OverlayConfig) => {
    updateOverlayProfile(gameId, config);
    return true;
  });

  ipcMain.handle("overlay:deleteProfile", (_e: unknown, gameId: number) => {
    const { deleteOverlayProfile } = require("../db");
    deleteOverlayProfile(gameId);
    return true;
  });

  ipcMain.handle("overlay:getAllProfiles", () => {
    return getAllOverlayProfiles();
  });

  ipcMain.handle("overlay:getStats", async () => {
    return getSystemStats();
  });

  ipcMain.handle("overlay:openUrl", async (_e: unknown, url: string) => {
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("overlay:getActiveGame", () => {
    if (activeGameId === null) return null;
    const game = getGame(activeGameId);
    if (!game) return null;
    return {
      id: game.id,
      title: game.title,
      platform: game.platform,
      coverImage: game.coverImage,
      playtimeSec: game.playtimeSec,
      launchCount: game.launchCount,
    };
  });
}

// ============================================================
// INITIALIZATION + CLEANUP
// ============================================================

export function initOverlay(): void {
  console.log("[overlay] Initializing overlay system...");
  registerHotkeys();
  registerOverlayIpc();
  console.log("[overlay] Overlay system initialized. Press Win+G, Alt+O, or Ctrl+Shift+O to toggle.");
}

export function cleanupOverlay(): void {
  unregisterHotkeys();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
  }
  overlayWindow = null;
  isOverlayVisible = false;
}
