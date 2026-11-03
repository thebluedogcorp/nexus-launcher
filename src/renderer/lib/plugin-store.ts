// v4.9.0 — Plugin extension registry (Zustand). Tracks ALL registered UI
// extensions from enabled plugins: pages, sidebar items, game-card actions,
// topbar actions, status indicators, command-palette commands, settings
// panels, and the active plugin page/dialog state. The App renders from
// this store — when a plugin registers an extension, the store updates
// and React re-renders.

import { create } from "zustand";
import type {
  PageExtension,
  SidebarItemExtension,
  GameCardActionExtension,
  TopbarActionExtension,
  StatusIndicatorExtension,
  CommandExtension,
  SettingsPanelExtension,
} from "@shared/plugin-types";

interface PluginExtensionState {
  pages: PageExtension[];
  sidebarItems: SidebarItemExtension[];
  gameCardActions: GameCardActionExtension[];
  topbarActions: TopbarActionExtension[];
  statusIndicators: StatusIndicatorExtension[];
  commands: CommandExtension[];
  settingsPanels: SettingsPanelExtension[];
  activePluginPage: string | null;     // the currently-open plugin page ID
  addPage: (ext: PageExtension) => void;
  addSidebarItem: (ext: SidebarItemExtension) => void;
  addGameCardAction: (ext: GameCardActionExtension) => void;
  addTopbarAction: (ext: TopbarActionExtension) => void;
  addStatusIndicator: (ext: StatusIndicatorExtension) => void;
  addCommand: (ext: CommandExtension) => void;
  addSettingsPanel: (ext: SettingsPanelExtension) => void;
  removeByPlugin: (pluginId: string) => void;
  setActivePluginPage: (pageId: string | null) => void;
  clear: () => void;
}

export const usePluginExtensions = create<PluginExtensionState>((set) => ({
  pages: [],
  sidebarItems: [],
  gameCardActions: [],
  topbarActions: [],
  statusIndicators: [],
  commands: [],
  settingsPanels: [],
  activePluginPage: null,
  addPage: (ext) => set((s) => ({ pages: [...s.pages.filter(p => p.id !== ext.id), ext] })),
  addSidebarItem: (ext) => set((s) => ({ sidebarItems: [...s.sidebarItems.filter(i => i.id !== ext.id), ext] })),
  addGameCardAction: (ext) => set((s) => ({ gameCardActions: [...s.gameCardActions.filter(a => a.id !== ext.id), ext] })),
  addTopbarAction: (ext) => set((s) => ({ topbarActions: [...s.topbarActions.filter(a => a.id !== ext.id), ext] })),
  addStatusIndicator: (ext) => set((s) => ({ statusIndicators: [...s.statusIndicators.filter(i => i.id !== ext.id), ext] })),
  addCommand: (ext) => set((s) => ({ commands: [...s.commands.filter(c => c.id !== ext.id), ext] })),
  addSettingsPanel: (ext) => set((s) => ({ settingsPanels: [...s.settingsPanels.filter(p => p.id !== ext.id), ext] })),
  removeByPlugin: (pluginId) => set((s) => ({
    pages: s.pages.filter(p => p.pluginId !== pluginId),
    sidebarItems: s.sidebarItems.filter(i => i.pluginId !== pluginId),
    gameCardActions: s.gameCardActions.filter(a => a.pluginId !== pluginId),
    topbarActions: s.topbarActions.filter(a => a.pluginId !== pluginId),
    statusIndicators: s.statusIndicators.filter(i => i.pluginId !== pluginId),
    commands: s.commands.filter(c => c.pluginId !== pluginId),
    settingsPanels: s.settingsPanels.filter(p => p.pluginId !== pluginId),
  })),
  setActivePluginPage: (pageId) => set({ activePluginPage: pageId }),
  clear: () => set({
    pages: [],
    sidebarItems: [],
    gameCardActions: [],
    topbarActions: [],
    statusIndicators: [],
    commands: [],
    settingsPanels: [],
    activePluginPage: null,
  }),
}));
