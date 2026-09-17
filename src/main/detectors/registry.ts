// Windows registry helper — shells out to `reg.exe` (always present on Windows).
// Returns parsed key/value pairs. Works without any native addons.
//
// This runs only on win32; on other platforms it returns empty results so the
// detectors can no-op gracefully during dev.

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface RegKey {
  hive: string; // e.g. "HKLM", "HKCU"
  path: string; // e.g. "SOFTWARE\\WOW6432Node\\GOG.com\\Games"
}

export interface RegValue {
  name: string;
  type: string;
  value: string;
}

const HIVE_MAP: Record<string, string> = {
  HKLM: "HKEY_LOCAL_MACHINE",
  HKCU: "HKEY_CURRENT_USER",
  HKCR: "HKEY_CLASSES_ROOT",
  HKU: "HKEY_USERS",
  HKCC: "HKEY_CURRENT_CONFIG",
};

/** Enumerate subkeys under a registry key. */
export async function regEnumKeys(key: RegKey): Promise<string[]> {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execAsync(
      `reg query "${key.hive}\\${key.path}"`,
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const keys: string[] = [];
    const base = `${key.hive}\\${key.path}`;
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === base) continue;
      if (trimmed.startsWith(base + "\\")) {
        keys.push(trimmed.slice(base.length + 1));
      }
    }
    return keys;
  } catch {
    return [];
  }
}

/** Read all values of a registry key. */
export async function regReadValues(key: RegKey): Promise<RegValue[]> {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execAsync(
      `reg query "${key.hive}\\${key.path}"`,
      { maxBuffer: 10 * 1024 * 1024 },
    );
    return parseRegOutput(stdout);
  } catch {
    return [];
  }
}

/** Read a specific named value. */
export async function regReadValue(key: RegKey, name: string): Promise<string | null> {
  const values = await regReadValues(key);
  const v = values.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return v?.value ?? null;
}

/** Query a 64-bit view of the registry from a 32-bit process (and vice-versa). */
export async function regReadValuesAlt(key: RegKey, view: "32" | "64"): Promise<RegValue[]> {
  if (process.platform !== "win32") return [];
  const flag = view === "32" ? "/reg:32" : "/reg:64";
  try {
    const { stdout } = await execAsync(
      `reg query "${key.hive}\\${key.path}" ${flag}`,
      { maxBuffer: 10 * 1024 * 1024 },
    );
    return parseRegOutput(stdout);
  } catch {
    return [];
  }
}

function parseRegOutput(stdout: string): RegValue[] {
  const out: RegValue[] = [];
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    // Lines look like:
    //     "gameName"    REG_SZ    "The Witcher 3"
    //     InstallDir    REG_SZ    C:\GOG Games\Witcher 3
    //     (Default)    REG_SZ    (value not set)
    const m = line.match(/^\s*(.+?)\s{2,}(REG_\w+)\s+(.*)$/);
    if (m) {
      let name = m[1].trim();
      const type = m[2].trim();
      let value = m[3].trim();
      if (name === "(Default)") name = "";
      if (
        value.startsWith('"') &&
        value.endsWith('"') &&
        value.length >= 2
      ) {
        value = value.slice(1, -1);
      }
      out.push({ name, type, value });
    }
  }
  return out;
}

export function regHive(hive: string): string | undefined {
  return HIVE_MAP[hive];
}
