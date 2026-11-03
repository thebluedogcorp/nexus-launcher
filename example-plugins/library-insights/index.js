// NEXUS Plugin SDK — Library Insights example.
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
}
