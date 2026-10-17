// v4.7.0 — Plugin Manager (main process). Handles filesystem operations:
// installing, listing, enabling/disabling, removing plugins. Plugin code is
// loaded in the RENDERER (via Blob import) — the main process manages files
// + metadata + per-plugin storage.

import { app } from "electron";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, cpSync, statSync } from "fs";
import type { PluginManifest, InstalledPlugin, PluginStatus } from "@shared/plugin-types";

const SUPPORTED_API_VERSION = 1;

function pluginsDir(): string {
  const dir = join(app.getPath("userData"), "plugins");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function pluginDir(id: string): string { return join(pluginsDir(), id); }

function readManifest(dir: string): PluginManifest | null {
  const p = join(dir, "manifest.json");
  if (!existsSync(p)) return null;
  try {
    const m = JSON.parse(readFileSync(p, "utf-8")) as PluginManifest;
    if (!m.id || !m.name || !m.version || !m.entry || typeof m.apiVersion !== "number") return null;
    return m;
  } catch { return null; }
}

function readMeta(id: string) {
  const p = join(pluginDir(id), ".meta.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; }
}

function writeMeta(id: string, meta: { status: PluginStatus; error?: string; installedAt: string; enabledAt: string | null }): void {
  writeFileSync(join(pluginDir(id), ".meta.json"), JSON.stringify(meta, null, 2));
}

export function validateManifest(m: PluginManifest): { ok: boolean; error?: string } {
  if (m.apiVersion !== SUPPORTED_API_VERSION) return { ok: false, error: `API v${m.apiVersion} not supported (host: v${SUPPORTED_API_VERSION}).` };
  if (!/^[a-z0-9-]+$/.test(m.id)) return { ok: false, error: "ID must be kebab-case." };
  if (!m.entry.endsWith(".js")) return { ok: false, error: "Entry must be .js" };
  return { ok: true };
}

export function listPlugins(): InstalledPlugin[] {
  const dir = pluginsDir();
  const ids = readdirSync(dir).filter(e => statSync(join(dir, e)).isDirectory() && existsSync(join(dir, e, "manifest.json")));
  return ids.map(id => {
    const dp = join(dir, id);
    const manifest = readManifest(dp)!;
    const meta = readMeta(id) ?? { status: "installed" as PluginStatus, installedAt: new Date().toISOString(), enabledAt: null };
    return { manifest, status: meta.status, error: meta.error, dirPath: dp, installedAt: meta.installedAt, enabledAt: meta.enabledAt };
  });
}

export function installPlugin(srcDir: string): InstalledPlugin {
  const manifest = readManifest(srcDir);
  if (!manifest) throw new Error("No valid manifest.json in the selected directory.");
  const v = validateManifest(manifest);
  if (!v.ok) throw new Error(v.error);
  const dest = pluginDir(manifest.id);
  if (existsSync(dest)) throw new Error(`Plugin "${manifest.id}" already installed. Remove it first.`);
  mkdirSync(dest, { recursive: true });
  cpSync(srcDir, dest, { recursive: true });
  const now = new Date().toISOString();
  writeMeta(manifest.id, { status: "installed", installedAt: now, enabledAt: null });
  return { manifest, status: "installed", dirPath: dest, installedAt: now, enabledAt: null };
}

/** v4.8.1 — Install a first-party plugin from embedded source code (no directory browsing needed). */
export function installPluginFromCode(manifestJson: string, entryCode: string): InstalledPlugin {
  const manifest = JSON.parse(manifestJson) as PluginManifest;
  if (!manifest || !manifest.id) throw new Error("Invalid manifest.");
  const v = validateManifest(manifest);
  if (!v.ok) throw new Error(v.error);
  const dest = pluginDir(manifest.id);
  if (existsSync(dest)) throw new Error(`Plugin "${manifest.id}" already installed. Remove it first.`);
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, "manifest.json"), manifestJson);
  writeFileSync(join(dest, manifest.entry), entryCode);
  const now = new Date().toISOString();
  writeMeta(manifest.id, { status: "installed", installedAt: now, enabledAt: null });
  return { manifest, status: "installed", dirPath: dest, installedAt: now, enabledAt: null };
}

export function enablePlugin(id: string): void {
  const meta = readMeta(id) ?? { status: "installed", installedAt: new Date().toISOString(), enabledAt: null };
  writeMeta(id, { ...meta, status: "enabled", enabledAt: new Date().toISOString(), error: undefined });
}

export function disablePlugin(id: string): void {
  const meta = readMeta(id) ?? { status: "installed", installedAt: new Date().toISOString(), enabledAt: null };
  writeMeta(id, { ...meta, status: "disabled", enabledAt: null });
}

export function markPluginError(id: string, error: string): void {
  const meta = readMeta(id) ?? { status: "enabled", installedAt: new Date().toISOString(), enabledAt: null };
  writeMeta(id, { ...meta, status: "error", error });
}

export function removePlugin(id: string): void {
  const dir = pluginDir(id);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export function readPluginEntry(id: string): string | null {
  const manifest = readManifest(pluginDir(id));
  if (!manifest) return null;
  const entryPath = join(pluginDir(id), manifest.entry);
  if (!existsSync(entryPath)) return null;
  return readFileSync(entryPath, "utf-8");
}

export function getEnabledPluginIds(): string[] {
  return listPlugins().filter(p => p.status === "enabled").map(p => p.manifest.id);
}

// Per-plugin storage
function pluginDataFile(id: string): string { return join(pluginDir(id), "data.json"); }

export function getPluginData(id: string, key: string): unknown {
  const f = pluginDataFile(id);
  if (!existsSync(f)) return null;
  try { const d = JSON.parse(readFileSync(f, "utf-8")); return d[key] ?? null; } catch { return null; }
}

export function setPluginData(id: string, key: string, value: unknown): void {
  const f = pluginDataFile(id);
  let d: Record<string, unknown> = {};
  if (existsSync(f)) { try { d = JSON.parse(readFileSync(f, "utf-8")); } catch {} }
  d[key] = value;
  writeFileSync(f, JSON.stringify(d, null, 2));
}

// ─── v4.10.0 — Plugin auto-update system ─────────────────────────────────
// When the app ships a NEWER first-party plugin catalog (via the
// FIRST_PARTY_PLUGINS constant in the renderer), users running an OLDER
// installed version need an upgrade path. We expose:
//   - checkPluginUpdates(catalog): returns the list of installed plugins
//     whose installed version < catalog version.
//   - updatePluginFromCode(manifestJson, entryCode): removes the old version
//     (if any) + writes the new manifest + entry code + re-enables. Preserves
//     the per-plugin data.json (so user settings aren't lost).

export interface PluginUpdateInfo {
  id: string;
  name: string;
  installedVersion: string;
  latestVersion: string;
}

/** Compare semver strings. Returns >0 if a > b, <0 if a < b, 0 if equal. */
function compareSemver(a: string, b: string): number {
  const pa = (a || "0").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = (b || "0").split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

/**
 * Given the renderer's first-party catalog (an array of {id, version}), return
 * the list of installed first-party plugins whose catalog version is newer
 * than the installed version. The renderer passes the catalog because the
 * catalog is a renderer-side constant (FIRST_PARTY_PLUGINS in
 * first-party-plugins.ts) — keeps the catalog in one place.
 */
export function checkPluginUpdates(
  catalog: Array<{ id: string; version: string; name?: string }>,
): PluginUpdateInfo[] {
  const installed = listPlugins();
  const out: PluginUpdateInfo[] = [];
  for (const cat of catalog) {
    const inst = installed.find((p) => p.manifest.id === cat.id);
    if (!inst) continue;
    if (compareSemver(cat.version, inst.manifest.version) > 0) {
      out.push({
        id: cat.id,
        name: cat.name ?? inst.manifest.name,
        installedVersion: inst.manifest.version,
        latestVersion: cat.version,
      });
    }
  }
  return out;
}

/**
 * Update an installed first-party plugin to a new version (from new manifest
 * + entry code). Removes the old version's files (manifest + entry .js) but
 * PRESERVES the per-plugin data.json + .meta.json's status (so an enabled
 * plugin stays enabled after the update).
 */
export function updatePluginFromCode(manifestJson: string, entryCode: string): InstalledPlugin {
  const manifest = JSON.parse(manifestJson) as PluginManifest;
  if (!manifest || !manifest.id) throw new Error("Invalid manifest.");
  const v = validateManifest(manifest);
  if (!v.ok) throw new Error(v.error);
  const dest = pluginDir(manifest.id);
  if (!existsSync(dest)) {
    // Not installed yet — fall back to install.
    return installPluginFromCode(manifestJson, entryCode);
  }
  // Preserve the per-plugin meta (status + enabled-at) + data.json across the update.
  const preservedMeta = readMeta(manifest.id) ?? { status: "enabled" as PluginStatus, installedAt: new Date().toISOString(), enabledAt: null };
  const preservedStatus: PluginStatus = preservedMeta.status === "error" ? "enabled" : preservedMeta.status;
  const preservedEnabledAt = preservedMeta.enabledAt;
  const preservedInstalledAt = preservedMeta.installedAt;

  // Overwrite manifest + entry file in place. The data.json is untouched.
  writeFileSync(join(dest, "manifest.json"), manifestJson);
  writeFileSync(join(dest, manifest.entry), entryCode);
  writeMeta(manifest.id, {
    status: preservedStatus,
    installedAt: preservedInstalledAt,
    enabledAt: preservedEnabledAt,
    error: undefined,
  });
  return {
    manifest,
    status: preservedStatus,
    dirPath: dest,
    installedAt: preservedInstalledAt,
    enabledAt: preservedEnabledAt,
  };
}
