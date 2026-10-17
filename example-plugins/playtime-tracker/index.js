// NEXUS Plugin — Playtime Tracker
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
}
