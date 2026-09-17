// EA App / Origin detector — reads the REAL EA registry hive.
//
// EA registers installed games under one of:
//   HKLM\SOFTWARE\WOW6432Node\EA Games\<title>          (older)
//   HKLM\SOFTWARE\WOW6432Node\EA Desktop\<title>         (EA App)
// with values: Install Dir, DisplayIcon, Locale, ProductName, ...
//
// The mapping from game title to the EA offer id is not in the registry, so we
// also look for the EA App cache manifest at:
//   C:\ProgramData\Electronic Arts\EA Desktop\InstalledContent.csv
// (one row per installed title, first column is the offer/content id).
//
// Launch:  origin2://game/launch?offerIds=<offerId>
//          (EA App also accepts ealaunch://<offerId>)

import { existsSync, promises as fs } from "fs";
import { regEnumKeys, regReadValues } from "./registry";
import { join } from "path";
import type { DetectedGame } from "@shared/types";

const EA_GAMES_KEY = { hive: "HKLM", path: "SOFTWARE\\WOW6432Node\\EA Games" };
const EA_DESKTOP_KEY = { hive: "HKLM", path: "SOFTWARE\\WOW6432Node\\EA Desktop" };
const INSTALLED_CSV = "C:\\ProgramData\\Electronic Arts\\EA Desktop\\InstalledContent.csv";

interface EaContentRow {
  offerId: string;
  title: string;
  installDir: string;
}

/** Parse EA's InstalledContent.csv into offerId -> row. */
async function readInstalledContent(): Promise<Map<string, EaContentRow>> {
  const map = new Map<string, EaContentRow>();
  if (!existsSync(INSTALLED_CSV)) return map;
  let raw: string;
  try {
    raw = await fs.readFile(INSTALLED_CSV, "utf16le");
  } catch {
    try {
      raw = await fs.readFile(INSTALLED_CSV, "utf8");
    } catch {
      return map;
    }
  }
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return map;
  // Header: "OfferID","Title","InstallDir",...
  const header = splitCsv(lines[0]);
  const idxOffer = header.findIndex((h) => /offer.?id/i.test(h));
  const idxTitle = header.findIndex((h) => /title/i.test(h));
  const idxDir = header.findIndex((h) => /install.?dir/i.test(h));
  for (const line of lines.slice(1)) {
    const cols = splitCsv(line);
    if (cols.length === 0) continue;
    const offerId = idxOffer >= 0 ? cols[idxOffer] : cols[0];
    const title = idxTitle >= 0 ? cols[idxTitle] : cols[1] ?? "";
    const installDir = idxDir >= 0 ? cols[idxDir] : "";
    if (offerId) {
      map.set(offerId.toLowerCase(), {
        offerId,
        title,
        installDir,
      });
    }
  }
  return map;
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') {
        buf += '"';
        i++;
        continue;
      }
      inQuote = !inQuote;
      continue;
    }
    if (c === "," && !inQuote) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  out.push(buf);
  return out;
}

export async function detectEa(): Promise<DetectedGame[]> {
  if (process.platform !== "win32") return [];
  const content = await readInstalledContent();
  const out: DetectedGame[] = [];

  // Combine EA Games + EA Desktop registry subkeys.
  const subkeys = [
    ...(await regEnumKeys(EA_GAMES_KEY)).map((k) => ({ regKey: EA_GAMES_KEY, sub: k })),
    ...(await regEnumKeys(EA_DESKTOP_KEY)).map((k) => ({ regKey: EA_DESKTOP_KEY, sub: k })),
  ];

  for (const { regKey, sub } of subkeys) {
    const values = await regReadValues({
      hive: regKey.hive,
      path: `${regKey.path}\\${sub}`,
    });
    if (!values.length) continue;
    const get = (n: string) =>
      values.find((v) => v.name.toLowerCase() === n.toLowerCase())?.value ?? null;
    const title = get("ProductName") || get("DisplayName") || sub;
    const installDir = get("Install Dir") || get("InstallLocation") || get("InstallDir");
    const exe = get("DisplayIcon") || get("ExePath");

    // Try to find the matching offer id from InstalledContent.csv by title.
    let offerId: string | null = null;
    let csvInstallDir: string | null = null;
    for (const row of content.values()) {
      if (
        row.title &&
        row.title.toLowerCase() === title.toLowerCase()
      ) {
        offerId = row.offerId;
        csvInstallDir = row.installDir || null;
        break;
      }
    }
    if (!offerId) {
      // Fall back: some EA App installs encode the offer id in the registry
      // under the "ContentID" value.
      offerId = get("ContentID") || get("OfferID");
    }

    out.push({
      title,
      platform: "ea",
      executable: exe && existsSync(exe) ? exe : null,
      installDir:
        (installDir && existsSync(installDir) ? installDir : null) ||
        (csvInstallDir && existsSync(csvInstallDir) ? csvInstallDir : null),
      launchCommand: offerId
        ? `origin2://game/launch?offerIds=${offerId}`
        : null,
      sizeBytes: null,
      eaOfferId: offerId,
    });
  }

  // If the CSV had rows not covered by the registry (rare), add them.
  for (const row of content.values()) {
    if (out.some((g) => g.eaOfferId === row.offerId)) continue;
    out.push({
      title: row.title || row.offerId,
      platform: "ea",
      executable: null,
      installDir: row.installDir && existsSync(row.installDir) ? row.installDir : null,
      launchCommand: `origin2://game/launch?offerIds=${row.offerId}`,
      sizeBytes: null,
      eaOfferId: row.offerId,
    });
  }

  void join;
  return out;
}
