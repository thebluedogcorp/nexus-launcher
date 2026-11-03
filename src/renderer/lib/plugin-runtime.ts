// v4.9.0 — Plugin runtime. Loads enabled plugins, creates their HostAPI,
// calls their entry functions, and manages their lifecycle (cleanup on
// disable/unload). Plugins are loaded via Blob import (read the JS file
// content from the main process → create a Blob URL → dynamic import()).
//
// The HostAPI exposes a broad surface in v4.9.0:
//  - ui.registerPage / registerSidebarItem / registerGameCardAction (v1)
//  - ui.registerTopbarAction / registerStatusIndicator / registerCommand /
//    registerSettingsPanel (v4.9.0)
//  - ui.toast / openDialog / closeDialog (host renders, plugin requests)
//  - ui.icon(name, size) — returns inline SVG for innerHTML composition
//  - network.fetch / clipboard / system.openExternal / showItemInFolder

import type { PluginManifest, HostAPI, PluginCleanup, PageExtension, SidebarItemExtension, GameCardActionExtension, TopbarActionExtension, StatusIndicatorExtension, CommandExtension, SettingsPanelExtension, ToastRequest, DialogRequest } from "@shared/plugin-types";
import { usePluginExtensions } from "./plugin-store";
import { renderPluginIconSVG } from "../components/PluginIcon";
import type { Game } from "@shared/types";

// Track active plugin cleanups (pluginId → cleanup function).
const cleanups = new Map<string, (() => void) | undefined>();

// Simple event emitter for the host events API.
const eventHandlers = new Map<string, Set<(data: unknown) => void>>();
function emitEvent(event: string, data: unknown): void {
  const handlers = eventHandlers.get(event);
  if (handlers) handlers.forEach((h) => { try { h(data); } catch { /* ignore */ } });
}

// Track which plugin opened which dialog so closeDialog can target it.
let activeDialogPluginId: string | null = null;

/** Create the HostAPI for a specific plugin. */
function createHostAPI(manifest: PluginManifest): HostAPI {
  const pluginId = manifest.id;
  const perms = new Set(manifest.permissions);
  const has = (p: string) => perms.has(p as never);

  return {
    plugin: { id: pluginId, manifest },

    ui: {
      registerPage: (ext) => {
        if (!has("ui:pages")) { console.error(`[plugin:${pluginId}] permission denied: ui:pages`); return; }
        const full: PageExtension = { ...ext, pluginId };
        usePluginExtensions.getState().addPage(full);
        console.log(`[plugin:${pluginId}] registered page: ${ext.id}`);
      },
      registerSidebarItem: (ext) => {
        if (!has("ui:sidebar")) { console.error(`[plugin:${pluginId}] permission denied: ui:sidebar`); return; }
        const full: SidebarItemExtension = { ...ext, pluginId };
        usePluginExtensions.getState().addSidebarItem(full);
        console.log(`[plugin:${pluginId}] registered sidebar item: ${ext.id}`);
      },
      registerGameCardAction: (ext) => {
        if (!has("ui:gamecard")) { console.error(`[plugin:${pluginId}] permission denied: ui:gamecard`); return; }
        const full: GameCardActionExtension = { ...ext, pluginId };
        usePluginExtensions.getState().addGameCardAction(full);
        console.log(`[plugin:${pluginId}] registered game-card action: ${ext.id}`);
      },

      registerTopbarAction: (ext) => {
        if (!has("ui:topbar")) { console.error(`[plugin:${pluginId}] permission denied: ui:topbar`); return; }
        const full: TopbarActionExtension = { ...ext, pluginId };
        usePluginExtensions.getState().addTopbarAction(full);
        console.log(`[plugin:${pluginId}] registered topbar action: ${ext.id}`);
      },
      registerStatusIndicator: (ext) => {
        if (!has("ui:statusbar")) { console.error(`[plugin:${pluginId}] permission denied: ui:statusbar`); return; }
        const full: StatusIndicatorExtension = { ...ext, pluginId };
        usePluginExtensions.getState().addStatusIndicator(full);
        console.log(`[plugin:${pluginId}] registered status indicator: ${ext.id}`);
      },
      registerCommand: (ext) => {
        if (!has("ui:commands")) { console.error(`[plugin:${pluginId}] permission denied: ui:commands`); return; }
        const full: CommandExtension = { ...ext, pluginId };
        usePluginExtensions.getState().addCommand(full);
        console.log(`[plugin:${pluginId}] registered command: ${ext.id}`);
      },
      registerSettingsPanel: (ext) => {
        if (!has("ui:settings")) { console.error(`[plugin:${pluginId}] permission denied: ui:settings`); return; }
        const full: SettingsPanelExtension = { ...ext, pluginId };
        usePluginExtensions.getState().addSettingsPanel(full);
        console.log(`[plugin:${pluginId}] registered settings panel: ${ext.id}`);
      },

      toast: (req: ToastRequest) => {
        if (!has("ui:toasts")) { console.error(`[plugin:${pluginId}] permission denied: ui:toasts`); return; }
        // Dispatch to the host (App.tsx listens for this event).
        window.dispatchEvent(new CustomEvent("nexus:pluginToast", { detail: { ...req, pluginId } }));
      },
      openDialog: (req: DialogRequest) => {
        if (!has("ui:dialogs")) { console.error(`[plugin:${pluginId}] permission denied: ui:dialogs`); return; }
        activeDialogPluginId = pluginId;
        window.dispatchEvent(new CustomEvent("nexus:pluginDialog", { detail: { ...req, pluginId } }));
      },
      closeDialog: () => {
        if (activeDialogPluginId === pluginId) {
          window.dispatchEvent(new CustomEvent("nexus:pluginCloseDialog"));
          activeDialogPluginId = null;
        }
      },

      icon: (name: string, size = 18) => renderPluginIconSVG(name, size),
    },

    games: {
      list: async () => {
        if (!has("games:read")) { console.error(`[plugin:${pluginId}] permission denied: games:read`); return []; }
        return await window.nexus.listGames({}) as Game[];
      },
      get: async (id: number) => {
        if (!has("games:read")) return null;
        return await window.nexus.getGame(id);
      },
    },

    storage: {
      get: async <T = unknown>(key: string) => {
        if (!has("storage")) { console.error(`[plugin:${pluginId}] permission denied: storage`); return null; }
        return await window.nexus.pluginsStorageGet(pluginId, key) as T | null;
      },
      set: async (key: string, value: unknown) => {
        if (!has("storage")) { console.error(`[plugin:${pluginId}] permission denied: storage`); return; }
        await window.nexus.pluginsStorageSet(pluginId, key, value);
      },
    },

    events: {
      on: (event: string, handler: (data: unknown) => void) => {
        if (!has("events")) { console.error(`[plugin:${pluginId}] permission denied: events`); return () => {}; }
        if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
        eventHandlers.get(event)!.add(handler);
        return () => { eventHandlers.get(event)?.delete(handler); };
      },
      emit: (event: string, data?: unknown) => {
        if (!has("events")) { console.error(`[plugin:${pluginId}] permission denied: events`); return; }
        emitEvent(event, data);
      },
    },

    log: {
      info: (msg: string) => console.log(`[plugin:${pluginId}] ${msg}`),
      error: (msg: string) => console.error(`[plugin:${pluginId}] ${msg}`),
    },

    theme: {
      setCSSVar: (name: string, value: string) => {
        if (!has("theme")) { console.error(`[plugin:${pluginId}] permission denied: theme`); return; }
        document.documentElement.style.setProperty(name, value);
      },
      getCSSVar: (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    },

    network: {
      fetch: async (url, opts) => {
        if (!has("network")) { console.error(`[plugin:${pluginId}] permission denied: network`); return { ok: false, status: 0, body: "permission denied" }; }
        return await window.nexus.pluginsNetworkFetch(url, opts);
      },
    },
    clipboard: {
      readText: async () => {
        if (!has("clipboard")) { console.error(`[plugin:${pluginId}] permission denied: clipboard`); return ""; }
        return await window.nexus.pluginsClipboardRead();
      },
      writeText: async (text: string) => {
        if (!has("clipboard")) { console.error(`[plugin:${pluginId}] permission denied: clipboard`); return; }
        await window.nexus.pluginsClipboardWrite(text);
      },
    },
    system: {
      openExternal: async (url: string) => {
        if (!has("system")) { console.error(`[plugin:${pluginId}] permission denied: system`); return; }
        await window.nexus.openExternal(url);
      },
      showItemInFolder: async (path: string) => {
        if (!has("system")) { console.error(`[plugin:${pluginId}] permission denied: system`); return; }
        await window.nexus.pluginsShowItemInFolder(path);
      },
    },
  };
}

/** Load + initialize all enabled plugins. Called on startup. */
export async function loadPlugins(): Promise<void> {
  try {
    const plugins = await window.nexus.pluginsList();
    const enabled = plugins.filter((p: { status: string }) => p.status === "enabled" || p.status === "error");
    for (const plugin of enabled) {
      try {
        const code = await window.nexus.pluginsReadEntry(plugin.manifest.id);
        if (!code) {
          await window.nexus.pluginsMarkError(plugin.manifest.id, "Entry file not found or empty.");
          continue;
        }
        // Load the plugin as an ES module via Blob URL.
        const blob = new Blob([code], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        const mod = await import(/* @vite-ignore */ url);
        URL.revokeObjectURL(url);
        const entry = mod.default;
        if (typeof entry !== "function") {
          await window.nexus.pluginsMarkError(plugin.manifest.id, "Entry module's default export is not a function.");
          continue;
        }
        // Create the HostAPI + call the entry function.
        const api = createHostAPI(plugin.manifest);
        const result = await entry(api);
        cleanups.set(plugin.manifest.id, result?.cleanup);
        console.log(`[plugins] loaded: ${plugin.manifest.name} v${plugin.manifest.version}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[plugins] failed to load ${plugin.manifest.id}:`, msg);
        await window.nexus.pluginsMarkError(plugin.manifest.id, msg);
      }
    }
  } catch (e) {
    console.error("[plugins] failed to list plugins:", e);
  }
}

/** Unload a plugin (call its cleanup + remove its extensions). */
export function unloadPlugin(pluginId: string): void {
  const cleanup = cleanups.get(pluginId);
  try { cleanup?.(); } catch { /* ignore */ }
  cleanups.delete(pluginId);
  usePluginExtensions.getState().removeByPlugin(pluginId);
  console.log(`[plugins] unloaded: ${pluginId}`);
}

/** Unload all plugins (on app close or recovery mode). */
export function unloadAllPlugins(): void {
  for (const id of cleanups.keys()) unloadPlugin(id);
}

/** Reload all plugins (after enabling/disabling). */
export async function reloadPlugins(): Promise<void> {
  unloadAllPlugins();
  await loadPlugins();
}
