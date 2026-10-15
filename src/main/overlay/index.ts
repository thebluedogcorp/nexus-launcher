// NEXUS Game Overlay — simplified to a single inline HTML string.
//
// Instead of loading a separate overlay.html + overlay.js (which can fail
// due to path resolution, asar issues, module preload CORS, etc.), we
// generate the entire overlay as an inline HTML string and load it via
// loadURL("data:text/html,..."). This GUARANTEES the overlay renders
// every single time, with zero external dependencies.
//
// The overlay polls system stats via IPC every 2 seconds and renders
// them directly with vanilla DOM updates (no React needed).

import { app, BrowserWindow, globalShortcut, screen, shell } from "electron";
import { join } from "path";
import { getOverlayProfile, getDefaultOverlayConfig, getAllOverlayProfiles, getGame } from "../db";
import type { OverlayConfig } from "../db";

let overlayWindow: BrowserWindow | null = null;
let isOverlayVisible = false;
let isClickThrough = false;
let activeGameId: number | null = null;
let activeConfig: OverlayConfig | null = null;
let statsPollTimer: ReturnType<typeof setInterval> | null = null;

const DEFAULT_HOTKEYS = ["Super+G", "Alt+O", "CommandOrControl+Shift+O"];

// ============================================================
// OVERLAY HTML (self-contained — no external JS/CSS)
// ============================================================

function buildOverlayHtml(config: OverlayConfig, game: { title: string; platform: string; coverImage: string | null; playtimeSec: number; launchCount: number } | null): string {
  const accent = config.appearance.accentColor || "#2dd4bf";
  const w = config.widgets;

  // Build widget HTML
  const widgets: string[] = [];

  if (w.fps) widgets.push(`<div class="widget"><div class="w-label">FPS</div><div class="w-value" id="fps">—</div></div>`);
  if (w.sessionTimer) widgets.push(`<div class="widget"><div class="w-label">Session</div><div class="w-value" id="session">0s</div></div>`);
  if (w.cpuGpu) {
    widgets.push(`<div class="widget"><div class="w-label">CPU</div><div class="w-value" id="cpu">—</div><div class="w-sub" id="cpuTemp"></div></div>`);
    widgets.push(`<div class="widget"><div class="w-label">GPU</div><div class="w-value" id="gpu">—</div><div class="w-sub" id="gpuTemp"></div></div>`);
  }
  if (w.ramVram) {
    widgets.push(`<div class="widget"><div class="w-label">RAM</div><div class="w-value" id="ram">—</div><div class="w-sub" id="ramPct"></div></div>`);
    widgets.push(`<div class="widget"><div class="w-label">VRAM</div><div class="w-value" id="vram">—</div><div class="w-sub" id="vramPct"></div></div>`);
  }
  if (w.clock) widgets.push(`<div class="widget"><div class="w-label">Time</div><div class="w-value" id="clock">—</div></div>`);
  if (w.network) widgets.push(`<div class="widget"><div class="w-label">Ping</div><div class="w-value" id="ping">—</div></div>`);

  // Quick links
  const linksHtml = w.quickLinks && config.links.length > 0
    ? `<div class="section"><div class="section-title">Quick Links</div>${config.links.map(l =>
        `<button class="link-btn" data-url="${l.url.replace(/"/g, '&quot;')}">${l.label}</button>`
      ).join("")}</div>`
    : "";

  // Notes
  const notesHtml = w.notes && config.notes
    ? `<div class="section"><div class="section-title">Notes</div><div class="notes">${config.notes.replace(/</g, '&lt;')}</div></div>`
    : "";

  // Game info
  const gameHtml = w.gameInfo && game
    ? `<div class="section"><div class="section-title">Total Playtime</div><div class="big-value">${formatPlaytime(game.playtimeSec)}</div><div class="small-text">Launched ${game.launchCount} times</div></div>`
    : "";

  // Header
  const headerHtml = game
    ? `<div class="header">${game.coverImage ? `<img src="${game.coverImage}" class="cover" onerror="this.style.display='none'">` : ''}<div><div class="game-title">${game.title}</div><div class="game-platform">${game.platform}</div></div></div>`
    : `<div class="header"><div class="game-title">NEXUS Overlay</div></div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background: #1a1a22;
    color: rgba(255,255,255,0.95);
    font-family: "Inter","Segoe UI",system-ui,sans-serif;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  }
  .panel {
    padding: 0;
    border-radius: 0;
    height: 100vh;
    overflow-y: auto;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: linear-gradient(135deg, ${accent}20, transparent);
  }
  .cover { width: 28px; height: 36px; border-radius: 3px; object-fit: cover; flex-shrink: 0; }
  .game-title { font-size: 14px; font-weight: 700; color: #fff; }
  .game-platform { font-size: 9px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.06em; }
  .widgets { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px 14px; }
  .widget {
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .w-label { font-size: 9px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .w-value { font-size: 16px; font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; margin-top: 2px; }
  .w-sub { font-size: 10px; color: ${accent}; margin-top: 1px; font-variant-numeric: tabular-nums; }
  .section { padding: 10px 14px; border-top: 1px solid rgba(255,255,255,0.06); }
  .section-title { font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-bottom: 6px; }
  .big-value { font-size: 14px; font-weight: 600; color: #fff; }
  .small-text { font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 4px; }
  .link-btn {
    display: block;
    width: 100%;
    padding: 7px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.8);
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    margin-bottom: 4px;
    font-family: inherit;
  }
  .link-btn:hover { background: rgba(255,255,255,0.08); }
  .notes { font-size: 11px; color: rgba(255,255,255,0.7); white-space: pre-wrap; line-height: 1.5; }
  .footer {
    display: flex;
    justify-content: space-between;
    padding: 8px 14px;
    font-size: 9px;
    color: rgba(255,255,255,0.25);
    border-top: 1px solid rgba(255,255,255,0.06);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .clickthrough-badge {
    display: none;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(251,191,36,0.15);
    color: #fbbf24;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-left: auto;
  }
  .clickthrough-badge.on { display: inline-block; }
</style>
</head>
<body>
<div class="panel">
  ${headerHtml}
  <div class="widgets">${widgets.join("")}</div>
  ${gameHtml}
  ${linksHtml}
  ${notesHtml}
  <div class="footer">
    <span>Alt+O Toggle</span>
    <span>Ctrl+Shift+X Click-Through</span>
  </div>
</div>
<script>
  // Session timer
  var sessionStart = Date.now();
  setInterval(function() {
    var el = document.getElementById('session');
    if (el) {
      var sec = Math.floor((Date.now() - sessionStart) / 1000);
      var h = Math.floor(sec / 3600);
      var m = Math.floor((sec % 3600) / 60);
      var s = sec % 60;
      el.textContent = h > 0 ? h + 'h ' + m + 'm' : (m > 0 ? m + 'm ' + s + 's' : s + 's');
    }
  }, 1000);

  // Clock
  setInterval(function() {
    var el = document.getElementById('clock');
    if (el) {
      var now = new Date();
      el.textContent = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    }
  }, 1000);

  // Quick links
  document.querySelectorAll('.link-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var url = btn.getAttribute('data-url');
      if (url && window.nexus && window.nexus.overlayOpenUrl) {
        window.nexus.overlayOpenUrl(url.replace('{game}', '${game ? game.title.replace(/'/g, "\\'") : ''}'));
      }
    });
  });

  // Stats polling — calls the main process via IPC
  setInterval(function() {
    if (window.nexus && window.nexus.overlayGetStats) {
      window.nexus.overlayGetStats().then(function(stats) {
        if (!stats) return;
        var el;
        if (stats.fps > 0 && (el = document.getElementById('fps'))) el.textContent = stats.fps;
        if ((el = document.getElementById('cpu'))) el.textContent = stats.cpu.usage + '%';
        if (stats.cpu.temp != null && (el = document.getElementById('cpuTemp'))) el.textContent = stats.cpu.temp + '\\u00B0C';
        if ((el = document.getElementById('gpu'))) el.textContent = stats.gpu.usage + '%';
        if (stats.gpu.temp != null && (el = document.getElementById('gpuTemp'))) el.textContent = stats.gpu.temp + '\\u00B0C';
        if ((el = document.getElementById('ram'))) el.textContent = stats.ram.usedGB + '/' + stats.ram.totalGB + 'GB';
        if ((el = document.getElementById('ramPct'))) el.textContent = stats.ram.usagePct + '%';
        if (stats.vram.totalGB > 0) {
          if ((el = document.getElementById('vram'))) el.textContent = stats.vram.usedGB + '/' + stats.vram.totalGB + 'GB';
          if ((el = document.getElementById('vramPct'))) el.textContent = stats.vram.usagePct + '%';
        }
        if (stats.network.pingMs != null && (el = document.getElementById('ping'))) el.textContent = stats.network.pingMs + 'ms';
      }).catch(function(e) { /* ignore */ });
    }
  }, 2000);
</script>
</body>
</html>`;
}

// ============================================================
// OVERLAY WINDOW CREATION
// ============================================================

function createOverlayWindow(): BrowserWindow {
  // Always use default config if none is set
  if (!activeConfig) {
    activeConfig = getDefaultOverlayConfig();
    console.log("[overlay] No active config — using default.");
  }

  // Get active game info if available
  let gameInfo: { title: string; platform: string; coverImage: string | null; playtimeSec: number; launchCount: number } | null = null;
  if (activeGameId !== null) {
    const game = getGame(activeGameId);
    if (game) {
      gameInfo = {
        title: game.title,
        platform: game.platform,
        coverImage: game.coverImage,
        playtimeSec: game.playtimeSec,
        launchCount: game.launchCount,
      };
    }
  }

  const win = new BrowserWindow({
    width: 340,
    height: 500,
    x: 20,
    y: 20,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    show: true,
    focusable: true,
    backgroundColor: "#1a1a22",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Build the overlay HTML inline — NO external file loading
  const html = buildOverlayHtml(activeConfig, gameInfo);
  console.log("[overlay] Loading inline overlay HTML (" + html.length + " bytes)");

  // Use loadURL with data: scheme — this ALWAYS works, no path resolution needed
  win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));

  isOverlayVisible = true;

  // Log renderer console messages
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[overlay:renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  win.webContents.on("did-fail-load", (_e, errorCode, errorDescription) => {
    console.error(`[overlay] did-fail-load: ${errorCode} ${errorDescription}`);
  });

  console.log("[overlay] Overlay window created and shown.");
  return win;
}

// ============================================================
// HOTKEYS
// ============================================================

function registerHotkeys(): void {
  try { globalShortcut.unregisterAll(); } catch { /* ignore */ }

  for (const key of DEFAULT_HOTKEYS) {
    try {
      const success = globalShortcut.register(key, () => {
        console.log(`[overlay] Hotkey pressed: ${key}`);
        toggleOverlay();
      });
      if (success) {
        console.log(`[overlay] Registered hotkey: ${key}`);
      } else {
        console.warn(`[overlay] Failed to register hotkey ${key} — may be taken by another app.`);
      }
    } catch (e) {
      console.warn(`[overlay] Error registering hotkey ${key}:`, e);
    }
  }

  try {
    globalShortcut.register("CommandOrControl+Shift+X", () => {
      toggleClickThrough();
    });
    console.log("[overlay] Registered click-through toggle: Ctrl+Shift+X");
  } catch (e) {
    console.warn("[overlay] Failed to register click-through hotkey:", e);
  }
}

// ============================================================
// TOGGLE
// ============================================================

export function toggleOverlay(): void {
  console.log(`[overlay] toggleOverlay. window=${overlayWindow ? "exists" : "null"}, visible=${isOverlayVisible}`);

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
    // Reload the HTML to pick up any config/game changes
    let gameInfo: { title: string; platform: string; coverImage: string | null; playtimeSec: number; launchCount: number } | null = null;
    if (activeGameId !== null) {
      const game = getGame(activeGameId);
      if (game) {
        gameInfo = { title: game.title, platform: game.platform, coverImage: game.coverImage, playtimeSec: game.playtimeSec, launchCount: game.launchCount };
      }
    }
    const config = activeConfig || getDefaultOverlayConfig();
    const html = buildOverlayHtml(config, gameInfo);
    overlayWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    overlayWindow.show();
    overlayWindow.focus();
    isOverlayVisible = true;
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
    overlayWindow = createOverlayWindow();
  } else {
    overlayWindow.show();
    overlayWindow.focus();
    isOverlayVisible = true;
  }
}

// ============================================================
// CLICK-THROUGH
// ============================================================

export function toggleClickThrough(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  isClickThrough = !isClickThrough;
  overlayWindow.setIgnoreMouseEvents(isClickThrough, { forward: true });
  overlayWindow.setFocusable(!isClickThrough);
  console.log(`[overlay] Click-through ${isClickThrough ? "ENABLED" : "DISABLED"}`);
}

// ============================================================
// ACTIVE GAME
// ============================================================

export function setActiveGame(gameId: number | null): void {
  activeGameId = gameId;
  if (gameId !== null) {
    let config = getOverlayProfile(gameId);
    if (!config) {
      config = getDefaultOverlayConfig();
    }
    activeConfig = config;
    console.log(`[overlay] Active game set to gameId=${gameId}.`);
  } else {
    activeConfig = getDefaultOverlayConfig();
    console.log("[overlay] Active game cleared — using default config.");
  }
}

// ============================================================
// PROFILE CRUD
// ============================================================

export function updateOverlayProfile(gameId: number, config: OverlayConfig): void {
  const { setOverlayProfile } = require("../db");
  setOverlayProfile(gameId, config);
  if (gameId === activeGameId) {
    activeConfig = config;
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
  fps: number; frametime: number;
  network: { downloadMbps: number; uploadMbps: number; pingMs: number | null };
  audioLevel: number;
}> {
  const { exec } = require("child_process");
  const { promisify } = require("util");
  const execAsync = promisify(exec);

  let cpuUsage = 0, cpuTemp: number | null = null;
  let gpuUsage = 0, gpuTemp: number | null = null;
  let ramUsedGB = 0, ramTotalGB = 0;
  let vramUsedGB = 0, vramTotalGB = 0;

  if (process.platform === "win32") {
    try {
      const { stdout } = await execAsync(`typeperf "\\Processor(_Total)\\% Processor Time" -sc 1`, { maxBuffer: 1024 * 1024, timeout: 3000 });
      const match = stdout.match(/"\d+\.?\d*"/g);
      if (match && match.length >= 2) cpuUsage = Math.round(parseFloat(match[1].replace(/"/g, "")));
    } catch { /* ignore */ }

    try {
      const { stdout } = await execAsync(`wmic os get TotalVisibleMemorySize,FreePhysicalMemory /format:list`, { maxBuffer: 1024 * 1024, timeout: 3000 });
      const totalMatch = stdout.match(/TotalVisibleMemorySize=(\d+)/);
      const freeMatch = stdout.match(/FreePhysicalMemory=(\d+)/);
      if (totalMatch && freeMatch) {
        ramTotalGB = Math.round(parseInt(totalMatch[1]) / 1024 / 1024 * 10) / 10;
        ramUsedGB = Math.round((ramTotalGB - parseInt(freeMatch[1]) / 1024 / 1024) * 10) / 10;
      }
    } catch { /* ignore */ }

    try {
      const { stdout } = await execAsync(`nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits`, { maxBuffer: 1024 * 1024, timeout: 3000 });
      const parts = stdout.trim().split(", ").map((s: string) => parseInt(s.trim()));
      if (parts.length >= 4) {
        gpuUsage = parts[0] ?? 0;
        gpuTemp = parts[1] ?? null;
        vramUsedGB = Math.round(parts[2] / 1024 * 10) / 10;
        vramTotalGB = Math.round(parts[3] / 1024 * 10) / 10;
      }
    } catch { /* nvidia-smi not available */ }
  }

  return {
    cpu: { usage: cpuUsage, temp: cpuTemp },
    gpu: { usage: gpuUsage, temp: gpuTemp },
    ram: { totalGB: ramTotalGB, usedGB: ramUsedGB, usagePct: ramTotalGB > 0 ? Math.round((ramUsedGB / ramTotalGB) * 100) : 0 },
    vram: { totalGB: vramTotalGB, usedGB: vramUsedGB, usagePct: vramTotalGB > 0 ? Math.round((vramUsedGB / vramTotalGB) * 100) : 0 },
    fps: 0, frametime: 0,
    network: { downloadMbps: 0, uploadMbps: 0, pingMs: null },
    audioLevel: 0,
  };
}

// ============================================================
// IPC
// ============================================================

export function registerOverlayIpc(): void {
  const { ipcMain } = require("electron");

  ipcMain.handle("overlay:toggle", () => { toggleOverlay(); return isOverlayVisible; });
  ipcMain.handle("overlay:show", () => { showOverlay(); return true; });
  ipcMain.handle("overlay:hide", () => { hideOverlay(); return true; });
  ipcMain.handle("overlay:toggleClickThrough", () => { toggleClickThrough(); return isClickThrough; });
  ipcMain.handle("overlay:getActiveConfig", () => { return { config: activeConfig, gameId: activeGameId }; });
  ipcMain.handle("overlay:getProfile", (_e: unknown, gameId: number) => {
    let config = getOverlayProfile(gameId);
    if (!config) config = getDefaultOverlayConfig();
    return config;
  });
  ipcMain.handle("overlay:saveProfile", (_e: unknown, gameId: number, config: OverlayConfig) => { updateOverlayProfile(gameId, config); return true; });
  ipcMain.handle("overlay:deleteProfile", (_e: unknown, gameId: number) => {
    const { deleteOverlayProfile } = require("../db");
    deleteOverlayProfile(gameId); return true;
  });
  ipcMain.handle("overlay:getAllProfiles", () => { return getAllOverlayProfiles(); });
  ipcMain.handle("overlay:getStats", async () => { return getSystemStats(); });
  ipcMain.handle("overlay:openUrl", async (_e: unknown, url: string) => { await shell.openExternal(url); return true; });
  ipcMain.handle("overlay:getActiveGame", () => {
    if (activeGameId === null) return null;
    const game = getGame(activeGameId);
    if (!game) return null;
    return { id: game.id, title: game.title, platform: game.platform, coverImage: game.coverImage, playtimeSec: game.playtimeSec, launchCount: game.launchCount };
  });
}

// ============================================================
// INIT + CLEANUP
// ============================================================

export function initOverlay(): void {
  console.log("[overlay] Initializing...");
  registerHotkeys();
  registerOverlayIpc();
  // Always set a default config so the overlay works even without a game running
  if (!activeConfig) activeConfig = getDefaultOverlayConfig();
  console.log("[overlay] Ready. Press Win+G, Alt+O, or Ctrl+Shift+O to toggle.");
}

export function cleanupOverlay(): void {
  try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
  overlayWindow = null;
  isOverlayVisible = false;
}

function formatPlaytime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 1000) return `${(h / 1000).toFixed(1)}k hours`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
