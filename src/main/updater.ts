// Auto-updater module — uses electron-updater to check GitHub Releases for
// newer NEXUS versions and install them silently.
//
// In development / portable builds this no-ops gracefully (electron-updater
// only works for code-signed NSIS installs). The renderer calls
// `window.nexus.checkForUpdates()` to trigger a manual check.

import type { App } from "electron";

export interface UpdateResult {
  ok: boolean;
  message: string;
  updateAvailable?: boolean;
  version?: string;
  releaseUrl?: string;
}

let _checked = false;

export async function checkForUpdatesAndNotify(): Promise<UpdateResult> {
  // Portable builds and dev mode don't support auto-update — fall back to a
  // lightweight GitHub Releases API check that opens the release page.
  if (!isAutoUpdateSupported()) {
    return checkReleasesViaApi();
  }

  try {
    // electron-updater is optional; lazy-require so the build doesn't fail
    // if the dependency is missing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = false; // ask first
    autoUpdater.autoInstallOnAppQuit = true;
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      return {
        ok: true,
        message: `Version ${result.updateInfo.version} is available.`,
        updateAvailable: result.updateInfo.version !== result.cancellationToken ? true : false,
        version: result.updateInfo.version,
      };
    }
    return { ok: true, message: "You're on the latest version.", updateAvailable: false };
  } catch (e) {
    // Fallback to the GitHub Releases API check.
    return checkReleasesViaApi();
  }
}

function isAutoUpdateSupported(): boolean {
  // electron-updater only works for packaged NSIS installs (not portable, not dev).
  // Portable builds are single-file self-extractors and can't self-update.
  return !!process.execPath && !process.env.DEV && !process.execPath.includes("NEXUS-Portable");
}

/** Fallback: query the GitHub Releases API and compare versions. */
async function checkReleasesViaApi(): Promise<UpdateResult> {
  try {
    const currentVersion = getCurrentVersion();
    const res = await fetch(
      "https://api.github.com/repos/thebluedogcorp/nexus-launcher/releases/latest",
      { headers: { Accept: "application/vnd.github.v3+json" } },
    );
    if (!res.ok) return { ok: false, message: `GitHub API ${res.status}` };
    const json = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      prerelease?: boolean;
    };
    if (!json.tag_name) return { ok: false, message: "No release tag found." };
    const latest = json.tag_name.replace(/^v/, "");
    const updateAvailable = compareVersions(latest, currentVersion) > 0;
    return {
      ok: true,
      message: updateAvailable
        ? `NEXUS ${latest} is available — your version is ${currentVersion}.`
        : `You're on the latest version (${currentVersion}).`,
      updateAvailable,
      version: latest,
      releaseUrl: json.html_url,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
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

// Type-only import so the module compiles even if electron isn't resolvable
// in some bundling contexts.
export type { App };
