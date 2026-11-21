// v10.0.0 — NexusForge store (zustand).
//
// Holds Forge Mode UI state (active, selection, picker, snap settings, live
// guides) and exposes layout operations that mutate the ACTIVE THEME DRAFT's
// `forge` section through useThemeStore — so every layout change flows through
// the same undo/redo + live-apply pipeline as token edits, and saves/exports
// with the theme.

import { create } from "zustand";
import type { PanelInstance, WorkspaceLayout } from "@shared/theme-types";
import { useThemeStore } from "../lib/theme-store";
import { DEFAULT_SNAP, type SnapGuides } from "./snap";

export interface PickedElement {
  selector: string;
  label: string;
  tag: string;
  vars: Array<{ name: string; value: string }>;
}

interface ForgeStore {
  // Mode
  active: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;

  // Which workspace the user is looking at (Shell sets this on view change).
  workspace: string | null;
  setWorkspace: (id: string) => void;

  // Selected panel (id) within the active workspace.
  selection: string | null;
  select: (id: string | null) => void;

  // Element picker (the "inspect any pixel" crosshair mode).
  pickMode: boolean;
  setPickMode: (v: boolean) => void;
  picked: PickedElement | null;
  setPicked: (el: PickedElement | null) => void;

  // Snap settings (persisted per session in localStorage).
  snapEnabled: boolean;
  grid: number;
  showGrid: boolean;
  setSnapEnabled: (v: boolean) => void;
  setGrid: (g: number) => void;
  setShowGrid: (v: boolean) => void;

  // Live guides published by the interaction layer during drag/resize.
  guides: SnapGuides;
  setGuides: (g: SnapGuides) => void;

  // ── Layout ops (all go through the theme draft → undo/redo + live apply) ──
  unlockWorkspace: (id: string, panels: PanelInstance[]) => void;
  resetWorkspace: (id: string) => void;
  setPanel: (wsId: string, panelId: string, patch: Partial<PanelInstance>) => void;
  setPanelToken: (panelId: string, prop: string, value: string | null) => void;
  bringToFront: (wsId: string, panelId: string) => void;
  hidePanel: (wsId: string, panelId: string, hidden: boolean) => void;
  setWorkspaceGrid: (wsId: string, grid: number) => void;
  addElementOverride: (selector: string, label: string, prop: string, value: string) => void;
  removeElementOverride: (id: string) => void;
  setOverrideProp: (id: string, prop: string, value: string | null) => void;
}

const LS_KEY = "nx-forge-prefs";

function loadPrefs(): { snapEnabled: boolean; grid: number; showGrid: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    return {
      snapEnabled: typeof raw.snapEnabled === "boolean" ? raw.snapEnabled : DEFAULT_SNAP.enabled,
      grid: [4, 8, 16, 32].includes(raw.grid) ? raw.grid : 16,
      showGrid: !!raw.showGrid,
    };
  } catch {
    return { snapEnabled: DEFAULT_SNAP.enabled, grid: 16, showGrid: false };
  }
}

function savePrefs(s: { snapEnabled: boolean; grid: number; showGrid: boolean }) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Read the layout for a workspace from the current theme draft. */
export function getWorkspaceLayout(wsId: string): WorkspaceLayout | null {
  const draft = useThemeStore.getState().draft;
  return draft.forge?.workspaces?.[wsId] ?? null;
}

/** Read per-panel token overrides from the current theme draft. */
export function getPanelTokens(panelId: string): Record<string, string> {
  const draft = useThemeStore.getState().draft;
  return draft.forge?.panelTokens?.[panelId] ?? {};
}

export const useForgeStore = create<ForgeStore>((set, get) => ({
  active: false,
  enter: () => set({ active: true }),
  exit: () => set({ active: false, selection: null, pickMode: false, picked: null, guides: { x: [], y: [] } }),
  toggle: () => (get().active ? get().exit() : get().enter()),

  workspace: null,
  setWorkspace: (id) => { if (get().workspace !== id) set({ workspace: id, selection: null, guides: { x: [], y: [] } }); },

  selection: null,
  select: (id) => set({ selection: id }),

  pickMode: false,
  setPickMode: (v) => set({ pickMode: v, picked: v ? null : get().picked }),
  picked: null,
  setPicked: (el) => set({ picked: el }),

  ...loadPrefs(),
  setSnapEnabled: (v) => { const s = { snapEnabled: v, grid: get().grid, showGrid: get().showGrid }; set({ snapEnabled: v }); savePrefs(s); },
  setGrid: (g) => { const s = { snapEnabled: get().snapEnabled, grid: g, showGrid: get().showGrid }; set({ grid: g }); savePrefs(s); },
  setShowGrid: (v) => { const s = { snapEnabled: get().snapEnabled, grid: get().grid, showGrid: v }; set({ showGrid: v }); savePrefs(s); },

  guides: { x: [], y: [] },
  setGuides: (g) => set({ guides: g }),

  // ─────────────────────────────────────────────────────────────────────────
  unlockWorkspace: (id, panels) => {
    useThemeStore.getState().setDraft((d) => {
      if (!d.forge) d.forge = { workspaces: {}, elementOverrides: [], panelTokens: {} };
      d.forge.workspaces[id] = { mode: "free", grid: get().grid, panels };
    });
  },

  resetWorkspace: (id) => {
    useThemeStore.getState().setDraft((d) => {
      if (!d.forge) return;
      delete d.forge.workspaces[id];
    });
    set({ selection: null });
  },

  setPanel: (wsId, panelId, patch) => {
    useThemeStore.getState().setDraft((d) => {
      const ws = d.forge?.workspaces?.[wsId];
      if (!ws) return;
      const p = ws.panels.find((x) => x.id === panelId);
      if (!p) return;
      Object.assign(p, patch);
    });
  },

  setPanelToken: (panelId, prop, value) => {
    useThemeStore.getState().setDraft((d) => {
      if (!d.forge) d.forge = { workspaces: {}, elementOverrides: [], panelTokens: {} };
      const tokens = d.forge.panelTokens[panelId] ?? {};
      if (value === null || value === "") delete tokens[prop];
      else tokens[prop] = value;
      if (Object.keys(tokens).length === 0) delete d.forge.panelTokens[panelId];
      else d.forge.panelTokens[panelId] = tokens;
    });
  },

  bringToFront: (wsId, panelId) => {
    useThemeStore.getState().setDraft((d) => {
      const ws = d.forge?.workspaces?.[wsId];
      if (!ws) return;
      const maxZ = Math.max(0, ...ws.panels.map((p) => p.z));
      const p = ws.panels.find((x) => x.id === panelId);
      if (p && p.z < maxZ) p.z = maxZ + 1;
    });
  },

  hidePanel: (wsId, panelId, hidden) => {
    get().setPanel(wsId, panelId, { hidden });
    if (hidden && get().selection === panelId) set({ selection: null });
  },

  setWorkspaceGrid: (wsId, grid) => {
    useThemeStore.getState().setDraft((d) => {
      const ws = d.forge?.workspaces?.[wsId];
      if (ws) ws.grid = grid;
    });
  },

  addElementOverride: (selector, label, prop, value) => {
    useThemeStore.getState().setDraft((d) => {
      if (!d.forge) d.forge = { workspaces: {}, elementOverrides: [], panelTokens: {} };
      const existing = d.forge.elementOverrides.find((o) => o.selector === selector);
      if (existing) {
        existing.props[prop] = value;
      } else {
        d.forge.elementOverrides.push({
          id: `ovr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          selector,
          label,
          props: { [prop]: value },
        });
      }
    });
  },

  removeElementOverride: (id) => {
    useThemeStore.getState().setDraft((d) => {
      if (!d.forge) return;
      d.forge.elementOverrides = d.forge.elementOverrides.filter((o) => o.id !== id);
    });
  },

  setOverrideProp: (id, prop, value) => {
    useThemeStore.getState().setDraft((d) => {
      const o = d.forge?.elementOverrides?.find((x) => x.id === id);
      if (!o) return;
      if (value === null || value === "") delete o.props[prop];
      else o.props[prop] = value;
    });
  },
}));
