// v4.11.0 — First-party plugin catalog. Embedded manifest + source code for
// every NEXUS first-party plugin — install directly from the app (Settings →
// Plugins → Marketplace) without browsing a directory.
//
// REDUCTION FROM v4.10.0: removed 8 plugins that duplicated native features:
//   - theme-studio      → native ThemeStudio component (topbar Theme Studio btn)
//   - custom-dashboard   → native Library home view (carousel + grid)
//   - game-info-hub      → native GamePage + GameEditor
//   - library-insights   → native StatsDashboard (topbar Stats btn)
//   - playtime-tracker   → native playtime tracking + StatsDashboard top-played
//   - storage-manager    → native StatsDashboard largest-games + GamePage onOpenDir
//   - launch-profiles    → native GameEditor edits launchCommand/executable/installDir
//   - quick-access-overlay → native sidebar IS the quick-access (All/Fav/Recent/Top/Platforms)
//
// The 4 remaining plugins genuinely extend the app with new capabilities:
//   - hello-world      → starter example for plugin developers
//   - command-palette  → Ctrl+K command palette (the app has none natively)
//   - backlog-manager  → game-status tracking (the app has none natively)
//   - music-player     → floating mini-player (the app has no music player)
//
// Each plugin's mount() function composes the shared .plugin-* CSS design
// system + uses api.ui.icon("name", size) for inline Lucide SVGs.

export interface FirstPartyPlugin {
  id: string;
  manifest: string;   // JSON string
  code: string;       // JS source (ES module)
}

export const FIRST_PARTY_PLUGINS: FirstPartyPlugin[] = [

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Hello World — minimal starter plugin (also demonstrates api.ui.toast)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "hello-world",
    manifest: `{
  "id": "hello-world",
  "name": "Hello World",
  "version": "2.0.0",
  "author": "NEXUS",
  "description": "A minimal starter plugin that adds a Hello World page. Demonstrates page registration, the games API, toasts, and loading + empty states. Use it as a reference for any new plugin you build.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read", "ui:toasts"],
  "icon": "sparkles",
  "category": "Productivity",
  "tagline": "Minimal starter plugin",
  "accent": "#a78bfa",
  "featured": false
}`,
    code: `// NEXUS Plugin SDK — Hello World example (v4.11.0). Polished UI with
// loading state, empty state, and per-game platform tags.
export default function plugin(api) {
  api.log.info("Hello World plugin loaded!");
  api.ui.registerPage({
    id: "hello-world", label: "Hello World", icon: "sparkles", sort: 100,
    mount: (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("sparkles", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Hello from Plugin!</h1>'
        + '<p>The canonical starter plugin. Click <strong>Load Games</strong> to call the host games API and render the first 10 titles with platform tags.</p></div></div>'

        // Quick reference card — what this plugin demonstrates
        + '<div class="plugin-card">'
        + '<div class="plugin-card-title">What this plugin demonstrates</div>'
        + '<div class="plugin-card-desc">A 30-line reference for page registration, async data fetch, host toast notifications, loading + empty states, and clean unmount.</div>'
        + '<div class="plugin-list">'
        + '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("layers", 14) + '</span><div class="plugin-list-text-stack"><div class="plugin-list-text">registerPage</div><div class="plugin-list-sub">Adds a sidebar entry + page mount</div></div></div>'
        + '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("library", 14) + '</span><div class="plugin-list-text-stack"><div class="plugin-list-text">api.games.list()</div><div class="plugin-list-sub">Async fetch of the user library</div></div></div>'
        + '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("bell", 14) + '</span><div class="plugin-list-text-stack"><div class="plugin-list-text">api.ui.toast()</div><div class="plugin-list-sub">Host-rendered notification on success</div></div></div>'
        + '</div></div>'

        // Try the API card with button + result list
        + '<div class="plugin-card">'
        + '<div class="plugin-card-title">Try the Games API</div>'
        + '<div class="plugin-card-desc">Click below to load your library and display the first 10 titles.</div>'
        + '<div class="plugin-input-row" style="margin-top:8px">'
        + '<button class="plugin-btn primary" id="lg">' + api.ui.icon("library", 14) + ' Load Games</button>'
        + '<button class="plugin-btn ghost" id="clr" style="display:none">' + api.ui.icon("refresh", 14) + ' Clear</button>'
        + '</div>'
        + '<div class="plugin-list" id="gl" style="margin-top:12px"></div>'
        + '</div></div>';

      const gl = c.querySelector("#gl");
      const clr = c.querySelector("#clr");
      const lg = c.querySelector("#lg");

      const load = async () => {
        lg.disabled = true;
        gl.innerHTML = '<div class="plugin-loading">' + api.ui.icon("refresh", 14) + ' Loading your library…</div>';
        try {
          const games = await api.games.list();
          lg.disabled = false;
          if (!games.length) {
            gl.innerHTML = '<div class="plugin-empty">' + api.ui.icon("library", 20) + '<div>No games in your library yet.</div><div class="plugin-empty-sub">Try scanning for installed games from the topbar Scan button.</div></div>';
            return;
          }
          clr.style.display = "";
          gl.innerHTML = games.slice(0, 10).map((g, i) => '<div class="plugin-list-item">'
            + '<span class="plugin-list-rank">' + (i + 1) + '</span>'
            + '<span class="plugin-list-icon">' + api.ui.icon("gamepad", 14) + '</span>'
            + '<div class="plugin-list-text-stack"><div class="plugin-list-text">' + g.title + '</div>'
            + '<div class="plugin-list-sub">' + (g.developer || 'Unknown developer') + '</div></div>'
            + '<span class="plugin-list-meta">' + (g.platform || "") + '</span></div>').join("");
          api.ui.toast({ type: "success", title: "Loaded " + games.length + " game" + (games.length === 1 ? "" : "s"), desc: "From api.games.list()" });
        } catch (e) {
          lg.disabled = false;
          gl.innerHTML = '<div class="plugin-empty"><div>Failed to load games</div><div class="plugin-empty-sub">' + (e && e.message ? e.message : String(e)) + '</div></div>';
        }
      };
      lg.addEventListener("click", load);
      clr.addEventListener("click", () => { gl.innerHTML = ""; clr.style.display = "none"; });
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "hello-world", label: "Hello World", icon: "sparkles", pageId: "hello-world", sort: 100 });
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Command Palette — registers commands for Ctrl+K (the app has no native
  //    command palette). Demonstrates ui:commands + ui:dialogs end-to-end.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "command-palette",
    manifest: `{
  "id": "command-palette",
  "name": "Command Palette",
  "version": "2.2.0",
  "author": "NEXUS",
  "description": "Adds a command palette — press Ctrl+K anywhere to search games, switch pages, and execute actions. The app has no native command palette; this plugin registers commands via api.ui.registerCommand().",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "ui:commands", "games:read", "ui:toasts", "ui:dialogs"],
  "icon": "command",
  "category": "Productivity",
  "tagline": "Ctrl+K to search + act",
  "accent": "#a78bfa",
  "featured": true
}`,
    code: `// NEXUS Plugin — Command Palette (v4.11.0). Registers commands via
// api.ui.registerCommand(); the host renders the actual palette. The plugin's
// own page lists every installed command + lets you run any of them.
export default function plugin(api) {
  const commands = [
    { id: "cmd.recent", label: "Show recently played games", icon: "clock", keywords: ["recent", "play"], handler: async () => {
      const games = await api.games.list();
      const recent = games.filter(g => g.lastPlayedAt).sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt)).slice(0, 5);
      api.ui.openDialog({
        title: recent.length ? "Recently Played" : "No Recent Games",
        width: 420,
        bodyHTML: recent.length
          ? '<div class="plugin-list">' + recent.map(g => '<div class="plugin-list-item"><span class="plugin-list-icon">' + api.ui.icon("play", 14) + '</span><div class="plugin-list-text-stack"><div class="plugin-list-text">' + g.title + '</div><div class="plugin-list-sub">Last played ' + new Date(g.lastPlayedAt).toLocaleDateString() + '</div></div></div>').join("") + '</div>'
          : '<div class="plugin-empty"><div>No recently played games.</div><div class="plugin-empty-sub">Launch a game from the library to populate this list.</div></div>',
        actions: [{ label: "Close", primary: true }]
      });
    } },
    { id: "cmd.favorites", label: "Open Favorites view", icon: "heart", keywords: ["fav", "star"], handler: () => api.ui.toast({ type: "info", title: "Favorites", desc: "Click the heart in the sidebar." }) },
    { id: "cmd.toast", label: "Send a test toast", icon: "bell", keywords: ["toast", "test"], handler: () => api.ui.toast({ type: "success", title: "Toast from Command", desc: "Triggered via api.ui.toast()" }) },
    { id: "cmd.dialog", label: "Open a sample dialog", icon: "layers", keywords: ["dialog", "modal"], handler: () => api.ui.openDialog({
      title: "Sample Dialog",
      width: 460,
      bodyHTML: '<div style="padding:4px;color:var(--text-dim);font-size:13px;line-height:1.6">This dialog was opened by the Command Palette plugin via <code style="font-family:Consolas,monospace;color:var(--accent)">api.ui.openDialog()</code>. The host renders the chrome (overlay + title + action footer); the body is plugin-supplied HTML or a render callback.</div>',
      actions: [
        { label: "Cancel" },
        { label: "Got it", primary: true, onClick: () => api.ui.toast({ type: "success", title: "Acknowledged" }) }
      ]
    }) }
  ];

  let registeredCount = 0;
  commands.forEach(cmd => { api.ui.registerCommand(cmd); registeredCount++; });

  api.ui.registerPage({
    id: "command-palette", label: "Commands", icon: "command", sort: 5,
    mount: (c) => {
      // Render shell once
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("command", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Command Palette</h1>'
        + '<p>Press <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere to open the palette. This plugin registered ' + registeredCount + ' command' + (registeredCount === 1 ? "" : "s") + '.</p></div></div>'

        + '<div class="plugin-card">'
        + '<div class="plugin-card-title">Installed Commands</div>'
        + '<div class="plugin-card-desc">Filter by name or keyword. Click Run to execute any command.</div>'
        + '<div class="plugin-search-box" style="margin-top:8px">'
        + '<span>' + api.ui.icon("search", 14) + '</span>'
        + '<input id="cf" placeholder="Filter commands…" />'
        + '<button class="plugin-search-clear" id="cx" style="display:none" aria-label="Clear">' + api.ui.icon("close", 12) + '</button>'
        + '</div>'
        + '<div class="plugin-list" id="cl" style="margin-top:12px"></div>'
        + '</div></div>';

      const filterInput = c.querySelector("#cf");
      const clearBtn = c.querySelector("#cx");
      const list = c.querySelector("#cl");

      const render = (q) => {
        const ql = q.trim().toLowerCase();
        const filtered = ql
          ? commands.filter(cmd => (cmd.label + " " + (cmd.keywords || []).join(" ")).toLowerCase().includes(ql))
          : commands;
        clearBtn.style.display = ql ? "" : "none";
        if (!filtered.length) {
          list.innerHTML = '<div class="plugin-empty"><div>No commands match "' + q + '"</div><div class="plugin-empty-sub">Try a different keyword.</div></div>';
          return;
        }
        list.innerHTML = filtered.map(cmd => '<div class="plugin-list-item">'
          + '<span class="plugin-list-icon">' + api.ui.icon(cmd.icon || "command", 14) + '</span>'
          + '<div class="plugin-list-text-stack"><div class="plugin-list-text">' + cmd.label + '</div>'
          + '<div class="plugin-list-sub">' + (cmd.keywords || []).join(" · ") + '</div></div>'
          + '<button class="plugin-btn primary small" data-id="' + cmd.id + '">' + api.ui.icon("play", 12) + ' Run</button>'
          + '</div>').join("");
        list.querySelectorAll("[data-id]").forEach(b => b.addEventListener("click", () => {
          const cmd = commands.find(c => c.id === b.dataset.id);
          if (cmd) cmd.handler();
        }));
      };
      filterInput.addEventListener("input", (e) => render(e.target.value));
      clearBtn.addEventListener("click", () => { filterInput.value = ""; render(""); filterInput.focus(); });
      render("");
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "command-palette", label: "Commands", icon: "command", pageId: "command-palette", sort: 5 });
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Backlog Manager — game-status tracking (the app has none natively).
  //    Demonstrates ui:pages + ui:gamecard + ui:commands + storage.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "backlog-manager",
    manifest: `{
  "id": "backlog-manager",
  "name": "Backlog Manager",
  "version": "2.0.0",
  "author": "NEXUS",
  "description": "Track where you are in every game in your library. Statuses: Want to Play, Playing, Paused, Completed, Abandoned. Set a game's status from its context menu or via commands. The app has no native status tracking.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "ui:gamecard", "ui:commands", "games:read", "storage", "ui:toasts"],
  "icon": "listChecks",
  "category": "Library",
  "tagline": "Game-status tracking",
  "accent": "#fbbf24",
  "featured": true
}`,
    code: `// NEXUS Plugin — Backlog Manager (v4.11.0). Tabbed board with per-status
// game counts + clear per-status empty states.
export default function plugin(api) {
  const STATUSES = ["Want to Play", "Playing", "Paused", "Completed", "Abandoned"];
  const STATUS_ICONS = { "Want to Play": "star", "Playing": "play", "Paused": "pause", "Completed": "trophy", "Abandoned": "trash" };

  async function getMap() { return (await api.storage.get("backlog")) || {}; }
  async function setMap(m) { await api.storage.set("backlog", m); }

  api.ui.registerPage({
    id: "backlog-manager", label: "Backlog", icon: "listChecks", sort: 20,
    mount: async (c) => {
      // Shell with hero + tab strip + tab body
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("listChecks", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Backlog Manager</h1>'
        + '<p>Track where you are in every game. Set a status from a game card context menu or via the command palette.</p></div></div>'
        + '<div class="plugin-card">'
        + '<div class="plugin-tabs" id="tabs"></div>'
        + '<div class="plugin-tab-body" id="tb"><div class="plugin-loading">' + api.ui.icon("refresh", 14) + ' Loading your backlog…</div></div>'
        + '</div></div>';

      const [games, map] = await Promise.all([api.games.list(), getMap()]);
      const tabsEl = c.querySelector("#tabs");
      const bodyEl = c.querySelector("#tb");

      // Render the tab strip with per-status counts
      tabsEl.innerHTML = STATUSES.map((s, i) => {
        const count = Object.values(map).filter(v => v === s).length;
        return '<button class="plugin-tab' + (i === 0 ? " active" : "") + '" data-s="' + s + '">'
          + api.ui.icon(STATUS_ICONS[s], 12) + ' ' + s
          + ' <span class="plugin-tab-count">' + count + '</span></button>';
      }).join("");

      const renderTab = (s) => {
        const ids = Object.entries(map).filter(([, v]) => v === s).map(([k]) => parseInt(k));
        const list = games.filter(g => ids.includes(g.id));
        if (!list.length) {
          bodyEl.innerHTML = '<div class="plugin-empty">'
            + '<div style="margin-bottom:8px">' + api.ui.icon(STATUS_ICONS[s], 24) + '</div>'
            + '<div>No games marked as "' + s + '"</div>'
            + '<div class="plugin-empty-sub">Right-click a game in your library and select "Set Backlog Status" to add it here.</div>'
            + '</div>';
          return;
        }
        bodyEl.innerHTML = '<div class="plugin-list">' + list.map(g => '<div class="plugin-list-item">'
          + '<span class="plugin-list-icon">' + api.ui.icon(STATUS_ICONS[s], 14) + '</span>'
          + '<div class="plugin-list-text-stack"><div class="plugin-list-text">' + g.title + '</div>'
          + '<div class="plugin-list-sub">' + (g.platform || "") + (g.developer ? ' · ' + g.developer : "") + '</div></div>'
          + '<button class="plugin-btn ghost small" data-clear="' + g.id + '">' + api.ui.icon("close", 12) + ' Clear</button>'
          + '</div>').join("") + '</div>';
        bodyEl.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", async () => {
          const id = parseInt(b.dataset.clear);
          const m = await getMap();
          delete m[id];
          await setMap(m);
          renderTab(s);
          // Update tab counts
          const count = Object.values(m).filter(v => v === s).length;
          tabsEl.querySelectorAll(".plugin-tab").forEach(t => {
            if (t.dataset.s === s) t.querySelector(".plugin-tab-count").textContent = count;
          });
        }));
      };

      tabsEl.querySelectorAll(".plugin-tab").forEach(t => t.addEventListener("click", () => {
        tabsEl.querySelectorAll(".plugin-tab").forEach(o => o.classList.remove("active"));
        t.classList.add("active");
        renderTab(t.dataset.s);
      }));
      renderTab(STATUSES[0]);
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "backlog-manager", label: "Backlog", icon: "listChecks", pageId: "backlog-manager", sort: 20 });
  api.ui.registerGameCardAction({ id: "set-status", label: "Set Backlog Status", icon: "listChecks", handler: async (gid, title) => {
    const m = await getMap();
    m[gid] = "Playing";
    await setMap(m);
    api.ui.toast({ type: "success", title: "Marked as Playing", desc: title + " → Playing" });
  } });
  // Register one command per status for the command palette.
  STATUSES.forEach(s => api.ui.registerCommand({
    id: "backlog." + s.toLowerCase().replace(/\\s/g, "-"),
    label: "Backlog: " + s,
    icon: STATUS_ICONS[s],
    keywords: ["backlog", "status"],
    handler: () => api.ui.toast({ type: "info", title: "Backlog", desc: "Filter applied: " + s })
  }));
}
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Music Player — floating mini-player (the app has no native music).
  //    Demonstrates ui:pages + ui:topbar + ui:commands + ui:dialogs + clipboard.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "music-player",
    manifest: `{
  "id": "music-player",
  "name": "Music Player",
  "version": "2.0.0",
  "author": "NEXUS",
  "description": "A floating music player — adds a topbar button that opens a mini-player dialog. Supports playlists, play/pause/skip controls, and copy-track-info to clipboard. The app has no native music player.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "ui:topbar", "ui:commands", "ui:dialogs", "ui:toasts", "storage", "clipboard"],
  "icon": "music",
  "category": "Media",
  "tagline": "Floating mini-player",
  "accent": "#fb7185",
  "featured": true
}`,
    code: `// NEXUS Plugin — Music Player (v4.11.0). Polished now-playing card with
// rotating album art + progress bar + queue list.
export default function plugin(api) {
  const playlist = [
    { title: "Cosmic Drift", artist: "NEXUS Sound", len: "3:42" },
    { title: "Pixel Sunrise", artist: "GLM", len: "4:08" },
    { title: "Late Night Drive", artist: "Z.ai", len: "5:21" },
    { title: "Neon Static", artist: "NEXUS Sound", len: "3:14" }
  ];
  let current = 0;
  let playing = false;

  api.ui.registerPage({
    id: "music-player", label: "Music", icon: "music", sort: 45,
    mount: (c) => {
      c.innerHTML = '<div class="plugin-page">'
        + '<div class="plugin-hero"><div class="plugin-hero-icon">' + api.ui.icon("music", 28) + '</div>'
        + '<div class="plugin-hero-text"><h1>Music Player</h1>'
        + '<p>A lightweight playlist manager. Click the music button in the topbar to open the mini-player as a dialog.</p></div></div>'

        // Now Playing card with rotating album art + progress + controls
        + '<div class="plugin-card">'
        + '<div class="plugin-card-title">Now Playing</div>'
        + '<div class="plugin-now-playing">'
        + '<div class="np-art" id="npa">' + api.ui.icon("music", 22) + '</div>'
        + '<div class="np-info"><div class="np-title" id="npt">' + playlist[0].title + '</div>'
        + '<div class="np-artist" id="npa2">' + playlist[0].artist + '</div>'
        + '<div class="np-progress-row"><span class="np-time" id="npt1">0:00</span>'
        + '<div class="np-progress"><div class="np-progress-fill" id="nppf" style="width:38%"></div></div>'
        + '<span class="np-time" id="npt2">' + playlist[0].len + '</span></div>'
        + '<div class="np-controls">'
        + '<button class="plugin-btn ghost" id="prev">' + api.ui.icon("skipBack", 14) + '</button>'
        + '<button class="plugin-btn primary" id="pp">' + api.ui.icon("play", 16) + '</button>'
        + '<button class="plugin-btn ghost" id="next">' + api.ui.icon("skipForward", 14) + '</button>'
        + '</div></div></div></div>'

        // Queue list
        + '<div class="plugin-card">'
        + '<div class="plugin-card-title">Queue</div>'
        + '<div class="plugin-list" id="ql"></div>'
        + '</div></div>';

      const npa = c.querySelector("#npa");
      const npt = c.querySelector("#npt");
      const npa2 = c.querySelector("#npa2");
      const npt2 = c.querySelector("#npt2");
      const ql = c.querySelector("#ql");
      const pp = c.querySelector("#pp");

      const renderQueue = () => {
        ql.innerHTML = playlist.map((t, i) => '<div class="plugin-list-item' + (i === current ? " active" : "") + '">'
          + (i === current
            ? '<span class="plugin-list-icon" style="color:var(--accent)">' + api.ui.icon("play", 14) + '</span>'
            : '<span class="plugin-list-icon">' + api.ui.icon("music", 14) + '</span>')
          + '<div class="plugin-list-text-stack"><div class="plugin-list-text">' + t.title + '</div>'
          + '<div class="plugin-list-sub">' + t.artist + '</div></div>'
          + '<span class="plugin-list-meta">' + t.len + '</span>'
          + '</div>').join("");
        ql.querySelectorAll(".plugin-list-item").forEach((item, i) => item.addEventListener("click", () => {
          current = i;
          updateNowPlaying();
          renderQueue();
        }));
      };
      const updateNowPlaying = () => {
        const t = playlist[current];
        npt.textContent = t.title;
        npa2.textContent = t.artist;
        npt2.textContent = t.len;
      };
      pp.addEventListener("click", () => {
        playing = !playing;
        pp.innerHTML = api.ui.icon(playing ? "pause" : "play", 16);
        npa.style.animation = playing ? "spin 8s linear infinite" : "none";
      });
      c.querySelector("#prev").addEventListener("click", () => {
        current = (current - 1 + playlist.length) % playlist.length;
        updateNowPlaying();
        renderQueue();
      });
      c.querySelector("#next").addEventListener("click", () => {
        current = (current + 1) % playlist.length;
        updateNowPlaying();
        renderQueue();
      });
      renderQueue();
    },
    unmount: () => {}
  });
  api.ui.registerSidebarItem({ id: "music-player", label: "Music", icon: "music", pageId: "music-player", sort: 45 });

  // Topbar action: opens the mini-player dialog with Copy Track Info action.
  api.ui.registerTopbarAction({
    id: "mp-mini", label: "Mini Player", icon: "music",
    onClick: () => api.ui.openDialog({
      title: "Mini Player",
      width: 380,
      bodyHTML: '<div class="plugin-now-playing">'
        + '<div class="np-art">' + api.ui.icon("music", 22) + '</div>'
        + '<div class="np-info"><div class="np-title">' + playlist[current].title + '</div>'
        + '<div class="np-artist">' + playlist[current].artist + '</div>'
        + '<div class="np-progress-row"><span class="np-time">0:00</span>'
        + '<div class="np-progress"><div class="np-progress-fill" style="width:38%"></div></div>'
        + '<span class="np-time">' + playlist[current].len + '</span></div>'
        + '<div class="np-controls">'
        + '<button class="plugin-btn ghost">' + api.ui.icon("skipBack", 14) + '</button>'
        + '<button class="plugin-btn primary">' + api.ui.icon("play", 16) + '</button>'
        + '<button class="plugin-btn ghost">' + api.ui.icon("skipForward", 14) + '</button>'
        + '</div></div></div>',
      actions: [
        { label: "Copy Track Info", onClick: async () => {
          await api.clipboard.writeText(playlist[current].title + " — " + playlist[current].artist);
          api.ui.toast({ type: "success", title: "Copied to clipboard", desc: playlist[current].title });
        } },
        { label: "Close", primary: true }
      ]
    })
  });
  api.ui.registerCommand({ id: "mp.open", label: "Open Mini Player", icon: "music", keywords: ["music", "play"], handler: () => api.ui.openDialog({ title: "Mini Player", width: 380, bodyHTML: '<div class="plugin-empty"><div>Click the music button in the topbar to open the full mini-player.</div></div>', actions: [{ label: "Close", primary: true }] }) });
}
`,
  },

];
