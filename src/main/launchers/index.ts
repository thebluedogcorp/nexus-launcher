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

import { shell } from "electron";
import { spawn } from "child_process";
import type { Game } from "@shared/types";

export interface LaunchResult {
  ok: boolean;
  message: string;
  startedAt: string;
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

  // 2. Direct executable (manual / custom games).
  if (game.executable) {
    try {
      spawn(game.executable, {
        cwd: game.installDir ?? undefined,
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      }).unref();
      return { ok: true, message: `Started ${game.executable}.`, startedAt };
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

  return {
    ok: false,
    message: "No launch command or executable available for this game.",
    startedAt,
  };
}

function looksLikeUri(s: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-zA-Z]:[\\/]/.test(s);
}
