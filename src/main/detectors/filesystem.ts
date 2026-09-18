// Filesystem game scanner — detects games installed in CUSTOM locations that
// the platform-specific detectors (Steam/Epic/etc.) miss.
//
// Strategy:
//   1. Enumerate all fixed drives (via wmic / Get-PSDrive on Windows).
//   2. For each drive + each user-configured custom scan path, walk the
//      directory tree (bounded depth) looking for game-like .exe files.
//   3. A directory is considered a "game" if it contains a large .exe
//      (>5MB, not an uninstaller/setup/redist) AND matches one of:
//        - Contains a common game data file pattern (e.g. *.pak, *.uasset,
//          *.bsa, data.win, *.cascatethunk)
//        - The exe name resembles the directory name (e.g. EldenRing.exe in
//          "ELDEN RING")
//        - The directory contains >2GB of data
//   4. The detected game is matched against RAWG + Steam by directory name to
//      fetch real cover art + metadata.
//
// This runs in the main process (Node fs + child_process).

import { existsSync, promises as fs, statSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { DetectedGame, PlatformId } from "@shared/types";

const execAsync = promisify(exec);

const MAX_DEPTH = 4;
const MIN_EXE_SIZE = 5 * 1024 * 1024; // 5MB
const MIN_GAME_DIR_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

// Exe name substrings that indicate a non-game binary (uninstallers, etc.)
const SKIP_EXE_PATTERNS = [
  "unins", "uninstall", "setup", "setup-", "redist", "crashpad", "crashreporter",
  "helper", "eula", "codepend", "directx", "vcredist", "dotnet", "physx",
  "garbage", "reporter", "launcher_setup", "bootstrapper", "downloader",
  "installer", "patcher", "updater", "wine", "proton",
];

// Game data file patterns that strongly indicate a game directory.
const GAME_DATA_PATTERNS = [
  /\.pak$/i, /\.uasset$/i, /\.bsa$/i, /\.ba2$/i, /\.vpk$/i, /\.vp6$/i,
  /\.cas$/i, /\.cascatethunk$/i, /\.rpf$/i, /\.cpk$/i, /\.pck$/i,
  /\.forge$/i, /\.tiger$/i, /\.sab$/i, /\.sdat$/i, /\.psarc$/i,
  /\.wad$/i, /\.vpk$/i, /\.bsp$/i, /\.pk3$/i, /\.iwd$/i,
  /^data\.win$/i, /^patch\.dat$/i, /^streaming\.bin$/i,
  /^pc\.bf$/i, /^game\.arche$/i,
];

interface ScanResult {
  detected: DetectedGame[];
  errors: { path: string; message: string }[];
}

/** Enumerate all fixed drives on Windows (e.g. C:\, D:\, E:\). */
async function enumerateDrives(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object -ExpandProperty DeviceID"`,
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
    );
    return stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[A-Z]:$/i.test(l)).map((l) => l + "\\");
  } catch {
    return ["C:\\"];
  }
}

/** Get the size of a directory (recursively), with an early-exit cap. */
function dirSize(dir: string, cap = 5 * 1024 * 1024 * 1024): number {
  let total = 0;
  const walk = (d: string, depth: number): boolean => {
    if (total > cap || depth > 3) return false;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return false;
    }
    for (const e of entries) {
      if (total > cap) return false;
      const full = join(d, e);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          if (!walk(full, depth + 1)) return false;
        } else {
          total += st.size;
        }
      } catch {
        // ignore permission errors
      }
    }
    return true;
  };
  try {
    walk(dir, 0);
    return total;
  } catch {
    return 0;
  }
}

/** Find the main game executable in a directory. */
function findGameExe(dir: string): { exe: string; size: number } | null {
  const dirName = basename(dir).toLowerCase();
  const candidates: { exe: string; size: number; matchScore: number }[] = [];

  const walk = (d: string, depth: number) => {
    if (depth > 2) return;
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
        if (st.isDirectory()) {
          // Skip common non-game subdirs.
          const lower = e.toLowerCase();
          if (lower === "binaries" || lower === "bin" || lower === "win64" || lower === "win32" || lower === "x64") {
            walk(full, depth + 1);
          }
          continue;
        }
        if (!e.toLowerCase().endsWith(".exe")) continue;
        if (st.size < MIN_EXE_SIZE) continue;
        const lower = e.toLowerCase();
        if (SKIP_EXE_PATTERNS.some((p) => lower.includes(p))) continue;
        // Score: exe name resembling the directory name is the strongest signal.
        const exeBase = e.replace(/\.exe$/i, "").toLowerCase();
        let matchScore = 0;
        if (dirName.includes(exeBase) || exeBase.includes(dirName.slice(0, 6))) {
          matchScore = 100;
        } else if (exeBase.length > 4) {
          matchScore = 50;
        } else {
          matchScore = 10;
        }
        candidates.push({ exe: full, size: st.size, matchScore });
      } catch {
        // ignore
      }
    }
  };
  walk(dir, 0);

  if (candidates.length === 0) return null;
  // Sort by match score desc, then by size desc.
  candidates.sort((a, b) => b.matchScore - a.matchScore || b.size - a.size);
  return { exe: candidates[0].exe, size: candidates[0].size };
}

/** Check if a directory looks like a game (contains game data files or is large). */
function looksLikeGame(dir: string): { isGame: boolean; size: number } {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return { isGame: false, size: 0 };
  }
  // Quick check for game data files (any depth 0-2).
  const hasDataFile = (d: string, depth: number): boolean => {
    if (depth > 2) return false;
    let ents: string[];
    try {
      ents = readdirSync(d);
    } catch {
      return false;
    }
    for (const e of ents) {
      if (GAME_DATA_PATTERNS.some((re) => re.test(e))) return true;
      const full = join(d, e);
      try {
        if (statSync(full).isDirectory() && hasDataFile(full, depth + 1)) return true;
      } catch {
        // ignore
      }
    }
    return false;
  };
  if (hasDataFile(dir, 0)) return { isGame: true, size: 0 };
  // Fall back to directory size.
  const size = dirSize(dir);
  return { isGame: size >= MIN_GAME_DIR_SIZE, size };
}

/**
 * Scan custom + all-drive paths for games installed in non-default locations.
 * Returns detected games with platform "manual" (the user can re-classify).
 */
export async function scanFilesystem(
  customPaths: string[],
  onProgress?: (path: string) => void,
): Promise<ScanResult> {
  const detected: DetectedGame[] = [];
  const errors: { path: string; message: string }[] = [];

  // Collect all roots: all fixed drives + custom paths.
  const roots = new Set<string>();
  if (process.platform === "win32") {
    const drives = await enumerateDrives();
    for (const d of drives) roots.add(d);
  }
  for (const p of customPaths) {
    if (p.trim() && existsSync(p.trim())) roots.add(p.trim());
  }

  for (const root of roots) {
    onProgress?.(root);
    try {
      await scanDir(root, 0, detected);
    } catch (e) {
      errors.push({ path: root, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return { detected, errors };
}

/** Recursively scan a directory for game-like subdirectories. */
async function scanDir(dir: string, depth: number, out: DetectedGame[]): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = await fs.stat(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    // Skip common non-game directories at the root.
    const lower = entry.toLowerCase();
    if (depth === 0) {
      if (
        lower === "windows" || lower === "program files" || lower === "program files (x86)" ||
        lower === "programdata" || lower === "users" || lower === "$recycle.bin" ||
        lower === "system volume information" || lower === "windowsapps" ||
        lower === "perflogs" || lower === "recovery" || lower === "documents and settings"
      ) {
        // But still scan inside Program Files (games often live there).
        if (lower.startsWith("program files")) {
          await scanDir(full, depth + 1, out);
        }
        continue;
      }
    }
    // Skip hidden + system + node_modules.
    if (entry.startsWith(".") || entry.startsWith("$") || lower === "node_modules" || lower === "__pycache__") {
      continue;
    }

    // Check if this directory looks like a game.
    const check = looksLikeGame(full);
    if (check.isGame) {
      const exe = findGameExe(full);
      if (exe) {
        // Avoid duplicates by path.
        if (out.some((g) => g.installDir === full)) continue;
        const title = humanizeName(entry);
        out.push({
          title,
          platform: "manual" as PlatformId,
          executable: exe.exe,
          installDir: full,
          launchCommand: null,
          sizeBytes: check.size || null,
        });
        continue; // don't recurse into a game dir
      }
    }

    // Recurse.
    await scanDir(full, depth + 1, out);
  }
}

/** "ELDEN_RING" -> "Elden Ring", "cyberpunk 2077" -> "Cyberpunk 2077" */
function humanizeName(raw: string): string {
  let s = raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  // Title case but keep all-caps acronyms (e.g. GTA, RDR2).
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
