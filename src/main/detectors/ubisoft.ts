// Ubisoft Connect detector — reads the REAL Ubisoft configuration.
//
// Ubisoft Connect stores install records in the Windows registry:
//   HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher
//       "InstallDir" = C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher
//   HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\<numericId>
//       "InstallDir" = C:\...\game
//       "Language"   = en
//
// Numeric id -> title mapping is held in:
//   <UbisoftInstallDir>\cache\configuration\config  (binary — hard to parse)
//   <UbisoftInstallDir>\logs\launcher_log.txt       (titles appear in install lines)
//
// As a robust fallback we read per-game registry:
//   HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\<uplay_id>
// which has DisplayName + InstallLocation for Ubisoft titles.
//
// Launch:  uplay://launch/<numericId>/0

import { existsSync } from "fs";
import { regEnumKeys, regReadValue, regReadValues } from "./registry";
import type { DetectedGame } from "@shared/types";

const UBISOFT_ROOT = { hive: "HKLM", path: "SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher" };
const UBISOFT_INSTALLS = { hive: "HKLM", path: "SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs" };
const UNINSTALL_KEY = { hive: "HKLM", path: "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall" };

/** Best-effort numeric id -> display name lookup from uninstall entries. */
async function buildTitleMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const subs = await regEnumKeys(UNINSTALL_KEY);
  for (const sub of subs) {
    const values = await regReadValues({
      hive: "HKLM",
      path: `${UNINSTALL_KEY.path}\\${sub}`,
    });
    if (!values.length) continue;
    const displayName =
      values.find((v) => v.name.toLowerCase() === "displayname")?.value ?? null;
    const publisher =
      values.find((v) => v.name.toLowerCase() === "publisher")?.value ?? "";
    if (!displayName) continue;
    if (!/ubisoft/i.test(publisher)) continue;
    // Ubisoft uninstall keys are often "Uplay Install <id>" or the numeric id.
    const m = sub.match(/(\d{6,})/);
    if (m) map.set(m[1], displayName);
  }
  return map;
}

export async function detectUbisoft(): Promise<DetectedGame[]> {
  if (process.platform !== "win32") return [];
  const titleMap = await buildTitleMap();

  const installIds = await regEnumKeys(UBISOFT_INSTALLS);
  const out: DetectedGame[] = [];
  for (const id of installIds) {
    const installDir = await regReadValue(
      { hive: "HKLM", path: `${UBISOFT_INSTALLS.path}\\${id}` },
      "InstallDir",
    );
    const title = titleMap.get(id) ?? `Ubisoft Game ${id}`;
    out.push({
      title,
      platform: "ubisoft",
      executable: null,
      installDir: installDir && existsSync(installDir) ? installDir : null,
      launchCommand: `uplay://launch/${id}/0`,
      sizeBytes: null,
      ubisoftId: id,
    });
  }
  return out;
}
