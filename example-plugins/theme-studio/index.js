// NEXUS Plugin — Theme Studio
export default function plugin(api) {
  api.log.info("Theme Studio loaded");
  const presets = {
    "Midnight": { "--bg": "#0a0a12", "--surface": "#161628", "--accent": "#6366f1", "--border": "rgba(255,255,255,0.08)" },
    "Sunset": { "--bg": "#1a0a0a", "--surface": "#2a1410", "--accent": "#fb923c", "--border": "rgba(255,255,255,0.06)" },
    "Forest": { "--bg": "#0a1a0a", "--surface": "#142814", "--accent": "#4ade80", "--border": "rgba(255,255,255,0.06)" },
    "AMOLED": { "--bg": "#000000", "--surface": "#0a0a0a", "--accent": "#00ff88", "--border": "rgba(255,255,255,0.12)" },
    "Crimson": { "--bg": "#1a0606", "--surface": "#280a0a", "--accent": "#ef4444", "--border": "rgba(255,255,255,0.06)" },
  };
  const vars = [
    { name: "--bg", label: "Background", type: "color" },
    { name: "--bg-2", label: "Elevated Surface", type: "color" },
    { name: "--surface", label: "Input Surface", type: "color" },
    { name: "--accent", label: "Accent Color", type: "color" },
    { name: "--text", label: "Text Color", type: "color" },
    { name: "--border", label: "Border Color", type: "color" },
    { name: "--r-lg", label: "Border Radius (lg)", type: "text" },
    { name: "--font-family", label: "Font Family", type: "text" },
    { name: "--bg-layer-value", label: "Background Image/Gradient", type: "text" },
  ];

  api.ui.registerPage({
    id: "theme-studio", label: "Theme Studio", icon: "🎨", sort: 50,
    mount: async (container) => {
      container.innerHTML = '<div style="padding:48px;max-width:900px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:var(--text-faint);margin-bottom:8px">Plugin</div><h1 style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:24px">🎨 Theme Studio</h1><div id="presets" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:32px"></div><div id="vars" style="display:grid;grid-template-columns:1fr 1fr;gap:16px"></div><div style="margin-top:24px"><button id="save" style="padding:10px 20px;border-radius:8px;background:var(--accent);color:var(--accent-fg);border:none;font-weight:600;cursor:pointer;font-size:13px">Save Theme</button> <button id="reset" style="padding:10px 20px;border-radius:8px;background:transparent;border:1px solid var(--border);color:var(--text-dim);font-weight:600;cursor:pointer;font-size:13px">Reset</button></div></div>';
      const presetsEl = container.querySelector("#presets");
      const varsEl = container.querySelector("#vars");
      Object.entries(presets).forEach(function(e) {
        const name = e[0]; const vals = e[1];
        const btn = document.createElement("button");
        btn.textContent = name;
        btn.style.cssText = "padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px;font-weight:600;cursor:pointer";
        btn.onclick = function() { Object.entries(vals).forEach(function(v) { api.theme.setCSSVar(v[0], v[1]); }); };
        presetsEl.appendChild(btn);
      });
      vars.forEach(function(v) {
        const div = document.createElement("div");
        div.style.cssText = "display:flex;flex-direction:column;gap:6px";
        const label = document.createElement("label");
        label.textContent = v.label;
        label.style.cssText = "font-size:11px;font-weight:600;color:var(--text-dim)";
        const input = document.createElement("input");
        input.value = api.theme.getCSSVar(v.name);
        input.style.cssText = "height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;font-family:monospace";
        input.oninput = function() { api.theme.setCSSVar(v.name, input.value); };
        div.appendChild(label); div.appendChild(input);
        varsEl.appendChild(div);
      });
      container.querySelector("#save").onclick = async function() {
        const saved = {};
        vars.forEach(function(v) { saved[v.name] = api.theme.getCSSVar(v.name); });
        await api.storage.set("theme", saved);
        api.log.info("Theme saved");
      };
      container.querySelector("#reset").onclick = function() {
        Object.keys(presets["AMOLED"]).forEach(function(k) { api.theme.setCSSVar(k, ""); });
      };
      // Load saved theme
      const saved = await api.storage.get("theme");
      if (saved && typeof saved === "object") {
        Object.entries(saved).forEach(function(e) { api.theme.setCSSVar(e[0], e[1]); });
        vars.forEach(function(v) { container.querySelector('input[value=""]'); });
      }
    },
    unmount: () => {},
  });
  api.ui.registerSidebarItem({ id: "theme-studio", label: "Theme Studio", icon: "🎨", pageId: "theme-studio", sort: 50 });
  return { cleanup() { api.log.info("Theme Studio cleanup"); } };
}
