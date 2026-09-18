// NEXUS — Electron main process entry.
//
// Creates a dark-themed BrowserWindow sized for a desktop launcher and loads
// the Vite dev server (in dev) or the built renderer (in production).

import { app, BrowserWindow, shell, dialog } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { registerIpc } from "./ipc";

// Prevent garbage collection of the main window.
let mainWindow: BrowserWindow | null = null;

const isDev = !!process.env.DEV || !app.isPackaged;

// Surface any uncaught error in the main process as a dialog so the user
// never sees a silent blank-screen failure.
process.on("uncaughtException", (err) => {
  const msg = err?.stack || String(err);
  // eslint-disable-next-line no-console
  console.error("[NEXUS] uncaughtException:", msg);
  dialog.showErrorBox(
    "NEXUS — Internal Error",
    `NEXUS hit an unexpected error:\n\n${msg}\n\nPlease report this with the stack trace above.`,
  );
});

process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[NEXUS] unhandledRejection:", reason);
});

function resolveRendererHtml(): string | null {
  // In a packaged app, __dirname is inside app.asar (e.g. .../app.asar/dist-electron/main).
  // The renderer is packaged at .../app.asar/dist-renderer/index.html — i.e. two levels up
  // from __dirname, into "dist-renderer".
  const candidates = [
    join(__dirname, "..", "dist-renderer", "index.html"), // packaged (asar)
    join(__dirname, "..", "..", "dist-renderer", "index.html"), // dev tsc output
    join(process.resourcesPath || "", "app.asar", "dist-renderer", "index.html"),
    join(process.resourcesPath || "", "dist-renderer", "index.html"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: "#0a0a0b",
    title: "NEXUS — Game Launcher",
    show: false,
    frame: true,
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

  // Log renderer console messages into the main process stdout (useful when
  // debugging a blank screen).
  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    // eslint-disable-next-line no-console
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  // If the renderer fails to load, show a clear error instead of a blank screen.
  mainWindow.webContents.on(
    "did-fail-load",
    (_e, errorCode, errorDescription, validatedURL) => {
      // eslint-disable-next-line no-console
      console.error(`[NEXUS] did-fail-load: ${errorCode} ${errorDescription} for ${validatedURL}`);
      dialog.showErrorBox(
        "NEXUS — Renderer failed to load",
        `The NEXUS UI could not be loaded.\n\nError ${errorCode}: ${errorDescription}\nURL: ${validatedURL}\n\n` +
          `This usually means the renderer files are missing from the packaged app. ` +
          `Please re-download the latest NEXUS-Setup-1.0.0.exe from the GitHub release.`,
      );
    },
  );

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const html = resolveRendererHtml();
    if (!html) {
      dialog.showErrorBox(
        "NEXUS — Renderer not found",
        `Could not locate the built renderer (dist-renderer/index.html).\n\n` +
          `Checked:\n  - ${join(__dirname, "..", "dist-renderer", "index.html")}\n  - ${join(__dirname, "..", "..", "dist-renderer", "index.html")}\n  - ${join(process.resourcesPath || "", "app.asar", "dist-renderer", "index.html")}\n\n` +
          `The packaged app appears to be missing its UI files. Please re-download the latest build.`,
      );
      app.quit();
      return;
    }
    mainWindow.loadFile(html);
  }
}

app.whenReady().then(() => {
  try {
    registerIpc();
  } catch (err) {
    // The IPC layer touches better-sqlite3 (native module). If it fails to
    // load (e.g. ABI mismatch after an Electron upgrade), surface it clearly.
    dialog.showErrorBox(
      "NEXUS — Database initialization failed",
      `NEXUS could not initialize its local database.\n\n${err instanceof Error ? err.stack || err.message : String(err)}\n\n` +
        `If better-sqlite3 reports an ABI mismatch, the app was built against a different Electron version. Re-download the latest release.`,
    );
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // ===== AUTOMATIC metadata enrichment on startup =====
  // Every game missing a banner image gets its artwork + details fetched in
  // the background (RAWG -> Steam). The renderer listens to patch:progress /
  // patch:gameUpdated / patch:done events and updates tiles live as artwork
  // arrives. This is fire-and-forget; failures never block the UI.
  try {
    // Lazy imports so a DB/native-module error above doesn't cascade.
    Promise.all([import("./db"), import("./ipc")]).then(([{ listGames }]) => {
      try {
        const all = listGames({ showHidden: true });
        const needPatch = all.filter((g) => !g.bannerImage);
        if (needPatch.length > 0) {
          // patchGamesInBackground is defined in ipc.ts and broadcasts events
          // to every renderer window. We invoke it via the exported helper.
          import("./ipc").then(({ patchGamesInBackgroundExport }) => {
            if (typeof patchGamesInBackgroundExport === "function") {
              void patchGamesInBackgroundExport(needPatch);
            }
          });
        }
      } catch {
        // ignore — enrichment is best-effort
      }
    });
  } catch {
    // ignore
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
