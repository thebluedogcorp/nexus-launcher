// NEXUS Game Overlay — the floating React UI that appears over the game.
//
// This is loaded by the overlay BrowserWindow (transparent, always-on-top).
// It renders the per-game configured widgets: FPS, CPU/GPU, clock, session
// timer, game info, quick links, notes, crosshair, etc.
//
// The overlay listens for IPC events from the main process:
//   - overlay:shown → the overlay was toggled on; load the active config
//   - overlay:configChanged → the active game changed; update the widgets
//   - overlay:clickThrough → click-through mode was toggled

import { useEffect, useState, useRef } from "react";

// Types (mirrored from the main process)
interface OverlayConfig {
  widgets: {
    fps: boolean;
    cpuGpu: boolean;
    ramVram: boolean;
    perfGraph: boolean;
    network: boolean;
    clock: boolean;
    sessionTimer: boolean;
    gameInfo: boolean;
    audioLevel: boolean;
    notes: boolean;
    crosshair: boolean;
    quickLinks: boolean;
  };
  links: Array<{ label: string; url: string; icon?: string }>;
  notes: string;
  crosshair: {
    enabled: boolean;
    style: "cross" | "dot" | "circle" | "t-cross";
    color: string;
    size: number;
    opacity: number;
    posX: number;
    posY: number;
  };
  position: { x: number; y: number; width: number; height: number };
  appearance: {
    opacity: number;
    compact: boolean;
    accentColor: string;
    showLabels: boolean;
  };
  hotkey: string;
}

interface SystemStats {
  cpu: { usage: number; temp: number | null };
  gpu: { usage: number; temp: number | null };
  ram: { totalGB: number; usedGB: number; usagePct: number };
  vram: { totalGB: number; usedGB: number; usagePct: number };
  fps: number;
  frametime: number;
  network: { downloadMbps: number; uploadMbps: number; pingMs: number | null };
  audioLevel: number;
}

interface ActiveGame {
  id: number;
  title: string;
  platform: string;
  coverImage: string | null;
  playtimeSec: number;
  launchCount: number;
}

const DEFAULT_CONFIG: OverlayConfig = {
  widgets: {
    fps: true, cpuGpu: true, ramVram: false, perfGraph: false,
    network: false, clock: true, sessionTimer: true, gameInfo: true,
    audioLevel: false, notes: false, crosshair: false, quickLinks: true,
  },
  links: [{ label: "Game Wiki", url: "https://www.google.com" }],
  notes: "",
  crosshair: { enabled: false, style: "cross", color: "#00ff00", size: 20, opacity: 80, posX: 50, posY: 50 },
  position: { x: 20, y: 20, width: 320, height: 400 },
  appearance: { opacity: 85, compact: false, accentColor: "#2dd4bf", showLabels: true },
  hotkey: "",
};

export function OverlayApp() {
  const [config, setConfig] = useState<OverlayConfig | null>(DEFAULT_CONFIG);
  const [gameId, setGameId] = useState<number | null>(null);
  const [game, setGame] = useState<ActiveGame | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [isClickThrough, setIsClickThrough] = useState(false);
  const [fpsHistory, setFpsHistory] = useState<number[]>(Array(60).fill(0));
  const sessionStartRef = useRef<number>(Date.now());

  // Listen for overlay:shown event — load the active config + game info
  useEffect(() => {
    const offShown = window.nexus.onOverlayShown?.((p: { config: unknown; gameId: number | null }) => {
      setConfig(p.config as OverlayConfig ?? DEFAULT_CONFIG);
      setGameId(p.gameId);
      sessionStartRef.current = Date.now();
      // Load the active game info
      window.nexus.overlayGetActiveGame?.().then((g: ActiveGame | null) => {
        if (g) setGame(g);
      }).catch(() => {});
    });

    const offConfig = window.nexus.onOverlayConfigChanged?.((p: { config: unknown; gameId: number | null }) => {
      setConfig(p.config as OverlayConfig ?? DEFAULT_CONFIG);
      setGameId(p.gameId);
      window.nexus.overlayGetActiveGame?.().then((g: ActiveGame | null) => {
        if (g) setGame(g);
      }).catch(() => {});
    });

    const offClick = window.nexus.onOverlayClickThrough?.((isCT: boolean) => {
      setIsClickThrough(isCT);
    });

    return () => { offShown?.(); offConfig?.(); offClick?.(); };
  }, []);

  // Poll system stats every 2 seconds
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const s = await window.nexus.overlayGetStats?.();
        if (s) {
          setStats(s);
          if (s.fps > 0) {
            setFpsHistory((prev) => [...prev.slice(1), s.fps]);
          }
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(poll);
  }, []);

  // Update session elapsed time every second
  useEffect(() => {
    const tick = setInterval(() => {
      setSessionElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // If no config, show a minimal placeholder
  if (!config) {
    return (
      <div style={overlayContainerStyle()}>
        <div style={panelStyle(80)}>
          <div style={{ color: "#2dd4bf", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
            NEXUS Overlay
          </div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
            Press Alt+O to toggle • Ctrl+Shift+X for click-through
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 8 }}>
            No game detected. Launch a game to load its overlay profile.
          </div>
        </div>
      </div>
    );
  }

  const accent = config.appearance.accentColor;
  const opacity = config.appearance.opacity / 100;
  const compact = config.appearance.compact;

  return (
    <div style={overlayContainerStyle()}>
      {/* Crosshair overlay — rendered full-screen if enabled */}
      {config.widgets.crosshair && config.crosshair.enabled && (
        <CrosshairOverlay config={config.crosshair} />
      )}

      {/* Main overlay panel */}
      <div style={panelStyle(opacity, config.appearance)}>
        {/* Header */}
        <div style={headerStyle(accent)}>
          {game && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {game.coverImage && (
                <img src={game.coverImage} alt="" style={{ width: 24, height: 32, borderRadius: 3, objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              )}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{game.title}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{game.platform}</div>
              </div>
            </div>
          )}
          {!game && <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>NEXUS Overlay</div>}
          {isClickThrough && (
            <div style={{ fontSize: 9, color: "#fbbf24", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Click-Through ON
            </div>
          )}
        </div>

        {/* Widgets grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: compact ? 4 : 8, padding: compact ? 8 : 12 }}>
          {/* FPS Counter */}
          {config.widgets.fps && (
            <Widget label="FPS" value={stats?.fps ? String(stats.fps) : "—"} accent={accent} compact={compact} />
          )}
          {/* Session Timer */}
          {config.widgets.sessionTimer && (
            <Widget label="Session" value={formatTime(sessionElapsed)} accent={accent} compact={compact} />
          )}
          {/* CPU */}
          {config.widgets.cpuGpu && (
            <Widget
              label="CPU"
              value={stats ? `${stats.cpu.usage}%` : "—"}
              subValue={stats?.cpu.temp ? `${stats.cpu.temp}°C` : undefined}
              accent={accent}
              compact={compact}
            />
          )}
          {/* GPU */}
          {config.widgets.cpuGpu && (
            <Widget
              label="GPU"
              value={stats ? `${stats.gpu.usage}%` : "—"}
              subValue={stats?.gpu.temp ? `${stats.gpu.temp}°C` : undefined}
              accent={accent}
              compact={compact}
            />
          )}
          {/* RAM */}
          {config.widgets.ramVram && (
            <Widget
              label="RAM"
              value={stats ? `${stats.ram.usedGB}/${stats.ram.totalGB}GB` : "—"}
              subValue={stats ? `${stats.ram.usagePct}%` : undefined}
              accent={accent}
              compact={compact}
            />
          )}
          {/* VRAM */}
          {config.widgets.ramVram && stats && stats.vram.totalGB > 0 && (
            <Widget
              label="VRAM"
              value={`${stats.vram.usedGB}/${stats.vram.totalGB}GB`}
              subValue={`${stats.vram.usagePct}%`}
              accent={accent}
              compact={compact}
            />
          )}
          {/* Clock */}
          {config.widgets.clock && (
            <Widget label="Time" value={new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} accent={accent} compact={compact} />
          )}
          {/* Network */}
          {config.widgets.network && (
            <Widget label="Ping" value={stats?.network?.pingMs != null ? `${stats.network.pingMs}ms` : "—"} accent={accent} compact={compact} />
          )}
        </div>

        {/* Performance graph */}
        {config.widgets.perfGraph && (
          <div style={{ padding: "0 12px 8px" }}>
            <PerfGraph history={fpsHistory} accent={accent} compact={compact} />
          </div>
        )}

        {/* Game info */}
        {config.widgets.gameInfo && game && (
          <div style={{ padding: "0 12px 8px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Total Playtime</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{formatPlaytime(game.playtimeSec)}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Launched {game.launchCount} times</div>
          </div>
        )}

        {/* Quick Links */}
        {config.widgets.quickLinks && config.links.length > 0 && (
          <div style={{ padding: "0 12px 8px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick Links</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {config.links.map((link, i) => (
                <button
                  key={i}
                  onClick={() => window.nexus.overlayOpenUrl?.(link.url.replace("{game}", encodeURIComponent(game?.title ?? "")))}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.8)",
                    fontSize: 11,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background .12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {config.widgets.notes && config.notes && (
          <div style={{ padding: "0 12px 12px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Notes</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {config.notes}
            </div>
          </div>
        )}

        {/* Footer hint */}
        <div style={footerStyle()}>
          <span>Alt+O Toggle</span>
          <span>Ctrl+Shift+X Click-Through</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Widget component
// ============================================================

function Widget({ label, value, subValue, accent, compact }: {
  label: string;
  value: string;
  subValue?: string;
  accent: string;
  compact: boolean;
}) {
  return (
    <div style={{
      padding: compact ? "6px 8px" : "8px 10px",
      borderRadius: 6,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: compact ? 14 : 16, fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
        {value}
      </div>
      {subValue && (
        <div style={{ fontSize: 10, color: accent, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
          {subValue}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Performance graph (simple canvas-like div bars)
// ============================================================

function PerfGraph({ history, accent, compact }: { history: number[]; accent: string; compact: boolean }) {
  const max = Math.max(...history, 60);
  const barWidth = 100 / history.length;

  return (
    <div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 4 }}>
        FPS History
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", height: compact ? 30 : 40, gap: 1, background: "rgba(255,255,255,0.02)", borderRadius: 4, padding: 2 }}>
        {history.map((fps, i) => (
          <div
            key={i}
            style={{
              width: `${barWidth}%`,
              height: `${(fps / max) * 100}%`,
              background: fps > 50 ? accent : fps > 30 ? "#fbbf24" : "#f87171",
              borderRadius: 1,
              opacity: 0.8,
              minHeight: 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Crosshair overlay
// ============================================================

function CrosshairOverlay({ config }: { config: OverlayConfig["crosshair"] }) {
  if (!config.enabled) return null;
  const opacity = config.opacity / 100;
  const size = config.size;

  return (
    <div style={{
      position: "fixed",
      left: `${config.posX}%`,
      top: `${config.posY}%`,
      transform: "translate(-50%, -50%)",
      pointerEvents: "none",
      zIndex: 99999,
      opacity,
    }}>
      {config.style === "cross" && (
        <svg width={size * 2} height={size * 2} viewBox={`0 0 ${size * 2} ${size * 2}`}>
          <line x1={size} y1={0} x2={size} y2={size * 0.4} stroke={config.color} strokeWidth={2} />
          <line x1={size} y1={size * 0.6} x2={size} y2={size * 2} stroke={config.color} strokeWidth={2} />
          <line x1={0} y1={size} x2={size * 0.4} y2={size} stroke={config.color} strokeWidth={2} />
          <line x1={size * 0.6} y1={size} x2={size * 2} y2={size} stroke={config.color} strokeWidth={2} />
        </svg>
      )}
      {config.style === "dot" && (
        <div style={{ width: size / 2, height: size / 2, borderRadius: "50%", background: config.color }} />
      )}
      {config.style === "circle" && (
        <div style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${config.color}` }} />
      )}
      {config.style === "t-cross" && (
        <svg width={size * 2} height={size * 2} viewBox={`0 0 ${size * 2} ${size * 2}`}>
          <line x1={size} y1={0} x2={size} y2={size * 0.4} stroke={config.color} strokeWidth={2} />
          <line x1={size} y1={size * 0.6} x2={size} y2={size * 2} stroke={config.color} strokeWidth={2} />
          <line x1={0} y1={size} x2={size * 2} y2={size} stroke={config.color} strokeWidth={2} />
        </svg>
      )}
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

function overlayContainerStyle(): React.CSSProperties {
  return {
    width: "100%",
    height: "100%",
    background: "#1a1a22",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
    userSelect: "none",
    WebkitUserSelect: "none",
    pointerEvents: "auto",
  };
}

function panelStyle(opacity: number, appearance?: OverlayConfig["appearance"]): React.CSSProperties {
  return {
    width: appearance ? undefined : 320,
    minWidth: 240,
    maxWidth: 400,
    background: `rgba(20, 20, 28, ${opacity})`,
    backdropFilter: "blur(16px) saturate(140%)",
    WebkitBackdropFilter: "blur(16px) saturate(140%)",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    overflow: "hidden",
    margin: 16,
  };
}

function headerStyle(accent: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: `linear-gradient(135deg, ${accent}15, transparent)`,
  };
}

function footerStyle(): React.CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 12px",
    fontSize: 9,
    color: "rgba(255,255,255,0.25)",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };
}

// ============================================================
// Utilities
// ============================================================

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatPlaytime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 1000) return `${(h / 1000).toFixed(1)}k hours`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
