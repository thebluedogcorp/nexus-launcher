// Steam game detector — reads the REAL Steam install.
//
// Detection flow (v3.9.2 — comprehensive rewrite for robustness):
//   1. Find the Steam install directory.
//        a. Registry: HKCU\Software\Valve\Steam -> SteamPath (with /reg:32 + /reg:64 fallback)
//        b. Registry: HKLM\Software\WOW6432Node\Valve\Steam -> InstallPath
//        c. Running process: `wmic process where "name='steam.exe'" get ExecutablePath`
//        d. Common default locations on all drive letters (C, D, E, F)
//   2. Read steamapps\libraryfolders.vdf -> list of Steam library folders.
//      Also read config\config.vdf -> BaseInstallFolder_* entries as a fallback.
//   3. For each library folder, read steamapps\appmanifest_*.vdf.
//   4. Extract appid, name, installdir, SizeOnDisk, lastplayed, BytesDownloaded.
//   5. Resolve the actual game executable by scanning the installdir for *.exe.
//
// All steps log progress via console.log so the user can see what's happening
// when they run "Scan System" and Steam games don't show up.

import { existsSync, promises as fs, readdirSync, statSync } from "fs";
import { join, resolve, basename, dirname } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { parseVdf, vdfGet } from "./vdf";
import { regReadValue, regReadValuesAlt } from "./registry";
import type { DetectedGame } from "@shared/types";

const execAsync = promisify(exec);

// ============================================================
// 1. FIND STEAM INSTALL
// ============================================================

async function findSteamInstall(): Promise<string | null> {
  // --- Method 1: Registry HKCU\Software\Valve\Steam\SteamPath ---
  // This is the canonical location. SteamPath uses forward slashes.
  try {
    const regPath = await regReadValue(
      { hive: "HKCU", path: "Software\\Valve\\Steam" },
      "SteamPath",
    );
    if (regPath) {
      // SteamPath typically uses forward slashes — normalize to backslashes.
      const normalized = regPath.replace(/\//g, "\\");
      if (existsSync(normalized)) {
        console.log("[steam] Found Steam via HKCU registry SteamPath:", normalized);
        return normalized;
      }
    }
  } catch (e) {
    console.warn("[steam] HKCU SteamPath registry read failed:", e);
  }

  // --- Method 1b: Also try the 32-bit and 64-bit views explicitly ---
  // On some systems (especially after a Windows update or Steam migration),
  // the registry key might only be visible from one view.
  for (const view of ["64", "32"] as const) {
    try {
      const values = await regReadValuesAlt(
        { hive: "HKCU", path: "Software\\Valve\\Steam" },
        view,
      );
      const steamPath = values.find((v) => v.name.toLowerCase() === "steampath");
      if (steamPath?.value) {
        const normalized = steamPath.value.replace(/\//g, "\\");
        if (existsSync(normalized)) {
          console.log(`[steam] Found Steam via HKCU registry (reg:${view}) SteamPath:`, normalized);
          return normalized;
        }
      }
    } catch {
      // ignore — try next method
    }
  }

  // --- Method 2: Registry HKLM for InstallPath ---
  // Some Steam installs register under HKLM instead of (or in addition to) HKCU.
  for (const regPath of [
    "SOFTWARE\\WOW6432Node\\Valve\\Steam",  // 64-bit OS, 32-bit Steam
    "SOFTWARE\\Valve\\Steam",               // 32-bit OS
  ]) {
    try {
      const installPath = await regReadValue(
        { hive: "HKLM", path: regPath },
        "InstallPath",
      );
      if (installPath && existsSync(installPath)) {
        console.log("[steam] Found Steam via HKLM registry InstallPath:", installPath);
        return installPath;
      }
    } catch {
      // ignore
    }
  }

  // --- Method 3: Check running steam.exe process ---
  // If Steam is currently running, we can find its path via wmic.
  try {
    const { stdout } = await execAsync(
      `wmic process where "name='steam.exe'" get ExecutablePath /format:list`,
      { maxBuffer: 1024 * 1024, timeout: 5000 },
    );
    const match = stdout.match(/ExecutablePath=(.+)/);
    if (match) {
      const exePath = match[1].trim();
      if (exePath && existsSync(exePath)) {
        const steamDir = dirname(exePath);
        console.log("[steam] Found Steam via running process:", steamDir);
        return steamDir;
      }
    }
  } catch {
    // ignore — Steam might not be running
  }

  // --- Method 4: Check common default locations on all drives ---
  // Users often install Steam on D:, E:, or F: drives.
  const drives = ["C", "D", "E", "F", "G"];
  const subPaths = [
    "Program Files (x86)\\Steam",
    "Program Files\\Steam",
    "Steam",
    "SteamLibrary",
    "Games\\Steam",
    "Games\\SteamLibrary",
  ];
  for (const drive of drives) {
    for (const sub of subPaths) {
      const candidate = `${drive}:\\${sub}`;
      if (existsSync(candidate) && existsSync(join(candidate, "steam.exe"))) {
        console.log("[steam] Found Steam via filesystem fallback:", candidate);
        return candidate;
      }
    }
  }

  // --- Method 5: Last resort — check if there's a steamapps folder anywhere ---
  // This catches edge cases where Steam is installed in a non-standard location
  // but the steamapps folder structure exists.
  for (const drive of drives) {
    const steamAppsCandidate = `${drive}:\\SteamLibrary\\steamapps`;
    if (existsSync(steamAppsCandidate)) {
      const parent = dirname(steamAppsCandidate);
      console.log("[steam] Found SteamLibrary (steamapps exists) at:", parent);
      // Return the parent of steamapps so the rest of the code can find steamapps
      return dirname(parent);
    }
  }

  console.warn("[steam] Could not find Steam install directory by any method.");
  return null;
}

// ============================================================
// 2. READ LIBRARY FOLDERS
// ============================================================

interface LibraryFolder {
  path: string;
  apps: Record<string, string>;
}

async function readLibraryFolders(steamPath: string): Promise<LibraryFolder[]> {
  const folders: LibraryFolder[] = [];

  // --- Method A: libraryfolders.vdf (modern Steam) ---
  const vdfPath = join(steamPath, "steamapps", "libraryfolders.vdf");
  if (existsSync(vdfPath)) {
    try {
      const raw = await fs.readFile(vdfPath, "utf8");
      const parsed = parseVdf(raw);
      const root = vdfGet(parsed, ["libraryfolders"]) as
        | { [k: string]: { path?: string; apps?: Record<string, string> } }
        | undefined;
      if (root) {
        for (const key of Object.keys(root)) {
          const entry = root[key];
          const p = entry?.path;
          if (!p) continue;
          // Normalize path — VDF uses forward slashes or escaped backslashes
          const normalized = p.replace(/\//g, "\\");
          if (existsSync(normalized)) {
            folders.push({ path: normalized, apps: entry.apps ?? {} });
            console.log(`[steam] Library folder ${key}:`, normalized);
          }
        }
      }
    } catch (e) {
      console.warn("[steam] Failed to parse libraryfolders.vdf:", e);
    }
  } else {
    console.log("[steam] libraryfolders.vdf not found at:", vdfPath);
  }

  // --- Method B: config.vdf BaseInstallFolder_* entries (fallback) ---
  // Steam also stores library folders in config/config.vdf.
  const configPath = join(steamPath, "config", "config.vdf");
  if (existsSync(configPath)) {
    try {
      const raw = await fs.readFile(configPath, "utf8");
      const parsed = parseVdf(raw);
      const installStore = vdfGet(parsed, ["InstallConfigStore", "Software", "Valve", "Steam"]) as
        | { [k: string]: string }
        | undefined;
      if (installStore) {
        for (const key of Object.keys(installStore)) {
          if (key.startsWith("BaseInstallFolder_")) {
            const p = installStore[key];
            if (p) {
              const normalized = p.replace(/\//g, "\\").replace(/\\\\/g, "\\");
              if (existsSync(normalized) && !folders.some((f) => f.path === normalized)) {
                folders.push({ path: normalized, apps: {} });
                console.log(`[steam] Library folder from config.vdf (${key}):`, normalized);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("[steam] Failed to parse config.vdf for BaseInstallFolder entries:", e);
    }
  }

  // --- Always include the default steamapps folder ---
  const defaultApps = join(steamPath, "steamapps");
  if (existsSync(defaultApps) && !folders.some((f) => f.path === defaultApps)) {
    folders.push({ path: defaultApps, apps: {} });
    console.log("[steam] Added default steamapps folder:", defaultApps);
  }

  if (folders.length === 0) {
    console.warn("[steam] No library folders found. Checked:", vdfPath, "and", configPath);
  }

  return folders;
}

// ============================================================
// 3. READ APP MANIFESTS
// ============================================================

interface AppManifest {
  appid: string;
  name: string;
  installdir: string;
  sizeOnDisk: number | null;
  bytesDownloaded: number | null;
  lastPlayed: number | null;
}

async function readManifest(file: string): Promise<AppManifest | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = parseVdf(raw);
    const state = vdfGet(parsed, ["AppState"]) as
      | {
          appid?: string;
          name?: string;
          installdir?: string;
          SizeOnDisk?: string;
          BytesDownloaded?: string;
          LastPlayed?: string;
        }
      | undefined;
    if (!state) return null;
    return {
      appid: state.appid ?? basename(file).replace(/\.vdf$/, "").replace("appmanifest_", ""),
      name: state.name ?? "",
      installdir: state.installdir ?? "",
      sizeOnDisk: state.SizeOnDisk ? Number(state.SizeOnDisk) : null,
      bytesDownloaded: state.BytesDownloaded ? Number(state.BytesDownloaded) : null,
      lastPlayed: state.LastPlayed ? Number(state.LastPlayed) : null,
    };
  } catch (e) {
    console.warn(`[steam] Failed to read manifest ${file}:`, e);
    return null;
  }
}

// ============================================================
// 4. FIND MAIN EXECUTABLE
// ============================================================

/** Scan an install directory for the most likely main executable. */
function findMainExe(installDir: string): string | null {
  if (!existsSync(installDir)) return null;
  const exes: { path: string; size: number; depth: number }[] = [];
  const gameName = basename(installDir).toLowerCase();

  const walk = (dir: string, depth: number) => {
    if (depth > 3) return; // don't go too deep
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full, depth + 1);
        } else if (e.toLowerCase().endsWith(".exe") && st.size > 100 * 1024) {
          // Skip obvious launcher/redistributable binaries.
          const lower = e.toLowerCase();
          if (
            lower.includes("unins") ||
            lower.includes("setup") ||
            lower.includes("redist") ||
            lower.includes("crashpad") ||
            lower.includes("helper") ||
            lower.includes("eula")
          ) {
            continue;
          }
          exes.push({ path: full, size: st.size, depth });
        }
      } catch {
        // ignore
      }
    }
  };
  walk(installDir, 0);

  if (exes.length === 0) return null;
  // Prefer an exe whose name resembles the game title.
  const matchByName = exes.find((x) =>
    basename(x.path).toLowerCase().includes(gameName.slice(0, 6)),
  );
  if (matchByName) return matchByName.path;
  // Otherwise prefer the largest exe at the shallowest depth.
  exes.sort((a, b) =>
    a.depth !== b.depth ? a.depth - b.depth : b.size - a.size,
  );
  return exes[0]?.path ?? null;
}

// ============================================================
// 5. COMPUTE DIRECTORY SIZE
// ============================================================

function dirSize(dir: string): number | null {
  if (!existsSync(dir)) return null;
  let total = 0;
  const walk = (d: string) => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else total += st.size;
      } catch {
        // ignore
      }
    }
  };
  try {
    walk(dir);
    return total;
  } catch {
    return null;
  }
}

// ============================================================
// MAIN DETECT FUNCTION
// ============================================================

export async function detectSteam(): Promise<DetectedGame[]> {
  if (process.platform !== "win32") {
    console.log("[steam] Not on Windows — skipping.");
    return [];
  }

  console.log("[steam] Starting detection...");
  const steamPath = await findSteamInstall();
  if (!steamPath) {
    console.warn("[steam] Steam install not found. Steam detection will return 0 games.");
    return [];
  }

  console.log("[steam] Steam install found at:", steamPath);
  const libraries = await readLibraryFolders(steamPath);
  console.log("[steam] Found", libraries.length, "library folder(s).");

  const detected: DetectedGame[] = [];
  let totalManifests = 0;

  for (const lib of libraries) {
    // Each library folder has a steamapps subdirectory with manifests.
    // The library path from libraryfolders.vdf is the ROOT of the Steam library
    // (e.g. "D:\SteamLibrary"), and manifests are under "steamapps\".
    // But the default library (index 0) uses the steamPath/steamapps directly.
    const appsDir = lib.path.endsWith("steamapps")
      ? lib.path
      : join(lib.path, "steamapps");

    if (!existsSync(appsDir)) {
      console.log(`[steam] Skipping ${lib.path} — steamapps folder not found at ${appsDir}`);
      continue;
    }

    let files: string[];
    try {
      files = await fs.readdir(appsDir);
    } catch (e) {
      console.warn(`[steam] Could not read directory ${appsDir}:`, e);
      continue;
    }

    const manifests = files.filter(
      (f) => f.startsWith("appmanifest_") && f.endsWith(".vdf"),
    );

    if (manifests.length === 0) {
      console.log(`[steam] No appmanifest_*.vdf files in ${appsDir}`);
      continue;
    }

    console.log(`[steam] Found ${manifests.length} manifest(s) in ${appsDir}`);
    totalManifests += manifests.length;

    for (const f of manifests) {
      const m = await readManifest(join(appsDir, f));
      if (!m || !m.name) {
        console.log(`[steam] Skipping ${f} — no name or failed to parse`);
        continue;
      }

      const installDir = join(appsDir, "common", m.installdir);
      const exe = findMainExe(installDir);
      const size = m.sizeOnDisk ?? dirSize(installDir);

      console.log(`[steam] Detected: ${m.name} (appid=${m.appid}, install=${m.installdir}, exe=${exe ? "found" : "not found"})`);

      detected.push({
        title: m.name,
        platform: "steam",
        executable: exe,
        installDir: existsSync(installDir) ? installDir : null,
        launchCommand: `steam://run/${m.appid}`,
        sizeBytes: size,
        steamAppId: m.appid,
      });
    }
  }

  console.log(`[steam] Detection complete: ${detected.length} games from ${totalManifests} manifests.`);
  return detected;
}
