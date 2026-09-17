import { useEffect, useState } from "react";
import type { DetectedGame, Game, PlatformId, ScanSummary } from "@shared/types";
import { PLATFORM_LIST } from "@shared/types";
import { Icon } from "./Icons";
import { CoverArt } from "./CoverArt";
import { formatSize } from "../lib/helpers";

type Step = "select" | "scanning" | "results";

interface Props {
  onClose: () => void;
  onRunScan: (platforms: PlatformId[]) => Promise<ScanSummary>;
  onImport: (items: DetectedGame[]) => Promise<Game[]>;
}

export function ScanDialog({ onClose, onRunScan, onImport }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<Set<PlatformId>>(
    new Set(PLATFORM_LIST.filter((p) => p.id !== "custom" && p.id !== "manual").map((p) => p.id as PlatformId)),
  );
  const [progress, setProgress] = useState<{ platform: string; label: string }[]>([]);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: PlatformId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const start = async () => {
    if (selected.size === 0) return;
    setStep("scanning");
    setProgress([]);
    setSummary(null);
    setError(null);
    try {
      const off = await new Promise<(() => void) | undefined>((resolve) => {
        const off = (window as unknown as { nexus?: { onScanProgress?: (cb: (p: { platform: string; label: string }) => void) => () => void } }).nexus?.onScanProgress?.((p) => {
          setProgress((prev) => [...prev, p]);
        });
        resolve(off);
      });
      const res = await onRunScan(Array.from(selected));
      off?.();
      setSummary(res);
      setChecked(new Set(res.detected.map((d) => d.title)));
      setStep("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("select");
    }
  };

  const importSelected = async () => {
    if (!summary) return;
    const items = summary.detected.filter((d) => checked.has(d.title));
    if (items.length === 0) return;
    await onImport(items);
    onClose();
  };

  useEffect(() => {
    if (step !== "scanning") setProgress([]);
  }, [step]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ color: "var(--nx-accent)" }}><Icon.Scan size={18} /></span>
            System Scan
          </div>
          <button className="modal-close" onClick={onClose}><Icon.Close size={16} /></button>
        </div>

        <div className="modal-body">
          {step === "select" && (
            <>
              <p style={{ fontSize: 12, color: "var(--nx-text-dim)", marginBottom: 14 }}>
                NEXUS reads each store's real install records (Steam VDF manifests, Epic's LauncherInstalled.dat, the GOG/EA/Ubisoft registry hives, Battle.net's agent.db, Riot's install paths, and the Xbox Appx package list) to detect every game installed on your PC.
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
              {error && (
                <div style={{ marginTop: 12, padding: 10, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", borderRadius: 8, fontSize: 12, color: "var(--nx-danger)" }}>
                  {error}
                </div>
              )}
              <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "var(--nx-text-faint)" }}>
                <Icon.Cpu size={14} />
                <span>Scanner runs read-only filesystem + registry probes. No files are modified.</span>
              </div>
            </>
          )}

          {step === "scanning" && (
            <div className="scan-stage scanning">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon.Spinner size={20} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--nx-text)" }}>
                    {progress.length > 0 ? `Scanning ${progress[progress.length - 1].label}…` : "Initializing NEXUS scanner…"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--nx-text-faint)", marginTop: 2 }}>
                    Stage {progress.length} of {selected.size}
                  </div>
                </div>
              </div>
              <div className="progress-bar">
                <div style={{ width: `${selected.size ? (progress.length / selected.size) * 100 : 0}%` }} />
              </div>
              <div className="scan-log">
                {progress.map((p, i) => (
                  <div key={i}>
                    <Icon.CheckCircle size={12} />
                    <span>Read {p.label} install records</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "results" && summary && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                    {summary.detected.length} game{summary.detected.length === 1 ? "" : "s"} detected
                  </div>
                  <div style={{ fontSize: 11, color: "var(--nx-text-dim)", marginTop: 2 }}>
                    {checked.size} selected · {Object.keys(summary.byPlatform).length} platforms
                    {summary.errors.length > 0 && ` · ${summary.errors.length} warnings`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost" style={{ height: 28, fontSize: 11 }} onClick={() => setChecked(new Set())}>Clear</button>
                  <button className="btn btn-outline" style={{ height: 28, fontSize: 11 }} onClick={() => setChecked(new Set(summary.detected.map((d) => d.title)))}>Select all</button>
                </div>
              </div>

              {summary.detected.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 30, border: "1px dashed var(--nx-border)", borderRadius: 12, textAlign: "center" }}>
                  <Icon.CheckCircle size={32} />
                  <div style={{ marginTop: 8, fontWeight: 600, color: "var(--nx-text)" }}>All clear!</div>
                  <div style={{ fontSize: 12, color: "var(--nx-text-faint)", marginTop: 4 }}>
                    Every detected game is already in your library, or no games were found in the selected stores.
                  </div>
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
                  {summary.detected.map((d) => {
                    const isOn = checked.has(d.title);
                    return (
                      <button
                        key={`${d.platform}-${d.title}`}
                        onClick={() => setChecked((prev) => {
                          const next = new Set(prev);
                          if (next.has(d.title)) next.delete(d.title);
                          else next.add(d.title);
                          return next;
                        })}
                        className={isOn ? "platform-card active" : "platform-card"}
                        style={{ padding: 8 }}
                      >
                        <div style={{ width: 40, height: 54, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                          <CoverArt title={d.title} platform={d.platform} coverImage={null} showOverlay={false} />
                        </div>
                        <div className="label">
                          <div className="name">{d.title}</div>
                          <div className="path">
                            {d.platform.toUpperCase()} · {formatSize(d.sizeBytes)}
                            {d.installDir ? ` · ${d.installDir}` : ""}
                          </div>
                        </div>
                        <span className="checkbox">{isOn && <Icon.Check size={12} />}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {summary.errors.length > 0 && (
                <details style={{ marginTop: 10, fontSize: 11, color: "var(--nx-text-faint)" }}>
                  <summary style={{ cursor: "pointer" }}>{summary.errors.length} platform warning(s)</summary>
                  <div style={{ marginTop: 6, fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 10 }}>
                    {summary.errors.map((e, i) => (
                      <div key={i}>{e.platform}: {e.message}</div>
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
              <button className="btn btn-primary" onClick={start} disabled={selected.size === 0}>
                <Icon.Scan size={15} /> Start Scan
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
