// v4.4.0 — ThemeStore (Zustand). Holds the active theme, the editor draft,
// undo/redo stacks, and the saved-themes list. Every draft mutation applies
// the draft to :root via applyTheme() so the live preview (and the real
// launcher behind the editor) re-themes instantly. Commits persist to the DB.
//
// Undo/redo is implemented as past[] / future[] snapshots of the draft
// (deep-cloned). Each `setDraft` call pushes the PREVIOUS draft onto past
// and clears future.

import { create } from "zustand";
import { DEFAULT_THEME, validateTheme, type ThemeConfig, type SavedTheme } from "@shared/theme-types";
import { applyTheme } from "./applyTheme";

const MAX_UNDO = 100;

function clone(c: ThemeConfig): ThemeConfig {
  return JSON.parse(JSON.stringify(c));
}

interface ThemeStore {
  themes: SavedTheme[];
  activeId: number;
  draft: ThemeConfig;
  past: ThemeConfig[];
  future: ThemeConfig[];
  selectedLayer: string;
  dirty: boolean;

  load: () => Promise<void>;
  selectTheme: (id: number) => Promise<void>;
  setDraft: (updater: (d: ThemeConfig) => void) => void;
  replaceDraft: (next: ThemeConfig) => void;
  undo: () => void;
  redo: () => void;
  revert: () => Promise<void>;
  reset: () => void;
  commit: () => Promise<void>;
  saveAs: (name: string) => Promise<void>;
  deleteTheme: (id: number) => Promise<void>;
  duplicateTheme: (id: number) => Promise<void>;
  setSelectedLayer: (layer: string) => void;
  applyActive: () => Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  themes: [],
  activeId: 0,
  draft: clone(DEFAULT_THEME),
  past: [],
  future: [],
  selectedLayer: "card",
  dirty: false,

  load: async () => {
    try {
      const themes: SavedTheme[] = await window.nexus.listThemes();
      const activeId = Number(localStorage.getItem("nx-active-theme") || "0");
      const active = themes.find((t: SavedTheme) => t.id === activeId) ?? themes[0] ?? null;
      const draft = active ? clone(active.config) : clone(DEFAULT_THEME);
      set({ themes, activeId: active?.id ?? 0, draft, past: [], future: [], dirty: false });
      applyTheme(draft);
    } catch {
      applyTheme(DEFAULT_THEME);
    }
  },

  selectTheme: async (id) => {
    const t = get().themes.find((x: SavedTheme) => x.id === id);
    if (!t) return;
    const draft = clone(t.config);
    set({ draft, past: [], future: [], selectedLayer: get().selectedLayer, dirty: false });
    applyTheme(draft);
  },

  setDraft: (updater) => {
    const prev = get().draft;
    const next = clone(prev);
    try { updater(next); } catch { return; }
    const past = [...get().past, clone(prev)].slice(-MAX_UNDO);
    set({ draft: next, past, future: [], dirty: true });
    applyTheme(next);
  },

  replaceDraft: (next) => {
    const prev = get().draft;
    const past = [...get().past, clone(prev)].slice(-MAX_UNDO);
    set({ draft: clone(next), past, future: [], dirty: true });
    applyTheme(next);
  },

  undo: () => {
    const { past, draft, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    const newPast = past.slice(0, -1);
    const newFuture = [clone(draft), ...future].slice(0, MAX_UNDO);
    set({ draft: prev, past: newPast, future: newFuture, dirty: newPast.length > 0 || true });
    applyTheme(prev);
  },

  redo: () => {
    const { past, draft, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    const newPast = [...past, clone(draft)].slice(-MAX_UNDO);
    set({ draft: next, past: newPast, future: newFuture, dirty: true });
    applyTheme(next);
  },

  revert: async () => {
    await get().selectTheme(get().activeId || get().themes[0]?.id || 0);
  },

  reset: () => {
    get().replaceDraft(clone(DEFAULT_THEME));
  },

  commit: async () => {
    const { draft, activeId, themes } = get();
    const active = themes.find((t: SavedTheme) => t.id === activeId);
    if (active && !active.builtin) {
      // update the existing editable personal theme
      await window.nexus.updateTheme(active.id, { config: draft });
    } else {
      // active is a builtin or none — create a new personal theme from the draft
      const name = `${draft.name} (Custom)`;
      const created: SavedTheme = await window.nexus.createTheme(name, clone(draft));
      localStorage.setItem("nx-active-theme", String(created.id));
      set({ activeId: created.id });
    }
    // persist active id + refresh the list
    localStorage.setItem("nx-active-theme", String(get().activeId));
    try { await window.nexus.setSettings({ activeThemeId: get().activeId }); } catch { /* ignore */ }
    const fresh: SavedTheme[] = await window.nexus.listThemes();
    set({ themes: fresh, dirty: false, past: [], future: [] });
    applyTheme(draft);
  },

  saveAs: async (name) => {
    const { draft } = get();
    const created: SavedTheme = await window.nexus.createTheme(name, clone({ ...draft, name }));
    localStorage.setItem("nx-active-theme", String(created.id));
    try { await window.nexus.setSettings({ activeThemeId: created.id }); } catch { /* ignore */ }
    const fresh: SavedTheme[] = await window.nexus.listThemes();
    set({ themes: fresh, activeId: created.id, dirty: false, past: [], future: [] });
    applyTheme(draft);
  },

  deleteTheme: async (id) => {
    await window.nexus.deleteTheme(id);
    const fresh: SavedTheme[] = await window.nexus.listThemes();
    set({ themes: fresh });
    // if we deleted the active, fall back to the first builtin
    if (get().activeId === id) {
      const fallback = fresh.find((t: SavedTheme) => t.builtin) ?? fresh[0] ?? null;
      if (fallback) {
        localStorage.setItem("nx-active-theme", String(fallback.id));
        set({ activeId: fallback.id, draft: clone(fallback.config), dirty: false, past: [], future: [] });
        applyTheme(fallback.config);
      }
    }
  },

  duplicateTheme: async (id) => {
    const src = get().themes.find((t) => t.id === id);
    if (!src) return;
    const created: SavedTheme | null = await window.nexus.duplicateTheme(id, `${src.name} (Copy)`);
    const fresh: SavedTheme[] = await window.nexus.listThemes();
    set({ themes: fresh });
    if (created) {
      localStorage.setItem("nx-active-theme", String(created.id));
      set({ activeId: created.id, draft: clone(created.config), dirty: false, past: [], future: [] });
      applyTheme(created.config);
    }
  },

  setSelectedLayer: (layer) => set({ selectedLayer: layer }),

  applyActive: async () => {
    const { activeId, themes } = get();
    const t = themes.find((x: SavedTheme) => x.id === activeId) ?? themes[0] ?? null;
    if (t) { set({ draft: clone(t.config), past: [], future: [], dirty: false }); applyTheme(t.config); }
  },
}));

// Helper for the inspector: update a single nested field on the draft.
export function setDraftField<K extends keyof ThemeConfig>(
  key: K,
  updater: (section: ThemeConfig[K]) => void
): void {
  useThemeStore.getState().setDraft((d) => { updater(d[key]); });
}
