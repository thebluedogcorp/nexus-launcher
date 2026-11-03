// v4.4.0 — applyTheme: maps a ThemeConfig onto CSS custom properties on :root.
//
// The existing variable-driven stylesheet already consumes these tokens
// (--bg, --surface, --accent, --r-lg, --shadow-mid, …), so setting them here
// re-themes the WHOLE launcher instantly — the studio's live preview and the
// real launcher share the same :root. New tokens introduced for v4.4.0:
//   --font-family, --font-size, --title-size, --line-height, --letter-spacing
//   --card-aspect, --card-min-width, --card-gap, --card-radius, --card-hover-lift
//   --sidebar-width, --sidebar-bg, --topbar-height, --topbar-bg, --topbar-border-opacity
//   --bg-layer-value, --bg-layer-blur, --bg-overlay
//   --anim-mult (recomputes --t-fast/base/slow), --hover-effects, --card-entrance
//
// applyTheme NEVER throws — on any error it reverts to the DEFAULT_THEME so a
// broken custom theme can never prevent the launcher from opening.

import { DEFAULT_THEME, validateTheme, type ThemeConfig, type SavedTheme } from "@shared/theme-types";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h)) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function withAlpha(rgba: string, alpha: number): string {
  // Replace the alpha component of an rgba(...) string, or wrap an opaque
  // color. Tolerant: if it doesn't parse, just return the original.
  const m = rgba.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(",").map((s) => s.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
  return rgba;
}

const SHADOW_BY_LEVEL: Record<string, string> = {
  none: "none",
  low: "var(--shadow-low)",
  mid: "var(--shadow-mid)",
  high: "var(--shadow-high)",
};

export function applyTheme(raw: unknown): void {
  let theme: ThemeConfig;
  try {
    theme = validateTheme(raw);
  } catch {
    theme = { ...DEFAULT_THEME };
  }
  const root = document.documentElement;
  const set = (k: string, v: string) => root.style.setProperty(k, v);

  try {
    // ----- colors -----
    set("--bg", theme.colors.bg);
    set("--bg-2", theme.colors.bg2);
    set("--surface", theme.colors.surface);
    set("--surface-2", theme.colors.surface2);
    set("--border", theme.colors.border);
    set("--border-2", theme.colors.border2);
    set("--border-strong", theme.colors.borderStrong);
    set("--text", theme.colors.text);
    set("--text-dim", theme.colors.textDim);
    set("--text-faint", theme.colors.textFaint);
    set("--danger", theme.colors.danger);
    // surface-glass derives from bg2 with 72% alpha
    set("--surface-glass", withAlpha(theme.colors.bg2, 0.72));

    // ----- accent (+ derived rgb / fg / hover) -----
    const rgb = hexToRgb(theme.colors.accent);
    if (rgb) {
      set("--accent", theme.colors.accent);
      set("--accent-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
      const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      set("--accent-fg", lum > 0.6 ? "#08080a" : "#ffffff");
      const mix = (ch: number) => Math.round(ch + (255 - ch) * 0.14);
      set("--accent-hover", `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`);
    }

    // ----- typography -----
    set("--font-family", theme.typography.fontFamily);
    set("--font-size", `${theme.typography.baseSize}px`);
    set("--title-size", `${theme.typography.titleSize}px`);
    set("--line-height", String(theme.typography.lineHeight));
    set("--letter-spacing", `${theme.typography.letterSpacing}em`);

    // ----- radius -----
    set("--r-sm", `${theme.radius.sm}px`);
    set("--r-md", `${theme.radius.md}px`);
    set("--r-lg", `${theme.radius.lg}px`);
    set("--r-xl", `${theme.radius.xl}px`);

    // ----- spacing (4px base * scale) -----
    const sc = theme.spacing.scale;
    set("--s-1", `${4 * sc}px`);
    set("--s-2", `${8 * sc}px`);
    set("--s-3", `${12 * sc}px`);
    set("--s-4", `${16 * sc}px`);
    set("--s-5", `${24 * sc}px`);
    set("--s-6", `${32 * sc}px`);
    set("--s-7", `${48 * sc}px`);

    // ----- shadows -----
    set("--shadow-low", theme.shadows.low);
    set("--shadow-mid", theme.shadows.mid);
    set("--shadow-high", theme.shadows.high);

    // ----- card -----
    set("--card-aspect", theme.card.aspectRatio);
    set("--card-min-width", `${theme.card.minWidth}px`);
    set("--card-gap", `${theme.card.gap}px`);
    set("--card-radius", `${theme.card.radius}px`);
    set("--card-border-opacity", String(theme.card.borderOpacity));
    set("--card-hover-lift", `${theme.card.hoverLift}px`);
    set("--card-shadow", SHADOW_BY_LEVEL[theme.card.shadow] ?? "var(--shadow-mid)");

    // ----- sidebar -----
    set("--sidebar-width", `${theme.sidebar.width}px`);
    set("--sidebar-bg", theme.sidebar.background);

    // ----- topbar -----
    set("--topbar-height", `${theme.topbar.height}px`);
    set("--topbar-bg", withAlpha(theme.topbar.background, theme.topbar.transparency));
    set("--topbar-border-opacity", String(theme.topbar.borderOpacity));

    // ----- background layer -----
    set("--bg-layer-value", theme.background.value || theme.colors.bg);
    set("--bg-layer-blur", `${theme.background.blur}px`);
    set("--bg-overlay", withAlpha(theme.colors.bg, theme.background.overlayOpacity));

    // ----- animations -----
    const mult = Math.max(0.2, Math.min(3, theme.animations.speedMultiplier));
    set("--t-fast", `${120 * mult}ms cubic-bezier(0.2,0.8,0.2,1)`);
    set("--t-base", `${180 * mult}ms cubic-bezier(0.2,0.8,0.2,1)`);
    set("--t-slow", `${280 * mult}ms cubic-bezier(0.2,0.8,0.2,1)`);
    set("--anim-mult", String(mult));
    // Boolean toggles are data attributes (CSS branches on them via [data-…="…"]).
    root.setAttribute("data-hover-effects", theme.animations.hoverEffects ? "1" : "0");
    root.setAttribute("data-card-entrance", theme.animations.cardEntrance ? "1" : "0");

    // ----- mode + library view (data attrs for CSS targeting) -----
    root.setAttribute("data-theme-mode", theme.mode);
    root.setAttribute("data-library-view", theme.layout.libraryView);
    root.setAttribute("data-sidebar-pos", theme.sidebar.position);
    // reduced motion
    if (theme.animations.reducedMotion) root.setAttribute("data-reduced-motion", "1");
    else root.removeAttribute("data-reduced-motion");

    // color-scheme for native form controls
    root.style.setProperty("color-scheme", theme.mode);
  } catch (e) {
    // Recovery: never let a bad theme break the app. Re-apply the default.
    console.error("[applyTheme] failed, reverting to default:", e);
    root.style.cssText = "";
    root.removeAttribute("data-theme-mode");
    root.removeAttribute("data-library-view");
    root.removeAttribute("data-sidebar-pos");
    applyTheme(DEFAULT_THEME);
  }
}

/** Apply the saved active theme id (called on startup). No-op if none saved. */
export async function applyActiveThemeOnStartup(): Promise<void> {
  try {
    const themes: SavedTheme[] = await window.nexus.listThemes();
    const activeId = Number(localStorage.getItem("nx-active-theme") || "0");
    const active = themes.find((t: SavedTheme) => t.id === activeId) ?? themes.find((t: SavedTheme) => t.builtin) ?? null;
    if (active) applyTheme(active.config);
    else applyTheme(DEFAULT_THEME);
  } catch {
    applyTheme(DEFAULT_THEME);
  }
}
