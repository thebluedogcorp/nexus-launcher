// NEXUS Plugin — Storage Manager
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
}
