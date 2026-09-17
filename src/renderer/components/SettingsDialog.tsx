import { useState } from "react";
import type { LauncherSettings, SortKey } from "@shared/types";
import { SORT_LABELS } from "@shared/types";
import { Icon } from "./Icons";

interface Props {
  initial: LauncherSettings;
  onClose: () => void;
  onSave: (s: Partial<LauncherSettings>) => Promise<LauncherSettings>;
}

export function SettingsDialog({ initial, onClose, onSave }: Props) {
  const [rawgKey, setRawgKey] = useState(initial.rawgApiKey);
  const [autoScan, setAutoScan] = useState(initial.autoScanOnStart);
  const [defaultSort, setDefaultSort] = useState<SortKey>(initial.defaultSort);
  const [scanPaths, setScanPaths] = useState(initial.scanPaths);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        rawgApiKey: rawgKey.trim(),
        autoScanOnStart: autoScan,
        defaultSort,
        scanPaths,
      });
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
            <span style={{ color: "var(--nx-accent)" }}><Icon.Settings size={18} /></span>
            Settings
          </div>
          <button className="modal-close" onClick={onClose}><Icon.Close size={16} /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label"><Icon.Key size={12} /> RAWG API Key</label>
            <input
              type="password"
              className="field-input"
              style={{ fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 12 }}
              value={rawgKey}
              onChange={(e) => setRawgKey(e.target.value)}
              placeholder="Paste your RAWG API key (optional)"
            />
            <div className="field-hint">
              <Icon.Info size={12} />
              <span>Required for live metadata patching. Get a free key at{" "}
                <a href="https://rawg.io/apidocs" target="_blank" rel="noopener noreferrer" style={{ color: "var(--nx-accent)" }}>rawg.io/apidocs</a>.
              </span>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Default Sort</label>
            <select className="field-input" value={defaultSort} onChange={(e) => setDefaultSort(e.target.value as SortKey)}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABELS[k]}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid var(--nx-border)", background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--nx-text)" }}>Auto-scan on startup</div>
              <div style={{ fontSize: 11, color: "var(--nx-text-dim)" }}>Detect newly installed games when NEXUS launches.</div>
            </div>
            <button
              onClick={() => setAutoScan(!autoScan)}
              style={{ width: 40, height: 22, borderRadius: 999, padding: 2, background: autoScan ? "var(--nx-accent)" : "rgba(255,255,255,0.1)", transition: "background .15s", position: "relative" }}
            >
              <span style={{ position: "absolute", top: 2, left: autoScan ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
            </button>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label"><Icon.FolderSearch size={12} /> Custom Scan Paths</label>
            <textarea
              className="field-input"
              value={scanPaths}
              onChange={(e) => setScanPaths(e.target.value)}
              placeholder={"C:\\Games\nD:\\SteamLibrary\\steamapps\\common"}
              rows={3}
            />
            <div className="field-hint">
              <Icon.Info size={12} />
              <span>One path per line. NEXUS will also probe these locations during a scan.</span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Icon.Spinner size={15} /> : <Icon.Check size={15} />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
