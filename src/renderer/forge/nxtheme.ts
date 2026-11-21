// v10.0.0 — .nxtheme: NEXUS's own theme file format.
//
// Layout of the file (plain text, human-greppable):
//
//   NEXUSNXTHEME 1                      ← magic + format version
//   { …pretty JSON of the theme… }      ← payload (validated on import)
//   SHA256 <hex>                        ← checksum of the exact payload bytes
//
// Why not just .json? A custom extension gives us OS-level file association
// (double-click a theme → NEXUS imports it), an unambiguous brand, and a
// checksum so hand-edited / corrupted files are rejected loudly instead of
// silently half-applying.

import { validateTheme, type ThemeConfig } from "@shared/theme-types";

export const NXTHEME_MAGIC = "NEXUSNXTHEME";
export const NXTHEME_EXTENSION = "nxtheme";

export interface NxThemeParseResult {
  ok: boolean;
  error?: string;
  checksumVerified?: boolean;
  theme?: ThemeConfig;
}

function payloadText(theme: ThemeConfig): string {
  return JSON.stringify(
    {
      name: theme.name,
      mode: theme.mode,
      colors: theme.colors,
      typography: theme.typography,
      radius: theme.radius,
      spacing: theme.spacing,
      shadows: theme.shadows,
      card: theme.card,
      sidebar: theme.sidebar,
      topbar: theme.topbar,
      background: theme.background,
      animations: theme.animations,
      layout: theme.layout,
      forge: theme.forge,
    },
    null,
    2,
  );
}

async function sha256Hex(text: string): Promise<string | null> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const data = new TextEncoder().encode(text);
      const buf = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* fall through */ }
  return null; // non-secure context — checksum can't be computed
}

/** Serialize a theme into .nxtheme file contents. */
export async function serializeNxTheme(theme: ThemeConfig): Promise<string> {
  const payload = payloadText(theme);
  const sum = await sha256Hex(payload);
  const lines = [`${NXTHEME_MAGIC} 1`, payload];
  if (sum) lines.push(`SHA256 ${sum}`);
  return lines.join("\n") + "\n";
}

/** Parse + validate .nxtheme contents. Never throws. */
export async function parseNxTheme(text: string): Promise<NxThemeParseResult> {
  const lines = text.split("\n");
  if (lines.length < 2) return { ok: false, error: "File is too short to be a NEXUS theme." };
  if (!lines[0].startsWith(NXTHEME_MAGIC)) {
    return { ok: false, error: `Not a NEXUS theme file (missing ${NXTHEME_MAGIC} header).` };
  }
  const formatVersion = Number(lines[0].slice(NXTHEME_MAGIC.length).trim());
  if (!Number.isFinite(formatVersion) || formatVersion < 1 || formatVersion > 1) {
    return { ok: false, error: `Unsupported .nxtheme format version: ${lines[0]}` };
  }
  // Payload = everything between the magic line and the trailing SHA256 line.
  let payload = text;
  let declaredSum: string | null = null;
  const lastLine = lines[lines.length - 1].trim();
  if (lastLine.startsWith("SHA256 ")) {
    declaredSum = lastLine.slice("SHA256 ".length).trim().toLowerCase();
    payload = lines.slice(1, -1).join("\n");
  } else {
    payload = lines.slice(1).join("\n");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { ok: false, error: "Theme payload is not valid JSON." };
  }
  const theme = validateTheme(raw);
  if (!theme.name) return { ok: false, error: "Theme has no name." };

  let checksumVerified = false;
  if (declaredSum) {
    const actual = await sha256Hex(payload);
    if (actual) {
      if (actual !== declaredSum) {
        return { ok: false, error: "Checksum mismatch — the file was modified or corrupted." };
      }
      checksumVerified = true;
    }
    // actual === null (non-secure context): accept with checksumVerified=false.
  }
  return { ok: true, theme, checksumVerified };
}

/** Build a safe file name for exports. */
export function nxThemeFileName(name: string): string {
  const clean = (name || "theme").replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-").slice(0, 48) || "theme";
  return `${clean}.${NXTHEME_EXTENSION}`;
}

/**
 * Export the given theme. In Electron this opens a native save dialog via
 * IPC; in a plain browser (mock QA) it falls back to a download.
 */
export async function exportNxThemeFile(theme: ThemeConfig): Promise<{ ok: boolean; path?: string; error?: string }> {
  const contents = await serializeNxTheme(theme);
  try {
    if (typeof window !== "undefined" && (window as unknown as { nexus?: { exportNxTheme?: unknown } }).nexus?.exportNxTheme) {
      return await window.nexus.exportNxTheme(contents, nxThemeFileName(theme.name));
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  // Browser fallback (QA).
  try {
    const blob = new Blob([contents], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nxThemeFileName(theme.name);
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, path: "(download)" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Import a theme from a picked file (native open dialog in Electron, hidden
 * <input type=file> in a plain browser).
 */
export async function importNxThemeFile(): Promise<NxThemeParseResult> {
  try {
    if (typeof window !== "undefined" && (window as unknown as { nexus?: { importNxTheme?: unknown } }).nexus?.importNxTheme) {
      const res = await window.nexus.importNxTheme();
      if (!res.ok || !res.contents) return { ok: false, error: res.error || "No file selected." };
      return parseNxTheme(res.contents);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  // Browser fallback (QA): hidden file input.
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${NXTHEME_EXTENSION},text/plain`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve({ ok: false, error: "No file selected." });
      try {
        resolve(await parseNxTheme(await file.text()));
      } catch (e) {
        resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    };
    input.click();
  });
}
