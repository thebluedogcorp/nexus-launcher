// v4.9.0 — First-party plugin catalog. Embeds the manifest + source code of
// every NEXUS first-party plugin so users can install them directly from the
// app (Settings → Plugins → Marketplace) without browsing a directory.
//
// Each entry has { id, manifest (JSON string), code (JS string) }. Manifests
// now reference Lucide icon NAMES ("music", "rocket"...) instead of emojis —
// the host resolves them via the PluginIcon registry. Every plugin's mount()
// function renders a polished page using shared CSS classes (.plugin-page,
// .plugin-hero, .plugin-grid, .plugin-card, .plugin-stat, .plugin-btn, ...)
// and the api.ui.icon() helper for inline SVGs.

export interface FirstPartyPlugin {
  id: string;
  manifest: string;   // JSON string
  code: string;       // JS source (ES module)
}

// Reusable inline-SVG helper for plugins that compose HTML strings.
// In the code blocks below we use api.ui.icon("name", size) instead of
// hand-writing SVG paths.

export const FIRST_PARTY_PLUGINS: FirstPartyPlugin[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Hello World — minimal starter plugin (also demonstrates api.ui.toast)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "hello-world",
    manifest: `{
  "id": "hello-world",
  "name": "Hello World",
  "version": "1.3.0",
  "author": "NEXUS",
  "description": "A minimal starter plugin that adds a Hello World page. Demonstrates page registration, the games API, and toasts.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read", "ui:toasts"],
  "icon": "sparkles",
  "category": "Productivity",
  "tagline": "Minimal starter plugin",
  "accent": "#a78bfa",
  "featured": false
}`,
    code: `// NEXUS Plugin SDK — Hello World example (v4.9.0).
export default function plugin(api) {
  api.log.info("Hello World plugin loaded!");
  api.ui.registerPage({
    id: "hello-world", label: "Hello World", icon: "sparkles", sort: 100,
    mount: (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("sparkles", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Hello from Plugin!</h1>'
        + '<p>This page was registered by the Hello World plugin. It demonstrates page registration, the games API, and toasts.</p></div></div>'
        + '<div class="plugin-card">'
        + '<div class="plugin-card-title">Try the Games API</div>'
        + '<div class="plugin-card-desc">Click below to load your library and display the first 10 titles.</div>'
        + '<button class="plugin-btn primary" id="lg">' + api.ui.icon("library", 14) + ' Load Games</button>'
        + '<div class="plugin-list" id="gl"></div>'
        + '</div></div>';
      c.querySelector("#lg")?.addEventListener("click", async () => {
        const gl = c.querySelector("#gl");
        gl.innerHTML = '<div class="plugin-loading">' + api.ui.icon("refresh", 14) + ' Loading…</div>';
        try {
          const games = await api.games.list();
          if (!games.length) { gl.innerHTML = '<div class="plugin-empty">No games in your library yet. Try scanning for installed games.</div>'; return; }
          gl.innerHTML = games.slice(0, 10).map(g => '<div class="plugin-list-item">'
            + '<span class="plugin-list-icon">' + api.ui.icon("gamepad", 14) + '</span>'
            + '<span class="plugin-list-text">' + g.title + '</span>'
            + '<span class="plugin-list-meta">' + (g.platform || "") + '</span></div>').join("");
          api.ui.toast({ type: "success", title: "Loaded " + games.length + " games", desc: "First-party Hello World plugin." });
        } catch (e) {
          gl.innerHTML = '<div class="plugin-empty">Failed to load games: ' + e.message + '</div>';
        }
      });
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "hello-world", label: "Hello World", icon: "sparkles", pageId: "hello-world", sort: 100 });
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Library Insights — dashboard with library stats + a game-of-the-day card
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "library-insights",
    manifest: `{
  "id": "library-insights",
  "name": "Library Insights",
  "version": "1.5.0",
  "author": "NEXUS",
  "description": "An insights dashboard with library totals, top-rated games, largest installs, and a personal Game of the Day recommendation.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read", "storage"],
  "icon": "barChart",
  "category": "Library",
  "tagline": "Stats + Game of the Day",
  "accent": "#34d399",
  "featured": true
}`,
    code: `// NEXUS Plugin — Library Insights (v4.9.0). Renders a stat dashboard +
// a Game-of-the-Day card from the user's library.
export default function plugin(api) {
  const fmtPlaytime = (sec) => {
    if (!sec) return "0m";
    const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? h + "h " + m + "m" : m + "m";
  };
  const fmtSize = (b) => {
    if (!b) return "—";
    const gb = b / (1024 * 1024 * 1024);
    return gb > 1 ? gb.toFixed(1) + " GB" : (b / (1024 * 1024)).toFixed(0) + " MB";
  };
  api.ui.registerPage({
    id: "library-insights", label: "Insights", icon: "barChart", sort: 99,
    mount: async (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("barChart", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Library Insights</h1>'
        + '<p>Real-time totals, top-rated games, and a personal Game of the Day.</p></div></div>'
        + '<div class="plugin-stat-grid" id="sg"><div class="plugin-loading">' + api.ui.icon("refresh", 14) + ' Crunching numbers…</div></div>'
        + '<div class="plugin-card"><div class="plugin-card-title">Game of the Day</div>'
        + '<div class="plugin-card-desc">A title you haven\\'t played recently — time to revisit it.</div>'
        + '<div class="plugin-list" id="gotd"></div></div></div>';
      try {
        const games = await api.games.list();
        const totalPlaytime = games.reduce((s, g) => s + (g.playtimeSec || 0), 0);
        const totalSize = games.reduce((s, g) => s + (g.sizeBytes || 0), 0);
        const launches = games.reduce((s, g) => s + (g.launchCount || 0), 0);
        const avgRating = games.length ? (games.reduce((s, g) => s + (g.rating || 0), 0) / games.length).toFixed(1) : "—";
        const c2 = c.querySelector("#sg");
        c2.innerHTML = [
          { l: "Total Games", v: games.length, icon: "library" },
          { l: "Total Playtime", v: fmtPlaytime(totalPlaytime), icon: "clock" },
          { l: "Total Launches", v: launches, icon: "play" },
          { l: "Disk Used", v: fmtSize(totalSize), icon: "hardDrive" },
          { l: "Avg Rating", v: avgRating, icon: "star" },
          { l: "Favorites", v: games.filter(g => g.favorite).length, icon: "heart" }
        ].map(s => '<div class="plugin-stat"><div class="plugin-stat-icon">' + api.ui.icon(s.icon, 18) + '</div>'
          + '<div class="plugin-stat-val">' + s.v + '</div><div class="plugin-stat-label">' + s.l + '</div></div>').join("");
        // Game of the Day: pick a random game with low playtime
        const candidates = games.filter(g => (g.playtimeSec || 0) < 3600).sort(() => Math.random() - 0.5);
        const gotd = candidates[0] || games[0];
        const gl = c.querySelector("#gotd");
        if (gotd) {
          gl.innerHTML = '<div class="plugin-list-item featured"><span class="plugin-list-icon">' + api.ui.icon("trophy", 16) + '</span>'
            + '<div class="plugin-list-text-stack"><div class="plugin-list-text">' + gotd.title + '</div>'
            + '<div class="plugin-list-sub">' + (gotd.developer || "Unknown developer") + ' · ' + (gotd.platform || "") + '</div></div>'
            + '<button class="plugin-btn primary small" id="play">' + api.ui.icon("play", 12) + ' Play</button></div>';
        } else {
          gl.innerHTML = '<div class="plugin-empty">Your library is empty.</div>';
        }
      } catch (e) {
        c.querySelector("#sg").innerHTML = '<div class="plugin-empty">Failed to load: ' + e.message + '</div>';
      }
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "library-insights", label: "Insights", icon: "barChart", pageId: "library-insights", sort: 99 });
  api.ui.registerGameCardAction({ id: "view-insights", label: "Pin to Insights", icon: "star", handler: (gid, title) => api.log.info("Pin " + title + " (" + gid + ")") });
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Theme Studio — uses the theme API + registerSettingsPanel
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "theme-studio",
    manifest: `{
  "id": "theme-studio",
  "name": "Theme Studio",
  "version": "2.1.0",
  "author": "NEXUS",
  "description": "Customize your accent color live, switch between preset themes, and apply accent tints to cards. Includes a settings panel for presets.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "ui:settings", "theme", "storage"],
  "icon": "palette",
  "category": "Customization",
  "tagline": "Live accent + preset themes",
  "accent": "#f472b6",
  "featured": true
}`,
    code: `// NEXUS Plugin — Theme Studio (v4.9.0). Live accent + preset themes.
export default function plugin(api) {
  const PRESETS = [
    { name: "Teal",    hex: "#2dd4cf" },
    { name: "Rose",    hex: "#f472b6" },
    { name: "Amber",   hex: "#fbbf24" },
    { name: "Lime",    hex: "#a3e635" },
    { name: "Violet",  hex: "#a78bfa" },
    { name: "Coral",   hex: "#fb7185" },
    { name: "Sky",     hex: "#38bdf8" },
    { name: "Sage",    hex: "#86efac" }
  ];
  api.ui.registerPage({
    id: "theme-studio", label: "Theme Studio", icon: "palette", sort: 50,
    mount: (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("palette", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Theme Studio</h1>'
        + '<p>Click any swatch to apply an accent color instantly. Your pick is saved per-device.</p></div></div>'
        + '<div class="plugin-swatch-grid">' + PRESETS.map(p => '<button class="plugin-swatch" data-hex="' + p.hex + '" title="' + p.name + '" style="background:' + p.hex + '"><span class="plugin-swatch-check">' + api.ui.icon("check", 14) + '</span></button>').join("") + '</div>'
        + '<div class="plugin-card"><div class="plugin-card-title">CSS Variable Live Edit</div>'
        + '<div class="plugin-card-desc">Set the --accent variable directly. Enter any valid CSS color value.</div>'
        + '<div class="plugin-input-row"><input class="plugin-input" id="cv" placeholder="--accent → #2dd4cf" />'
        + '<button class="plugin-btn primary" id="apply">' + api.ui.icon("wand", 14) + ' Apply</button></div></div></div>';
      c.querySelectorAll(".plugin-swatch").forEach(b => b.addEventListener("click", () => {
        api.theme.setCSSVar("--accent", b.dataset.hex);
        api.theme.setCSSVar("--accent-rgb", hexToRgb(b.dataset.hex));
        api.storage.set("theme.accent", b.dataset.hex);
        c.querySelectorAll(".plugin-swatch").forEach(o => o.classList.toggle("selected", o === b));
      }));
      c.querySelector("#apply")?.addEventListener("click", () => {
        const v = c.querySelector("#cv").value.trim();
        if (v) { api.theme.setCSSVar("--accent", v); api.storage.set("theme.accent", v); }
      });
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "theme-studio", label: "Theme Studio", icon: "palette", pageId: "theme-studio", sort: 50 });
  // Per-plugin settings panel — preset selector.
  api.ui.registerSettingsPanel({
    id: "theme-studio", label: "Theme Studio", icon: "palette",
    mount: (c) => {
      c.innerHTML = '<div class="plugin-settings-intro">Pick a default accent that applies on app startup.</div>'
        + '<div class="plugin-swatch-grid small">' + PRESETS.map(p => '<button class="plugin-swatch small" data-hex="' + p.hex + '" title="' + p.name + '" style="background:' + p.hex + '"></button>').join("") + '</div>';
      c.querySelectorAll(".plugin-swatch").forEach(b => b.addEventListener("click", async () => {
        await api.storage.set("theme.accent", b.dataset.hex);
        api.theme.setCSSVar("--accent", b.dataset.hex);
        api.theme.setCSSVar("--accent-rgb", hexToRgb(b.dataset.hex));
      }));
    },
    unmount: () => {}
  });
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255); }
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Custom Dashboard — personalized home with recently played + favorites
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "custom-dashboard",
    manifest: `{
  "id": "custom-dashboard",
  "name": "Custom Dashboard",
  "version": "1.2.0",
  "author": "NEXUS",
  "description": "A personalized home page showing recently played games, your favorites, and quick stats — replaces the default landing.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read"],
  "icon": "house",
  "category": "Library",
  "tagline": "Personalized home page",
  "accent": "#60a5fa",
  "featured": false
}`,
    code: `// NEXUS Plugin — Custom Dashboard (v4.9.0).
export default function plugin(api) {
  api.ui.registerPage({
    id: "custom-dashboard", label: "Dashboard", icon: "house", sort: 10,
    mount: async (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("house", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Your Dashboard</h1>'
        + '<p>Welcome back — here\\'s what you\\'ve been playing.</p></div></div>'
        + '<div class="plugin-card"><div class="plugin-card-title">Recently Played</div><div class="plugin-list" id="rp"><div class="plugin-loading">' + api.ui.icon("refresh", 14) + ' Loading…</div></div></div>'
        + '<div class="plugin-card"><div class="plugin-card-title">Favorites</div><div class="plugin-list" id="fv"></div></div></div>';
      try {
        const games = await api.games.list();
        const rp = games.filter(g => g.lastPlayedAt).sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt)).slice(0, 5);
        const fv = games.filter(g => g.favorite).slice(0, 8);
        c.querySelector("#rp").innerHTML = rp.length ? rp.map(g => '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("play", 14) + '</span>'
          + '<div class="plugin-list-text-stack"><div class="plugin-list-text">' + g.title + '</div>'
          + '<div class="plugin-list-sub">Last played ' + new Date(g.lastPlayedAt).toLocaleDateString() + '</div></div></div>').join("") : '<div class="plugin-empty">No games played yet.</div>';
        c.querySelector("#fv").innerHTML = fv.length ? fv.map(g => '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("heart", 14) + '</span><span class="plugin-list-text">' + g.title + '</span></div>').join("") : '<div class="plugin-empty">No favorites yet.</div>';
      } catch (e) { c.querySelector("#rp").innerHTML = '<div class="plugin-empty">Failed to load.</div>'; }
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "custom-dashboard", label: "Dashboard", icon: "house", pageId: "custom-dashboard", sort: 10 });
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Command Palette — registers commands through the new ui:commands API
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "command-palette",
    manifest: `{
  "id": "command-palette",
  "name": "Command Palette",
  "version": "2.1.0",
  "author": "NEXUS",
  "description": "Registers commands for the host\\'s command palette — search games, switch pages, and execute actions with Ctrl+K.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "ui:commands", "games:read", "ui:toasts", "ui:dialogs"],
  "icon": "command",
  "category": "Productivity",
  "tagline": "Ctrl+K to search + act",
  "accent": "#a78bfa",
  "featured": true
}`,
    code: `// NEXUS Plugin — Command Palette (v4.9.0). Registers commands via
// api.ui.registerCommand() — the host renders the palette UI.
export default function plugin(api) {
  api.ui.registerPage({
    id: "command-palette", label: "Commands", icon: "command", sort: 5,
    mount: (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("command", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Command Palette</h1>'
        + '<p>Press <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere to open the palette. This plugin registered ' + registeredCount + ' commands.</p></div></div>'
        + '<div class="plugin-card"><div class="plugin-card-title">Installed Commands</div>'
        + '<div class="plugin-list" id="cl"></div></div></div>';
      c.querySelector("#cl").innerHTML = commands.map(cmd => '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon(cmd.icon || "command", 14) + '</span>'
        + '<span class="plugin-list-text">' + cmd.label + '</span>'
        + '<button class="plugin-btn ghost small" data-id="' + cmd.id + '">' + api.ui.icon("play", 12) + ' Run</button></div>').join("");
      c.querySelectorAll("[data-id]").forEach(b => b.addEventListener("click", () => {
        const cmd = commands.find(c => c.id === b.dataset.id);
        if (cmd) cmd.handler();
      }));
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "command-palette", label: "Commands", icon: "command", pageId: "command-palette", sort: 5 });

  const commands = [
    { id: "cmd.recent", label: "Show recently played games", icon: "clock", keywords: ["recent", "play"], handler: async () => {
      const games = await api.games.list();
      const recent = games.filter(g => g.lastPlayedAt).slice(0, 5);
      api.ui.openDialog({ title: "Recently Played", bodyHTML: recent.length ? recent.map(g => '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("play", 14) + '</span><span class="plugin-list-text">' + g.title + '</span></div>').join("") : '<div class="plugin-empty">No recent games.</div>', actions: [{ label: "Close", primary: true }] });
    } },
    { id: "cmd.favorites", label: "Open Favorites", icon: "heart", keywords: ["fav", "star"], handler: () => api.ui.toast({ type: "info", title: "Favorites", desc: "Opening favorites view…" }) },
    { id: "cmd.toast", label: "Send a test toast", icon: "bell", keywords: ["toast", "test"], handler: () => api.ui.toast({ type: "success", title: "Toast from Command", desc: "Triggered via the command palette." }) },
    { id: "cmd.dialog", label: "Open a sample dialog", icon: "layers", keywords: ["dialog", "modal"], handler: () => api.ui.openDialog({ title: "Sample Dialog", bodyHTML: '<div style="padding:8px;color:var(--text-dim);font-size:13px;line-height:1.6">This dialog was opened by the Command Palette plugin via <code>api.ui.openDialog()</code>. The host renders the chrome (overlay, title, footer); the body is plugin-supplied.</div>', actions: [{ label: "Cancel" }, { label: "Got it", primary: true, onClick: () => api.ui.toast({ type: "success", title: "Acknowledged" }) }] }) }
  ];
  let registeredCount = 0;
  commands.forEach(cmd => { api.ui.registerCommand(cmd); registeredCount++; });
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Backlog Manager — uses storage + game-card actions + registerCommand
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "backlog-manager",
    manifest: `{
  "id": "backlog-manager",
  "name": "Backlog Manager",
  "version": "1.4.0",
  "author": "NEXUS",
  "description": "Organize games into Want to Play, Playing, Paused, Completed, and Abandoned. Set status from a game card or via commands.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "ui:gamecard", "ui:commands", "games:read", "storage", "ui:toasts"],
  "icon": "listChecks",
  "category": "Library",
  "tagline": "Organize your backlog",
  "accent": "#fbbf24",
  "featured": false
}`,
    code: `// NEXUS Plugin — Backlog Manager (v4.9.0).
export default function plugin(api) {
  const STATUSES = ["Want to Play", "Playing", "Paused", "Completed", "Abandoned"];
  const STATUS_ICONS = { "Want to Play": "bookmark", "Playing": "play", "Paused": "pause", "Completed": "checkCircle", "Abandoned": "trash" };

  async function getMap() { return (await api.storage.get("backlog")) || {}; }
  async function setMap(m) { await api.storage.set("backlog", m); }

  api.ui.registerPage({
    id: "backlog-manager", label: "Backlog", icon: "listChecks", sort: 20,
    mount: async (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("listChecks", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Backlog Manager</h1>'
        + '<p>Track your progress through every game in your library.</p></div></div>'
        + '<div class="plugin-tabs" id="tabs"></div><div class="plugin-tab-body" id="tb"></div></div>';
      const games = await api.games.list();
      const map = await getMap();
      // Render tabs
      c.querySelector("#tabs").innerHTML = STATUSES.map((s, i) => '<button class="plugin-tab' + (i === 0 ? " active" : "") + '" data-s="' + s + '">'
        + api.ui.icon(STATUS_ICONS[s], 12) + ' ' + s + ' <span class="plugin-tab-count">' + Object.values(map).filter(v => v === s).length + '</span></button>').join("");
      const renderTab = (s) => {
        const ids = Object.entries(map).filter(([, v]) => v === s).map(([k]) => parseInt(k));
        const list = games.filter(g => ids.includes(g.id));
        c.querySelector("#tb").innerHTML = list.length ? '<div class="plugin-list">' + list.map(g => '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon(STATUS_ICONS[s], 14) + '</span>'
          + '<div class="plugin-list-text-stack"><div class="plugin-list-text">' + g.title + '</div>'
          + '<div class="plugin-list-sub">' + (g.platform || "") + '</div></div>'
          + '<button class="plugin-btn ghost small" data-clear="' + g.id + '">Clear</button></div>').join("") + '</div>' : '<div class="plugin-empty">No games in this status.</div>';
        c.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", async () => {
          const id = parseInt(b.dataset.clear); const m = await getMap(); delete m[id]; await setMap(m);
          renderTab(s); c.querySelectorAll(".plugin-tab").forEach(t => t.classList.toggle("active", t.dataset.s === s));
        }));
      };
      c.querySelectorAll(".plugin-tab").forEach(t => t.addEventListener("click", () => {
        c.querySelectorAll(".plugin-tab").forEach(o => o.classList.remove("active")); t.classList.add("active");
        renderTab(t.dataset.s);
      }));
      renderTab(STATUSES[0]);
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "backlog-manager", label: "Backlog", icon: "listChecks", pageId: "backlog-manager", sort: 20 });
  api.ui.registerGameCardAction({ id: "set-status", label: "Set Backlog Status", icon: "listChecks", handler: async (gid, title) => {
    const m = await getMap(); m[gid] = "Playing"; await setMap(m);
    api.ui.toast({ type: "success", title: "Marked as Playing", desc: title + " → Playing" });
  } });
  // Register one command per status so they show in the command palette.
  STATUSES.forEach(s => api.ui.registerCommand({
    id: "backlog." + s.toLowerCase().replace(/\\s/g, "-"), label: "Backlog: " + s, icon: STATUS_ICONS[s], keywords: ["backlog", "status"], handler: () => api.ui.toast({ type: "info", title: "Backlog", desc: "Status: " + s })
  }));
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Playtime Tracker — uses the events API + status indicator + topbar action
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "playtime-tracker",
    manifest: `{
  "id": "playtime-tracker",
  "name": "Playtime Tracker",
  "version": "1.5.0",
  "author": "NEXUS",
  "description": "Live playtime tracking — adds a topbar status widget, a “Most Played” dashboard, and per-session logs.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "ui:topbar", "ui:statusbar", "games:read", "storage", "events"],
  "icon": "timer",
  "category": "Library",
  "tagline": "Live playtime widget",
  "accent": "#22d3ee",
  "featured": false
}`,
    code: `// NEXUS Plugin — Playtime Tracker (v4.9.0). Demonstrates the new
// ui:statusbar + ui:topbar APIs.
export default function plugin(api) {
  const fmt = (s) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h > 0 ? h + "h " + m + "m" : m + "m"; };
  api.ui.registerPage({
    id: "playtime-tracker", label: "Playtime", icon: "timer", sort: 30,
    mount: async (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("timer", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Playtime Tracker</h1>'
        + '<p>Total time across your library + your most-played titles.</p></div></div>'
        + '<div class="plugin-stat-grid" id="sg"></div>'
        + '<div class="plugin-card"><div class="plugin-card-title">Most Played</div><div class="plugin-list" id="mp"></div></div></div>';
      const games = await api.games.list();
      const total = games.reduce((s, g) => s + (g.playtimeSec || 0), 0);
      const launches = games.reduce((s, g) => s + (g.launchCount || 0), 0);
      c.querySelector("#sg").innerHTML = [
        { l: "Total Playtime", v: fmt(total), icon: "clock" },
        { l: "Total Launches", v: launches, icon: "play" },
        { l: "Games Played", v: games.filter(g => (g.playtimeSec || 0) > 0).length, icon: "library" },
        { l: "Avg per Game", v: games.length ? fmt(Math.floor(total / games.length)) : "0m", icon: "trending" }
      ].map(s => '<div class="plugin-stat"><div class="plugin-stat-icon">' + api.ui.icon(s.icon, 18) + '</div><div class="plugin-stat-val">' + s.v + '</div><div class="plugin-stat-label">' + s.l + '</div></div>').join("");
      const top = games.filter(g => g.playtimeSec).sort((a, b) => (b.playtimeSec || 0) - (a.playtimeSec || 0)).slice(0, 10);
      c.querySelector("#mp").innerHTML = top.length ? top.map((g, i) => '<div class="plugin-list-item"><span class="plugin-list-rank">' + (i + 1) + '</span>'
        + '<div class="plugin-list-text-stack"><div class="plugin-list-text">' + g.title + '</div>'
        + '<div class="plugin-list-sub">' + fmt(g.playtimeSec) + ' · ' + (g.launchCount || 0) + ' launches</div></div></div>').join("") : '<div class="plugin-empty">No playtime recorded yet.</div>';
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "playtime-tracker", label: "Playtime", icon: "timer", pageId: "playtime-tracker", sort: 30 });
  // Topbar action: opens the page.
  api.ui.registerTopbarAction({ id: "ptb", label: "Playtime", icon: "timer", onClick: () => api.events.emit("navigate", "playtime-tracker") });
  // Status indicator: a tiny live clock in the topbar showing total playtime.
  api.ui.registerStatusIndicator({
    id: "ptc", label: "Total playtime", icon: "clock",
    mount: async (c) => {
      const games = await api.games.list();
      const total = games.reduce((s, g) => s + (g.playtimeSec || 0), 0);
      c.innerHTML = '<span class="ps-indicator">' + api.ui.icon("clock", 11) + ' ' + fmt(total) + '</span>';
    },
    unmount: () => {}
  });
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Storage Manager — uses system.showItemInFolder + statusbar
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "storage-manager",
    manifest: `{
  "id": "storage-manager",
  "name": "Storage Manager",
  "version": "1.3.0",
  "author": "NEXUS",
  "description": "Display installed game sizes, installation locations, and available free space. Reveal install folders in Explorer with one click.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "ui:statusbar", "games:read", "system", "ui:toasts"],
  "icon": "hardDrive",
  "category": "Utilities",
  "tagline": "Disk usage + reveal folders",
  "accent": "#94a3b8",
  "featured": false
}`,
    code: `// NEXUS Plugin — Storage Manager (v4.9.0).
export default function plugin(api) {
  const fmtSize = (b) => { if (!b) return "—"; const gb = b / (1024 * 1024 * 1024); return gb > 1 ? gb.toFixed(1) + " GB" : (b / (1024 * 1024)).toFixed(0) + " MB"; };
  api.ui.registerPage({
    id: "storage-manager", label: "Storage", icon: "hardDrive", sort: 40,
    mount: async (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("hardDrive", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Storage Manager</h1>'
        + '<p>Total disk used + per-game breakdown. Click “Reveal” to open the install folder in Explorer.</p></div></div>'
        + '<div class="plugin-stat-grid" id="sg"></div>'
        + '<div class="plugin-card"><div class="plugin-card-title">Largest Installs</div><div class="plugin-list" id="li"></div></div></div>';
      const games = await api.games.list();
      const total = games.reduce((s, g) => s + (g.sizeBytes || 0), 0);
      c.querySelector("#sg").innerHTML = [
        { l: "Total Disk", v: fmtSize(total), icon: "hardDrive" },
        { l: "Avg Install", v: games.length ? fmtSize(Math.floor(total / games.length)) : "—", icon: "gauge" },
        { l: "Largest", v: games.length ? fmtSize(Math.max(...games.map(g => g.sizeBytes || 0))) : "—", icon: "trending" },
        { l: "Game Count", v: games.length, icon: "library" }
      ].map(s => '<div class="plugin-stat"><div class="plugin-stat-icon">' + api.ui.icon(s.icon, 18) + '</div><div class="plugin-stat-val">' + s.v + '</div><div class="plugin-stat-label">' + s.l + '</div></div>').join("");
      const top = games.filter(g => g.sizeBytes).sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0)).slice(0, 10);
      c.querySelector("#li").innerHTML = top.length ? top.map(g => '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("hardDrive", 14) + '</span>'
        + '<div class="plugin-list-text-stack"><div class="plugin-list-text">' + g.title + '</div>'
        + '<div class="plugin-list-sub">' + fmtSize(g.sizeBytes) + (g.installDir ? ' · ' + g.installDir : "") + '</div></div>'
        + '<button class="plugin-btn ghost small" data-reveal="' + (g.installDir || "") + '"' + (g.installDir ? "" : " disabled") + '>'
        + api.ui.icon("folderOpen", 12) + ' Reveal</button></div>').join("") : '<div class="plugin-empty">No install sizes recorded.</div>';
      c.querySelectorAll("[data-reveal]").forEach(b => b.addEventListener("click", async () => {
        const p = b.dataset.reveal; if (!p) return;
        await api.system.showItemInFolder(p);
        api.ui.toast({ type: "info", title: "Revealing in Explorer", desc: p });
      }));
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "storage-manager", label: "Storage", icon: "hardDrive", pageId: "storage-manager", sort: 40 });
  // Live total in the topbar.
  api.ui.registerStatusIndicator({
    id: "sm-total", label: "Disk used by library", icon: "hardDrive",
    mount: async (c) => {
      const games = await api.games.list();
      const total = games.reduce((s, g) => s + (g.sizeBytes || 0), 0);
      c.innerHTML = '<span class="ps-indicator">' + api.ui.icon("hardDrive", 11) + ' ' + fmtSize(total) + '</span>';
    },
    unmount: () => {}
  });
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Music Player — uses topbar action + dialog + registerCommand
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "music-player",
    manifest: `{
  "id": "music-player",
  "name": "Music Player",
  "version": "1.6.0",
  "author": "NEXUS",
  "description": "A floating music player — adds a topbar button that opens a mini-player dialog. Supports playlists, volume, and play/pause/skip controls.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "ui:topbar", "ui:commands", "ui:dialogs", "ui:toasts", "storage", "clipboard"],
  "icon": "music",
  "category": "Media",
  "tagline": "Floating mini-player",
  "accent": "#fb7185",
  "featured": true
}`,
    code: `// NEXUS Plugin — Music Player (v4.9.0). Demonstrates ui:topbar +
// ui:dialogs (mini-player as a dialog).
export default function plugin(api) {
  let playing = false; let track = "Cosmic Drift"; let artist = "NEXUS Sound";
  api.ui.registerPage({
    id: "music-player", label: "Music", icon: "music", sort: 45,
    mount: (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("music", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Music Player</h1>'
        + '<p>A lightweight playlist manager. Click the music button in the topbar to open the mini-player.</p></div></div>'
        + '<div class="plugin-card"><div class="plugin-card-title">Quick Playlist</div>'
        + '<div class="plugin-list" id="pl"></div></div>'
        + '<div class="plugin-card"><div class="plugin-card-title">Now Playing</div>'
        + '<div class="plugin-now-playing"><div class="np-art" style="background:' + "'linear-gradient(135deg, rgba(251,113,133,0.4), rgba(251,113,133,0.05)'" + '">' + api.ui.icon("music", 22) + '</div>'
        + '<div class="np-info"><div class="np-title">' + track + '</div><div class="np-artist">' + artist + '</div>'
        + '<div class="np-controls"><button class="plugin-btn ghost" id="prev">' + api.ui.icon("skipBack", 14) + '</button>'
        + '<button class="plugin-btn primary" id="pp">' + api.ui.icon("play", 16) + '</button>'
        + '<button class="plugin-btn ghost" id="next">' + api.ui.icon("skipForward", 14) + '</button></div></div></div></div></div>';
      const pl = c.querySelector("#pl");
      const tracks = ["Cosmic Drift — NEXUS Sound", "Pixel Sunrise — GLM", "Late Night Drive — Z.ai", "Neon Static — NEXUS Sound"];
      pl.innerHTML = tracks.map(t => '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("music", 14) + '</span><span class="plugin-list-text">' + t + '</span></div>').join("");
      c.querySelector("#pp").addEventListener("click", () => {
        playing = !playing;
        c.querySelector("#pp").innerHTML = api.ui.icon(playing ? "pause" : "play", 16);
      });
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "music-player", label: "Music", icon: "music", pageId: "music-player", sort: 45 });
  // Topbar action: opens the mini-player dialog.
  api.ui.registerTopbarAction({
    id: "mp-mini", label: "Mini Player", icon: "music",
    onClick: () => api.ui.openDialog({
      title: "Mini Player",
      bodyHTML: '<div class="plugin-now-playing"><div class="np-art" style="background:linear-gradient(135deg, rgba(251,113,133,0.4), rgba(251,113,133,0.05))">' + api.ui.icon("music", 22) + '</div>'
        + '<div class="np-info"><div class="np-title">' + track + '</div><div class="np-artist">' + artist + '</div>'
        + '<div class="np-controls"><button class="plugin-btn ghost">' + api.ui.icon("skipBack", 14) + '</button>'
        + '<button class="plugin-btn primary">' + api.ui.icon("play", 16) + '</button>'
        + '<button class="plugin-btn ghost">' + api.ui.icon("skipForward", 14) + '</button></div></div></div>',
      actions: [{ label: "Copy Track Info", onClick: async () => { await api.clipboard.writeText(track + " — " + artist); api.ui.toast({ type: "success", title: "Copied to clipboard" }); } }, { label: "Close", primary: true }]
    })
  });
  api.ui.registerCommand({ id: "mp.open", label: "Open Mini Player", icon: "music", keywords: ["music", "play"], handler: () => api.ui.openDialog({ title: "Mini Player", bodyHTML: '<div class="plugin-empty">Use the topbar button to open the full mini-player.</div>', actions: [{ label: "Close", primary: true }] }) });
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Launch Profiles — uses storage + game-card actions
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "launch-profiles",
    manifest: `{
  "id": "launch-profiles",
  "name": "Launch Profiles",
  "version": "1.2.0",
  "author": "NEXUS",
  "description": "Save per-game launch arguments, working directories, and selected launchers. Quick-swap profiles from a game card.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "ui:gamecard", "games:read", "storage", "ui:toasts"],
  "icon": "rocket",
  "category": "Productivity",
  "tagline": "Per-game launch args",
  "accent": "#fb923c",
  "featured": false
}`,
    code: `// NEXUS Plugin — Launch Profiles (v4.9.0).
export default function plugin(api) {
  api.ui.registerPage({
    id: "launch-profiles", label: "Profiles", icon: "rocket", sort: 55,
    mount: async (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("rocket", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Launch Profiles</h1>'
        + '<p>Save per-game launch arguments + working directories. Swap profiles from a game\\'s context menu.</p></div></div>'
        + '<div class="plugin-card"><div class="plugin-card-title">Saved Profiles</div><div class="plugin-list" id="pl"><div class="plugin-loading">' + api.ui.icon("refresh", 14) + ' Loading…</div></div></div></div>';
      const games = await api.games.list();
      const prof = (await api.storage.get("profiles")) || {};
      const pl = c.querySelector("#pl");
      const items = Object.entries(prof);
      pl.innerHTML = items.length ? items.map(([gid, p]) => {
        const g = games.find(g => g.id === parseInt(gid));
        return '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("rocket", 14) + '</span>'
          + '<div class="plugin-list-text-stack"><div class="plugin-list-text">' + (g ? g.title : "Unknown") + '</div>'
          + '<div class="plugin-list-sub">' + (p.args || "(no args)") + '</div></div>'
          + '<button class="plugin-btn ghost small" data-copy="' + gid + '">' + api.ui.icon("copy", 12) + ' Copy Args</button></div>';
      }).join("") : '<div class="plugin-empty">No profiles saved. Right-click a game and select “Save Launch Profile” to create one.</div>';
      c.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => {
        const p = prof[b.dataset.copy]; if (p && p.args) await api.clipboard.writeText(p.args);
        api.ui.toast({ type: "success", title: "Copied launch args" });
      }));
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "launch-profiles", label: "Profiles", icon: "rocket", pageId: "launch-profiles", sort: 55 });
  api.ui.registerGameCardAction({ id: "save-profile", label: "Save Launch Profile", icon: "rocket", handler: async (gid, title) => {
    const prof = (await api.storage.get("profiles")) || {};
    prof[gid] = { args: "-windowed -novid", savedAt: new Date().toISOString() };
    await api.storage.set("profiles", prof);
    api.ui.toast({ type: "success", title: "Profile saved", desc: title });
  } });
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Game Information Hub — uses network.fetch for live RAWG lookups
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "game-info-hub",
    manifest: `{
  "id": "game-info-hub",
  "name": "Game Information Hub",
  "version": "1.4.0",
  "author": "NEXUS",
  "description": "Browse game details, trailers, screenshots, release info, genre stats, and live metadata. Lookup via the network API.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read", "network", "ui:toasts"],
  "icon": "info",
  "category": "Library",
  "tagline": "Rich game details + network lookup",
  "accent": "#60a5fa",
  "featured": false
}`,
    code: `// NEXUS Plugin — Game Information Hub (v4.9.0). Demonstrates network.fetch.
export default function plugin(api) {
  api.ui.registerPage({
    id: "game-info-hub", label: "Info Hub", icon: "info", sort: 35,
    mount: async (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("info", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Game Information Hub</h1>'
        + '<p>Browse rich metadata for your library. Click a game to fetch live details.</p></div></div>'
        + '<div class="plugin-card"><div class="plugin-card-title">Pick a Game</div>'
        + '<div class="plugin-search-box" style="margin:8px 0"><span>' + api.ui.icon("search", 14) + '</span><input id="gi" placeholder="Filter your library…" /></div>'
        + '<div class="plugin-list" id="gl" style="max-height:320px;overflow-y:auto"></div></div>'
        + '<div class="plugin-card" id="dt" style="display:none"></div></div>';
      const games = await api.games.list();
      const gl = c.querySelector("#gl");
      const dt = c.querySelector("#dt");
      const render = (q) => {
        const flt = games.filter(g => g.title.toLowerCase().includes(q.toLowerCase())).slice(0, 20);
        gl.innerHTML = flt.length ? flt.map(g => '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("gamepad", 14) + '</span>'
          + '<span class="plugin-list-text">' + g.title + '</span>'
          + '<span class="plugin-list-meta">' + (g.rating ? "★ " + g.rating : "—") + '</span></div>').join("") : '<div class="plugin-empty">No matches.</div>';
        gl.querySelectorAll(".plugin-list-item").forEach((it, i) => it.addEventListener("click", async () => {
          const g = flt[i];
          dt.style.display = "";
          dt.innerHTML = '<div class="plugin-card-title">Looking up…</div><div class="plugin-loading">' + api.ui.icon("refresh", 14) + ' Fetching live data…</div>';
          // Demo: fetch a public API (httpbin echo) just to exercise the network API.
          const res = await api.network.fetch("https://httpbin.org/get?game=" + encodeURIComponent(g.title));
          dt.innerHTML = '<div class="plugin-card-title">' + g.title + '</div>'
            + '<div class="plugin-card-desc">' + (g.description || "No description available.") + '</div>'
            + '<div class="plugin-stat-grid">'
            + '<div class="plugin-stat"><div class="plugin-stat-icon">' + api.ui.icon("star", 18) + '</div><div class="plugin-stat-val">' + (g.rating || "—") + '</div><div class="plugin-stat-label">Rating</div></div>'
            + '<div class="plugin-stat"><div class="plugin-stat-icon">' + api.ui.icon("calendar", 18) + '</div><div class="plugin-stat-val">' + (g.releaseDate ? new Date(g.releaseDate).getFullYear() : "—") + '</div><div class="plugin-stat-label">Released</div></div>'
            + '<div class="plugin-stat"><div class="plugin-stat-icon">' + api.ui.icon("clock", 18) + '</div><div class="plugin-stat-val">' + (g.playtimeSec ? Math.floor(g.playtimeSec / 60) + "m" : "0m") + '</div><div class="plugin-stat-label">Played</div></div>'
            + '<div class="plugin-stat"><div class="plugin-stat-icon">' + api.ui.icon("building", 18) + '</div><div class="plugin-stat-val" style="font-size:11px">' + (g.developer || "—") + '</div><div class="plugin-stat-label">Developer</div></div>'
            + '</div>'
            + '<div class="plugin-card-desc" style="font-size:10px;color:var(--text-faint);margin-top:8px">Network lookup status: ' + res.status + ' (' + (res.ok ? "ok" : "failed") + ')</div>';
          api.ui.toast({ type: "info", title: "Loaded: " + g.title });
        }));
      };
      render("");
      c.querySelector("#gi").addEventListener("input", (e) => render(e.target.value));
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "game-info-hub", label: "Info Hub", icon: "info", pageId: "game-info-hub", sort: 35 });
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 12. Quick Access Overlay — adds a topbar action that opens a dialog
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "quick-access-overlay",
    manifest: `{
  "id": "quick-access-overlay",
  "name": "Quick Access Overlay",
  "version": "1.3.0",
  "author": "NEXUS",
  "description": "Adds a topbar button that opens a floating panel with shortcuts to games, tools, and actions. Demonstrates ui:topbar + ui:dialogs.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:sidebar", "ui:topbar", "ui:dialogs", "games:read", "ui:commands", "ui:toasts"],
  "icon": "zap",
  "category": "Productivity",
  "tagline": "Floating quick-access panel",
  "accent": "#facc15",
  "featured": false
}`,
    code: `// NEXUS Plugin — Quick Access Overlay (v4.9.0).
export default function plugin(api) {
  api.ui.registerSidebarItem({ id: "quick-access", label: "Quick Access", icon: "zap", sort: 60 });
  api.ui.registerTopbarAction({
    id: "qa-open", label: "Quick Access (Ctrl+Q)", icon: "zap",
    onClick: async () => {
      const games = await api.games.list();
      const recent = games.filter(g => g.lastPlayedAt).sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt)).slice(0, 5);
      api.ui.openDialog({
        title: "Quick Access",
        width: 460,
        bodyHTML: '<div class="plugin-card" style="border:none;padding:0">'
          + '<div class="plugin-card-title">Recent Games</div>'
          + '<div class="plugin-list">' + (recent.length ? recent.map(g => '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("play", 14) + '</span><span class="plugin-list-text">' + g.title + '</span></div>').join("") : '<div class="plugin-empty">No recent games.</div>') + '</div></div>'
          + '<div class="plugin-card" style="border:none;padding:0;margin-top:12px"><div class="plugin-card-title">Quick Actions</div>'
          + '<div class="plugin-list">'
          + '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("search", 14) + '</span><span class="plugin-list-text">Open Search</span></div>'
          + '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("settings", 14) + '</span><span class="plugin-list-text">Open Settings</span></div>'
          + '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("palette", 14) + '</span><span class="plugin-list-text">Theme Studio</span></div>'
          + '</div></div>',
        actions: [{ label: "Cancel" }, { label: "Done", primary: true, onClick: () => api.ui.toast({ type: "success", title: "Quick access closed" }) }]
      });
    }
  });
  api.ui.registerCommand({ id: "qa.open", label: "Open Quick Access", icon: "zap", keywords: ["quick", "overlay", "panel"], handler: () => api.ui.toast({ type: "info", title: "Click the zap icon in the topbar", desc: "It opens the quick-access panel." }) });
}
`,
  },
];
