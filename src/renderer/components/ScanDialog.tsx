import { useEffect, useState } from "react";
import type { DetectedGame, Game, PlatformId, ScanSummary } from "@shared/types";
import { PLATFORM_LIST } from "@shared/types";
import { Icon } from "./Icons";
import { formatSize, platformColor, platformLabel } from "../lib/helpers";

type Step = "select" | "scanning" | "results";
type Mode = "platforms" | "deep";

interface Props {
  onClose: () => void;
  onRunScan: (platforms: PlatformId[]) => Promise<ScanSummary>;
  onImport: (items: DetectedGame[]) => Promise<Game[]>;
  onDeepScan: (customPaths: string[]) => Promise<{
    detected: DetectedGame[];
    totalFound: number;
    skipped: number;
    errors: { path: string; message: string }[];
  }>;
}

export function ScanDialog({ onClose, onRunScan, onImport, onDeepScan }: Props) {
  const [mode, setMode] = useState<Mode>("platforms");
  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<Set<PlatformId>>(
    new Set(PLATFORM_LIST.filter((p) => p.id !== "custom" && p.id !== "manual").map((p) => p.id as PlatformId)),
  );
  const [progress, setProgress] = useState<{ platform: string; label: string }[]>([]);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [deepResults, setDeepResults] = useState<{ detected: DetectedGame[]; totalFound: number; skipped: number; errors: { path: string; message: string }[] } | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [customPaths, setCustomPaths] = useState("");

  const toggle = (id: PlatformId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const start = async () => {
    if (mode === "platforms") {
      if (selected.size === 0) return;
      setStep("scanning");
      setProgress([]);
      setSummary(null);
      setError(null);
      try {
        const res = await onRunScan(Array.from(selected));
        setSummary(res);
        setChecked(new Set(res.detected.map((d) => d.title)));
        setStep("results");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStep("select");
      }
    } else {
      // Deep filesystem scan.
      setStep("scanning");
      setProgress([]);
      setDeepResults(null);
      setError(null);
      try {
        const paths = customPaths.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
        const res = await onDeepScan(paths);
        setDeepResults(res);
        setChecked(new Set(res.detected.map((d) => d.title)));
        setStep("results");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStep("select");
      }
    }
  };

  const importSelected = async () => {
    const items = mode === "platforms" && summary
      ? summary.detected.filter((d) => checked.has(d.title))
      : deepResults ? deepResults.detected.filter((d) => checked.has(d.title)) : [];
    if (items.length === 0) return;
    await onImport(items);
    onClose();
  };

  useEffect(() => {
    if (step !== "scanning") setProgress([]);
  }, [step]);

  const detected = summary?.detected ?? deepResults?.detected ?? [];
  const totalFound = summary?.detected.length ?? deepResults?.totalFound ?? 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ color: "var(--nx-accent)" }}><Icon.Scan size={18} /></span>
            {mode === "platforms" ? "Scan Platforms" : "Deep Filesystem Scan"}
          </div>
          <button className="modal-close" onClick={onClose}><Icon.Close size={16} /></button>
        </div>

        <div className="modal-body">
          {step === "select" && (
            <>
              {/* Mode switcher */}
              <div style={{ display: "flex", gap: 6, marginBottom: 18, padding: 3, background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid var(--nx-border)" }}>
                <button
                  onClick={() => setMode("platforms")}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    background: mode === "platforms" ? "rgba(255,255,255,0.08)" : "transparent",
                    color: mode === "platforms" ? "#fff" : "var(--nx-text-faint)",
                    transition: "all .15s",
                  }}
                >
                  Platform Scan
                </button>
                <button
                  onClick={() => setMode("deep")}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    background: mode === "deep" ? "rgba(255,255,255,0.08)" : "transparent",
                    color: mode === "deep" ? "#fff" : "var(--nx-text-faint)",
                    transition: "all .15s",
                  }}
                >
                  Deep Scan (All Drives)
                </button>
              </div>

              {mode === "platforms" ? (
                <>
                  <p style={{ fontSize: 12, color: "var(--nx-text-dim)", marginBottom: 14, lineHeight: 1.5 }}>
                    Scans each store's real install records (Steam VDF, Epic manifests, GOG/EA/Ubisoft registry, Battle.net agent.db, Riot paths, Xbox Appx).
                  </p>
                  <div className="platform-grid">
                    {PLATFORM_LIST.filter((p) => p.id !== "custom" && p.id !== "manual").map((p) => (
                      <button
                        key={p.id}
                        className={selected.has(p.id as PlatformId) ? "platform-card active" : "platform-card"}
                        onClick={() => toggle(p.id as PlatformId)}
                      >
                        <span className="plat-dot" style={{ background: `${p.accent}1f`, color: p.accent }}>{p.monogram}</span>
                        <div className="label">
                          <div className="name">{p.label}</div>
                          <div className="path">{p.pathHint}</div>
                        </div>
                        <span className="checkbox">
                          {selected.has(p.id as PlatformId) && <Icon.Check size={12} />}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{
                    padding: 12, borderRadius: 9, background: "rgba(0,168,225,0.06)",
                    border: "1px solid rgba(0,168,225,0.2)", marginBottom: 16,
                    fontSize: 12, color: "var(--nx-text-dim)", lineHeight: 1.6,
                  }}>
                    <strong style={{ color: "#5ac8e8" }}>Deep Scan</strong> walks every fixed drive (C:\, D:\, …) plus any custom paths below, looking for game-like directories. It detects games installed in non-default locations that the platform scanners miss — e.g. a game you extracted to D:\Games\MyGame. Heuristics: large .exe + game data files (.pak, .uasset, .bsa, data.win, etc.) or directories larger than 2GB.
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Custom Scan Paths (optional — one per line)</label>
                    <textarea
                      className="field-input"
                      value={customPaths}
                      onChange={(e) => setCustomPaths(e.target.value)}
                      placeholder={"D:\\Games\nE:\\SteamLibrary\\steamapps\\common\nF:\\GOG Games"}
                      rows={4}
                    />
                    <div className="field-hint">
                      <Icon.Info size={12} />
                      <span>All fixed drives are scanned automatically. Add custom paths above to scan additional locations (network drives, external drives, etc.).</span>
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div style={{ marginTop: 12, padding: 10, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", borderRadius: 8, fontSize: 12, color: "var(--nx-danger)" }}>
                  {error}
                </div>
              )}
            </>
          )}

          {step === "scanning" && (
            <div className="scan-stage scanning">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon.Spinner size={20} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--nx-text)" }}>
                    {progress.length > 0 ? progress[progress.length - 1].label : "Initializing scanner…"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--nx-text-faint)", marginTop: 2 }}>
                    {mode === "platforms" ? `Stage ${progress.length} of ${selected.size}` : "Scanning drives…"}
                  </div>
                </div>
              </div>
              <div className="progress-bar">
                <div style={{ width: mode === "platforms" ? `${selected.size ? (progress.length / selected.size) * 100 : 0}%` : "60%" }} />
              </div>
              <div className="scan-log">
                {progress.map((p, i) => (
                  <div key={i}>
                    <Icon.CheckCircle size={12} />
                    <span>{p.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "results" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                    {totalFound} game{totalFound === 1 ? "" : "s"} detected
                    {deepResults && deepResults.skipped > 0 && <span style={{ color: "var(--nx-text-faint)", fontWeight: 400 }}> · {deepResults.skipped} already in library</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--nx-text-dim)", marginTop: 2 }}>
                    {checked.size} selected
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setChecked(new Set())}>Clear</button>
                  <button className="btn btn-outline btn-sm" onClick={() => setChecked(new Set(detected.map((d) => d.title)))}>Select all</button>
                </div>
              </div>

              {detected.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 30, border: "1px dashed var(--nx-border)", borderRadius: 12, textAlign: "center" }}>
                  <Icon.CheckCircle size={32} />
                  <div style={{ marginTop: 8, fontWeight: 600, color: "var(--nx-text)" }}>All clear!</div>
                  <div style={{ fontSize: 12, color: "var(--nx-text-faint)", marginTop: 4 }}>
                    No new games found. Try Deep Scan if your games are in custom locations.
                  </div>
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
                  {detected.map((d) => {
                    const isOn = checked.has(d.title);
                    return (
                      <button
                        key={`${d.platform}-${d.title}-${d.installDir ?? ""}`}
                        onClick={() => setChecked((prev) => {
                          const next = new Set(prev);
                          if (next.has(d.title)) next.delete(d.title);
                          else next.add(d.title);
                          return next;
                        })}
                        className={isOn ? "platform-card active" : "platform-card"}
                        style={{ padding: 8 }}
                      >
                        <span className="plat-dot" style={{ background: `${platformColor(d.platform)}1f`, color: platformColor(d.platform) }}>
                          {PLATFORM_LIST.find((p) => p.id === d.platform)?.monogram ?? "?"}
                        </span>
                        <div className="label">
                          <div className="name">{d.title}</div>
                          <div className="path">
                            {platformLabel(d.platform)} · {formatSize(d.sizeBytes)}
                            {d.installDir ? ` · ${d.installDir}` : ""}
                          </div>
                        </div>
                        <span className="checkbox">{isOn && <Icon.Check size={12} />}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {deepResults && deepResults.errors.length > 0 && (
                <details style={{ marginTop: 10, fontSize: 11, color: "var(--nx-text-faint)" }}>
                  <summary style={{ cursor: "pointer" }}>{deepResults.errors.length} scan warning(s)</summary>
                  <div style={{ marginTop: 6, fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 10 }}>
                    {deepResults.errors.map((e, i) => (
                      <div key={i}>{e.path}: {e.message}</div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          {step === "select" && (
            <>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={start} disabled={mode === "platforms" && selected.size === 0}>
                <Icon.Scan size={15} /> Start {mode === "deep" ? "Deep Scan" : "Scan"}
              </button>
            </>
          )}
          {step === "scanning" && (
            <button className="btn btn-ghost" disabled>
              <Icon.Spinner size={15} /> Scanning…
            </button>
          )}
          {step === "results" && (
            <>
              <button className="btn btn-ghost" onClick={() => setStep("select")}>Scan again</button>
              <button className="btn btn-primary" onClick={importSelected} disabled={checked.size === 0}>
                <Icon.Download size={15} /> Import ({checked.size})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
