// GOG Galaxy detector — reads the REAL GOG registry hive.
//
// GOG registers each installed game under:
//   HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\<numericId>
// with values: gameName, path (install dir), exe, launchCommand, verbaRow, etc.
//
// Launch:  gog://<numericId>  (also goggalaxy://<numericId>)
//
// On a 64-bit Electron the WOW6432Node view is the default for HKLM\SOFTWARE
// reads, but we also try the explicit 32-bit view as a safety net.

import { existsSync } from "fs";
import { regEnumKeys, regReadValues, regReadValuesAlt } from "./registry";
import type { DetectedGame } from "@shared/types";

const GOG_KEY = { hive: "HKLM", path: "SOFTWARE\\WOW6432Node\\GOG.com\\Games" };
const GOG_KEY_LEGACY = { hive: "HKLM", path: "SOFTWARE\\GOG.com\\Games" };

async function readGogKey(subkey: string) {
  const a = await regReadValues({ hive: "HKLM", path: `SOFTWARE\\WOW6432Node\\GOG.com\\Games\\${subkey}` });
  if (a.length) return a;
  const b = await regReadValuesAlt(
    { hive: "HKLM", path: `SOFTWARE\\WOW6432Node\\GOG.com\\Games\\${subkey}` },
    "32",
  );
  if (b.length) return b;
  const c = await regReadValues({ hive: "HKLM", path: `SOFTWARE\\GOG.com\\Games\\${subkey}` });
  return c;
}

export async function detectGog(): Promise<DetectedGame[]> {
  if (process.platform !== "win32") return [];
  let ids = await regEnumKeys(GOG_KEY);
  if (ids.length === 0) ids = await regEnumKeys(GOG_KEY_LEGACY);

  const out: DetectedGame[] = [];
  for (const id of ids) {
    const values = await readGogKey(id);
    if (!values.length) continue;
    const get = (name: string) =>
      values.find((v) => v.name.toLowerCase() === name.toLowerCase())?.value ?? null;
    const title = get("gameName") || get("productName") || id;
    const installDir = get("path") || get("installDir");
    const exe = get("exe") || get("launchCommand") || get("exeFile");
    let launch = get("launchCommand") || null;
    // GOG launch commands sometimes include the full path; fall back to gog://<id>
    if (!launch || launch.toLowerCase().endsWith(".exe")) {
      launch = `gog://${id}`;
    }
    out.push({
      title,
      platform: "gog",
      executable: exe && existsSync(exe) ? exe : null,
      installDir: installDir && existsSync(installDir) ? installDir : null,
      launchCommand: launch,
      sizeBytes: null,
      gogId: id,
    });
  }
  return out;
}
