// Detector orchestrator — runs every platform detector in parallel and
// returns a unified ScanSummary. Each detector is platform-guarded (no-ops
// outside win32) so this file is safe to import during renderer dev.

import { detectSteam } from "./steam";
import { detectEpic } from "./epic";
import { detectGog } from "./gog";
import { detectBattlenet } from "./battlenet";
import { detectEa } from "./ea";
import { detectUbisoft } from "./ubisoft";
import { detectRiot } from "./riot";
import { detectXbox } from "./xbox";
import type { DetectedGame, PlatformId, ScanSummary } from "@shared/types";

type Detector = {
  platform: PlatformId;
  label: string;
  run: () => Promise<DetectedGame[]>;
};

const DETECTORS: Detector[] = [
  { platform: "steam", label: "Steam", run: detectSteam },
  { platform: "epic", label: "Epic Games", run: detectEpic },
  { platform: "gog", label: "GOG Galaxy", run: detectGog },
  { platform: "battlenet", label: "Battle.net", run: detectBattlenet },
  { platform: "ea", label: "EA App", run: detectEa },
  { platform: "ubisoft", label: "Ubisoft Connect", run: detectUbisoft },
  { platform: "riot", label: "Riot Client", run: detectRiot },
  { platform: "xbox", label: "Xbox / Game Pass", run: detectXbox },
];

export async function runScan(
  platforms?: PlatformId[],
  onProgress?: (platform: PlatformId, label: string) => void,
): Promise<ScanSummary> {
  const targets = DETECTORS.filter(
    (d) => !platforms || platforms.includes(d.platform),
  );

  const detected: DetectedGame[] = [];
  const byPlatform: Record<string, number> = {};
  const errors: { platform: string; message: string }[] = [];

  // Run detectors sequentially so onProgress updates fire in a stable order
  // and so we don't hammer the registry / PowerShell in parallel.
  for (const d of targets) {
    onProgress?.(d.platform, d.label);
    try {
      const games = await d.run();
      for (const g of games) {
        detected.push(g);
        byPlatform[d.platform] = (byPlatform[d.platform] || 0) + 1;
      }
    } catch (e) {
      errors.push({
        platform: d.platform,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    detected,
    byPlatform,
    scannedPlatforms: targets.map((t) => t.platform),
    errors,
  };
}
