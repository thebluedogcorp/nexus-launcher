// NEXUS — Electron main process entry.
//
// Creates a frameless, dark-themed BrowserWindow sized for a desktop launcher
// and loads the Vite dev server (in dev) or the built renderer (in production).

import { app, BrowserWindow, shell } from "electron";
import { join } from "path";
import { registerIpc } from "./ipc";

// Prevent garbage collection of the main window.
let mainWindow: BrowserWindow | null = null;

const isDev = !!process.env.DEV || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: "#0a0a0b",
    title: "NEXUS — Game Launcher",
    show: false,
    frame: true, // keep native frame for a real tool feel; the renderer draws its own chrome
    autoHideMenuBar: true,
    icon: join(__dirname, "..", "resources", "icon.ico"),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Open external links (RAWG links, etc.) in the user's default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  if (isDev) {
    // Vite dev server.
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "..", "dist-renderer", "index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
