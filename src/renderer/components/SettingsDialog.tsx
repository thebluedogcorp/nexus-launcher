import { useState } from "react";
import type { LauncherSettings, SortKey } from "@shared/types";
import { SORT_LABELS } from "@shared/types";
import { Icon } from "./Icons";

interface Props {
  initial: LauncherSettings;
  onClose: () => void;
  onSave: (s: Partial<LauncherSettings>) => Promise<LauncherSettings>;
  onCheckUpdates: () => void;
}

/**
 * NEXUS Settings — zero-setup by design.
 *
 * No API key field: metadata is fetched automatically using a built-in default
 * key, so the launcher works perfectly the moment it's installed. Power users
 * who want to override the key can drop a `rawgApiKey` line in the DB by hand,
 * but there's no UI for it to avoid confusing normal users.
 */
export function SettingsDialog({ initial, onClose, onSave, onCheckUpdates }: Props) {
  const [autoScan, setAutoScan] = useState(initial.autoScanOnStart);
  const [defaultSort, setDefaultSort] = useState<SortKey>(initial.defaultSort);
  const [scanPaths, setScanPaths] = useState(initial.scanPaths);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
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
          {/* Zero-setup banner — reassures the user everything just works. */}
          <div style={{
            display: "flex", alignItems: "center", gap: 13, padding: 14,
            background: "linear-gradient(135deg, rgba(52,211,153,0.1), rgba(52,211,153,0.02))",
            border: "1px solid rgba(52,211,153,0.25)", borderRadius: 11, marginBottom: 20,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: "rgba(52,211,153,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--nx-accent)",
            }}>
              <Icon.Shield size={20} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Everything just works</div>
              <div style={{ fontSize: 11, color: "var(--nx-text-dim)", marginTop: 2, lineHeight: 1.5 }}>
                NEXUS auto-detects your games and fetches cover art, screenshots, and details automatically. No API keys, no setup.
              </div>
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
              <span>Optional. One path per line. NEXUS also probes these locations during a scan.</span>
            </div>
          </div>

          {/* Check for updates */}
          <div style={{
            display: "flex", alignItems: "center", gap: 13, marginTop: 20, padding: 14,
            border: "1px solid var(--nx-border)", borderRadius: 11,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--nx-text-dim)",
            }}>
              <Icon.DownloadCloud size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--nx-text)" }}>Check for updates</div>
              <div style={{ fontSize: 11, color: "var(--nx-text-dim)", marginTop: 2 }}>Download and install the latest version from GitHub.</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={onCheckUpdates}>
              <Icon.Refresh size={14} /> Check
            </button>
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
