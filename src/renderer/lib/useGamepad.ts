import { useEffect, useRef, useState, useCallback } from "react";

// Standard gamepad button mapping (Xbox controller layout; works with most).
// The Gamepad API exposes buttons by index:
//   0: A (confirm), 1: B (back), 2: X, 3: Y,
//   4: LB, 5: RB, 6: LT, 7: RT,
//   8: Back/Share, 9: Start/Menu,
//   12: D-pad up, 13: D-pad down, 14: D-pad left, 15: D-pad right,
//   16: Xbox/PS button
//
// Axes: 0 = left stick X, 1 = left stick Y, 2 = right stick X, 3 = right stick Y.

export type GamepadAction =
  | "left"      // D-pad left / left stick left
  | "right"     // D-pad right / left stick right
  | "up"        // D-pad up / left stick up
  | "down"      // D-pad down / left stick down
  | "confirm"   // A / Cross
  | "back"      // B / Circle
  | "play"      // X / Square
  | "details"   // Y / Triangle
  | "menu"      // Start / Menu
  | "scan";     // Back/Share

export interface ControllerState {
  connected: boolean;
  lastIndex: number; // index of the most-recently-pressed action (for focus rings)
}

const DEADZONE = 0.5; // stick threshold

interface Callbacks {
  onAction: (action: GamepadAction) => void;
}

/**
 * useGamepadController — polls the Web Gamepad API on a rAF loop and fires
 * callbacks for D-pad / stick navigation and face buttons.
 *
 * Returns { connected, lastIndex } so the UI can render a "controller
 * connected" indicator and show gamepad focus rings (vs mouse hover).
 */
export function useGamepadController({ onAction }: Callbacks): ControllerState {
  const [connected, setConnected] = useState(false);
  const [lastIndex, setLastIndex] = useState(0);
  const rafRef = useRef<number | null>(null);
  // Track previous button/axis state so we only fire on edge transitions
  // (not on every frame while held).
  const prevState = useRef<{
    buttons: boolean[];
    axes: number[];
  }>({ buttons: [], axes: [] });
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const fire = useCallback((action: GamepadAction) => {
    setLastIndex((i) => i + 1);
    onActionRef.current(action);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const onConnect = (e: GamepadEvent) => {
      if (e.gamepad) {
        setConnected(true);
        // Start polling if not already running.
        startPolling();
      }
    };
    const onDisconnect = (e: GamepadEvent) => {
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

        // D-pad (buttons 12-15)
        if (buttons[12] && !prev.buttons[12]) fire("up");
        if (buttons[13] && !prev.buttons[13]) fire("down");
        if (buttons[14] && !prev.buttons[14]) fire("left");
        if (buttons[15] && !prev.buttons[15]) fire("right");

        // Left stick (axes 0,1) — with deadzone + edge detection
        const lx = axes[0] ?? 0;
        const ly = axes[1] ?? 0;
        const plx = prev.axes[0] ?? 0;
        const ply = prev.axes[1] ?? 0;
        if (lx < -DEADZONE && plx >= -DEADZONE) fire("left");
        if (lx > DEADZONE && plx <= DEADZONE) fire("right");
        if (ly < -DEADZONE && ply >= -DEADZONE) fire("up");
        if (ly > DEADZONE && ply <= DEADZONE) fire("down");

        // Face buttons
        if (buttons[0] && !prev.buttons[0]) fire("confirm");   // A
        if (buttons[1] && !prev.buttons[1]) fire("back");     // B
        if (buttons[2] && !prev.buttons[2]) fire("play");      // X
        if (buttons[3] && !prev.buttons[3]) fire("details");   // Y
        if (buttons[9] && !prev.buttons[9]) fire("menu");      // Start/Menu
        if (buttons[8] && !prev.buttons[8]) fire("scan");      // Back/Share

        prevState.current = { buttons, axes };
      }
      rafRef.current = requestAnimationFrame(poll);
    };

    const startPolling = () => {
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(poll);
      }
    };

    // Some browsers require a button press before exposing the gamepad.
    // Listen for the connect event AND start polling immediately (the poll
    // loop re-checks navigator.getGamepads() every frame).
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

  return { connected, lastIndex };
}
