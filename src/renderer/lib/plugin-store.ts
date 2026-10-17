// v4.7.0 — Plugin extension registry (Zustand). Tracks all registered UI
// extensions (pages, sidebar items, game-card actions) from enabled plugins.
// The App renders from this store — when a plugin registers an extension,
// the store updates and React re-renders.

import { create } from "zustand";
import type { PageExtension, SidebarItemExtension, GameCardActionExtension } from "@shared/plugin-types";

interface PluginExtensionState {
  pages: PageExtension[];
  sidebarItems: SidebarItemExtension[];
  gameCardActions: GameCardActionExtension[];
  activePluginPage: string | null;     // the currently-open plugin page ID
  addPage: (ext: PageExtension) => void;
  addSidebarItem: (ext: SidebarItemExtension) => void;
  addGameCardAction: (ext: GameCardActionExtension) => void;
  removeByPlugin: (pluginId: string) => void;
  setActivePluginPage: (pageId: string | null) => void;
  clear: () => void;
}

export const usePluginExtensions = create<PluginExtensionState>((set) => ({
  pages: [],
  sidebarItems: [],
  gameCardActions: [],
  activePluginPage: null,
  addPage: (ext) => set((s) => ({ pages: [...s.pages.filter(p => p.id !== ext.id), ext] })),
  addSidebarItem: (ext) => set((s) => ({ sidebarItems: [...s.sidebarItems.filter(i => i.id !== ext.id), ext] })),
  addGameCardAction: (ext) => set((s) => ({ gameCardActions: [...s.gameCardActions.filter(a => a.id !== ext.id), ext] })),
  removeByPlugin: (pluginId) => set((s) => ({
    pages: s.pages.filter(p => p.pluginId !== pluginId),
    sidebarItems: s.sidebarItems.filter(i => i.pluginId !== pluginId),
    gameCardActions: s.gameCardActions.filter(a => a.pluginId !== pluginId),
  })),
  setActivePluginPage: (pageId) => set({ activePluginPage: pageId }),
  clear: () => set({ pages: [], sidebarItems: [], gameCardActions: [], activePluginPage: null }),
}));
