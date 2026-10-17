# NEXUS Plugin Developer Guide

Complete documentation for creating plugins for the NEXUS Game Launcher.

## Quick Start

A plugin is a directory containing two files:

```
my-plugin/
├── manifest.json    # metadata + permissions
└── index.js         # entry point (ES module)
```

### manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "What your plugin does.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read"],
  "icon": "🎨"
}
```

### index.js

```javascript
export default function plugin(api) {
  // Register a page
  api.ui.registerPage({
    id: "my-page",
    label: "My Page",
    icon: "🎨",
    mount: (container) => {
      container.innerHTML = "<h1>Hello from my plugin!</h1>";
    },
    unmount: (container) => {
      // Cleanup when the page is closed
    },
  });

  // Register a sidebar item that opens the page
  api.ui.registerSidebarItem({
    id: "my-page",
    label: "My Page",
    icon: "🎨",
    pageId: "my-page",
  });

  // Return a cleanup function called when the plugin is disabled
  return {
    cleanup() {
      console.log("My plugin cleanup");
    },
  };
}
```

## Installing Your Plugin

1. Open NEXUS → Settings → Plugins
2. Click "Install from Directory"
3. Select your plugin directory (the one containing manifest.json + index.js)
4. The plugin appears in the list — click the toggle to enable it
5. Restart NEXUS (or it loads automatically on next startup)
6. Your sidebar item appears in the desktop sidebar

## Permissions

Permissions are declared in the manifest. Each capability requires a specific permission. The HostAPI checks permissions before granting access.

| Permission | What it allows |
|---|---|
| `ui:pages` | Register custom pages (sidebar entries with mount/unmount) |
| `ui:sidebar` | Add sidebar navigation items |
| `ui:gamecard` | Add actions to game card context menus |
| `games:read` | Read game library metadata (list + get by ID) |
| `storage` | Per-plugin persistent storage (get/set key-value pairs) |
| `events` | Subscribe to + emit application events |
| `network` | (Future) Make HTTP requests through the host |
| `theme` | Modify CSS custom properties (visual appearance) |

## HostAPI Reference

The `api` object passed to your plugin's entry function has these namespaces:

### api.plugin
```javascript
api.plugin.id        // your plugin's ID
api.plugin.manifest   // the full manifest object
```

### api.ui.registerPage(options)
Register a custom page that appears in the sidebar.

```javascript
api.ui.registerPage({
  id: "music-player",        // unique page ID
  label: "Music",             // sidebar label
  icon: "🎵",                 // emoji or text
  sort: 50,                   // sidebar sort order (lower = higher)
  mount: (container) => {    // called when the page is shown
    // container is an HTMLElement — render any HTML/CSS/JS into it
    container.innerHTML = `
      <div style="padding: 24px">
        <h1>Music Player</h1>
        <p>Your music controls here.</p>
      </div>
    `;
    // Add event listeners
    const btn = container.querySelector("button");
    btn?.addEventListener("click", () => {
      api.log.info("Button clicked!");
    });
  },
  unmount: (container) => {  // called when the page is hidden
    // Clean up event listeners, intervals, etc.
  },
});
```

### api.ui.registerSidebarItem(options)
Add a sidebar navigation entry.

```javascript
api.ui.registerSidebarItem({
  id: "music-player",
  label: "Music",
  icon: "🎵",
  pageId: "music-player",   // links to a registered page
  sort: 50,
});
```

### api.ui.registerGameCardAction(options)
Add an action to the game card right-click context menu.

```javascript
api.ui.registerGameCardAction({
  id: "view-stats",
  label: "View Stats",
  handler: (gameId, gameTitle) => {
    api.log.info(`Stats requested for ${gameTitle} (ID: ${gameId})`);
    // Open a page, show a dialog, etc.
  },
});
```

### api.games.list()
Returns an array of all games in the library.

```javascript
const games = await api.games.list();
games.forEach(g => {
  console.log(g.title, g.platform, g.installed, g.playtimeSec);
});
```

### api.games.get(id)
Returns a single game by ID.

```javascript
const game = await api.games.get(42);
if (game) console.log(game.title, game.description);
```

### api.storage.get(key) / api.storage.set(key, value)
Per-plugin persistent storage. Data is isolated per plugin — other plugins can't access your storage.

```javascript
// Save
await api.storage.set("volume", 0.8);
await api.storage.set("playlist", ["song1.mp3", "song2.mp3"]);

// Load
const volume = await api.storage.get("volume");  // 0.8
const playlist = await api.storage.get("playlist");  // ["song1.mp3", "song2.mp3"]
```

### api.events.on(event, handler) / api.events.emit(event, data)
Subscribe to + emit application events.

```javascript
// Listen for game launches
const unsubscribe = api.events.on("game:launched", (data) => {
  console.log("Game launched:", data);
});

// Emit your own events (other plugins can listen)
api.events.emit("music:started", { track: "My Song" });

// Later, stop listening
unsubscribe();
```

### api.theme.setCSSVar(name, value) / api.theme.getCSSVar(name)
Modify the application's visual appearance via CSS custom properties.

```javascript
// Change the accent color
api.theme.setCSSVar("--accent", "#ff6b6b");

// Change the background
api.theme.setCSSVar("--bg", "#1a1a2e");

// Read a CSS variable
const accent = api.theme.getCSSVar("--accent");
```

### api.log.info(msg) / api.log.error(msg)
Log messages visible in DevTools (View → Toggle Developer Tools, or Ctrl+Shift+I).

```javascript
api.log.info("Plugin initialized");
api.log.error("Something went wrong!");
```

## Plugin Lifecycle

1. **Discovery** — NEXUS scans the plugins directory on startup
2. **Manifest validation** — checks apiVersion, permissions, entry file
3. **Enable** — user enables the plugin in Settings → Plugins
4. **Load** — the entry JS file is read + loaded via Blob import
5. **Initialize** — the default export function is called with the HostAPI
6. **Runtime** — the plugin registers extensions + responds to events
7. **Disable** — the cleanup function (if returned) is called + extensions removed
8. **Remove** — the plugin directory is deleted

## Game Object Structure

The `Game` object returned by `api.games.list()` and `api.games.get()` has these fields:

```javascript
{
  id: 42,                    // numeric ID
  title: "Elden Ring",       // game title
  platform: "steam",         // steam | epic | gog | xbox | ubisoft | battlenet | ea | riot | manual | custom
  source: "auto",            // auto (detected) | manual
  executable: "C:\\...",      // path to exe (null if not installed)
  installDir: "C:\\...",      // install directory
  launchCommand: "steam://run/1245620",  // launch URI
  coverImage: "https://...",  // cover art URL
  bannerImage: "https://...", // wide banner URL
  trailerUrl: "https://...", // trailer mp4 URL
  screenshots: ["https://..."], // screenshot gallery
  description: "...",         // game description
  developer: "FromSoftware",  // developer
  publisher: "Bandai Namco",  // publisher
  releaseDate: "2022-02-25",  // ISO date
  rating: 4.5,               // RAWG rating
  ratingCount: 12345,        // rating count
  genres: ["Action", "RPG"], // genre list
  tags: ["Open World"],       // tag list
  rawgId: 314908,             // RAWG game ID
  steamAppId: "1245620",     // Steam app ID
  playtimeSec: 36000,        // total playtime in seconds
  launchCount: 15,           // total launch count
  lastPlayedAt: "2024-01-15", // last played ISO date
  sizeBytes: 52428800000,    // install size in bytes
  favorite: true,            // is favorited
  hidden: false,             // is hidden
  installed: true,           // is installed on disk
  installedAt: "2022-03-01", // install date
  createdAt: "2022-03-01",   // library add date
  updatedAt: "2024-01-15",   // last update date
  completionStatus: "playing", // "" | "playing" | "completed" | "backlog" | "abandoned" | "wishlist"
  userRating: 5,             // 1-5 user stars
  notes: "My notes",          // user notes
  sortOrder: 0,              // manual sort order
}
```

## Example Plugins

See the `example-plugins/` directory in the repository:

- **hello-world/** — minimal plugin: registers a page + calls the games API
- **library-insights/** — dashboard with stats + game-card action + events + storage

## Debugging

1. Enable Developer Mode in Settings → Developer Settings
2. Open DevTools: View → Toggle Developer Tools (or Ctrl+Shift+I)
3. Look for `[plugin:your-plugin-id]` log lines in the Console
4. Errors during load are stored in the plugin's metadata (visible in Settings → Plugins)

## Creating Your Plugin

```bash
mkdir my-plugin
cd my-plugin

# Create manifest.json
cat > manifest.json << 'EOF'
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "You",
  "description": "Does something cool.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read"],
  "icon": "🚀"
}
EOF

# Create index.js
cat > index.js << 'EOF'
export default function plugin(api) {
  api.ui.registerPage({
    id: "my-page",
    label: "My Page",
    icon: "🚀",
    mount: (container) => {
      container.innerHTML = "<h1>Hello!</h1>";
    },
    unmount: () => {},
  });
  api.ui.registerSidebarItem({
    id: "my-page",
    label: "My Page",
    icon: "🚀",
    pageId: "my-page",
  });
  return { cleanup() {} };
}
EOF
```

Then install via Settings → Plugins → Install from Directory.

## Limitations

- Plugins run in the renderer process (contextIsolation context). No Node.js access.
- No hot reload — enable/disable requires an app restart.
- No plugin-to-plugin direct communication (use events instead).
- Plugin code is loaded via Blob import — no TypeScript transpilation (write plain JS or pre-compile).
- CSP allows `script-src 'self' 'unsafe-inline' file: blob:` — inline scripts work.

## API Versioning

The current API version is **1**. Set `"apiVersion": 1` in your manifest. If the host's API version doesn't match, the plugin will be rejected with an error message.

Future API versions will be backward-compatible where possible.
