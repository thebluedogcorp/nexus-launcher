// Real game launcher — actually starts games on Windows.
//
// Each platform has a real, native launch mechanism:
//   steam://run/<appid>                          -> Steam protocol handler
//   com.epicgames.launcher://apps/<app>          -> Epic protocol handler
//   gog://<id>                                   -> GOG Galaxy protocol handler
//   battlenet://<uid>                            -> Battle.net protocol handler
//   origin2://game/launch?offerIds=<id>          -> EA App protocol handler
//   uplay://launch/<id>/0                        -> Ubisoft Connect protocol handler
//   riotclient://launch / valorant:// / lor://   -> Riot protocol handlers
//   shell:appsfolder:<PFN>!<AppId>               -> Xbox UWP launch
//
// Electron's `shell.openExternal` invokes the OS default handler for these URIs,
// which is exactly how the official store launchers do it. For manually-added
// games with an .exe path, we spawn the executable directly.
//
// SHORTCUT SUPPORT: .lnk files (Windows shortcuts) are resolved to their
// real target + working directory before spawning. This handles cases where
// the store doesn't expose the .exe directly but creates a Start Menu
// shortcut (common with Epic, EA App, Xbox Game Pass).

import { shell } from "electron";
import { spawn, exec } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { promisify } from "util";
import type { Game } from "@shared/types";

const execAsync = promisify(exec);

export interface LaunchResult {
  ok: boolean;
  message: string;
  startedAt: string;
}

export interface ShortcutTarget {
  targetPath: string;
  workingDir: string;
  arguments: string;
  iconLocation: string;
}

/**
 * Resolve a Windows .lnk shortcut file to its real target executable + working
 * directory. Uses PowerShell to read the WScript.Shell COM object (always
 * available on Windows). Returns null if the file isn't a valid shortcut or
 * can't be resolved.
 *
 * On non-Windows platforms, returns null (shortcuts are Windows-only).
 */
export async function resolveShortcut(lnkPath: string): Promise<ShortcutTarget | null> {
  if (process.platform !== "win32") return null;
  if (!lnkPath.toLowerCase().endsWith(".lnk")) return null;
  if (!existsSync(lnkPath)) return null;

  try {
    // Use PowerShell to read the shortcut via WScript.Shell COM.
    // This is the most reliable method — it handles all .lnk variants.
    const psScript = `
      $ws = New-Object -ComObject WScript.Shell;
      $sc = $ws.CreateShortcut('${lnkPath.replace(/'/g, "''")}');
      $sc.TargetPath + '|' + $sc.WorkingDirectory + '|' + $sc.Arguments + '|' + $sc.IconLocation
    `.trim().replace(/\n/g, " ");
    const { stdout } = await execAsync(
      `powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`,
      { windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const parts = stdout.trim().split("|");
    if (parts.length >= 1 && parts[0]) {
      return {
        targetPath: parts[0],
        workingDir: parts[1] || dirname(parts[0]),
        arguments: parts[2] || "",
        iconLocation: parts[3] || "",
      };
    }
    return null;
  } catch {
    // Fallback: try reading the .lnk binary directly for the ASCII target path.
    // This is less reliable but works without PowerShell.
    return resolveShortcutBinary(lnkPath);
  }
}

/**
 * Fallback: parse a .lnk file's binary header to find the target path.
 * This reads the raw bytes and looks for the "A_RELATIVE_PATH" or the
 * "LINK_TARGET" ASCII path string. Not as reliable as PowerShell but
 * works in headless/restricted environments.
 */
function resolveShortcutBinary(lnkPath: string): ShortcutTarget | null {
  try {
    const buf = readFileSync(lnkPath);
    // .lnk files have a complex binary format. We do a simple heuristic:
    // look for a path-like string (C:\...\something.exe) in the raw bytes.
    const content = buf.toString("latin1");
    // Find the first .exe path in the content.
    const match = content.match(/[A-Z]:\\[^\x00-\x1f]*\.exe/i);
    if (match) {
      return {
        targetPath: match[0],
        workingDir: dirname(match[0]),
        arguments: "",
        iconLocation: "",
      };
    }
    // Also look for .url files (some stores use those).
    const urlMatch = content.match(/URL=(.+)/i);
    if (urlMatch) {
      return {
        targetPath: urlMatch[1].trim(),
        workingDir: "",
        arguments: "",
        iconLocation: "",
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Launch a game using the most appropriate native mechanism. */
export async function launchGame(game: Game): Promise<LaunchResult> {
  const startedAt = new Date().toISOString();

  // 1. Protocol URI (preferred — lets the official launcher handle updates/DRM).
  if (game.launchCommand && looksLikeUri(game.launchCommand)) {
    try {
      await shell.openExternal(game.launchCommand);
      return { ok: true, message: `Launched ${game.title} via ${game.platform}.`, startedAt };
    } catch (e) {
      return {
        ok: false,
        message: `Could not open ${game.launchCommand}: ${
          e instanceof Error ? e.message : String(e)
        }`,
        startedAt,
      };
    }
  }

  // 2. Direct executable or .lnk shortcut (manual / custom games).
  if (game.executable) {
    const exePath = game.executable;
    const isShortcut = exePath.toLowerCase().endsWith(".lnk");

    // If it's a .lnk shortcut, resolve it to the real target first.
    if (isShortcut) {
      const target = await resolveShortcut(exePath);
      if (target && target.targetPath) {
        try {
          // Spawn the resolved target with its working directory + arguments.
          const args = target.arguments ? target.arguments.split(/\s+/).filter(Boolean) : [];
          spawn(target.targetPath, args, {
            cwd: target.workingDir || undefined,
            detached: true,
            stdio: "ignore",
            windowsHide: false,
          }).unref();
          return {
            ok: true,
            message: `Launched via shortcut: ${target.targetPath}`,
            startedAt,
          };
        } catch (e) {
          return {
            ok: false,
            message: `Failed to start shortcut target: ${
              e instanceof Error ? e.message : String(e)
            }`,
            startedAt,
          };
        }
      }

      // If shortcut resolution failed, try opening the .lnk directly via
      // shell.openPath — Windows will follow the shortcut natively.
      try {
        const result = await shell.openPath(exePath);
        if (!result) {
          return { ok: true, message: `Launched shortcut ${exePath}.`, startedAt };
        }
        return { ok: false, message: `Could not open shortcut: ${result}`, startedAt };
      } catch (e) {
        return {
          ok: false,
          message: `Failed to open shortcut: ${
            e instanceof Error ? e.message : String(e)
          }`,
          startedAt,
        };
      }
    }

    // 3. Direct .exe — spawn it directly.
    try {
      spawn(exePath, {
        cwd: game.installDir ?? undefined,
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      }).unref();
      return { ok: true, message: `Started ${exePath}.`, startedAt };
    } catch (e) {
      return {
        ok: false,
        message: `Failed to start executable: ${
          e instanceof Error ? e.message : String(e)
        }`,
        startedAt,
      };
    }
  }

  // 4. If we have an installDir but no executable, try opening the directory
  //    (the user can find the exe manually).
  if (game.installDir) {
    try {
      await shell.openPath(game.installDir);
      return { ok: true, message: `Opened install directory (no exe set).`, startedAt };
    } catch {
      // fall through
    }
  }

  return {
    ok: false,
    message: "No launch command or executable available for this game.",
    startedAt,
  };
}

function looksLikeUri(s: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-zA-Z]:[\\/]/.test(s);
}
