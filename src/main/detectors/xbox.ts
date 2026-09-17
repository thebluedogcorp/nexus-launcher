// Xbox / Game Pass (UWP) detector — reads the REAL installed UWP packages.
//
// On Windows, Game Pass and Microsoft Store games are UWP/Appx packages.
// We enumerate them via PowerShell:
//   Get-AppxPackage | Where-Object { $_.IsFramework -eq $false -and $_.IsResourcePackage -eq $false } |
//     Select-Object Name, PackageFullName, InstallLocation, MainApplicationId
//
// We filter to packages likely to be games by looking at the InstallLocation
// (under WindowsApps) and matching against a curated list of known Game Pass /
// Microsoft game package name prefixes. For unknown packages we still surface
// them so the user can keep or discard them.
//
// Launch:  start shell:appsfolder:<PackageFamilyName>!<AppId>
//          (PowerShell: Start-Process "shell:appsfolder:<PFN>!<AppId>")

import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, promises as fs, statSync, readdirSync } from "fs";
import { join, basename } from "path";
import type { DetectedGame } from "@shared/types";

const execAsync = promisify(exec);

interface AppxPackage {
  Name: string;
  PackageFullName: string;
  PackageFamilyName: string;
  InstallLocation: string;
  ApplicationId: string;
}

// Known Microsoft game package-name prefixes. Game Pass titles publish under
// predictable publisher namespaces (Microsoft.* etc.) but the package Name
// often contains the game title. We treat anything under WindowsApps with a
// non-trivial size (>1GB) and a game-like name as a candidate.
const GAME_NAME_HINTS = [
  "halo", "forza", "gears", "sea of thieves", "state of decay", "age of empires",
  "minecraft", "flight sim", "fs2020", "grounded", "outer worlds", "psychonauts",
  "yakuza", "resident evil", "doom", "wolfenstein", "dishonored", "prey",
  "tomb raider", "deus ex", "hitman", "assassin", "far cry", "watch dogs",
  "rainbow", "ghost recon", "metro", "deep rock", "no man's sky", "octopath",
  "persona", "final fantasy", "dragon quest", "elder scrolls", "fallout",
  "the witcher", "cyberpunk", "valheim", "viva pinata", "fable",
  "diablo", "starcraft", "warcraft", "overwatch", "call of duty",
];

const SKIP_NAME_HINTS = [
  "system", "framework", "runtime", "vclib", "ui.xaml", "winui",
  "microsoft.net", "microsoft.vc", "desktopappinstaller", "storeeng",
  "windowscalculator", "windowscamera", "windowscommunicationsapps",
  "windowsmaps", "windowsmediaplayer", "windowsstore", "xboxgameoverlay",
  "xboxidentityprovider", "xboxspeechtotextoverlay", "xbox.tcui",
  "microsoft.xboxgamecallableui", "microsoft.xboxdeviceportal",
  "yourphone", "zunemusic", "zunevideo", "bing", "edge", "office",
  "solitaire", "3dviewer", "mixedreality", "soundrecorder", "skype",
  "windowsfeedback", "windows.photos", "windowsalarms", "stickynotes",
];

const POWERSHELL_QUERY = `powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; Get-AppxPackage | Where-Object { $_.IsFramework -eq $false -and -not $_.IsResourcePackage -and $_.InstallLocation } | ForEach-Object { $a = (Get-AppxPackageManifest $_.PackageFullName).Package.Applications.Application | Select-Object -First 1; [PSCustomObject]@{ Name=$_.Name; PackageFullName=$_.PackageFullName; PackageFamilyName=$_.PackageFamilyName; InstallLocation=$_.InstallLocation; ApplicationId=$a.Id } | ConvertTo-Json -Compress -Depth 3 }"`;

function dirSize(dir: string): number | null {
  if (!existsSync(dir)) return null;
  let total = 0;
  const walk = (d: string, depth: number) => {
    if (depth > 4) return;
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
        if (st.isDirectory()) walk(full, depth + 1);
        else total += st.size;
      } catch {
        // WindowsApps often blocks access; skip silently.
      }
    }
  };
  try {
    walk(dir, 0);
    return total;
  } catch {
    return null;
  }
}

async function enumAppxPackages(): Promise<AppxPackage[]> {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execAsync(POWERSHELL_QUERY, {
      maxBuffer: 50 * 1024 * 1024,
      windowsHide: true,
    });
    const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const packages: AppxPackage[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        packages.push({
          Name: obj.Name,
          PackageFullName: obj.PackageFullName,
          PackageFamilyName: obj.PackageFamilyName,
          InstallLocation: obj.InstallLocation,
          ApplicationId: obj.ApplicationId,
        });
      } catch {
        // skip malformed line
      }
    }
    return packages;
  } catch {
    return [];
  }
}

function isLikelyGame(pkg: AppxPackage): boolean {
  const name = pkg.Name.toLowerCase();
  if (SKIP_NAME_HINTS.some((s) => name.includes(s))) return false;
  if (GAME_NAME_HINTS.some((s) => name.includes(s))) return true;
  // Heuristic: under WindowsApps + not a Microsoft system component + large.
  if (!pkg.InstallLocation.toLowerCase().includes("windowsapps")) return false;
  if (pkg.Name.startsWith("Microsoft.") && pkg.Name.endsWith("App")) return false;
  // Only keep Microsoft.* / *.Game / *.Games / known publishers to limit noise.
  return /microsoft\.|game|games/i.test(pkg.Name);
}

function humanizeName(raw: string): string {
  // "Microsoft.HaloInfinite" -> "Halo Infinite"
  let s = raw.replace(/^Microsoft\./, "");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  s = s.replace(/[._]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export async function detectXbox(): Promise<DetectedGame[]> {
  if (process.platform !== "win32") return [];
  const packages = await enumAppxPackages();
  const out: DetectedGame[] = [];
  for (const pkg of packages) {
    if (!isLikelyGame(pkg)) continue;
    const installDir = existsSync(pkg.InstallLocation) ? pkg.InstallLocation : null;
    const size = installDir ? dirSize(installDir) : null;
    // Only surface packages with >1GB on disk OR a known game hint, to keep
    // the scan focused on real games rather than tiny companion apps.
    const name = pkg.Name.toLowerCase();
    const hint = GAME_NAME_HINTS.some((s) => name.includes(s));
    if (!hint && (size === null || size < 1 * 1024 * 1024 * 1024)) continue;

    out.push({
      title: humanizeName(pkg.Name),
      platform: "xbox",
      executable: null, // UWP apps don't have a classic exe path
      installDir,
      launchCommand: `shell:appsfolder:${pkg.PackageFamilyName}!${pkg.ApplicationId}`,
      sizeBytes: size,
      xboxPackageFamilyName: pkg.PackageFamilyName,
      xboxAppId: pkg.ApplicationId,
    });
  }
  return out;
}
