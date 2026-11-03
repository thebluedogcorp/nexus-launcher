// NEXUS Plugin — Command Palette
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
}
