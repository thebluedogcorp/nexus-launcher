// Riot Client detector — reads the REAL Riot install paths.
//
// Riot's titles live under well-known folders:
//   C:\Riot Games\VALORANT\live\VALORANT.exe
//   C:\Riot Games\League of Legends\LeagueClient.exe
//   C:\Riot Games\League of Legends (PBE)\...
//   C:\Riot Games\Legends of Runeterra\...
//   C:\Riot Games\VALORANT (PBE)\...
//
// Riot also writes to:
//   HKLM\SOFTWARE\Riot Games, Inc.\Riot Client  ->  InstallationPath
//
// Launch:  riotclient://launch  (defaults to the Riot Client shell) OR the
//          product-specific URI:
//            valorant://     (VALORANT)
//            leagueoflegends://  (LoL)
//            lor://         (Legends of Runeterra)

import { existsSync, promises as fs, statSync } from "fs";
import { join } from "path";
import { regReadValue } from "./registry";
import type { DetectedGame } from "@shared/types";

const RIOT_TITLES: Array<{
  id: string;
  name: string;
  subfolder: string;
  exe: string;
  launch: string;
}> = [
  { id: "valorant", name: "VALORANT", subfolder: "VALORANT", exe: "live\\VALORANT.exe", launch: "valorant://" },
  { id: "lol", name: "League of Legends", subfolder: "League of Legends", exe: "LeagueClient.exe", launch: "leagueoflegends://" },
  { id: "lor", name: "Legends of Runeterra", subfolder: "Legends of Runeterra", exe: "LoR.exe", launch: "lor://" },
  { id: "tft", name: "Teamfight Tactics", subfolder: "League of Legends", exe: "LeagueClient.exe", launch: "leagueoflegends://" },
];

async function findRiotBase(): Promise<string | null> {
  const reg = await regReadValue(
    { hive: "HKLM", path: "SOFTWARE\\WOW6432Node\\Riot Games, Inc.\\Riot Client" },
    "InstallationPath",
  );
  if (reg && existsSync(reg)) return reg;
  const candidates = [
    "C:\\Riot Games",
    "C:\\Program Files\\Riot Games",
    "C:\\Program Files (x86)\\Riot Games",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

function dirSize(dir: string): number | null {
  if (!existsSync(dir)) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readdirSync, statSync } = require("fs") as typeof import("fs");
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

export async function detectRiot(): Promise<DetectedGame[]> {
  if (process.platform !== "win32") return [];
  const base = await findRiotBase();
  if (!base) return [];

  const out: DetectedGame[] = [];
  for (const t of RIOT_TITLES) {
    const installDir = join(base, t.subfolder);
    const exePath = join(installDir, t.exe);
    if (!existsSync(exePath)) {
      // Try the Riot Client layout where VALORANT sits under Riot Client.
      const alt = join(base, "Riot Client", t.subfolder);
      const altExe = join(alt, t.exe);
      if (existsSync(altExe)) {
        out.push({
          title: t.name,
          platform: "riot",
          executable: altExe,
          installDir: alt,
          launchCommand: t.launch,
          sizeBytes: dirSize(alt),
          riotId: t.id,
        });
      }
      continue;
    }
    out.push({
      title: t.name,
      platform: "riot",
      executable: exePath,
      installDir,
      launchCommand: t.launch,
      sizeBytes: dirSize(installDir),
      riotId: t.id,
    });
  }
  return out;
}
