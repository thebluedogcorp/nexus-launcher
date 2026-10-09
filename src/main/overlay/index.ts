// NEXUS Game Overlay — a floating, always-on-top transparent window that
// appears over the game when the user presses the global hotkey (Win+G or
// Alt+O by default).
//
// Architecture:
//   - A separate BrowserWindow with:
//     frame: false, transparent: true, alwaysOnTop: true,
//     skipTaskbar: true, focusable: true (toggleable for click-through)
//   - globalShortcut registers Win+G / Alt+O to toggle the overlay
//   - The overlay loads a separate HTML page (overlay.html) that renders
//     the React overlay UI with widgets (FPS, CPU, clock, links, etc.)
//   - Per-game profiles are loaded from the DB when a game is detected
//     as running (via the playtime tracker)
//   - The overlay can toggle click-through mode (mouse events pass through
//     to the game underneath)

import { app, BrowserWindow, globalShortcut, screen, shell } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { getOverlayProfile, setOverlayProfile, getDefaultOverlayConfig, getAllOverlayProfiles, getGame } from "../db";
import type { OverlayConfig } from "../db";

let overlayWindow: BrowserWindow | null = null;
let isOverlayVisible = false;
let isClickThrough = false;
let activeGameId: number | null = null;
let activeConfig: OverlayConfig | null = null;

const DEFAULT_HOTKEYS = ["CommandOrControl+Shift+O", "Alt+O"];

// ============================================================
// OVERLAY WINDOW CREATION
// ============================================================

function createOverlayWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
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
    show: false,
    focusable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load the overlay renderer
  const isDev = !!process.env.DEV || !app.isPackaged;
  if (isDev) {
    win.loadURL("http://localhost:5173/overlay.html");
    // Don't open devtools for the overlay in dev — it steals focus from the game
  } else {
    const candidates = [
      join(__dirname, "..", "dist-renderer", "overlay.html"),
      join(process.resourcesPath || "", "app.asar", "dist-renderer", "overlay.html"),
      join(process.resourcesPath || "", "dist-renderer", "overlay.html"),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        win.loadFile(p);
        break;
      }
    }
  }

  // Keep the overlay always on top of everything, including fullscreen games
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  return win;
}

// ============================================================
// HOTKEY REGISTRATION
// ============================================================

function registerHotkeys(): void {
  // Unregister any existing hotkeys first
  try {
    globalShortcut.unregisterAll();
  } catch {
    // ignore
  }

  // Register the default hotkeys
  for (const key of DEFAULT_HOTKEYS) {
    try {
      globalShortcut.register(key, () => {
        toggleOverlay();
      });
      console.log(`[overlay] Registered hotkey: ${key}`);
    } catch (e) {
      console.warn(`[overlay] Failed to register hotkey ${key}:`, e);
    }
  }

  // Register a hotkey for click-through toggle
  try {
    globalShortcut.register("CommandOrControl+Shift+X", () => {
      toggleClickThrough();
    });
    console.log("[overlay] Registered click-through toggle: Ctrl+Shift+X");
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
  if (!overlayWindow) {
    overlayWindow = createOverlayWindow();
    // Wait for the window to be ready before showing
    overlayWindow.once("ready-to-show", () => {
      overlayWindow?.show();
      overlayWindow?.focus();
      isOverlayVisible = true;
      sendToOverlay("overlay:shown", { config: activeConfig, gameId: activeGameId });
    });
    return;
  }

  if (isOverlayVisible) {
    overlayWindow.hide();
    isOverlayVisible = false;
  } else {
    overlayWindow.show();
    overlayWindow.focus();
    isOverlayVisible = true;
    sendToOverlay("overlay:shown", { config: activeConfig, gameId: activeGameId });
  }
}

export function hideOverlay(): void {
  if (overlayWindow && isOverlayVisible) {
    overlayWindow.hide();
    isOverlayVisible = false;
  }
}

export function showOverlay(): void {
  if (!overlayWindow) {
    overlayWindow = createOverlayWindow();
    overlayWindow.once("ready-to-show", () => {
      overlayWindow?.show();
      overlayWindow?.focus();
      isOverlayVisible = true;
      sendToOverlay("overlay:shown", { config: activeConfig, gameId: activeGameId });
    });
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
  if (!overlayWindow) return;
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
    // Load the per-game overlay profile (or create a default one)
    let config = getOverlayProfile(gameId);
    if (!config) {
      config = getDefaultOverlayConfig();
      // Customize the default with the game title
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
    // Hide the overlay when no game is active
    hideOverlay();
  }

  // If the overlay is visible, update it with the new config
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
// PROFILE CRUD (called from IPC)
// ============================================================

export function updateOverlayProfile(gameId: number, config: OverlayConfig): void {
  setOverlayProfile(gameId, config);
  // If this is the active game's profile, update the live overlay
  if (gameId === activeGameId) {
    activeConfig = config;
    if (isOverlayVisible) {
      sendToOverlay("overlay:configChanged", { config: activeConfig, gameId: activeGameId });
    }
  }
  console.log(`[overlay] Profile updated for gameId=${gameId}.`);
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
// SYSTEM STATS (for the overlay widgets)
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
  // On Windows, we use `wmic` / `typeperf` for CPU usage and `nvidia-smi` /
  // `wmic path win32_VideoController` for GPU stats. These are best-effort —
  // if a tool isn't available we return 0.
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
  let fps = 0;
  let frametime = 0;

  if (process.platform === "win32") {
    // CPU usage (typeperf gives a decimal like "12.345678")
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

    // RAM (wmic os get FreePhysicalMemory,TotalVisibleMemorySize)
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

    // GPU (nvidia-smi if available)
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
    } catch { /* nvidia-smi not available — AMD/Intel GPUs won't be monitored */ }

    // CPU temp (OpenHardwareMonitor / LibreHardwareMonitor if installed;
    // otherwise we try `wmic path MSAcpi_ThermalZoneTemperature` which is
    // unreliable but sometimes works)
    try {
      const { stdout } = await execAsync(
        `wmic /namespace:\\\\root\\wmi PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature /format:list`,
        { maxBuffer: 1024 * 1024, timeout: 3000 },
      );
      const tempMatch = stdout.match(/CurrentTemperature=(\d+)/);
      if (tempMatch) {
        // Temperature is in tenths of Kelvin — convert to Celsius
        cpuTemp = Math.round((parseInt(tempMatch[1]) / 10) - 273.15);
      }
    } catch { /* ignore */ }
  }

  const ramUsagePct = ramTotalGB > 0 ? Math.round((ramUsedGB / ramTotalGB) * 100) : 0;
  const vramUsagePct = vramTotalGB > 0 ? Math.round((vramUsedGB / vramTotalGB) * 100) : 0;

  return {
    cpu: { usage: cpuUsage, temp: cpuTemp },
    gpu: { usage: gpuUsage, temp: gpuTemp },
    ram: { totalGB: ramTotalGB, usedGB: ramUsedGB, usagePct: ramUsagePct },
    vram: { totalGB: vramTotalGB, usedGB: vramUsedGB, usagePct: vramUsagePct },
    fps, // FPS requires PresentMon or a native hook — left as 0 for now
    frametime,
    network: { downloadMbps: 0, uploadMbps: 0, pingMs: null },
    audioLevel: 0,
  };
}

// ============================================================
// OVERLAY IPC HANDLERS
// ============================================================

export function registerOverlayIpc(): void {
  const { ipcMain } = require("electron");

  // Toggle the overlay (from renderer — e.g. a tray menu button)
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

  // Toggle click-through mode
  ipcMain.handle("overlay:toggleClickThrough", () => {
    toggleClickThrough();
    return isClickThrough;
  });

  // Get the active game's overlay config
  ipcMain.handle("overlay:getActiveConfig", () => {
    return { config: activeConfig, gameId: activeGameId };
  });

  // Get a specific game's overlay profile
  ipcMain.handle("overlay:getProfile", (_e: unknown, gameId: number) => {
    let config = getOverlayProfile(gameId);
    if (!config) {
      config = getDefaultOverlayConfig();
    }
    return config;
  });

  // Save a game's overlay profile
  ipcMain.handle("overlay:saveProfile", (_e: unknown, gameId: number, config: OverlayConfig) => {
    updateOverlayProfile(gameId, config);
    return true;
  });

  // Delete a game's overlay profile
  ipcMain.handle("overlay:deleteProfile", (_e: unknown, gameId: number) => {
    const { deleteOverlayProfile } = require("../db");
    deleteOverlayProfile(gameId);
    return true;
  });

  // Get all overlay profiles (for the settings UI)
  ipcMain.handle("overlay:getAllProfiles", () => {
    return getAllOverlayProfiles();
  });

  // Get system stats (polled by the overlay renderer every 2s)
  ipcMain.handle("overlay:getStats", async () => {
    return getSystemStats();
  });

  // Open a URL in the default browser (from the overlay's quick links)
  ipcMain.handle("overlay:openUrl", async (_e: unknown, url: string) => {
    await shell.openExternal(url);
    return true;
  });

  // Get the active game info (title, cover, playtime)
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
  registerHotkeys();
  registerOverlayIpc();
  console.log("[overlay] Overlay system initialized. Press Alt+O or Ctrl+Shift+O to toggle.");
}

export function cleanupOverlay(): void {
  unregisterHotkeys();
  if (overlayWindow) {
    overlayWindow.destroy();
    overlayWindow = null;
  }
  isOverlayVisible = false;
}
