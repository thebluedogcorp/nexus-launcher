// Epic Games detector — reads the REAL Epic manifest store.
//
// Epic writes a JSON file listing every installed game:
//   C:\ProgramData\Epic\UnrealEngineLauncher\LauncherInstalled.dat
//
// Format:
//   { "InstallationList": [
//       { "InstallLocation": "C:\\...\\GameName",
//         "AppName": "36d6b2f8e1c9415f8a6b7c8d9e0f1a2b",
//         "AppDisplayName": "Game Name",
//         "InstallSize": 12345678901 } ] }
//
// Launch:  com.epicgames.launcher://apps/<AppName>?action=launch&silent=true

import { existsSync, promises as fs } from "fs";
import { join, basename } from "path";
import type { DetectedGame } from "@shared/types";

const MANIFEST_PATH =
  "C:\\ProgramData\\Epic\\UnrealEngineLauncher\\LauncherInstalled.dat";

interface EpicInstall {
  InstallLocation: string;
  AppName: string;
  AppDisplayName?: string;
  InstallSize?: number;
}

function findMainExe(installDir: string): string | null {
  if (!existsSync(installDir)) return null;
  // Epic games typically ship a <GameName>\Binaries\Win64\<Game>.exe under
  // an Engine-style layout, or a flat exe at root. Scan up to 3 levels.
  // (Reused minimal scan logic — kept local to avoid cross-imports.)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readdirSync, statSync } = require("fs") as typeof import("fs");
  const exes: { path: string; size: number }[] = [];
  const gameName = basename(installDir).toLowerCase();
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
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
        if (st.isDirectory()) walk(full, depth + 1);
        else if (e.toLowerCase().endsWith(".exe") && st.size > 1024 * 1024) {
          const lower = e.toLowerCase();
          if (
            lower.includes("unins") ||
            lower.includes("setup") ||
            lower.includes("redist") ||
            lower.includes("crashpad") ||
            lower.includes("eula")
          ) {
            continue;
          }
          exes.push({ path: full, size: st.size });
        }
      } catch {
        // ignore
      }
    }
  };
  walk(installDir, 0);
  if (exes.length === 0) return null;
  const byName = exes.find((x) =>
    basename(x.path).toLowerCase().includes(gameName.slice(0, 6)),
  );
  if (byName) return byName.path;
  exes.sort((a, b) => b.size - a.size);
  return exes[0].path;
}

export async function detectEpic(): Promise<DetectedGame[]> {
  if (process.platform !== "win32") return [];
  if (!existsSync(MANIFEST_PATH)) return [];
  let raw: string;
  try {
    raw = await fs.readFile(MANIFEST_PATH, "utf8");
  } catch {
    return [];
  }
  let data: { InstallationList?: EpicInstall[] };
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = data.InstallationList ?? [];
  const out: DetectedGame[] = [];
  for (const item of list) {
    if (!item.AppName) continue;
    const title = item.AppDisplayName || basename(item.InstallLocation || "Epic Game");
    out.push({
      title,
      platform: "epic",
      executable: findMainExe(item.InstallLocation),
      installDir: existsSync(item.InstallLocation) ? item.InstallLocation : null,
      launchCommand: `com.epicgames.launcher://apps/${item.AppName}?action=launch&silent=true`,
      sizeBytes: typeof item.InstallSize === "number" ? item.InstallSize : null,
      epicAppName: item.AppName,
    });
  }
  return out;
}
