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
  bannerImage: string | null;       // wide hero image (RAWG background_image)
  screenshots: string[];            // RAWG screenshot gallery
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
  // v4.5.0 — install state. False when a game is in the library but not
  // installed (e.g. added from a store catalog or queued for download).
  // verifyInstalled() updates this; the renderer uses it to show Get vs Play.
  installed: boolean;
  createdAt: string;
  updatedAt: string;
  // v2.0 — 50 features
  completionStatus: "" | "playing" | "completed" | "backlog" | "abandoned" | "wishlist";
  userRating: number | null;      // 1-5 user stars
  notes: string | null;            // user notes
  lastSessionAt: string | null;   // last play session timestamp
  sessionMinutes: number;          // last session length in minutes
  sortOrder: number;              // manual drag reorder
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
  bannerImage?: string;       // wide hero image
  screenshots?: string[];      // gallery
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
  // Startup & close behavior (v3.11.0)
  launchOnStartup: boolean;
  closeBehavior: "exit" | "minimize" | "ask";
  // v4.0.0 — UI mode (console carousel vs desktop grid)
  uiMode: "console" | "desktop";
  // v4.3.0 — which platform ids are hidden in the sidebar (pipe-separated).
  // Empty string means "all visible".
  hiddenPlatforms: string;
  // v4.3.0 — whether the platform section in the sidebar starts collapsed.
  sidebarCollapsed: boolean;
  // v4.4.0 — the active theme id (which saved theme is applied). 0 = default.
  activeThemeId: number;
}

export type SortKey = "recent" | "name" | "playtime" | "rating";
export type ViewMode = "grid" | "list";

export const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently Played",
  name: "Name (A–Z)",
  playtime: "Most Played",
  rating: "Top Rated",
};

// v4.3.0 — Collections.
// A collection is either a user-curated group (kind="manual", membership in
// the collection_games junction) or an auto-generated Smart Collection
// (kind="auto:*", membership computed from the games table at read time).
export type CollectionKind =
  | "manual"
  | "auto:recent"
  | "auto:favorites"
  | "auto:never"
  | "auto:playing"
  | "auto:backlog"
  | "auto:top";

export interface Collection {
  id: number;
  name: string;
  icon: string;          // icon KEY (e.g. "folder", "gamepad", "trophy") resolved
                        // to a lucide SVG via IconGlyph. Never an emoji.
  color: string;         // hex accent override (or "" for "use global accent")
  kind: CollectionKind;
  description: string | null;
  pinned: boolean;
  sortOrder: number;
  gameCount: number;     // computed (count of membership)
  createdAt: string;
}

// v4.3.1 — icon KEYS (not emojis). Resolved to lucide-react SVGs in the
// renderer via IconGlyph. Add a key here AND to IconGlyph.GLYPHS to make a
// new icon available in the collection picker.
export const COLLECTION_ICONS = [
  "folder", "gamepad", "trophy", "star", "heart", "flame", "target", "dice",
  "palette", "rocket", "swords", "shield", "globe", "skull", "gem", "joystick",
  "puzzle", "film", "book", "zap", "bookmark", "clock", "sparkles", "crown",
] as const;

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

// v4.5.x — Game acquisition. The launcher manages EXISTING installed games;
// for games that aren't installed, clicking Get opens the intelligent
// store-link picker which redirects to the official store page (Steam/GOG/
// Epic/Xbox) where the user can buy or download the game. No download
// engine — the launcher never transfers files itself.

// A resolved acquisition option for a specific game — one way to get it.
export interface AcquisitionOption {
  sourceKind: string;         // "store-link" (the only kind now)
  sourceName: string;         // e.g. "Steam", "GOG", "Web"
  label: string;              // "Get on Steam" | "Search on GOG" | "Search the web"
  storeUrl?: string;          // opens in the default browser (https only)
  note?: string;              // explanation
}

