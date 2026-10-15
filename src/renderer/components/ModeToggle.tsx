// v4.2.0 — Segmented Console ↔ Desktop layout switch.
// Extracted into its own component so TypeScript does NOT narrow `uiMode`
// inside each render branch (which made the per-button `active` comparison
// a dead-code error). Also dedupes the two topbar copies.
import { Icon } from "./Icons";

type Mode = "console" | "desktop";

interface Props {
  current: Mode;
  onSwitch: (mode: Mode) => void;
}

export function ModeToggle({ current, onSwitch }: Props) {
  return (
    <div
      className="mode-toggle"
      title="Switch launcher layout"
      role="tablist"
      aria-label="Launcher layout"
    >
      <button
        className={current === "console" ? "mode-toggle-btn active" : "mode-toggle-btn"}
        onClick={() => onSwitch("console")}
        role="tab"
        aria-selected={current === "console"}
        title="Console layout (carousel)"
      >
        <Icon.Gamepad size={14} /> <span>Console</span>
      </button>
      <button
        className={current === "desktop" ? "mode-toggle-btn active" : "mode-toggle-btn"}
        onClick={() => onSwitch("desktop")}
        role="tab"
        aria-selected={current === "desktop"}
        title="Desktop layout (grid)"
      >
        <Icon.Grid size={14} /> <span>Desktop</span>
      </button>
    </div>
  );
}
