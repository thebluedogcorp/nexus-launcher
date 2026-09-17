// Shared types used by both the Electron main process and the React renderer.

export type PlatformId =
  | "steam"
  | "epic"
  | "gog"
  | "xbox"
  | "ubisoft"
  | "battlenet"
  | "ea"
  | "riot"
  | "manual"
  | "custom";

export type GameSource = "auto" | "manual";

export interface Game {
  id: number;
  title: string;
  platform: PlatformId;
  source: GameSource;
  // Native launch info — real, OS-specific.
  executable: string | null;
  installDir: string | null;
  launchCommand: string | null;
  // RAWG / metadata
  coverImage: string | null;
  description: string | null;
  developer: string | null;
  publisher: string | null;
  releaseDate: string | null;
  rating: number | null;
  ratingCount: number | null;
  genres: string[];
  tags: string[];
  rawgId: number | null;
  // Per-store native identifiers
  steamAppId: string | null;
  epicAppName: string | null;
  gogId: string | null;
  battlenetUid: string | null;
  eaOfferId: string | null;
  ubisoftId: string | null;
  riotId: string | null;
  xboxPackageFamilyName: string | null;
  xboxAppId: string | null;
  // Stats
  playtimeSec: number;
  launchCount: number;
  lastPlayedAt: string | null;
  sizeBytes: number | null;
  favorite: boolean;
  hidden: boolean;
  installedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DetectedGame {
  title: string;
  platform: PlatformId;
  executable: string | null;
  installDir: string | null;
  launchCommand: string | null;
  sizeBytes: number | null;
  steamAppId?: string | null;
  epicAppName?: string | null;
  gogId?: string | null;
  battlenetUid?: string | null;
  eaOfferId?: string | null;
  ubisoftId?: string | null;
  riotId?: string | null;
  xboxPackageFamilyName?: string | null;
  xboxAppId?: string | null;
}

export interface ScanSummary {
  detected: DetectedGame[];
  byPlatform: Record<string, number>;
  scannedPlatforms: string[];
  errors: { platform: string; message: string }[];
}

export interface MetadataResult {
  rawgId: number;
  title: string;
  developer?: string;
  publisher?: string;
  releaseDate?: string;
  rating?: number;
  ratingCount?: number;
  genres: string[];
  description?: string;
  coverImage?: string;
}

export interface Stats {
  totalGames: number;
  byPlatform: Record<string, number>;
  totalPlaytimeSec: number;
  totalLaunches: number;
  totalSizeBytes: number;
  favorites: number;
  avgRating: number | null;
  playedToday: number;
}

export interface LauncherSettings {
  rawgApiKey: string;
  autoScanOnStart: boolean;
  defaultSort: SortKey;
  scanPaths: string;
}

export type SortKey = "recent" | "name" | "playtime" | "rating";
export type ViewMode = "grid" | "list";

export const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently Played",
  name: "Name (A–Z)",
  playtime: "Most Played",
  rating: "Top Rated",
};

export interface PlatformInfo {
  id: PlatformId;
  label: string;
  monogram: string;
  accent: string;
  gradient: string;
  pathHint: string;
}

export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
  steam: { id: "steam", label: "Steam", monogram: "ST", accent: "#66c0f4", gradient: "from-sky-700 to-slate-900", pathHint: "C:\\Program Files (x86)\\Steam\\steamapps" },
  epic: { id: "epic", label: "Epic Games", monogram: "EP", accent: "#a9a9a9", gradient: "from-zinc-600 to-zinc-900", pathHint: "C:\\ProgramData\\Epic\\UnrealEngineLauncher" },
  gog: { id: "gog", label: "GOG Galaxy", monogram: "GO", accent: "#9b59b6", gradient: "from-purple-800 to-slate-900", pathHint: "HKLM\\SOFTWARE\\GOG.com\\Games" },
  xbox: { id: "xbox", label: "Xbox / Game Pass", monogram: "XB", accent: "#107c10", gradient: "from-emerald-700 to-green-900", pathHint: "Get-AppxPackage" },
  ubisoft: { id: "ubisoft", label: "Ubisoft Connect", monogram: "UB", accent: "#0070ff", gradient: "from-sky-700 to-slate-900", pathHint: "HKLM\\SOFTWARE\\Ubisoft\\Launcher" },
  battlenet: { id: "battlenet", label: "Battle.net", monogram: "BN", accent: "#00aeff", gradient: "from-cyan-700 to-slate-900", pathHint: "C:\\ProgramData\\Blizzard\\Battle.net\\Agent\\agent.db" },
  ea: { id: "ea", label: "EA App", monogram: "EA", accent: "#ff4747", gradient: "from-red-700 to-slate-900", pathHint: "HKLM\\SOFTWARE\\EA Games" },
  riot: { id: "riot", label: "Riot Client", monogram: "RI", accent: "#d32936", gradient: "from-rose-700 to-red-950", pathHint: "C:\\Riot Games" },
  manual: { id: "manual", label: "Manual", monogram: "ME", accent: "#34d399", gradient: "from-emerald-700 to-teal-950", pathHint: "—" },
  custom: { id: "custom", label: "Custom", monogram: "CU", accent: "#64748b", gradient: "from-slate-700 to-zinc-950", pathHint: "—" },
};

export const PLATFORM_LIST = Object.values(PLATFORMS);
