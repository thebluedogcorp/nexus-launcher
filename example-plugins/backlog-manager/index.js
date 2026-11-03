// NEXUS Plugin — Backlog Manager
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
}
