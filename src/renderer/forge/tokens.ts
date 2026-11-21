// v10.0.0 — NexusForge token catalog.
//
// The authoritative list of EVERY themeable parameter. The Forge Inspector's
// token browser renders from this catalog, so adding a token here makes it
// editable everywhere (Forge Mode, Theme Studio could adopt it too).
//
// `path` is a setter path into the ThemeConfig draft; `cssVar` documents the
// CSS custom property the token feeds (via applyTheme).

export type TokenType = "color" | "number" | "px" | "enum" | "bool" | "font" | "text" | "shadow";

export interface TokenDef {
  group: string;
  label: string;
  path: string;          // e.g. "colors.accent"
  cssVar?: string;       // e.g. "--accent"
  type: TokenType;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string | number | boolean; label: string }>;
  hint?: string;
}

export const TOKEN_CATALOG: TokenDef[] = [
  // ── Colors ──────────────────────────────────────────────────────────────
  { group: "Colors", label: "Background", path: "colors.bg", cssVar: "--bg", type: "color" },
  { group: "Colors", label: "Background (raised)", path: "colors.bg2", cssVar: "--bg-2", type: "color" },
  { group: "Colors", label: "Surface", path: "colors.surface", cssVar: "--surface", type: "color" },
  { group: "Colors", label: "Surface (raised)", path: "colors.surface2", cssVar: "--surface-2", type: "color" },
  { group: "Colors", label: "Border", path: "colors.border", cssVar: "--border", type: "color" },
  { group: "Colors", label: "Border (strong)", path: "colors.border2", cssVar: "--border-2", type: "color" },
  { group: "Colors", label: "Border (heaviest)", path: "colors.borderStrong", cssVar: "--border-strong", type: "color" },
  { group: "Colors", label: "Text", path: "colors.text", cssVar: "--text", type: "color" },
  { group: "Colors", label: "Text (dim)", path: "colors.textDim", cssVar: "--text-dim", type: "color" },
  { group: "Colors", label: "Text (faint)", path: "colors.textFaint", cssVar: "--text-faint", type: "color" },
  { group: "Colors", label: "Accent", path: "colors.accent", cssVar: "--accent", type: "color", hint: "The primary brand color used across the whole app." },
  { group: "Colors", label: "Danger", path: "colors.danger", cssVar: "--danger", type: "color" },

  // ── Typography ──────────────────────────────────────────────────────────
  { group: "Typography", label: "Font family", path: "typography.fontFamily", cssVar: "--font-family", type: "font" },
  { group: "Typography", label: "Base size", path: "typography.baseSize", cssVar: "--font-size", type: "px", min: 10, max: 20, step: 1 },
  { group: "Typography", label: "Title size", path: "typography.titleSize", cssVar: "--title-size", type: "px", min: 14, max: 40, step: 1 },
  { group: "Typography", label: "Line height", path: "typography.lineHeight", cssVar: "--line-height", type: "number", min: 1.1, max: 2, step: 0.05 },
  { group: "Typography", label: "Letter spacing", path: "typography.letterSpacing", cssVar: "--letter-spacing", type: "number", min: -0.06, max: 0.08, step: 0.005 },

  // ── Radius ──────────────────────────────────────────────────────────────
  { group: "Radius", label: "Small", path: "radius.sm", cssVar: "--r-sm", type: "px", min: 0, max: 20, step: 1 },
  { group: "Radius", label: "Medium", path: "radius.md", cssVar: "--r-md", type: "px", min: 0, max: 24, step: 1 },
  { group: "Radius", label: "Large", path: "radius.lg", cssVar: "--r-lg", type: "px", min: 0, max: 28, step: 1 },
  { group: "Radius", label: "Extra large", path: "radius.xl", cssVar: "--r-xl", type: "px", min: 0, max: 36, step: 1 },

  // ── Spacing ─────────────────────────────────────────────────────────────
  { group: "Spacing", label: "Scale multiplier", path: "spacing.scale", cssVar: "--s-1…7", type: "number", min: 0.5, max: 2, step: 0.05, hint: "Multiplies every spacing step in the app." },

  // ── Shadows ─────────────────────────────────────────────────────────────
  { group: "Shadows", label: "Low", path: "shadows.low", cssVar: "--shadow-low", type: "shadow" },
  { group: "Shadows", label: "Mid", path: "shadows.mid", cssVar: "--shadow-mid", type: "shadow" },
  { group: "Shadows", label: "High", path: "shadows.high", cssVar: "--shadow-high", type: "shadow" },

  // ── Cards ───────────────────────────────────────────────────────────────
  { group: "Cards", label: "Aspect ratio", path: "card.aspectRatio", cssVar: "--card-aspect", type: "enum", options: [
    { value: "3/4", label: "Portrait 3:4" }, { value: "2/3", label: "Portrait 2:3" }, { value: "16/9", label: "Landscape 16:9" }, { value: "1/1", label: "Square 1:1" },
  ] },
  { group: "Cards", label: "Min width", path: "card.minWidth", cssVar: "--card-min-width", type: "px", min: 120, max: 400, step: 10 },
  { group: "Cards", label: "Gap", path: "card.gap", cssVar: "--card-gap", type: "px", min: 0, max: 40, step: 1 },
  { group: "Cards", label: "Corner radius", path: "card.radius", cssVar: "--card-radius", type: "px", min: 0, max: 28, step: 1 },
  { group: "Cards", label: "Border opacity", path: "card.borderOpacity", cssVar: "--card-border-opacity", type: "number", min: 0, max: 1, step: 0.02 },
  { group: "Cards", label: "Shadow", path: "card.shadow", type: "enum", options: [
    { value: "none", label: "None" }, { value: "low", label: "Low" }, { value: "mid", label: "Mid" }, { value: "high", label: "High" },
  ] },
  { group: "Cards", label: "Hover lift", path: "card.hoverLift", cssVar: "--card-hover-lift", type: "px", min: 0, max: 12, step: 1 },
  { group: "Cards", label: "Density", path: "card.density", type: "enum", options: [
    { value: "compact", label: "Compact" }, { value: "cozy", label: "Cozy" }, { value: "comfortable", label: "Comfortable" },
  ] },
  { group: "Cards", label: "Show title", path: "card.showTitle", type: "bool" },
  { group: "Cards", label: "Show platform", path: "card.showPlatform", type: "bool" },
  { group: "Cards", label: "Show playtime", path: "card.showPlaytime", type: "bool" },

  // ── Sidebar ─────────────────────────────────────────────────────────────
  { group: "Shell", label: "Sidebar width", path: "sidebar.width", cssVar: "--sidebar-width", type: "px", min: 48, max: 400, step: 4, hint: "Drag the sidebar edge in Forge Mode to set this." },
  { group: "Shell", label: "Sidebar position", path: "sidebar.position", type: "enum", options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }] },
  { group: "Shell", label: "Sidebar background", path: "sidebar.background", cssVar: "--sidebar-bg", type: "color" },
  { group: "Shell", label: "Topbar height", path: "topbar.height", cssVar: "--topbar-height", type: "px", min: 36, max: 96, step: 2, hint: "Drag the topbar edge in Forge Mode to set this." },
  { group: "Shell", label: "Topbar background", path: "topbar.background", cssVar: "--topbar-bg", type: "color" },
  { group: "Shell", label: "Topbar transparency", path: "topbar.transparency", type: "number", min: 0, max: 1, step: 0.02 },
  { group: "Shell", label: "Topbar border opacity", path: "topbar.borderOpacity", type: "number", min: 0, max: 1, step: 0.02 },

  // ── Background ──────────────────────────────────────────────────────────
  { group: "Background", label: "Type", path: "background.type", type: "enum", options: [
    { value: "solid", label: "Solid color" }, { value: "gradient", label: "Gradient" }, { value: "image", label: "Image" },
  ] },
  { group: "Background", label: "Value", path: "background.value", cssVar: "--bg-layer-value", type: "text", hint: "Color, CSS gradient, or image URL." },
  { group: "Background", label: "Blur", path: "background.blur", cssVar: "--bg-layer-blur", type: "px", min: 0, max: 40, step: 1 },
  { group: "Background", label: "Overlay opacity", path: "background.overlayOpacity", cssVar: "--bg-overlay", type: "number", min: 0, max: 1, step: 0.02 },
  { group: "Background", label: "Parallax", path: "background.parallax", type: "bool" },

  // ── Animations ──────────────────────────────────────────────────────────
  { group: "Motion", label: "Speed multiplier", path: "animations.speedMultiplier", cssVar: "--anim-mult", type: "number", min: 0.25, max: 2, step: 0.05 },
  { group: "Motion", label: "Hover effects", path: "animations.hoverEffects", type: "bool" },
  { group: "Motion", label: "Card entrance stagger", path: "animations.cardEntrance", type: "bool" },
  { group: "Motion", label: "Reduced motion", path: "animations.reducedMotion", type: "bool" },

  // ── Mode ────────────────────────────────────────────────────────────────
  { group: "Mode", label: "Theme mode", path: "mode", type: "enum", options: [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }] },
  { group: "Mode", label: "Library view", path: "layout.libraryView", type: "enum", options: [{ value: "grid", label: "Grid" }, { value: "list", label: "List" }] },
];

export const TOKEN_GROUPS = Array.from(new Set(TOKEN_CATALOG.map((t) => t.group)));

/** Read a token value from a theme config by its dot path. */
export function readToken(theme: unknown, path: string): unknown {
  let cur: unknown = theme;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else return undefined;
  }
  return cur;
}

/** Common per-panel token quick-set list (used by the Panel inspector). */
export const PANEL_QUICK_TOKENS: Array<{ prop: string; label: string; type: TokenType }> = [
  { prop: "--accent", label: "Accent", type: "color" },
  { prop: "--surface", label: "Surface", type: "color" },
  { prop: "--surface-2", label: "Surface raised", type: "color" },
  { prop: "--bg", label: "Background", type: "color" },
  { prop: "--text", label: "Text", type: "color" },
  { prop: "--r-lg", label: "Radius", type: "px" },
  { prop: "--font-size", label: "Font size", type: "px" },
];
