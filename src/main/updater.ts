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
import { createWriteStream, existsSync, mkdirSync, unlinkSync, renameSync, readdirSync, statSync } from "fs";
import { spawn } from "child_process";

/** Names of files left behind in %TEMP% by previous update cycles. */
const INSTALLER_CACHE_PATTERNS = [
  "NEXUS-Update-Setup.exe",
  "nexus-update.part",
  "NEXUS-Setup-",      // any leftover NEXUS-Setup-*.exe from interrupted installs
  "NEXUS-Portable-",   // any leftover NEXUS-Portable-*.exe
];

/**
 * v4.10.0 — Installer cache cleanup.
 *
 * When NEXUS auto-updates, it downloads the latest NSIS installer to
 * %TEMP%\NEXUS-Update-Setup.exe (~85 MB). After the install runs, the
 * downloaded .exe is LEFT BEHIND in %TEMP% — taking up disk space on
 * every update cycle. Over a few months this can pile up to several GB.
 *
 * This function scans %TEMP% for leftover NEXUS installer files and deletes
 * them. It's called:
 *   - On app startup (best-effort, silent — never blocks the launch).
 *   - Just before downloading a new update (so the new download doesn't fight
 *     an old leftover of the same name).
 *   - On user demand via the Settings → General → "Clean up update cache"
 *     button.
 *
 * Returns the bytes freed + the list of paths removed (for the Settings UI
 * to display: "Freed 85.2 MB across 1 file").
 */
export interface CleanupResult {
  ok: boolean;
  bytesFreed: number;
  filesRemoved: string[];
  message: string;
}

export function cleanupInstallerCache(): CleanupResult {
  const tempDir = app.getPath("temp");
  const removed: string[] = [];
  let bytesFreed = 0;
  try {
    const entries = readdirSync(tempDir);
    for (const name of entries) {
      const matches = INSTALLER_CACHE_PATTERNS.some((p) =>
        p.endsWith("-") ? name.startsWith(p) : name === p
      );
      if (!matches) continue;
      const full = join(tempDir, name);
      try {
        const stat = statSync(full);
        if (stat.isFile()) {
          unlinkSync(full);
          removed.push(name);
          bytesFreed += stat.size;
        }
      } catch {
        // File might be in use (e.g. installer currently running) — skip.
      }
    }
    const mb = (bytesFreed / (1024 * 1024)).toFixed(1);
    return {
      ok: true,
      bytesFreed,
      filesRemoved: removed,
      message: removed.length
        ? `Freed ${mb} MB across ${removed.length} file${removed.length === 1 ? "" : "s"}`
        : "No leftover installer files found.",
    };
  } catch (e) {
    return { ok: false, bytesFreed: 0, filesRemoved: [], message: e instanceof Error ? e.message : String(e) };
  }
}

/** Scan %TEMP% for leftover installer files WITHOUT deleting — for the
 *  Settings UI to show the current cache size before the user clicks Clean. */
export function getInstallerCacheInfo(): { bytes: number; files: string[] } {
  const tempDir = app.getPath("temp");
  let bytes = 0;
  const files: string[] = [];
  try {
    for (const name of readdirSync(tempDir)) {
      const matches = INSTALLER_CACHE_PATTERNS.some((p) =>
        p.endsWith("-") ? name.startsWith(p) : name === p
      );
      if (!matches) continue;
      const full = join(tempDir, name);
      try {
        const stat = statSync(full);
        if (stat.isFile()) {
          bytes += stat.size;
          files.push(name);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return { bytes, files };
}

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
// Use the LIST endpoint (/releases) — the /releases/latest endpoint returns
// 404 for private repos when called without auth, and also for repos whose
// latest release is marked prerelease. The list endpoint is more permissive.
const API_LIST = `https://api.github.com/repos/${REPO}/releases?per_page=10`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

interface LatestRelease {
  tag_name: string;
  html_url: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
    content_type: string;
  }>;
  prerelease: boolean;
  draft: boolean;
}

/** Check the latest GitHub release against the installed version. */
export async function checkForUpdatesAndNotify(): Promise<UpdateResult> {
  try {
    const currentVersion = getCurrentVersion();
    const release = await fetchLatestRelease();
    if (!release) {
      return {
        ok: false,
        message: `Couldn't reach GitHub Releases. Open the releases page manually.`,
        releaseUrl: RELEASES_PAGE,
      };
    }
    const latest = release.tag_name.replace(/^v/, "");
    const updateAvailable = compareVersions(latest, currentVersion) > 0;

    // Prefer the NSIS setup installer (it self-updates on future runs).
    const setupAsset = release.assets.find(
      (a) => /NEXUS-Setup.*\.exe$/i.test(a.name),
    );
    const portableAsset = release.assets.find(
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
      releaseUrl: release.html_url,
      downloadUrl: asset?.browser_download_url,
      downloadSize: asset?.size,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), releaseUrl: RELEASES_PAGE };
  }
}

/**
 * Fetch the latest non-prerelease, non-draft release.
 * Tries the list endpoint (more permissive), falls back to the latest endpoint,
 * then to scraping the releases HTML page (works without API auth).
 */
async function fetchLatestRelease(): Promise<LatestRelease | null> {
  // 1. List endpoint — returns all releases, we pick the newest non-prerelease.
  try {
    const res = await fetch(API_LIST, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "NEXUS-Launcher-Updater" },
    });
    if (res.ok) {
      const json = (await res.json()) as LatestRelease[];
      const stable = json.find((r) => !r.prerelease && !r.draft);
      if (stable) return stable;
      // If every release is somehow prerelease, take the first.
      if (json.length > 0) return json[0];
    }
  } catch {
    // fall through
  }

  // 2. Latest endpoint — works for public repos with a stable latest release.
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "NEXUS-Launcher-Updater" },
    });
    if (res.ok) {
      return (await res.json()) as LatestRelease;
    }
  } catch {
    // fall through
  }

  // 3. HTML fallback — scrape the releases page for the latest tag.
  // This works without API auth (the HTML page is publicly readable for
  // public repos, and for private repos the user will be prompted to sign in
  // when they click the download link).
  try {
    const res = await fetch(RELEASES_PAGE, {
      headers: { "User-Agent": "NEXUS-Launcher-Updater" },
      redirect: "follow",
    });
    if (res.ok) {
      const html = await res.text();
      // The page URL after redirect contains the tag, e.g.
      // https://github.com/thebluedogcorp/nexus-launcher/releases/tag/v1.4.0
      const finalUrl = res.url || "";
      const tagMatch = finalUrl.match(/\/releases\/tag\/(v?[\d.]+)/);
      if (tagMatch) {
        const tag = tagMatch[1].startsWith("v") ? tagMatch[1] : `v${tagMatch[1]}`;
        return {
          tag_name: tag,
          html_url: finalUrl,
          assets: [],
          prerelease: false,
          draft: false,
        };
      }
      // Also try scraping the version from the HTML body.
      const bodyMatch = html.match(/\/releases\/tag\/(v?[\d.]+)/);
      if (bodyMatch) {
        const tag = bodyMatch[1].startsWith("v") ? bodyMatch[1] : `v${bodyMatch[1]}`;
        return {
          tag_name: tag,
          html_url: `https://github.com/${REPO}/releases/tag/${tag}`,
          assets: [],
          prerelease: false,
          draft: false,
        };
      }
    }
  } catch {
    // fall through
  }

  return null;
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

  // v4.10.0 — Auto-cleanup of any leftover installer files BEFORE downloading,
  // so the new download doesn't fight an old leftover of the same name. Also
  // prevents the user's %TEMP% from accumulating multiple NEXUS-Setup-*.exe
  // files (each ~85 MB) over repeated updates.
  try {
    cleanupInstallerCache();
  } catch {
    // Never block the download on cleanup failure.
  }

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
