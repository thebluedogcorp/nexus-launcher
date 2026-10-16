// v4.4.0 — Theme Studio: versioned, structured theme configuration.
//
// A Theme is a plain JSON object (NOT arbitrary CSS) so it can be validated,
// versioned, imported/exported, and recovered from a broken state. The
// renderer's applyTheme() maps a ThemeConfig onto ~60 CSS custom properties
// on :root, which the existing variable-driven stylesheet already consumes —
// so the WHOLE launcher re-themes instantly, and theme failures can't break
// the app (we fall back to DEFAULT_THEME on validation error).
//
// Schema is additive: bump `version` and add optional fields; old themes
// still load (validateTheme fills missing fields from DEFAULT_THEME).

export type ThemeMode = "dark" | "light";
export type LibraryView = "grid" | "list";
export type CardDensity = "compact" | "cozy" | "comfortable";
export type ShadowLevel = "none" | "low" | "mid" | "high";
export type BackgroundType = "solid" | "gradient" | "image";
export type SidebarPosition = "left" | "right";

export interface ThemeConfig {
  version: 1;
  name: string;
  mode: ThemeMode;

  colors: {
    bg: string;
    bg2: string;
    surface: string;
    surface2: string;
    border: string;       // e.g. "rgba(255,255,255,0.06)"
    border2: string;
    borderStrong: string;
    text: string;
    textDim: string;
    textFaint: string;
    accent: string;
    danger: string;
  };

  typography: {
    fontFamily: string;   // e.g. '"Inter","Segoe UI",system-ui,sans-serif'
    baseSize: number;     // px, body font-size
    titleSize: number;    // px, collection/header titles
    lineHeight: number;   // unitless
    letterSpacing: number;// em, base letter-spacing (negative = tighter)
  };

  radius: {
    sm: number; md: number; lg: number; xl: number;
  };

  spacing: {
    scale: number;        // multiplier applied to the 4/8/12/16/24/32/48 base
  };

  shadows: {
    low: string; mid: string; high: string;
  };

  card: {
    aspectRatio: string;   // "3/4" | "16/9" | "1/1" | "2/3"
    minWidth: number;      // px, grid auto-fill minmax
    gap: number;           // px, grid gap
    radius: number;        // px (overrides --r-lg for cards)
    borderOpacity: number; // 0..1
    shadow: ShadowLevel;
    hoverLift: number;     // px, translateY on hover (0 = none)
    density: CardDensity;  // affects gap + min-width heuristic
    showTitle: boolean;
    showPlatform: boolean;
    showPlaytime: boolean;
  };

  sidebar: {
    width: number;         // px
    position: SidebarPosition;
    background: string;    // CSS color (often = bg2)
  };

  topbar: {
    height: number;        // px
    background: string;    // CSS color or rgba
    transparency: number;  // 0..1 (applied as the rgba alpha on bg)
    borderOpacity: number; // 0..1
  };

  background: {
    type: BackgroundType;
    value: string;         // color | gradient css | image url/path
    blur: number;          // px, applied to the bg layer
    overlayOpacity: number;// 0..1, dark scrim over the bg
    parallax: boolean;     // slow zoom on the bg
  };

  animations: {
    speedMultiplier: number; // 0.5..2.0, applied to --t-fast/base/slow
    hoverEffects: boolean;
    cardEntrance: boolean;   // stagger animation on grid load
    reducedMotion: boolean;   // force-disable animations
  };

  layout: {
    libraryView: LibraryView;
    sectionsOrder: string[];   // ["collections","platforms","stats"]
    hiddenSections: string[];  // subset of sectionsOrder
  };
}

// The default theme = the v4.3.1 launcher look (pure black + teal accent).
export const DEFAULT_THEME: ThemeConfig = {
  version: 1,
  name: "NEXUS Default",
  mode: "dark",
  colors: {
    bg: "#000000",
    bg2: "#0c0c0e",
    surface: "#141416",
    surface2: "#1c1c1f",
    border: "rgba(255,255,255,0.06)",
    border2: "rgba(255,255,255,0.10)",
    borderStrong: "rgba(255,255,255,0.16)",
    text: "rgba(255,255,255,0.92)",
    textDim: "rgba(255,255,255,0.58)",
    textFaint: "rgba(255,255,255,0.34)",
    accent: "#2dd4bf",
    danger: "#f87171",
  },
  typography: {
    fontFamily: '"Inter","Segoe UI",system-ui,sans-serif',
    baseSize: 14,
    titleSize: 22,
    lineHeight: 1.5,
    letterSpacing: -0.011,
  },
  radius: { sm: 6, md: 8, lg: 12, xl: 16 },
  spacing: { scale: 1 },
  shadows: {
    low: "0 1px 2px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)",
    mid: "0 4px 14px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)",
    high: "0 22px 56px -12px rgba(0,0,0,0.7), 0 8px 22px -4px rgba(0,0,0,0.45)",
  },
  card: {
    aspectRatio: "3/4",
    minWidth: 220,
    gap: 16,
    radius: 12,
    borderOpacity: 0.06,
    shadow: "mid",
    hoverLift: 3,
    density: "comfortable",
    showTitle: true,
    showPlatform: true,
    showPlaytime: true,
  },
  sidebar: {
    width: 240,
    position: "left",
    background: "#0c0c0e",
  },
  topbar: {
    height: 56,
    background: "#000000",
    transparency: 0.82,
    borderOpacity: 0.06,
  },
  background: {
    type: "solid",
    value: "#000000",
    blur: 0,
    overlayOpacity: 0.82,
    parallax: false,
  },
  animations: {
    speedMultiplier: 1,
    hoverEffects: true,
    cardEntrance: true,
    reducedMotion: false,
  },
  layout: {
    libraryView: "grid",
    sectionsOrder: ["collections", "platforms", "stats"],
    hiddenSections: [],
  },
};

// Deep-merge a partial/legacy config onto DEFAULT_THEME so missing fields are
// always filled. Used on load (DB rows) + import. Never throws.
export function validateTheme(raw: unknown): ThemeConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_THEME };
  const r = raw as Partial<ThemeConfig>;
  const d = DEFAULT_THEME;
  return {
    version: 1,
    name: typeof r.name === "string" ? r.name : d.name,
    mode: r.mode === "light" || r.mode === "dark" ? r.mode : d.mode,
    colors: { ...d.colors, ...(r.colors ?? {}) },
    typography: { ...d.typography, ...(r.typography ?? {}) },
    radius: { ...d.radius, ...(r.radius ?? {}) },
    spacing: { ...d.spacing, ...(r.spacing ?? {}) },
    shadows: { ...d.shadows, ...(r.shadows ?? {}) },
    card: { ...d.card, ...(r.card ?? {}) },
    sidebar: { ...d.sidebar, ...(r.sidebar ?? {}) },
    topbar: { ...d.topbar, ...(r.topbar ?? {}) },
    background: { ...d.background, ...(r.background ?? {}) },
    animations: { ...d.animations, ...(r.animations ?? {}) },
    layout: {
      libraryView: r.layout?.libraryView === "list" || r.layout?.libraryView === "grid" ? r.layout.libraryView : d.layout.libraryView,
      sectionsOrder: Array.isArray(r.layout?.sectionsOrder) ? r.layout!.sectionsOrder.filter((s) => typeof s === "string") : d.layout.sectionsOrder,
      hiddenSections: Array.isArray(r.layout?.hiddenSections) ? r.layout!.hiddenSections.filter((s) => typeof s === "string") : d.layout.hiddenSections,
    },
  };
}

// A saved theme row in the DB.
export interface SavedTheme {
  id: number;
  name: string;
  config: ThemeConfig;
  builtin: boolean;      // preset (read-only name+config, can't delete)
  createdAt: string;
}
