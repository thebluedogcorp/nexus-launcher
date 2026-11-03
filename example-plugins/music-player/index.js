// NEXUS Plugin — Music Player
export default function plugin(api) {
  api.log.info("Music Player loaded");
  let audio = null, playlist = [], currentIdx = 0;
  api.ui.registerPage({
    id: "music-player", label: "Music", icon: "🎵", sort: 45,
    mount: async (container) => {
      playlist = (await api.storage.get("playlist")) || [];
      container.innerHTML = '<div style="padding:48px;max-width:800px"><h1 style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:24px">🎵 Music Player</h1><div style="padding:24px;border-radius:16px;background:var(--surface);border:1px solid var(--border);text-align:center;margin-bottom:24px"><div id="now-playing" style="font-size:14px;color:var(--text-dim);margin-bottom:16px">No track loaded</div><div style="display:flex;justify-content:center;gap:12px"><button id="prev" style="font-size:20px;background:none;border:none;color:var(--text-dim);cursor:pointer;padding:8px">⏮</button><button id="play-btn" style="width:56px;height:56px;border-radius:50%;background:var(--accent);border:none;color:var(--accent-fg);font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center">▶</button><button id="next" style="font-size:20px;background:none;border:none;color:var(--text-dim);cursor:pointer;padding:8px">⏭</button></div></div><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-faint);margin-bottom:8px">Playlist</div><div id="playlist-el"></div><div style="margin-top:16px"><input id="add-url" style="width:60%;height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px" placeholder="Paste audio file URL…"> <button id="add-btn" style="padding:8px 16px;border-radius:8px;background:var(--accent);color:var(--accent-fg);border:none;font-weight:600;cursor:pointer;font-size:12px">Add</button></div></div>';
      const np = container.querySelector("#now-playing");
      const plEl = container.querySelector("#playlist-el");
      function renderPL() { plEl.innerHTML = playlist.length ? playlist.map(function(t, i) { return '<div class="pl-item" data-idx="' + i + '" style="padding:8px 12px;border-radius:6px;background:rgba(255,255,255,0.02);margin-bottom:4px;cursor:pointer;font-size:12px;color:var(--text)">' + (i === currentIdx ? "▶ " : "") + t.name + '</div>'; }).join("") : '<div style="color:var(--text-faint);font-size:12px;padding:8px">Empty playlist. Add a URL above.</div>'; }
      function play(i) { if (i < 0 || i >= playlist.length) return; currentIdx = i; if (!audio) { audio = new Audio(); audio.onended = function() { play(currentIdx + 1); }; } audio.src = playlist[i].url; audio.play(); np.textContent = "▶ " + playlist[i].name; renderPL(); }
      container.querySelector("#play-btn").onclick = function() { if (audio && !audio.paused) { audio.pause(); } else if (audio) { audio.play(); } else if (playlist.length) { play(0); } };
      container.querySelector("#prev").onclick = function() { play(currentIdx - 1); };
      container.querySelector("#next").onclick = function() { play(currentIdx + 1); };
      container.querySelector("#add-btn").onclick = async function() { const url = container.querySelector("#add-url").value.trim(); if (!url) return; playlist.push({ name: url.split("/").pop() || "Track", url: url }); container.querySelector("#add-url").value = ""; await api.storage.set("playlist", playlist); renderPL(); };
      renderPL();
    },
    unmount: (c) => { if (audio) { audio.pause(); audio = null; } },
  });
  api.ui.registerSidebarItem({ id: "music-player", label: "Music", icon: "🎵", pageId: "music-player", sort: 45 });
  return { cleanup() { if (audio) { audio.pause(); audio = null; } } };
}
