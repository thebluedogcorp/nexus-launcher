// v4.7.0 — Plugin system types. A plugin is a directory containing a
// manifest.json + an entry JS file (ES module). Plugins run in the renderer
// (contextIsolation context) with controlled access to host capabilities via
// the HostAPI. They register UI extensions (pages, sidebar items, game-card
// actions) + use host services (games, storage, events) through the API.

export type PluginPermission =
  | "ui:pages"           // register custom pages
  | "ui:sidebar"         // add sidebar navigation entries
  | "ui:gamecard"        // add actions to game cards
  | "games:read"         // read game library metadata
  | "storage"            // persistent per-plugin storage
  | "events"             // subscribe to + emit application events
  | "network"            // make HTTP(S) requests via the host
  | "theme";             // modify visual appearance via CSS custom properties

export interface PluginManifest {
  id: string;                    // unique plugin identifier (kebab-case)
  name: string;                  // display name
  version: string;               // semver
  author: string;
  description: string;
  apiVersion: number;            // must match the host's supported API version
  entry: string;                 // entry JS file (relative to plugin dir, e.g. "index.js")
  permissions: PluginPermission[];
  minAppVersion?: string;        // semver — reject if the app is older
  icon?: string;                 // emoji or URL
}

export type PluginStatus =
  | "installed"       // present but not enabled
  | "enabled"         // active + loaded
  | "disabled"        // user-disabled
  | "error"           // failed to load/initialize
  | "incompatible";   // API version mismatch or missing deps

export interface InstalledPlugin {
  manifest: PluginManifest;
  status: PluginStatus;
  error?: string;                // last error message (if status = error)
  dirPath: string;               // absolute path to the plugin directory
  installedAt: string;
  enabledAt: string | null;
}

// Extension registrations — what a plugin adds to the UI.

export interface PageExtension {
  pluginId: string;
  id: string;                    // unique page id (e.g. "music-player")
  label: string;                 // sidebar label
  icon?: string;                 // emoji
  sort?: number;                 // sidebar sort order (lower = higher)
  mount: (container: HTMLElement) => void;
  unmount?: (container: HTMLElement) => void;
}

export interface SidebarItemExtension {
  pluginId: string;
  id: string;
  label: string;
  icon?: string;
  pageId?: string;               // if set, clicking opens this page
  sort?: number;
}

export interface GameCardActionExtension {
  pluginId: string;
  id: string;
  label: string;                 // context-menu label
  icon?: string;
  handler: (gameId: number, gameTitle: string) => void;
}

// The HostAPI — passed to the plugin's entry function.
export interface HostAPI {
  plugin: {
    id: string;
    manifest: PluginManifest;
  };
  ui: {
    registerPage: (ext: Omit<PageExtension, "pluginId">) => void;
    registerSidebarItem: (ext: Omit<SidebarItemExtension, "pluginId">) => void;
    registerGameCardAction: (ext: Omit<GameCardActionExtension, "pluginId">) => void;
  };
  games: {
    list: () => Promise<import("./types").Game[]>;
    get: (id: number) => Promise<import("./types").Game | null>;
  };
  storage: {
    get: <T = unknown>(key: string) => Promise<T | null>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  events: {
    on: (event: string, handler: (data: unknown) => void) => () => void;
    emit: (event: string, data?: unknown) => void;
  };
  log: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
  theme: {
    setCSSVar: (name: string, value: string) => void;
    getCSSVar: (name: string) => string;
  };
}

// The plugin entry function signature.
export type PluginEntry = (api: HostAPI) => PluginCleanup | void | Promise<PluginCleanup | void>;
export interface PluginCleanup {
  cleanup?: () => void;
}
