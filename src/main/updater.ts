// Auto-updater — checks GitHub Releases, downloads the latest NSIS installer,
// and launches it to replace the running app.
//
// Strategy:
//   1. Query GitHub Releases API for the latest release tag.
//   2. Compare semver against the installed version.
//   3. If newer: fetch the NSIS installer asset (NEXUS-Setup-*.exe) URL.
//   4. Download it to %TEMP% with live progress events to the renderer.
//   5. Launch the installer (detached) and quit NEXUS so the installer can
//      replace the files.
//
// Works for BOTH portable and NSIS installs (portable builds just re-download
// the latest portable or setup — we prefer setup since it self-updates).

import { app, BrowserWindow } from "electron";
import type { App } from "electron";
import { join } from "path";
import { createWriteStream, existsSync, mkdirSync, unlinkSync, renameSync } from "fs";
import { spawn } from "child_process";

export interface UpdateResult {
  ok: boolean;
  message: string;
  updateAvailable?: boolean;
  version?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  downloadSize?: number;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
}

const REPO = "thebluedogcorp/nexus-launcher";
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Check the latest GitHub release against the installed version. */
export async function checkForUpdatesAndNotify(): Promise<UpdateResult> {
  try {
    const currentVersion = getCurrentVersion();
    const res = await fetch(API, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!res.ok) return { ok: false, message: `GitHub API ${res.status}` };
    const json = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      assets?: Array<{
        name: string;
        browser_download_url: string;
        size: number;
        content_type: string;
      }>;
    };
    if (!json.tag_name) return { ok: false, message: "No release tag found." };
    const latest = json.tag_name.replace(/^v/, "");
    const updateAvailable = compareVersions(latest, currentVersion) > 0;

    // Prefer the NSIS setup installer (it self-updates on future runs).
    const setupAsset = json.assets?.find(
      (a) => /NEXUS-Setup.*\.exe$/i.test(a.name) && a.content_type.includes("msdownload"),
    );
    const portableAsset = json.assets?.find(
      (a) => /NEXUS-Portable.*\.exe$/i.test(a.name),
    );
    const asset = setupAsset ?? portableAsset;

    return {
      ok: true,
      message: updateAvailable
        ? `NEXUS ${latest} is available — your version is ${currentVersion}.`
        : `You're on the latest version (${currentVersion}).`,
      updateAvailable,
      version: latest,
      releaseUrl: json.html_url,
      downloadUrl: asset?.browser_download_url,
      downloadSize: asset?.size,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Download the latest installer to %TEMP% with live progress events, then
 * launch it (detached) so it replaces the app. Sends `updater:progress`
 * events to every renderer window. Resolves with the downloaded file path.
 *
 * The caller (renderer) should call `app.quit()` after the user confirms.
 */
export async function downloadAndInstallUpdate(
  downloadUrl: string,
  expectedSize?: number,
): Promise<{ ok: boolean; message: string; installerPath?: string }> {
  if (!downloadUrl) return { ok: false, message: "No download URL available." };

  const tempDir = app.getPath("temp");
  const tmpPath = join(tempDir, "nexus-update.part");
  const finalPath = join(tempDir, "NEXUS-Update-Setup.exe");

  try {
    const res = await fetch(downloadUrl, { redirect: "follow" });
    if (!res.ok || !res.body) {
      return { ok: false, message: `Download failed: HTTP ${res.status}` };
    }

    const totalBytes = expectedSize ?? Number(res.headers.get("content-length")) ?? 0;
    let received = 0;
    const lastPct = -1;

    const writer = createWriteStream(tmpPath);
    const reader = res.body.getReader();

    const broadcast = (pct: number) => {
      if (pct === lastPct) return;
      const progress: DownloadProgress = {
        bytesDownloaded: received,
        totalBytes,
        percent: pct,
      };
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("updater:progress", progress);
      }
    };

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await new Promise<void>((resolve, reject) => {
        writer.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()));
      });
      received += value.length;
      if (totalBytes > 0) {
        const pct = Math.min(100, Math.round((received / totalBytes) * 100));
        broadcast(pct);
      }
    }
    await new Promise<void>((resolve, reject) => {
      writer.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });

    // Rename .part -> final .exe
    if (existsSync(finalPath)) {
      try {
        unlinkSync(finalPath);
      } catch {
        // ignore
      }
    }
    renameSync(tmpPath, finalPath);

    // 100% done
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("updater:progress", {
        bytesDownloaded: received,
        totalBytes: totalBytes || received,
        percent: 100,
      } as DownloadProgress);
    }

    return {
      ok: true,
      message: "Download complete. Launching installer…",
      installerPath: finalPath,
    };
  } catch (e) {
    // Clean up partial file.
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Launch the downloaded installer (detached) so it can replace the running
 * app, then quit NEXUS. The NSIS installer will close NEXUS automatically
 * during file replacement; we quit here as a safety net.
 */
export function launchInstallerAndQuit(installerPath: string): void {
  try {
    // On Windows, spawning the .exe detached + unref'd lets it keep running
    // after NEXUS exits.
    const child = spawn(installerPath, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
    // Give the installer a moment to start, then quit.
    setTimeout(() => {
      app.quit();
    }, 800);
  } catch {
    // If launch fails, just quit so the user can run it manually.
    app.quit();
  }
}

function getCurrentVersion(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  try {
    const pkg = require("../../package.json");
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Returns >0 if a > b, <0 if a < b, 0 if equal. Handles "1.2.3" vs "1.2". */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

// Ensure the temp dir exists (it should, but be safe for the rename).
try {
  if (!existsSync(app.getPath("temp"))) {
    mkdirSync(app.getPath("temp"), { recursive: true });
  }
} catch {
  // ignore
}

// Type-only import kept for bundler compatibility.
export type { App };
