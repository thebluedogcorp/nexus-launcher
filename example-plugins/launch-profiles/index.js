// NEXUS Plugin — Launch Profiles
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
}
