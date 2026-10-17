// v4.7.0 — Plugin runtime. Loads enabled plugins, creates their HostAPI,
// calls their entry functions, and manages their lifecycle (cleanup on
// disable/unload). Plugins are loaded via Blob import (read the JS file
// content from the main process → create a Blob URL → dynamic import()).

import type { PluginManifest, HostAPI, PluginCleanup, PageExtension, SidebarItemExtension, GameCardActionExtension } from "@shared/plugin-types";
import { usePluginExtensions } from "./plugin-store";
import type { Game } from "@shared/types";

// Track active plugin cleanups (pluginId → cleanup function).
const cleanups = new Map<string, (() => void) | undefined>();

// Simple event emitter for the host events API.
const eventHandlers = new Map<string, Set<(data: unknown) => void>>();
function emitEvent(event: string, data: unknown): void {
  const handlers = eventHandlers.get(event);
  if (handlers) handlers.forEach((h) => { try { h(data); } catch { /* ignore */ } });
}

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
        const module = await import(/* @vite-ignore */ url);
        URL.revokeObjectURL(url);
        const entry = module.default;
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
