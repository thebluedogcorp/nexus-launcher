// NEXUS System Tray + Close Behavior + Launch-on-Startup
//
// This module manages:
// 1. System tray icon with context menu (Show NEXUS / Quit)
// 2. Close behavior (exit / minimize-to-tray / ask-every-time)
// 3. Launch-on-startup via Windows registry (HKCU\...\Run)

import { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { getAllSettings, setSetting } from "../db";

let tray: Tray | null = null;
let isQuitting = false;

// ============================================================
// SYSTEM TRAY
// ============================================================

function createTrayIcon(): Electron.NativeImage {
  // Try to load the app icon from several candidate locations.
  const candidates = [
    join(__dirname, "..", "..", "resources", "icon.png"),
    join(process.resourcesPath || "", "resources", "icon.png"),
    join(process.resourcesPath || "", "app.asar", "resources", "icon.png"),
  ];
  for (const iconPath of candidates) {
    if (existsSync(iconPath)) {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) {
        return img.resize({ width: 16, height: 16 });
      }
    }
  }
  return nativeImage.createEmpty();
}

export function createTray(mainWindow: BrowserWindow): Tray {
  if (tray) return tray;

  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("NEXUS — Game Launcher");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show NEXUS",
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: "separator" },
    {
      label: "Quit NEXUS",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click on tray icon shows the window
  tray.on("click", () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

// ============================================================
// CLOSE BEHAVIOR
// ============================================================

export async function handleCloseRequest(
  mainWindow: BrowserWindow,
  settings: { closeBehavior: "exit" | "minimize" | "ask" },
): Promise<boolean> {
  if (isQuitting) return false;

  const behavior = settings.closeBehavior;

  if (behavior === "exit") {
    isQuitting = true;
    return false;
  }

  if (behavior === "minimize") {
    mainWindow.hide();
    return true;
  }

  // "ask" — show a dialog
  const result = await dialog.showMessageBox(mainWindow, {
    type: "question",
    title: "Close NEXUS",
    message: "What would you like NEXUS to do?",
    detail: "You can change this behavior in Settings > Startup & Close.",
    buttons: [
      "Minimize to Tray",
      "Exit Completely",
      "Cancel",
    ],
    defaultId: 0,
    cancelId: 2,
  });

  if (result.response === 0) {
    mainWindow.hide();
    return true;
  } else if (result.response === 1) {
    isQuitting = true;
    return false;
  } else {
    return true;
  }
}

export function setQuitting(value: boolean): void {
  isQuitting = value;
}

export function getIsQuitting(): boolean {
  return isQuitting;
}

// ============================================================
// LAUNCH ON STARTUP
// ============================================================

export async function setLaunchOnStartup(enabled: boolean): Promise<void> {
  if (process.platform !== "win32") return;

  const { exec } = require("child_process");
  const { promisify } = require("util");
  const execAsync = promisify(exec);

  const regKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
  const valueName = "NEXUS";

  try {
    if (enabled) {
      const exePath = app.getPath("exe");
      const escapedPath = exePath.replace(/"/g, '\\"');
      await execAsync(
        `reg add "${regKey}" /v "${valueName}" /t REG_SZ /d "${escapedPath}" /f`,
        { maxBuffer: 1024 * 1024 },
      );
      console.log("[startup] Launch-on-startup ENABLED:", exePath);
    } else {
      await execAsync(
        `reg delete "${regKey}" /v "${valueName}" /f`,
        { maxBuffer: 1024 * 1024 },
      );
      console.log("[startup] Launch-on-startup DISABLED.");
    }
  } catch (e) {
    if (!enabled) {
      console.log("[startup] Registry value not found (already disabled).");
    } else {
      console.error("[startup] Failed to set launch-on-startup:", e);
    }
  }
}

export async function isLaunchOnStartupEnabled(): Promise<boolean> {
  if (process.platform !== "win32") return false;

  const { exec } = require("child_process");
  const { promisify } = require("util");
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync(
      `reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "NEXUS"`,
      { maxBuffer: 1024 * 1024 },
    );
    return stdout.includes("NEXUS") && stdout.includes("REG_SZ");
  } catch {
    return false;
  }
}

// ============================================================
// IPC HANDLERS
// ============================================================

export function registerStartupCloseIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle("startup:isEnabled", async () => {
    return isLaunchOnStartupEnabled();
  });

  ipcMain.handle("startup:setEnabled", async (_e, enabled: boolean) => {
    await setLaunchOnStartup(enabled);
    setSetting("launchOnStartup", String(enabled));
    return isLaunchOnStartupEnabled();
  });

  ipcMain.handle("close:getBehavior", async () => {
    return getAllSettings().closeBehavior;
  });

  ipcMain.handle("close:setBehavior", async (_e, behavior: "exit" | "minimize" | "ask") => {
    setSetting("closeBehavior", behavior);
    return behavior;
  });
}
