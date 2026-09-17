// Steam game detector — reads the REAL Steam install.
//
// Detection flow:
//   1. Find the Steam install directory.
//        - Registry: HKCU\Software\Valve\Steam  ->  SteamPath
//        - Fallback: C:\Program Files (x86)\Steam
//   2. Read steamapps\libraryfolders.vdf  ->  list of Steam library folders.
//   3. For each library folder, read steamapps\appmanifest_*.vdf.
//   4. Extract appid, name, installdir, SizeOnDisk, lastplayed, BytesDownloaded.
//   5. Resolve the actual game executable by scanning the installdir for *.exe.

import { existsSync, promises as fs, readdirSync, statSync } from "fs";
import { join, resolve, basename } from "path";
import { parseVdf, vdfGet } from "./vdf";
import { regReadValue } from "./registry";
import type { DetectedGame } from "@shared/types";

async function findSteamInstall(): Promise<string | null> {
  // Registry first (always correct on a real install).
  const regPath = await regReadValue(
    { hive: "HKCU", path: "Software\\Valve\\Steam" },
    "SteamPath",
  );
  if (regPath && existsSync(regPath)) return regPath;
  // Common default locations.
  const candidates = [
    "C:\\Program Files (x86)\\Steam",
    "C:\\Program Files\\Steam",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

interface LibraryFolder {
  path: string;
  apps: Record<string, string>;
}

async function readLibraryFolders(steamPath: string): Promise<LibraryFolder[]> {
  const vdfPath = join(steamPath, "steamapps", "libraryfolders.vdf");
  if (!existsSync(vdfPath)) {
    // Older Steam versions used libraryfolders.vdf or steamapps as the library.
    return [{ path: join(steamPath, "steamapps"), apps: {} }];
  }
  const raw = await fs.readFile(vdfPath, "utf8");
  const parsed = parseVdf(raw);
  const folders: LibraryFolder[] = [];
  const root = vdfGet(parsed, ["libraryfolders"]) as
    | { [k: string]: { path?: string; apps?: Record<string, string> } }
    | undefined;
  if (root) {
    for (const key of Object.keys(root)) {
      const entry = root[key];
      const p = entry?.path;
      if (!p) continue;
      folders.push({ path: p, apps: entry.apps ?? {} });
    }
  }
  if (folders.length === 0) {
    folders.push({ path: join(steamPath, "steamapps"), apps: {} });
  }
  return folders;
}

interface AppManifest {
  appid: string;
  name: string;
  installdir: string;
  sizeOnDisk: number | null;
  bytesDownloaded: number | null;
  lastPlayed: number | null;
}

async function readManifest(file: string): Promise<AppManifest | null> {
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
}

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

/** Compute the real on-disk size of a directory (recursively). */
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

export async function detectSteam(): Promise<DetectedGame[]> {
  if (process.platform !== "win32") return [];
  const steamPath = await findSteamInstall();
  if (!steamPath) return [];

  const libraries = await readLibraryFolders(steamPath);
  const detected: DetectedGame[] = [];

  for (const lib of libraries) {
    const appsDir = lib.path;
    if (!existsSync(appsDir)) continue;
    let files: string[];
    try {
      files = await fs.readdir(appsDir);
    } catch {
      continue;
    }
    const manifests = files.filter(
      (f) => f.startsWith("appmanifest_") && f.endsWith(".vdf"),
    );
    for (const f of manifests) {
      const m = await readManifest(join(appsDir, f));
      if (!m || !m.name) continue;
      const installDir = join(appsDir, "common", m.installdir);
      const exe = findMainExe(installDir);
      const size = m.sizeOnDisk ?? dirSize(installDir);
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
  return detected;
}
