// v4.9.0 — Plugin system types. A plugin is a directory containing a
// manifest.json + an entry JS file (ES module). Plugins run in the renderer
// (contextIsolation context) with controlled access to host capabilities via
// the HostAPI. They register UI extensions (pages, sidebar items, topbar
// actions, status indicators, command palette entries, settings panels,
// game-card actions) + use host services (games, storage, events, network,
// clipboard, system) through the API.

export type PluginPermission =
  | "ui:pages"           // register custom pages
  | "ui:sidebar"         // add sidebar navigation entries
  | "ui:gamecard"        // add actions to game cards
  | "ui:topbar"           // add buttons to the topbar
  | "ui:statusbar"        // add small status-bar widgets
  | "ui:commands"        // register command palette commands
  | "ui:settings"        // register a per-plugin settings panel
  | "ui:dialogs"         // open custom dialog/modal windows
  | "ui:toasts"          // show toast notifications
  | "games:read"         // read game library metadata
  | "storage"            // persistent per-plugin storage
  | "events"             // subscribe to + emit application events
  | "network"            // make HTTP(S) requests via the host
  | "clipboard"          // read/write the system clipboard
  | "system"             // open external URLs, reveal files in explorer
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
  /** v4.9.0 — Lucide icon name (e.g. "music", "rocket"), data-URI, or https URL.
   *  Emojis are deprecated for first-party plugins. */
  icon?: string;
  /** v4.9.0 — gallery category. One of: Productivity, Library, Customization, Media, Utilities. */
  category?: string;
  /** v4.9.0 — short tagline (≤60 chars) shown in the gallery. */
  tagline?: string;
  /** v4.9.0 — flag for featured plugins (shown at the top of the gallery). */
  featured?: boolean;
  /** v4.9.0 — accent gradient color (CSS hex) for the gallery card header. Optional. */
  accent?: string;
  /** v4.9.0 — long-form description shown when expanded. */
  longDescription?: string;
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

// ─── Extension registrations — what a plugin adds to the UI. ──────────────

export interface PageExtension {
  pluginId: string;
  id: string;                    // unique page id (e.g. "music-player")
  label: string;                 // sidebar label
  icon?: string;                 // Lucide icon name
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

export interface TopbarActionExtension {
  pluginId: string;
  id: string;
  label: string;                 // tooltip / aria-label
  icon?: string;                 // Lucide icon name
  onClick: () => void;
  sort?: number;
}

export interface StatusIndicatorExtension {
  pluginId: string;
  id: string;
  label: string;                 // tooltip on hover
  icon?: string;                 // Lucide icon name
  /** Render into a small host-provided container (~24x24px). Use innerHTML or
   *  DOM APIs to draw a small live indicator. */
  mount: (container: HTMLElement) => void;
  unmount?: (container: HTMLElement) => void;
  sort?: number;
}

export interface CommandExtension {
  pluginId: string;
  id: string;                    // unique command id
  label: string;                 // command-palette label
  icon?: string;                 // Lucide icon name
  keywords?: string[];           // additional searchable terms
  /** Sort-boost — lower = higher in the palette. */
  sort?: number;
  handler: () => void;
}

export interface SettingsPanelExtension {
  pluginId: string;
  id: string;
  label: string;                 // tab label (e.g. "Music Player")
  icon?: string;
  sort?: number;
  mount: (container: HTMLElement) => void;
  unmount?: (container: HTMLElement) => void;
}

// ─── Toast / Dialog request payloads (host renders, plugin requests). ─────

export interface ToastRequest {
  type: "info" | "success" | "error" | "warning";
  title: string;
  desc?: string;
  duration?: number;            // ms — host default applies if omitted
}

export interface DialogAction {
  label: string;
  primary?: boolean;
  danger?: boolean;
  /** Return a value to close the dialog with a result. */
  onClick?: () => void | Promise<void>;
}

export interface DialogRequest {
  title: string;
  /** HTML body OR a render callback that fills a container. */
  bodyHTML?: string;
  bodyRender?: (container: HTMLElement) => void;
  actions: DialogAction[];
  /** Width in pixels (480 default). */
  width?: number;
}

// ─── The HostAPI — passed to the plugin's entry function. ──────────────────

export interface HostAPI {
  plugin: {
    id: string;
    manifest: PluginManifest;
  };
  ui: {
    // Existing (v1)
    registerPage: (ext: Omit<PageExtension, "pluginId">) => void;
    registerSidebarItem: (ext: Omit<SidebarItemExtension, "pluginId">) => void;
    registerGameCardAction: (ext: Omit<GameCardActionExtension, "pluginId">) => void;

    // New in v4.9.0 — broaden UI surface
    registerTopbarAction: (ext: Omit<TopbarActionExtension, "pluginId">) => void;
    registerStatusIndicator: (ext: Omit<StatusIndicatorExtension, "pluginId">) => void;
    registerCommand: (ext: Omit<CommandExtension, "pluginId">) => void;
    registerSettingsPanel: (ext: Omit<SettingsPanelExtension, "pluginId">) => void;

    /** Show a toast notification (host-rendered). */
    toast: (req: ToastRequest) => void;
    /** Open a modal dialog with arbitrary HTML + actions (host-rendered). */
    openDialog: (req: DialogRequest) => void;
    /** Close the currently-open dialog opened by this plugin (best-effort). */
    closeDialog: () => void;

    /** Return an inline SVG string for a Lucide icon — for plugins that build
     *  HTML via innerHTML. Use like: `c.innerHTML = api.ui.icon("music", 24)`. */
    icon: (name: string, size?: number) => string;
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
  // New in v4.9.0 — host services
  network: {
    fetch: (url: string, opts?: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
    }) => Promise<{ ok: boolean; status: number; body: string }>;
  };
  clipboard: {
    readText: () => Promise<string>;
    writeText: (text: string) => Promise<void>;
  };
  system: {
    openExternal: (url: string) => Promise<void>;
    showItemInFolder: (path: string) => Promise<void>;
  };
}

// The plugin entry function signature.
export type PluginEntry = (api: HostAPI) => PluginCleanup | void | Promise<PluginCleanup | void>;
export interface PluginCleanup {
  cleanup?: () => void;
}
