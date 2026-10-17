// NEXUS Plugin SDK — Hello World example.
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
}
