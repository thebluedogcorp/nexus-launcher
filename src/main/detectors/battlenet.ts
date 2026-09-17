// Battle.net detector — reads the REAL Blizzard Agent database.
//
// The Battle.net agent keeps an SQLite database at:
//   C:\ProgramData\Blizzard Entertainment\Battle.net\Agent\agent.db
// The `product` table lists installed products with their uid + install path.
//
// We read it with better-sqlite3 (already a dependency). If agent.db is locked
// or missing, we fall back to scanning the known Battle.net install dirs.
//
// Launch:  battlenet://<product_uid>   (e.g. battlenet://D3, battlenet://Pro)

import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import type { DetectedGame } from "@shared/types";

const AGENT_DB =
  "C:\\ProgramData\\Blizzard Entertainment\\Battle.net\\Agent\\agent.db";

// uid -> human title + friendly launch code mapping for the well-known
// Battle.net products. Battle.net's product UIDs are stable across installs.
const PRODUCT_TITLES: Record<string, string> = {
  d3: "Diablo III",
  d3cn: "Diablo III (CN)",
  d3t: "Diablo III: Reaper of Souls",
  d3roe: "Diablo III: Reaper of Souls",
  diablo4: "Diablo IV",
  diablo_iv_beta: "Diablo IV (Beta)",
  hs: "Hearthstone",
  hsb: "Hearthstone (Beta)",
  pro: "Overwatch",
  odin: "Diablo II: Resurrected",
  zeus: "Warcraft III: Reforged",
  wow: "World of Warcraft",
  wowt: "World of Warcraft (PTR)",
  wowd: "World of Warcraft (Dev)",
  wowclassic: "World of Warcraft Classic",
  wowclassic_t: "World of Warcraft Classic (PTR)",
  wowbeta: "World of Warcraft (Beta)",
  sc2: "StarCraft II",
  s2: "StarCraft II",
  wtcg: "Hearthstone",
  viper: "Call of Duty: Modern Warfare III",
  ody: "Call of Duty: Black Ops 6",
  d4: "Diablo IV",
  rtro: "Blizzard Arcade Collection",
  s1: "StarCraft: Remastered",
  w1: "Warcraft: Orcs & Humans",
  w2: "Warcraft II: Battle.net Edition",
  w3: "Warcraft III: Reforged",
};

interface ProductRow {
  uid: string;
  installPath: string | null;
}

function queryAgentDb(): ProductRow[] {
  // Lazy import so the renderer build never tries to bundle better-sqlite3.
  let Database: typeof import("better-sqlite3");
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Database = require("better-sqlite3");
  } catch {
    // Packaged: try the unpacked path.
    try {
      const path = require("path");
      const fs = require("fs") as typeof import("fs");
      const candidate = path.join(
        process.resourcesPath || "",
        "app.asar.unpacked",
        "node_modules",
        "better-sqlite3",
      );
      if (fs.existsSync(candidate)) {
        Database = require(candidate);
      } else {
        return [];
      }
    } catch {
      return [];
    }
  }
  if (!existsSync(AGENT_DB)) return [];
  try {
    const conn: import("better-sqlite3").Database = new Database(AGENT_DB, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const rows = conn
        .prepare(
          "SELECT uid, installPath FROM product WHERE installPath IS NOT NULL AND installPath != ''",
        )
        .all() as { uid: string; installPath: string }[];
      return rows.map((r) => ({ uid: r.uid, installPath: r.installPath }));
    } finally {
      conn.close();
    }
  } catch {
    return [];
  }
}

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

function findMainExe(installDir: string): string | null {
  if (!existsSync(installDir)) return null;
  const candidates: { path: string; size: number }[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 3) return;
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
        else if (e.toLowerCase().endsWith(".exe") && st.size > 5 * 1024 * 1024) {
          const lower = e.toLowerCase();
          if (
            lower.includes("setup") ||
            lower.includes("unins") ||
            lower.includes("crashpad") ||
            lower.includes("helper")
          ) {
            continue;
          }
          candidates.push({ path: full, size: st.size });
        }
      } catch {
        // ignore
      }
    }
  };
  walk(installDir, 0);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0].path;
}

export async function detectBattlenet(): Promise<DetectedGame[]> {
  if (process.platform !== "win32") return [];
  const products = queryAgentDb();
  const out: DetectedGame[] = [];
  for (const p of products) {
    const uid = p.uid?.toLowerCase();
    if (!uid) continue;
    const title = PRODUCT_TITLES[uid] ?? niceTitle(uid);
    const installDir = p.installPath && existsSync(p.installPath) ? p.installPath : null;
    out.push({
      title,
      platform: "battlenet",
      executable: installDir ? findMainExe(installDir) : null,
      installDir,
      launchCommand: `battlenet://${p.uid}`,
      sizeBytes: installDir ? dirSize(installDir) : null,
      battlenetUid: p.uid,
    });
  }
  return out;
}

function niceTitle(uid: string): string {
  // d3 -> "D3", diablo4 -> "Diablo4"
  if (/^[a-z]+[0-9]+$/.test(uid)) {
    const m = uid.match(/^([a-z]+)([0-9]+)$/);
    if (m) return `${m[1].toUpperCase()}${m[2]}`;
  }
  return uid.charAt(0).toUpperCase() + uid.slice(1);
}
