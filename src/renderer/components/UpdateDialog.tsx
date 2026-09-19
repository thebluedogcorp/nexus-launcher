import { useEffect, useState } from "react";
import { Icon } from "./Icons";

interface UpdateInfo {
  version?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  downloadSize?: number;
}

interface Props {
  info: UpdateInfo;
  onClose: () => void;
}

type Phase = "confirm" | "downloading" | "installing" | "done" | "error";

/**
 * In-app updater dialog. Downloads the latest NSIS installer from GitHub
 * Releases with a live progress bar, then launches it to replace the app.
 */
export function UpdateDialog({ info, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [progress, setProgress] = useState({ bytesDownloaded: 0, totalBytes: 0, percent: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to download progress events from the main process.
    const off = (window as unknown as {
      nexus?: {
        onUpdateProgress?: (cb: (p: { bytesDownloaded: number; totalBytes: number; percent: number }) => void) => () => void;
      };
    }).nexus?.onUpdateProgress?.((p) => {
      setProgress(p);
      if (p.percent >= 100) setPhase("installing");
    });
    return () => {
      off?.();
    };
  }, []);

  const startDownload = async () => {
    // If we have a direct asset URL, stream the installer + launch it.
    if (info.downloadUrl) {
      setPhase("downloading");
      setProgress({ bytesDownloaded: 0, totalBytes: info.downloadSize ?? 0, percent: 0 });
      try {
        const res = await window.nexus.downloadAndInstallUpdate(info.downloadUrl, info.downloadSize);
        if (res.ok) {
          setPhase("installing");
          setTimeout(() => setPhase("done"), 1500);
        } else {
          setPhase("error");
          setError(res.message);
        }
      } catch (e) {
        setPhase("error");
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    // No direct asset URL (e.g. the GitHub API returned 404 because the repo
    // is private and the call was unauthenticated). Open the release page in
    // the user's default browser so they can download manually.
    if (info.releaseUrl) {
      await window.nexus.openExternal(info.releaseUrl);
      onClose();
      return;
    }

    setPhase("error");
    setError("No download URL available and no release page to open.");
  };

  const sizeLabel = info.downloadSize ? formatBytes(info.downloadSize) : "—";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ color: "var(--nx-accent)" }}><Icon.DownloadCloud size={18} /></span>
            Update NEXUS
          </div>
          {phase !== "downloading" && phase !== "installing" && (
            <button className="modal-close" onClick={onClose}><Icon.Close size={16} /></button>
          )}
        </div>

        <div className="modal-body">
          {phase === "confirm" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14, flexShrink: 0,
                  background: "linear-gradient(135deg, rgba(52,211,153,0.2), rgba(52,211,153,0.02))",
                  border: "1px solid rgba(52,211,153,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--nx-accent)",
                }}>
                  <Icon.DownloadCloud size={28} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
                    NEXUS {info.version} is available
                  </div>
                  <div style={{ fontSize: 12, color: "var(--nx-text-dim)", marginTop: 4 }}>
                    {info.downloadUrl
                      ? `Download size: ${sizeLabel} · Installs automatically when complete`
                      : "Opens the GitHub release page in your browser"}
                  </div>
                </div>
              </div>
              <div style={{
                padding: 12, borderRadius: 9,
                background: "rgba(255,255,255,0.03)", border: "1px solid var(--nx-border)",
                fontSize: 12, color: "var(--nx-text-dim)", lineHeight: 1.6,
              }}>
                {info.downloadUrl
                  ? "NEXUS will download the latest installer and launch it. Your library and settings are preserved across updates. The app will close briefly during installation and reopen automatically."
                  : "Your library and settings are preserved across updates. Download the new NEXUS-Setup exe from GitHub and run it — it will replace this version."}
              </div>
            </>
          )}

          {(phase === "downloading" || phase === "installing") && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ marginBottom: 18 }}>
                {phase === "downloading" ? (
                  <Icon.DownloadCloud size={40} />
                ) : (
                  <Icon.Spinner size={40} />
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
                {phase === "downloading" ? "Downloading update…" : "Installing update…"}
              </div>
              <div style={{ fontSize: 12, color: "var(--nx-text-dim)", marginBottom: 18 }}>
                {phase === "downloading"
                  ? `${formatBytes(progress.bytesDownloaded)} of ${progress.totalBytes ? formatBytes(progress.totalBytes) : "…"}`
                  : "Launching installer. The app will restart automatically."}
              </div>
              <div className="progress-bar" style={{ height: 8, width: "100%" }}>
                <div style={{
                  width: `${phase === "installing" ? 100 : progress.percent}%`,
                  background: "linear-gradient(90deg, #34d399, #2dd4bf)",
                  height: "100%", borderRadius: 999,
                  boxShadow: "0 0 12px var(--nx-accent-glow)",
                  transition: "width .3s ease",
                }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--nx-text-faint)", marginTop: 8 }}>
                {phase === "downloading" ? `${progress.percent}%` : ""}
              </div>
            </div>
          )}

          {phase === "done" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px",
                background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center", color: "var(--nx-accent)",
              }}>
                <Icon.CheckCircle size={28} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Update launched</div>
              <div style={{ fontSize: 12, color: "var(--nx-text-dim)", marginTop: 6 }}>
                The installer is running in the background. NEXUS will restart shortly.
              </div>
            </div>
          )}

          {phase === "error" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px",
                background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center", color: "var(--nx-danger)",
              }}>
                <Icon.Info size={28} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Update failed</div>
              <div style={{ fontSize: 12, color: "var(--nx-text-dim)", marginTop: 6, lineHeight: 1.5 }}>{error}</div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {phase === "confirm" && (
            <>
              {info.releaseUrl && (
                <a href={info.releaseUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  <Icon.ExternalLink size={14} /> Release notes
                </a>
              )}
              <button className="btn btn-ghost" onClick={onClose}>Later</button>
              <button className="btn btn-primary" onClick={startDownload}>
                <Icon.DownloadCloud size={15} /> {info.downloadUrl ? "Download & Install" : "Open in Browser"}
              </button>
            </>
          )}
          {phase === "error" && (
            <>
              {info.releaseUrl && (
                <button className="btn btn-outline" onClick={() => window.nexus.openExternal(info.releaseUrl!)}>
                  <Icon.ExternalLink size={14} /> Open release page
                </button>
              )}
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </>
          )}
          {phase === "downloading" || phase === "installing" || phase === "done" ? (
            <div style={{ fontSize: 11, color: "var(--nx-text-faint)", padding: "0 4px" }}>
              Please don't close NEXUS while updating…
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
