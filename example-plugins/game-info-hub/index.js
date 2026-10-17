// NEXUS Plugin — Game Information Hub
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
}
