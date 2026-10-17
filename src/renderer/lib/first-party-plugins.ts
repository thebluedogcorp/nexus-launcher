// v4.8.1 — First-party plugin catalog. Embeds the manifest + source code
// of all NEXUS first-party plugins so users can install them directly from
// the app (Settings → Plugins → First-Party Plugins) without browsing a
// directory. Each entry has { id, manifest (JSON string), code (JS string) }.

export interface FirstPartyPlugin {
  id: string;
  manifest: string;   // JSON string
  code: string;       // JS source (ES module)
}

export const FIRST_PARTY_PLUGINS: FirstPartyPlugin[] = [
  { id: "hello-world", manifest: `{
  "id": "hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "A minimal plugin that adds a Hello World page to the sidebar.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read"],
  "icon": "👋"
}`, code: `// NEXUS Plugin SDK — Hello World example.
export default function plugin(api) {
  api.log.info("Hello World plugin loaded!");
  api.ui.registerPage({
    id: "hello-world", label: "Hello World", icon: "👋", sort: 100,
    mount: (container) => {
      container.innerHTML = '<div style="padding:48px;max-width:680px"><h1 style="font-size:32px;font-weight:800;color:var(--text);margin-bottom:16px">👋 Hello from Plugin!</h1><p style="font-size:14px;color:var(--text-dim);line-height:1.8;margin-bottom:24px">This page was registered by the Hello World plugin.</p><button id="lg" style="padding:10px 20px;border-radius:8px;background:var(--accent);color:var(--accent-fg);border:none;font-weight:600;cursor:pointer">Load Games</button><div id="gl" style="margin-top:16px"></div></div>';
      container.querySelector("#lg")?.addEventListener("click", async () => {
        const games = await api.games.list();
        container.querySelector("#gl").innerHTML = games.slice(0, 10).map(g => '<div style="padding:8px;border-radius:6px;background:var(--surface);margin-bottom:6px;font-size:13px;color:var(--text)">' + g.title + '</div>').join("");
      });
    },
    unmount: () => { api.log.info("Hello World unmounted."); },
  });
  api.ui.registerSidebarItem({ id: "hello-world", label: "Hello World", icon: "👋", pageId: "hello-world", sort: 100 });
  return { cleanup() { api.log.info("Hello World cleanup."); } };
}` },
  { id: "library-insights", manifest: `{
  "id": "library-insights",
  "name": "Library Insights",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "Adds an insights dashboard page with library stats + a game-card action.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "ui:gamecard", "games:read", "storage", "events"],
  "icon": "📊"
}`, code: `// NEXUS Plugin SDK — Library Insights example.
export default function plugin(api) {
  api.log.info("Library Insights loaded!");
  api.ui.registerPage({
    id: "library-insights", label: "Insights", icon: "📊", sort: 99,
    mount: async (container) => {
      const games = await api.games.list();
      const byPlat = {};
      games.forEach(g => { byPlat[g.platform] = (byPlat[g.platform] || 0) + 1; });
      const totalH = Math.round(games.reduce((s, g) => s + g.playtimeSec, 0) / 3600);
      const installed = games.filter(g => g.installed).length;
      const maxC = Math.max(...Object.values(byPlat), 1);
      container.innerHTML = '<div style="padding:48px;max-width:900px"><h1 style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:24px">📊 Library Insights</h1><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:32px"><div style="padding:20px;border-radius:12px;background:var(--surface);border:1px solid var(--border)"><div style="font-size:28px;font-weight:800;color:var(--accent)">' + games.length + '</div><div style="font-size:10px;text-transform:uppercase;color:var(--text-faint)">Total Games</div></div><div style="padding:20px;border-radius:12px;background:var(--surface);border:1px solid var(--border)"><div style="font-size:28px;font-weight:800;color:var(--accent)">' + installed + '</div><div style="font-size:10px;text-transform:uppercase;color:var(--text-faint)">Installed</div></div><div style="padding:20px;border-radius:12px;background:var(--surface);border:1px solid var(--border)"><div style="font-size:28px;font-weight:800;color:var(--accent)">' + totalH + 'h</div><div style="font-size:10px;text-transform:uppercase;color:var(--text-faint)">Playtime</div></div></div><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-faint);margin-bottom:12px">By Platform</div>' + Object.entries(byPlat).map(function(e) { return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px"><span style="width:100px;font-size:12px;color:var(--text-dim)">' + e[0] + '</span><div style="flex:1;height:20px;border-radius:4px;background:var(--surface)"><div style="width:' + Math.round(e[1]/maxC*100) + '%;height:100%;border-radius:4px;background:var(--accent)"></div></div><span style="font-size:12px;font-weight:700;color:var(--text);width:24px">' + e[1] + '</span></div>'; }).join("") + '</div></div>';
    },
    unmount: () => {},
  });
  api.ui.registerSidebarItem({ id: "library-insights", label: "Insights", icon: "📊", pageId: "library-insights", sort: 99 });
  api.ui.registerGameCardAction({ id: "view-insights", label: "View in Insights", handler: (gid, title) => { api.log.info("Action: " + title); } });
  api.events.on("game:launched", () => { api.log.info("A game was launched!"); });
  return { cleanup() { api.log.info("Library Insights cleanup."); } };
}` },
  { id: "theme-studio", manifest: `{
  "id": "theme-studio",
  "name": "Theme Studio",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "Customize colors, backgrounds, gradients, glass effects, and typography. Apply presets or fine-tune every CSS variable.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "theme", "storage"],
  "icon": "🎨"
}`, code: `// NEXUS Plugin — Theme Studio
export default function plugin(api) {
  api.log.info("Theme Studio loaded");
  const presets = {
    "Midnight": { "--bg": "#0a0a12", "--surface": "#161628", "--accent": "#6366f1", "--border": "rgba(255,255,255,0.08)" },
    "Sunset": { "--bg": "#1a0a0a", "--surface": "#2a1410", "--accent": "#fb923c", "--border": "rgba(255,255,255,0.06)" },
    "Forest": { "--bg": "#0a1a0a", "--surface": "#142814", "--accent": "#4ade80", "--border": "rgba(255,255,255,0.06)" },
    "AMOLED": { "--bg": "#000000", "--surface": "#0a0a0a", "--accent": "#00ff88", "--border": "rgba(255,255,255,0.12)" },
    "Crimson": { "--bg": "#1a0606", "--surface": "#280a0a", "--accent": "#ef4444", "--border": "rgba(255,255,255,0.06)" },
  };
  const vars = [
    { name: "--bg", label: "Background", type: "color" },
    { name: "--bg-2", label: "Elevated Surface", type: "color" },
    { name: "--surface", label: "Input Surface", type: "color" },
    { name: "--accent", label: "Accent Color", type: "color" },
    { name: "--text", label: "Text Color", type: "color" },
    { name: "--border", label: "Border Color", type: "color" },
    { name: "--r-lg", label: "Border Radius (lg)", type: "text" },
    { name: "--font-family", label: "Font Family", type: "text" },
    { name: "--bg-layer-value", label: "Background Image/Gradient", type: "text" },
  ];

  api.ui.registerPage({
    id: "theme-studio", label: "Theme Studio", icon: "🎨", sort: 50,
    mount: async (container) => {
      container.innerHTML = '<div style="padding:48px;max-width:900px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:var(--text-faint);margin-bottom:8px">Plugin</div><h1 style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:24px">🎨 Theme Studio</h1><div id="presets" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:32px"></div><div id="vars" style="display:grid;grid-template-columns:1fr 1fr;gap:16px"></div><div style="margin-top:24px"><button id="save" style="padding:10px 20px;border-radius:8px;background:var(--accent);color:var(--accent-fg);border:none;font-weight:600;cursor:pointer;font-size:13px">Save Theme</button> <button id="reset" style="padding:10px 20px;border-radius:8px;background:transparent;border:1px solid var(--border);color:var(--text-dim);font-weight:600;cursor:pointer;font-size:13px">Reset</button></div></div>';
      const presetsEl = container.querySelector("#presets");
      const varsEl = container.querySelector("#vars");
      Object.entries(presets).forEach(function(e) {
        const name = e[0]; const vals = e[1];
        const btn = document.createElement("button");
        btn.textContent = name;
        btn.style.cssText = "padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px;font-weight:600;cursor:pointer";
        btn.onclick = function() { Object.entries(vals).forEach(function(v) { api.theme.setCSSVar(v[0], v[1]); }); };
        presetsEl.appendChild(btn);
      });
      vars.forEach(function(v) {
        const div = document.createElement("div");
        div.style.cssText = "display:flex;flex-direction:column;gap:6px";
        const label = document.createElement("label");
        label.textContent = v.label;
        label.style.cssText = "font-size:11px;font-weight:600;color:var(--text-dim)";
        const input = document.createElement("input");
        input.value = api.theme.getCSSVar(v.name);
        input.style.cssText = "height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;font-family:monospace";
        input.oninput = function() { api.theme.setCSSVar(v.name, input.value); };
        div.appendChild(label); div.appendChild(input);
        varsEl.appendChild(div);
      });
      container.querySelector("#save").onclick = async function() {
        const saved = {};
        vars.forEach(function(v) { saved[v.name] = api.theme.getCSSVar(v.name); });
        await api.storage.set("theme", saved);
        api.log.info("Theme saved");
      };
      container.querySelector("#reset").onclick = function() {
        Object.keys(presets["AMOLED"]).forEach(function(k) { api.theme.setCSSVar(k, ""); });
      };
      // Load saved theme
      const saved = await api.storage.get("theme");
      if (saved && typeof saved === "object") {
        Object.entries(saved).forEach(function(e) { api.theme.setCSSVar(e[0], e[1]); });
        vars.forEach(function(v) { container.querySelector('input[value=""]'); });
      }
    },
    unmount: () => {},
  });
  api.ui.registerSidebarItem({ id: "theme-studio", label: "Theme Studio", icon: "🎨", pageId: "theme-studio", sort: 50 });
  return { cleanup() { api.log.info("Theme Studio cleanup"); } };
}` },
  { id: "custom-dashboard", manifest: `{
  "id": "custom-dashboard",
  "name": "Custom Dashboard",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "A personalized home page with recently played games, favorites, library stats, and quick actions.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read"],
  "icon": "🏠"
}`, code: `// NEXUS Plugin — Custom Dashboard
export default function plugin(api) {
  api.log.info("Custom Dashboard loaded");
  api.ui.registerPage({
    id: "custom-dashboard", label: "Dashboard", icon: "🏠", sort: 10,
    mount: async (container) => {
      const games = await api.games.list();
      const recent = games.filter(function(g) { return g.lastPlayedAt; }).sort(function(a, b) { return (b.lastPlayedAt || "").localeCompare(a.lastPlayedAt || ""); }).slice(0, 6);
      const favs = games.filter(function(g) { return g.favorite; }).slice(0, 6);
      const totalH = Math.round(games.reduce(function(s, g) { return s + g.playtimeSec; }, 0) / 3600);
      const installed = games.filter(function(g) { return g.installed; }).length;
      container.innerHTML = '<div style="padding:48px;max-width:1100px"><h1 style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:24px">🏠 Dashboard</h1><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:32px"><div style="padding:20px;border-radius:12px;background:var(--surface);border:1px solid var(--border)"><div style="font-size:28px;font-weight:800;color:var(--accent)">' + games.length + '</div><div style="font-size:10px;text-transform:uppercase;color:var(--text-faint)">Total Games</div></div><div style="padding:20px;border-radius:12px;background:var(--surface);border:1px solid var(--border)"><div style="font-size:28px;font-weight:800;color:var(--accent)">' + installed + '</div><div style="font-size:10px;text-transform:uppercase;color:var(--text-faint)">Installed</div></div><div style="padding:20px;border-radius:12px;background:var(--surface);border:1px solid var(--border)"><div style="font-size:28px;font-weight:800;color:var(--accent)">' + totalH + 'h</div><div style="font-size:10px;text-transform:uppercase;color:var(--text-faint)">Playtime</div></div></div><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-faint);margin-bottom:12px">Recently Played</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:32px">' + recent.map(function(g) { return '<div style="border-radius:8px;overflow:hidden;background:var(--surface);border:1px solid var(--border)"><div style="aspect-ratio:3/4;background:' + (g.coverImage ? 'url(' + g.coverImage + ') center/cover' : 'var(--surface-2)') + '"></div><div style="padding:8px"><div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + g.title + '</div></div></div>'; }).join("") + '</div><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-faint);margin-bottom:12px">Favorites</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px">' + favs.map(function(g) { return '<div style="border-radius:8px;overflow:hidden;background:var(--surface);border:1px solid var(--border)"><div style="aspect-ratio:3/4;background:' + (g.coverImage ? 'url(' + g.coverImage + ') center/cover' : 'var(--surface-2)') + '"></div><div style="padding:8px"><div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + g.title + '</div></div></div>'; }).join("") + '</div></div>';
    },
    unmount: () => {},
  });
  api.ui.registerSidebarItem({ id: "custom-dashboard", label: "Dashboard", icon: "🏠", pageId: "custom-dashboard", sort: 10 });
  return { cleanup() {} };
}` },
  { id: "command-palette", manifest: `{
  "id": "command-palette",
  "name": "Command Palette",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "Press Ctrl+K to search games, switch pages, and execute actions from one searchable interface.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "games:read", "events"],
  "icon": "⌘"
}`, code: `// NEXUS Plugin — Command Palette
export default function plugin(api) {
  api.log.info("Command Palette loaded");
  let games = [];
  let overlay = null;

  function show() {
    if (overlay) { overlay.remove(); overlay = null; return; }
    overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);display:flex;align-items:flex-start;justify-content:center;padding-top:120px";
    overlay.onclick = function(e) { if (e.target === overlay) hide(); };
    const box = document.createElement("div");
    box.style.cssText = "width:560px;max-width:90vw;background:var(--bg-2,#141416);border:1px solid rgba(255,255,255,0.16);border-radius:16px;box-shadow:0 24px 64px -12px rgba(0,0,0,0.8);overflow:hidden";
    const input = document.createElement("input");
    input.placeholder = "Search games…";
    input.style.cssText = "width:100%;height:48px;padding:0 20px;border:none;border-bottom:1px solid rgba(255,255,255,0.06);background:transparent;color:var(--text);font-size:15px;outline:none";
    const results = document.createElement("div");
    results.style.cssText = "max-height:320px;overflow-y:auto";
    function render(q) {
      const filtered = games.filter(function(g) { return g.title.toLowerCase().includes(q.toLowerCase()); }).slice(0, 8);
      results.innerHTML = filtered.length ? filtered.map(function(g) {
        return '<div class="cp-item" data-id="' + g.id + '" style="padding:12px 20px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:background 0.12s"><span style="font-size:18px">' + (g.favorite ? "⭐" : "🎮") + '</span><span style="font-size:13px;color:var(--text)">' + g.title + '</span><span style="font-size:10px;color:var(--text-faint);margin-left:auto">' + g.platform + '</span></div>';
      }).join("") : '<div style="padding:20px;text-align:center;color:var(--text-faint);font-size:13px">No results</div>';
      results.querySelectorAll(".cp-item").forEach(function(el) {
        el.onmouseenter = function() { el.style.background = "rgba(255,255,255,0.04)"; };
        el.onmouseleave = function() { el.style.background = "transparent"; };
        el.onclick = function() { const id = el.getAttribute("data-id"); api.events.emit("command:openGame", { id: parseInt(id) }); hide(); };
      });
    }
    input.oninput = function() { render(input.value); };
    input.onkeydown = function(e) { if (e.key === "Escape") hide(); };
    box.appendChild(input); box.appendChild(results);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
    render("");
  }
  function hide() { if (overlay) { overlay.remove(); overlay = null; } }

  // Register a hidden page (for sidebar-less operation) + sidebar item.
  api.ui.registerPage({ id: "command-palette", label: "Commands", icon: "⌘", mount: function(c) { c.innerHTML = '<div style="padding:48px;text-align:center"><p style="color:var(--text-dim);font-size:14px">Press Ctrl+K anywhere to open the command palette.</p></div>'; }, unmount: function() {} });
  api.ui.registerSidebarItem({ id: "command-palette", label: "Commands", icon: "⌘", pageId: "command-palette", sort: 5 });

  // Load games for search.
  api.games.list().then(function(g) { games = g; });
  api.events.on("library:updated", function() { api.games.list().then(function(g) { games = g; }); });

  // Ctrl+K shortcut.
  document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); show(); }
  });

  return { cleanup() { hide(); document.removeEventListener("keydown", arguments.callee); } };
}` },
  { id: "backlog-manager", manifest: `{
  "id": "backlog-manager",
  "name": "Backlog Manager",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "Organize games into Want to Play, Playing, Paused, Completed, and Abandoned. Add personal notes and priorities.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read", "storage"],
  "icon": "📋"
}`, code: `// NEXUS Plugin — Backlog Manager
export default function plugin(api) {
  api.log.info("Backlog Manager loaded");
  const statuses = ["Want to Play", "Playing", "Paused", "Completed", "Abandoned"];
  api.ui.registerPage({
    id: "backlog-manager", label: "Backlog", icon: "📋", sort: 20,
    mount: async (container) => {
      const games = await api.games.list();
      const saved = (await api.storage.get("backlog")) || {};
      const byStatus = {};
      statuses.forEach(function(s) { byStatus[s] = []; });
      games.forEach(function(g) { const st = saved[g.id] || (g.completionStatus || "Want to Play"); if (byStatus[st]) byStatus[st].push(g); });
      container.innerHTML = '<div style="padding:48px;max-width:1100px"><h1 style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:24px">📋 Backlog Manager</h1><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">' + statuses.map(function(s) {
        const list = byStatus[s] || [];
        return '<div style="padding:16px;border-radius:12px;background:var(--surface);border:1px solid var(--border)"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-bottom:12px">' + s + ' <span style="color:var(--text-faint)">(' + list.length + ')</span></div>' + list.map(function(g) { return '<div style="padding:8px 10px;border-radius:6px;background:rgba(255,255,255,0.03);margin-bottom:6px;font-size:12px;color:var(--text)">' + g.title + '</div>'; }).join("") + '</div>';
      }).join("") + '</div></div>';
    },
    unmount: () => {},
  });
  api.ui.registerSidebarItem({ id: "backlog-manager", label: "Backlog", icon: "📋", pageId: "backlog-manager", sort: 20 });
  api.ui.registerGameCardAction({ id: "set-status", label: "Set Backlog Status", handler: async (gid, title) => { const saved = (await api.storage.get("backlog")) || {}; saved[gid] = "Playing"; await api.storage.set("backlog", saved); api.log.info("Set " + title + " to Playing"); } });
  return { cleanup() {} };
}` },
  { id: "playtime-tracker", manifest: `{
  "id": "playtime-tracker",
  "name": "Playtime Tracker",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "Track sessions, total playtime, most-played games, and personal milestones with charts.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read", "storage", "events"],
  "icon": "⏱️"
}`, code: `// NEXUS Plugin — Playtime Tracker
export default function plugin(api) {
  api.log.info("Playtime Tracker loaded");
  let sessions = [];
  api.storage.get("sessions").then(function(s) { if (Array.isArray(s)) sessions = s; });
  api.events.on("game:launched", function(data) { sessions.push({ game: data.title || "Unknown", date: new Date().toISOString() }); api.storage.set("sessions", sessions); });

  api.ui.registerPage({
    id: "playtime-tracker", label: "Playtime", icon: "⏱️", sort: 30,
    mount: async (container) => {
      const games = await api.games.list();
      const top = games.filter(function(g) { return g.playtimeSec > 0; }).sort(function(a, b) { return b.playtimeSec - a.playtimeSec; }).slice(0, 10);
      const totalH = Math.round(games.reduce(function(s, g) { return s + g.playtimeSec; }, 0) / 3600);
      const maxP = Math.max.apply(null, top.map(function(g) { return g.playtimeSec; }).concat(1));
      container.innerHTML = '<div style="padding:48px;max-width:900px"><h1 style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:24px">⏱️ Playtime Tracker</h1><div style="display:flex;gap:16px;margin-bottom:32px"><div style="padding:20px;border-radius:12px;background:var(--surface);border:1px solid var(--border);flex:1"><div style="font-size:32px;font-weight:800;color:var(--accent)">' + totalH + 'h</div><div style="font-size:10px;text-transform:uppercase;color:var(--text-faint)">Total Playtime</div></div><div style="padding:20px;border-radius:12px;background:var(--surface);border:1px solid var(--border);flex:1"><div style="font-size:32px;font-weight:800;color:var(--accent)">' + sessions.length + '</div><div style="font-size:10px;text-transform:uppercase;color:var(--text-faint)">Sessions Tracked</div></div></div><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-faint);margin-bottom:12px">Top 10 Most Played</div>' + top.map(function(g) { return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><span style="width:200px;font-size:12px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + g.title + '</span><div style="flex:1;height:20px;border-radius:4px;background:var(--surface)"><div style="width:' + Math.round(g.playtimeSec / maxP * 100) + '%;height:100%;border-radius:4px;background:var(--accent)"></div></div><span style="font-size:12px;font-weight:700;color:var(--text);width:48px">' + Math.round(g.playtimeSec / 3600) + 'h</span></div>'; }).join("") + '</div></div>';
    },
    unmount: () => {},
  });
  api.ui.registerSidebarItem({ id: "playtime-tracker", label: "Playtime", icon: "⏱️", pageId: "playtime-tracker", sort: 30 });
  return { cleanup() {} };
}` },
  { id: "storage-manager", manifest: `{
  "id": "storage-manager",
  "name": "Storage Manager",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "Display installed game sizes, installation locations, and available disk space with folder shortcuts.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read"],
  "icon": "💾"
}`, code: `// NEXUS Plugin — Storage Manager
export default function plugin(api) {
  api.log.info("Storage Manager loaded");
  function fmt(bytes) { if (!bytes) return "—"; if (bytes < 1e9) return Math.round(bytes/1e6) + " MB"; if (bytes < 1e12) return (bytes/1e9).toFixed(1) + " GB"; return (bytes/1e12).toFixed(1) + " TB"; }
  api.ui.registerPage({
    id: "storage-manager", label: "Storage", icon: "💾", sort: 40,
    mount: async (container) => {
      const games = await api.games.list();
      const installed = games.filter(function(g) { return g.installed && g.sizeBytes; }).sort(function(a, b) { return (b.sizeBytes || 0) - (a.sizeBytes || 0); });
      const total = installed.reduce(function(s, g) { return s + (g.sizeBytes || 0); }, 0);
      const maxS = Math.max.apply(null, installed.map(function(g) { return g.sizeBytes || 0; }).concat(1));
      container.innerHTML = '<div style="padding:48px;max-width:900px"><h1 style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:16px">💾 Storage Manager</h1><div style="padding:20px;border-radius:12px;background:var(--surface);border:1px solid var(--border);margin-bottom:24px"><div style="font-size:32px;font-weight:800;color:var(--accent)">' + fmt(total) + '</div><div style="font-size:10px;text-transform:uppercase;color:var(--text-faint)">Total Disk Usage (' + installed.length + ' installed games)</div></div>' + installed.map(function(g) { return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><span style="width:240px;font-size:12px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + g.title + '</span><div style="flex:1;height:16px;border-radius:4px;background:var(--surface)"><div style="width:' + Math.round((g.sizeBytes||1)/maxS*100) + '%;height:100%;border-radius:4px;background:var(--accent)"></div></div><span style="font-size:12px;font-weight:700;color:var(--text);width:64px">' + fmt(g.sizeBytes) + '</span></div>'; }).join("") + '</div>';
    },
    unmount: () => {},
  });
  api.ui.registerSidebarItem({ id: "storage-manager", label: "Storage", icon: "💾", pageId: "storage-manager", sort: 40 });
  return { cleanup() {} };
}` },
  { id: "music-player", manifest: `{
  "id": "music-player",
  "name": "Music Player",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "Play local audio files, manage playlists, and display album artwork with a compact player.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "storage"],
  "icon": "🎵"
}`, code: `// NEXUS Plugin — Music Player
export default function plugin(api) {
  api.log.info("Music Player loaded");
  let audio = null, playlist = [], currentIdx = 0;
  api.ui.registerPage({
    id: "music-player", label: "Music", icon: "🎵", sort: 45,
    mount: async (container) => {
      playlist = (await api.storage.get("playlist")) || [];
      container.innerHTML = '<div style="padding:48px;max-width:800px"><h1 style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:24px">🎵 Music Player</h1><div style="padding:24px;border-radius:16px;background:var(--surface);border:1px solid var(--border);text-align:center;margin-bottom:24px"><div id="now-playing" style="font-size:14px;color:var(--text-dim);margin-bottom:16px">No track loaded</div><div style="display:flex;justify-content:center;gap:12px"><button id="prev" style="font-size:20px;background:none;border:none;color:var(--text-dim);cursor:pointer;padding:8px">⏮</button><button id="play-btn" style="width:56px;height:56px;border-radius:50%;background:var(--accent);border:none;color:var(--accent-fg);font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center">▶</button><button id="next" style="font-size:20px;background:none;border:none;color:var(--text-dim);cursor:pointer;padding:8px">⏭</button></div></div><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-faint);margin-bottom:8px">Playlist</div><div id="playlist-el"></div><div style="margin-top:16px"><input id="add-url" style="width:60%;height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px" placeholder="Paste audio file URL…"> <button id="add-btn" style="padding:8px 16px;border-radius:8px;background:var(--accent);color:var(--accent-fg);border:none;font-weight:600;cursor:pointer;font-size:12px">Add</button></div></div>';
      const np = container.querySelector("#now-playing");
      const plEl = container.querySelector("#playlist-el");
      function renderPL() { plEl.innerHTML = playlist.length ? playlist.map(function(t, i) { return '<div class="pl-item" data-idx="' + i + '" style="padding:8px 12px;border-radius:6px;background:rgba(255,255,255,0.02);margin-bottom:4px;cursor:pointer;font-size:12px;color:var(--text)">' + (i === currentIdx ? "▶ " : "") + t.name + '</div>'; }).join("") : '<div style="color:var(--text-faint);font-size:12px;padding:8px">Empty playlist. Add a URL above.</div>'; }
      function play(i) { if (i < 0 || i >= playlist.length) return; currentIdx = i; if (!audio) { audio = new Audio(); audio.onended = function() { play(currentIdx + 1); }; } audio.src = playlist[i].url; audio.play(); np.textContent = "▶ " + playlist[i].name; renderPL(); }
      container.querySelector("#play-btn").onclick = function() { if (audio && !audio.paused) { audio.pause(); } else if (audio) { audio.play(); } else if (playlist.length) { play(0); } };
      container.querySelector("#prev").onclick = function() { play(currentIdx - 1); };
      container.querySelector("#next").onclick = function() { play(currentIdx + 1); };
      container.querySelector("#add-btn").onclick = async function() { const url = container.querySelector("#add-url").value.trim(); if (!url) return; playlist.push({ name: url.split("/").pop() || "Track", url: url }); container.querySelector("#add-url").value = ""; await api.storage.set("playlist", playlist); renderPL(); };
      renderPL();
    },
    unmount: (c) => { if (audio) { audio.pause(); audio = null; } },
  });
  api.ui.registerSidebarItem({ id: "music-player", label: "Music", icon: "🎵", pageId: "music-player", sort: 45 });
  return { cleanup() { if (audio) { audio.pause(); audio = null; } } };
}` },
  { id: "launch-profiles", manifest: `{
  "id": "launch-profiles",
  "name": "Launch Profiles",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "Save per-game launch arguments, working directories, and selectable profiles like Default, Performance, and Debug.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read", "storage"],
  "icon": "🚀"
}`, code: `// NEXUS Plugin — Launch Profiles
export default function plugin(api) {
  api.log.info("Launch Profiles loaded");
  api.ui.registerPage({
    id: "launch-profiles", label: "Profiles", icon: "🚀", sort: 55,
    mount: async (container) => {
      const games = await api.games.list();
      const profiles = (await api.storage.get("profiles")) || {};
      container.innerHTML = '<div style="padding:48px;max-width:900px"><h1 style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:24px">🚀 Launch Profiles</h1>' + games.slice(0, 20).map(function(g) {
        const p = profiles[g.id] || {};
        return '<div style="padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border);margin-bottom:8px"><div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:8px">' + g.title + '</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><input class="lp-args" data-id="' + g.id + '" value="' + (p.args || "") + '" placeholder="Launch args" style="height:32px;padding:0 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:11px;font-family:monospace"><select class="lp-mode" data-id="' + g.id + '" style="height:32px;padding:0 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:11px"><option>Default</option><option ' + (p.mode === "Performance" ? "selected" : "") + '>Performance</option><option ' + (p.mode === "Debug" ? "selected" : "") + '>Debug</option></select><button class="lp-save" data-id="' + g.id + '" style="height:32px;border-radius:6px;background:var(--accent);color:var(--accent-fg);border:none;font-weight:600;cursor:pointer;font-size:11px">Save</button></div></div>';
      }).join("") + '</div>';
      container.querySelectorAll(".lp-save").forEach(function(btn) {
        btn.onclick = async function() { const id = btn.getAttribute("data-id"); const args = container.querySelector('.lp-args[data-id="' + id + '"]').value; const mode = container.querySelector('.lp-mode[data-id="' + id + '"]').value; profiles[id] = { args: args, mode: mode }; await api.storage.set("profiles", profiles); api.log.info("Saved profile for game " + id); btn.textContent = "Saved!"; setTimeout(function() { btn.textContent = "Save"; }, 1500); };
      });
    },
    unmount: () => {},
  });
  api.ui.registerSidebarItem({ id: "launch-profiles", label: "Profiles", icon: "🚀", pageId: "launch-profiles", sort: 55 });
  return { cleanup() {} };
}` },
  { id: "game-info-hub", manifest: `{
  "id": "game-info-hub",
  "name": "Game Information Hub",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "Browse game details, trailers, screenshots, release info, genres, and developer info in a dedicated page.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:pages", "ui:sidebar", "games:read"],
  "icon": "ℹ️"
}`, code: `// NEXUS Plugin — Game Information Hub
export default function plugin(api) {
  api.log.info("Game Info Hub loaded");
  api.ui.registerPage({
    id: "game-info-hub", label: "Info Hub", icon: "ℹ️", sort: 35,
    mount: async (container) => {
      const games = await api.games.list();
      container.innerHTML = '<div style="padding:48px;max-width:1100px"><h1 style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:24px">ℹ️ Game Information Hub</h1><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">' + games.slice(0, 24).map(function(g) {
        return '<div style="border-radius:12px;overflow:hidden;background:var(--surface);border:1px solid var(--border)"><div style="aspect-ratio:16/9;background:' + (g.bannerImage ? 'url(' + g.bannerImage + ') center/cover' : 'var(--surface-2)') + '"></div><div style="padding:16px"><div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px">' + g.title + '</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' + (g.genres || []).slice(0, 4).map(function(gen) { return '<span style="font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:4px;background:rgba(var(--accent-rgb),0.12);color:var(--accent)">' + gen + '</span>'; }).join("") + '</div><div style="font-size:11px;color:var(--text-dim);line-height:1.5">' + (g.developer ? "Dev: " + g.developer + " · " : "") + (g.releaseDate ? "Released: " + g.releaseDate.slice(0, 4) : "") + (g.rating ? " · ⭐ " + g.rating.toFixed(1) : "") + '</div></div></div>';
      }).join("") + '</div></div>';
    },
    unmount: () => {},
  });
  api.ui.registerSidebarItem({ id: "game-info-hub", label: "Info Hub", icon: "ℹ️", pageId: "game-info-hub", sort: 35 });
  return { cleanup() {} };
}` },
  { id: "quick-access-overlay", manifest: `{
  "id": "quick-access-overlay",
  "name": "Quick Access Overlay",
  "version": "1.0.0",
  "author": "NEXUS",
  "description": "A floating panel with shortcuts to games, tools, and actions. Press Ctrl+Space to toggle.",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["ui:sidebar", "games:read", "events"],
  "icon": "⚡"
}`, code: `// NEXUS Plugin — Quick Access Overlay
export default function plugin(api) {
  api.log.info("Quick Access Overlay loaded");
  let panel = null, games = [];
  function toggle() {
    if (panel) { panel.remove(); panel = null; return; }
    panel = document.createElement("div");
    panel.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:9999;width:280px;background:var(--bg-2,#141416);border:1px solid var(--border-2,rgba(255,255,255,0.16));border-radius:16px;box-shadow:0 20px 50px -10px rgba(0,0,0,0.8);padding:16px";
    panel.innerHTML = '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-faint);margin-bottom:12px">⚡ Quick Access</div><div id="qa-games" style="max-height:240px;overflow-y:auto"></div>';
    const gamesEl = panel.querySelector("#qa-games");
    gamesEl.innerHTML = games.slice(0, 8).map(function(g) { return '<div class="qa-item" style="padding:8px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:var(--text-dim);transition:background 0.12s;display:flex;align-items:center;gap:8px"><span>' + (g.installed ? "🎮" : "📦") + '</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + g.title + '</span></div>'; }).join("");
    gamesEl.querySelectorAll(".qa-item").forEach(function(el, i) { el.onmouseenter = function() { el.style.background = "rgba(255,255,255,0.04)"; }; el.onmouseleave = function() { el.style.background = "transparent"; }; el.onclick = function() { api.events.emit("command:openGame", { id: games[i].id }); panel.remove(); panel = null; }; });
    document.body.appendChild(panel);
  }
  api.games.list().then(function(g) { games = g; });
  api.events.on("library:updated", function() { api.games.list().then(function(g) { games = g; }); });
  api.ui.registerSidebarItem({ id: "quick-access", label: "Quick Access", icon: "⚡", sort: 60 });
  document.addEventListener("keydown", function(e) { if (e.ctrlKey && e.code === "Space") { e.preventDefault(); toggle(); } });
  return { cleanup() { if (panel) { panel.remove(); panel = null; } } };
}` }
];
