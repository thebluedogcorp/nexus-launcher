import { useEffect, useState } from "react";
import type { Game, MetadataResult, PlatformId } from "@shared/types";
import { PLATFORM_LIST } from "@shared/types";
import { Icon } from "./Icons";
interface Props {
  onClose: () => void;
  onAdd: (input: {
    title: string;
    platform: PlatformId;
    executable?: string | null;
    installDir?: string | null;
    launchCommand?: string | null;
    autoPatch?: boolean;
  }) => Promise<Game>;
}

export function AddGameDialog({ onClose, onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [debounced, setDebounced] = useState("");
  const [platform, setPlatform] = useState<PlatformId>("manual");
  const [executable, setExecutable] = useState("");
  const [installDir, setInstallDir] = useState("");
  const [launchCommand, setLaunchCommand] = useState("");
  const [autoPatch, setAutoPatch] = useState(true);
  const [results, setResults] = useState<MetadataResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MetadataResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(title.trim()), 350);
    return () => clearTimeout(t);
  }, [title]);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    window.nexus.searchMetadata(debounced).then((r: MetadataResult[]) => {
      if (!cancelled) {
        setResults(r);
        setSearching(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const reset = () => {
    setTitle(""); setPlatform("manual"); setExecutable(""); setInstallDir("");
    setLaunchCommand(""); setAutoPatch(true); setResults([]); setSelected(null);
  };

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        title: title.trim(),
        platform,
        executable: executable.trim() || null,
        installDir: installDir.trim() || null,
        launchCommand: launchCommand.trim() || null,
        autoPatch,
      });
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ color: "var(--nx-accent)" }}><Icon.Plus size={18} /></span>
            Add Game Manually
          </div>
          <button className="modal-close" onClick={onClose}><Icon.Close size={16} /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Game Title</label>
            <div className="search" style={{ margin: 0, maxWidth: "none" }}>
              <span className="icon"><Icon.Search size={16} /></span>
              <input
                autoFocus
                className="field-input"
                style={{ paddingLeft: 36 }}
                value={title}
                onChange={(e) => { setTitle(e.target.value); setSelected(null); }}
                placeholder="e.g. Elden Ring, Hades II…"
              />
            </div>

            {debounced.length >= 2 && !selected && (
              <div className="suggest-list">
                {searching && (
                  <div style={{ padding: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--nx-text-faint)" }}>
                    <Icon.Spinner size={14} /> Searching RAWG…
                  </div>
                )}
                {!searching && results.length === 0 && (
                  <div style={{ padding: 12, fontSize: 12, color: "var(--nx-text-faint)" }}>
                    No matches — you can still add this game with your own details.
                  </div>
                )}
                {results.map((r) => (
                  <button key={r.rawgId} className="suggest-item" onClick={() => { setTitle(r.title); setSelected(r); }}>
                    {r.coverImage ? (
                      <img className="suggest-thumb" src={r.coverImage} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="suggest-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><Icon.Gamepad size={16} /></div>
                    )}
                    <div className="suggest-info">
                      <div className="suggest-title">{r.title}</div>
                      <div className="suggest-sub">
                        {r.developer || "Unknown"}
                        {r.releaseDate ? ` · ${r.releaseDate.slice(0, 4)}` : ""}
                        {r.rating ? ` · ★ ${r.rating.toFixed(1)}` : ""}
                      </div>
                    </div>
                    <Icon.Chevron size={14} />
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="preview-card">
                {selected.coverImage ? (
                  <img className="preview-thumb" src={selected.coverImage} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="preview-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><Icon.Gamepad size={18} /></div>
                )}
                <div className="preview-body">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon.Check size={14} />
                    <div className="preview-title">{selected.title}</div>
                  </div>
                  <div className="preview-sub">
                    {selected.developer || "—"}
                    {selected.releaseDate ? ` · ${selected.releaseDate.slice(0, 4)}` : ""}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {selected.genres.slice(0, 4).map((g) => <span key={g} className="genre-tag">{g}</span>)}
                  </div>
                </div>
                <button className="modal-close" style={{ width: 24, height: 24 }} onClick={() => setSelected(null)}>
                  <Icon.Close size={12} />
                </button>
              </div>
            )}
          </div>

          <div className="field">
            <label className="field-label">Platform</label>
            <select className="field-input" value={platform} onChange={(e) => setPlatform(e.target.value as PlatformId)}>
              {PLATFORM_LIST.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Executable Path (.exe, .lnk, or .url)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="field-input" style={{ fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 12 }} value={executable} onChange={(e) => setExecutable(e.target.value)} placeholder="C:\Games\game.exe or C:\shortcut.lnk" />
                <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0, height: 40, borderRadius: 9 }} onClick={async () => {
                  const res = await window.nexus.pickFile({ title: "Select game executable or shortcut" });
                  if (res.ok && res.path) setExecutable(res.path);
                }}>
                  <Icon.Folder size={14} /> Browse
                </button>
              </div>
              <div className="field-hint">
                <Icon.Info size={12} />
                <span>You can select a .exe, .lnk shortcut, or .url file. All are resolved automatically when launching — great for Steam shortcuts (.url) and games where the store hides the real .exe (Epic, EA App, Xbox Game Pass).</span>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Install Directory</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="field-input" style={{ fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 12 }} value={installDir} onChange={(e) => setInstallDir(e.target.value)} placeholder="C:\Games\MyGame" />
                <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0, height: 40, borderRadius: 9 }} onClick={async () => {
                  const res = await window.nexus.pickFolder({ title: "Select install directory" });
                  if (res.ok && res.path) setInstallDir(res.path);
                }}>
                  <Icon.Folder size={14} /> Browse
                </button>
              </div>
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label">Launch Command (optional)</label>
            <input className="field-input" style={{ fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 12 }} value={launchCommand} onChange={(e) => setLaunchCommand(e.target.value)} placeholder="steam://run/1245620 — leave blank to use the exe directly" />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid var(--nx-border)", background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 12, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--nx-text)" }}>Auto-patch metadata</div>
              <div style={{ fontSize: 11, color: "var(--nx-text-dim)" }}>Fetch cover art + details from RAWG when adding.</div>
            </div>
            <button
              onClick={() => setAutoPatch(!autoPatch)}
              style={{
                width: 40, height: 22, borderRadius: 999, padding: 2,
                background: autoPatch ? "var(--nx-accent)" : "rgba(255,255,255,0.1)",
                transition: "background .15s", position: "relative",
              }}
            >
              <span style={{
                position: "absolute", top: 2, left: autoPatch ? 20 : 2,
                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                transition: "left .15s",
              }} />
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!title.trim() || saving}>
            {saving ? <Icon.Spinner size={15} /> : <Icon.Plus size={15} />}
            Add to Library
          </button>
        </div>
      </div>
    </div>
  );
}
