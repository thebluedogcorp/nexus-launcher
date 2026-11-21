// Electron stub for running main-process modules outside Electron.
//
// Loaded via `node --require ./electron-stub.js`. Patches Module._load so
// any `require("electron")` from the compiled main-process code (under
// dist-electron/) returns this stub instead of trying to load the real
// Electron binary package (which only works inside an Electron process).
//
// The stub provides exactly the surface the media-server pipeline touches:
//   • app.getPath("userData") → a temp dir controlled by NEXUS_USERDATA env
//     (so the test can point better-sqlite3 at a throwaway nexus.db file)
//   • protocol.registerSchemesAsPrivileged / protocol.handle → no-ops
//     (the test exercises the HTTP server, not the nexus-media:// protocol)
//   • BrowserWindow.getAllWindows() → [] (the scanner's progress emitter
//     iterates over windows; an empty array is a safe no-op)
//   • ipcMain / dialog → no-ops (IPC handlers register but never fire in tests)
//
// This lets us import the REAL compiled db.js / media.js / media-server.js
// unchanged and exercise them against a real SQLite file + real ffmpeg-made
// MKV files — which is the only honest way to verify the pipeline the user
// reported broken.

const Module = require("module");
const path = require("path");
const fs = require("fs");
const os = require("os");

const USERDATA = process.env.NEXUS_USERDATA || path.join(os.tmpdir(), "nexus-itest-userdata");
try { fs.mkdirSync(USERDATA, { recursive: true }); } catch { /* ignore */ }

const stub = {
  app: {
    getPath: (key) => {
      if (key === "userData") return USERDATA;
      if (key === "temp") return os.tmpdir();
      if (key === "home") return os.homedir();
      return USERDATA;
    },
    isReady: () => true,
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: () => {},
    off: () => {},
    once: () => {},
    quit: () => {},
    exit: () => {},
    relaunch: () => {},
    requestSingleInstanceLock: () => true,
    releaseSingleInstanceLock: () => {},
    getName: () => "NEXUS",
    getVersion: () => "0.0.0-test",
  },
  protocol: {
    registerSchemesAsPrivileged: () => {},
    handle: () => {},
    unhandle: () => {},
    registerFileProtocol: () => {},
    registerHttpProtocol: () => {},
    registerStreamProtocol: () => {},
    unregisterProtocol: () => {},
  },
  BrowserWindow: class {
    static getAllWindows() { return []; }
    constructor() {}
    on() { return this; }
    webContents = { send: () => {}, on: () => {} };
    loadURL() {}
    loadFile() {}
    show() {}
    hide() {}
    close() {}
    destroy() {}
  },
  ipcMain: {
    handle: () => {},
    on: () => {},
    off: () => {},
    once: () => {},
    removeAllListeners: () => {},
    removeHandler: () => {},
  },
  dialog: {
    showErrorBox: () => {},
    showMessageBox: () => Promise.resolve({ response: 0 }),
    showOpenDialog: () => Promise.resolve({ canceled: false, filePaths: [] }),
    showSaveDialog: () => Promise.resolve({ canceled: false, filePath: "" }),
  },
  shell: { openExternal: () => Promise.resolve(), showItemInFolder: () => {}, openPath: () => Promise.resolve("") },
  Tray: class { constructor() {} setToolTip() {} setContextMenu() {} on() {} destroy() {} },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  nativeImage: { createFromPath: () => ({}), createEmpty: () => ({}) },
  globalShortcut: { register: () => true, unregister: () => {}, unregisterAll: () => {} },
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }), getAllDisplays: () => [] },
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { on: () => {}, send: () => {}, invoke: () => Promise.resolve(null), removeAllListeners: () => {} },
  session: { defaultSession: {} },
  Notification: class { constructor() {} show() {} close() {} },
  powerMonitor: { on: () => {} },
  systemPreferences: { getUserDefault: () => null, on: () => {} },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return stub;
  return origLoad.apply(this, arguments);
};

module.exports = stub;
