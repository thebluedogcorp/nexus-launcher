// NEXUS Plugin — Custom Dashboard
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
}
