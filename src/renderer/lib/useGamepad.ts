import { useEffect, useRef, useState, useCallback } from "react";

export type GamepadAction =
  | "left"
  | "right"
  | "up"
  | "down"
  | "confirm"
  | "back"
  | "play"
  | "details"
  | "menu"
  | "scan";

export interface ControllerState {
  connected: boolean;
}

const DEADZONE = 0.45;      // must exceed this to start navigation
const RELEASE_ZONE = 0.2;   // must drop below this to release (hysteresis)
const REPEAT_DELAY = 250;   // ms between continuous navigations when stick is held

interface Callbacks {
  onAction: (action: GamepadAction) => void;
}

/**
 * useGamepadController — polls the Web Gamepad API on a rAF loop.
 *
 * Features:
 * - D-pad: edge-triggered (fires once per press)
 * - Analog stick: CONTINUOUS — hold the stick and navigation repeats every
 *   REPEAT_DELAY ms until the stick is released. This gives the console-like
 *   feel where holding right scrolls through cards continuously.
 * - Face buttons (A/B/X/Y): edge-triggered
 * - Start/Back: edge-triggered
 */
export function useGamepadController({ onAction }: Callbacks): ControllerState {
  const [connected, setConnected] = useState(false);
  const rafRef = useRef<number | null>(null);
  const prevState = useRef<{ buttons: boolean[]; axes: number[] }>({ buttons: [], axes: [] });
  // For continuous analog navigation:
  const stickRepeatRef = useRef<{ dir: string | null; lastFire: number }>({ dir: null, lastFire: 0 });
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const fire = useCallback((action: GamepadAction) => {
    onActionRef.current(action);
    // Haptic feedback — dual rumble on supported controllers
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((g) => g?.connected);
    if (pad) {
      try {
        const actuator = pad.vibrationActuator as { playEffect?: (type: string, params: { duration: number; weakMagnitude: number; strongMagnitude: number }) => Promise<unknown> } | undefined;
        if (actuator?.playEffect) {
          const strong = action === "confirm" || action === "play" || action === "back";
          actuator.playEffect("dual-rumble", {
            duration: strong ? 120 : 50,
            weakMagnitude: strong ? 0.5 : 0.2,
            strongMagnitude: strong ? 0.7 : 0.25,
          }).catch(() => {});
        }
      } catch { /* haptics not supported */ }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const onConnect = () => { setConnected(true); startPolling(); };
    const onDisconnect = () => {
      const remaining = navigator.getGamepads?.().filter((g) => g && g.connected);
      if (!remaining || remaining.length === 0) setConnected(false);
    };

    const poll = () => {
      if (cancelled) return;
      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads.find((g) => g && g.connected);
      if (pad) {
        const buttons = pad.buttons.map((b) => b.pressed);
        const axes = pad.axes.slice(0, 4);
        const prev = prevState.current;
        const now = performance.now();

        // --- D-pad (edge-triggered) ---
        if (buttons[12] && !prev.buttons[12]) fire("up");
        if (buttons[13] && !prev.buttons[13]) fire("down");
        if (buttons[14] && !prev.buttons[14]) fire("left");
        if (buttons[15] && !prev.buttons[15]) fire("right");

        // --- Face buttons (edge-triggered) ---
        if (buttons[0] && !prev.buttons[0]) fire("confirm");
        if (buttons[1] && !prev.buttons[1]) fire("back");
        if (buttons[2] && !prev.buttons[2]) fire("play");
        if (buttons[3] && !prev.buttons[3]) fire("details");
        if (buttons[9] && !prev.buttons[9]) fire("menu");
        if (buttons[8] && !prev.buttons[8]) fire("scan");

        // --- Analog stick (CONTINUOUS, horizontal/vertical only) ---
        // The stick only fires LEFT/RIGHT for continuous horizontal navigation.
        // Vertical (up/down) is D-pad ONLY — this prevents accidental zone
        // switching when the user is just trying to scroll horizontally.
        const lx = axes[0] ?? 0;
        const sr = stickRepeatRef.current;
        let currentDir: "left" | "right" | null = null;

        if (sr.dir) {
          // Currently navigating — release if horizontal magnitude drops
          if (Math.abs(lx) < RELEASE_ZONE) {
            currentDir = null;
          } else {
            currentDir = lx < 0 ? "left" : "right";
          }
        } else {
          // Not navigating — start if beyond DEADZONE
          if (lx < -DEADZONE) currentDir = "left";
          else if (lx > DEADZONE) currentDir = "right";
        }

        if (currentDir) {
          if (sr.dir !== currentDir) {
            sr.dir = currentDir;
            sr.lastFire = now;
            fire(currentDir);
          } else if (now - sr.lastFire >= REPEAT_DELAY) {
            // Same direction held — fire again (continuous).
            sr.lastFire = now;
            fire(currentDir);
          }
        } else {
          // Stick released (below RELEASE_ZONE).
          stickRepeatRef.current.dir = null;
        }

        prevState.current = { buttons, axes };
      }
      rafRef.current = requestAnimationFrame(poll);
    };

    const startPolling = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(poll);
    };

    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    startPolling();

    return () => {
      cancelled = true;
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [fire]);

  return { connected };
}
