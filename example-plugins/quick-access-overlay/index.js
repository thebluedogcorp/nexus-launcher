// NEXUS Plugin — Quick Access Overlay
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
}
