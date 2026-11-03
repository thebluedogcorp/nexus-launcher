// v4.4.0 — Built-in theme presets. Each is a full ThemeConfig built on top of
// DEFAULT_THEME with the visual overrides that define the style. Imported by
// both the DB seeder (main process) and the Theme Studio (renderer).
//
// Presets are stored in the `themes` table with builtin=1 on first run;
// users can duplicate them into editable personal themes but can't delete
// the built-ins (the studio hides the delete button for builtin rows).

import { DEFAULT_THEME, type ThemeConfig } from "./theme-types";

type PartialDeep<T> = { [K in keyof T]?: PartialDeep<T[K]> };

/** Shallow-merge overrides onto a clone of DEFAULT_THEME (deep at one level). */
function p(overrides: PartialDeep<ThemeConfig>): ThemeConfig {
  const out: ThemeConfig = JSON.parse(JSON.stringify(DEFAULT_THEME));
  for (const [k, v] of Object.entries(overrides)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      // @ts-expect-error — merge section
      out[k] = { ...out[k], ...v };
    } else if (v !== undefined) {
      // @ts-expect-error — top-level scalar
      out[k] = v;
    }
  }
  return out;
}

export interface PresetDef {
  id: string;          // stable preset id (used as the DB id seed)
  theme: ThemeConfig;
}

// 10 presets. Each sets its own name (the studio shows it).
export const PRESET_THEMES: PresetDef[] = [
  {
    id: "preset-default",
    theme: { ...DEFAULT_THEME, name: "NEXUS Default" },
  },
  {
    id: "preset-minimalist-dark",
    theme: p({
      name: "Minimalist Dark",
      colors: {
        bg: "#0a0a0a", bg2: "#111111", surface: "#161616", surface2: "#1d1d1d",
        border: "rgba(255,255,255,0.05)", border2: "rgba(255,255,255,0.08)",
        borderStrong: "rgba(255,255,255,0.12)",
        text: "rgba(255,255,255,0.90)", textDim: "rgba(255,255,255,0.55)", textFaint: "rgba(255,255,255,0.32)",
        accent: "#8b8b8b",
      },
      typography: { letterSpacing: -0.02 },
      card: { radius: 6, hoverLift: 0, shadow: "low", borderOpacity: 0.05 },
      animations: { hoverEffects: false, cardEntrance: false },
    }),
  },
  {
    id: "preset-modern-dashboard",
    theme: p({
      name: "Modern Gaming Dashboard",
      colors: {
        bg: "#0e1116", bg2: "#161b22", surface: "#1c232c", surface2: "#242c37",
        border: "rgba(255,255,255,0.07)", borderStrong: "rgba(255,255,255,0.16)",
        accent: "#6366f1",
      },
      radius: { sm: 8, md: 12, lg: 16, xl: 22 },
      shadows: {
        low: "0 2px 4px rgba(0,0,0,0.3)",
        mid: "0 8px 24px rgba(0,0,0,0.45)",
        high: "0 24px 64px -12px rgba(99,102,241,0.25), 0 8px 24px rgba(0,0,0,0.5)",
      },
      card: { radius: 16, hoverLift: 4, shadow: "mid", gap: 18, minWidth: 240 },
      sidebar: { width: 260, background: "#0b0f14" },
    }),
  },
  {
    id: "preset-steam",
    theme: p({
      name: "Steam-Inspired Library",
      colors: {
        bg: "#171a21", bg2: "#1b2838", surface: "#2a475e", surface2: "#31637d",
        border: "rgba(0,0,0,0.25)", border2: "rgba(0,0,0,0.35)", borderStrong: "rgba(255,255,255,0.20)",
        text: "rgba(255,255,255,0.95)", textDim: "rgba(255,255,255,0.65)", textFaint: "rgba(255,255,255,0.40)",
        accent: "#66c0f4",
      },
      typography: { fontFamily: '"Motiva Sans","Inter","Segoe UI",system-ui,sans-serif', baseSize: 14 },
      card: { aspectRatio: "3/4", minWidth: 230, radius: 4, shadow: "low", hoverLift: 2 },
      sidebar: { width: 240, background: "#171a21" },
      topbar: { height: 54, background: "#171a21", transparency: 0.95 },
    }),
  },
  {
    id: "preset-cyberpunk-neon",
    theme: p({
      name: "Cyberpunk Neon",
      colors: {
        bg: "#070016", bg2: "#0d0024", surface: "#1a0040", surface2: "#260066",
        border: "rgba(255,0,255,0.18)", border2: "rgba(0,255,255,0.22)", borderStrong: "rgba(255,0,255,0.40)",
        text: "rgba(255,255,255,0.95)", textDim: "rgba(255,0,255,0.70)", textFaint: "rgba(0,255,255,0.50)",
        accent: "#ff00aa", danger: "#ff3366",
      },
      typography: { letterSpacing: 0.02, fontFamily: '"Orbitron","Inter","Segoe UI",system-ui,sans-serif' },
      radius: { sm: 2, md: 2, lg: 4, xl: 8 },
      shadows: {
        low: "0 0 8px rgba(255,0,170,0.3)",
        mid: "0 0 18px rgba(255,0,170,0.45), 0 0 30px rgba(0,255,255,0.25)",
        high: "0 0 40px rgba(255,0,170,0.6), 0 0 70px rgba(0,255,255,0.4)",
      },
      card: { radius: 4, hoverLift: 4, shadow: "mid", borderOpacity: 0.18 },
      background: { type: "gradient", value: "linear-gradient(135deg,#070016 0%,#1a0040 50%,#0d0024 100%)", blur: 0, overlayOpacity: 0.5, parallax: true },
      animations: { speedMultiplier: 0.85, hoverEffects: true, cardEntrance: true },
    }),
  },
  {
    id: "preset-glassmorphism",
    theme: p({
      name: "Glassmorphism",
      colors: {
        bg: "#0a0e17", bg2: "#0e131e", surface: "rgba(255,255,255,0.06)", surface2: "rgba(255,255,255,0.10)",
        border: "rgba(255,255,255,0.10)", border2: "rgba(255,255,255,0.16)", borderStrong: "rgba(255,255,255,0.24)",
        text: "rgba(255,255,255,0.95)", textDim: "rgba(255,255,255,0.65)", textFaint: "rgba(255,255,255,0.40)",
        accent: "#34d399",
      },
      radius: { sm: 10, md: 14, lg: 20, xl: 28 },
      card: { radius: 20, hoverLift: 4, shadow: "mid", borderOpacity: 0.10, minWidth: 230, gap: 18 },
      sidebar: { width: 250, background: "rgba(10,14,23,0.5)" },
      topbar: { height: 60, background: "rgba(10,14,23,0.5)", transparency: 0.6, borderOpacity: 0.10 },
      background: { type: "gradient", value: "linear-gradient(135deg,#1e3a5f 0%,#0a0e17 60%,#2d1b4e 100%)", blur: 24, overlayOpacity: 0.35, parallax: false },
    }),
  },
  {
    id: "preset-amoled-black",
    theme: p({
      name: "AMOLED Black",
      colors: {
        bg: "#000000", bg2: "#000000", surface: "#000000", surface2: "#0a0a0a",
        border: "rgba(255,255,255,0.08)", border2: "rgba(255,255,255,0.14)", borderStrong: "rgba(255,255,255,0.24)",
        text: "#ffffff", textDim: "rgba(255,255,255,0.60)", textFaint: "rgba(255,255,255,0.36)",
        accent: "#00ff88",
      },
      shadows: {
        low: "0 1px 2px rgba(0,0,0,1)", mid: "0 4px 12px rgba(0,0,0,1)", high: "0 20px 50px rgba(0,0,0,1)",
      },
      card: { shadow: "none", hoverLift: 0, borderOpacity: 0.10, radius: 8 },
      sidebar: { background: "#000000" },
      topbar: { background: "#000000", transparency: 1, borderOpacity: 0.08 },
    }),
  },
  {
    id: "preset-retro-gaming",
    theme: p({
      name: "Retro Gaming",
      colors: {
        bg: "#1a120b", bg2: "#241a10", surface: "#2e2114", surface2: "#3a2a18",
        border: "rgba(255,180,90,0.12)", border2: "rgba(255,180,90,0.20)", borderStrong: "rgba(255,180,90,0.32)",
        text: "rgba(255,225,180,0.92)", textDim: "rgba(255,200,140,0.62)", textFaint: "rgba(255,180,90,0.40)",
        accent: "#ffb84d",
      },
      typography: { fontFamily: '"VT323","Courier New",monospace', baseSize: 15, letterSpacing: 0.01, lineHeight: 1.4 },
      radius: { sm: 2, md: 3, lg: 4, xl: 6 },
      card: { radius: 4, hoverLift: 2, shadow: "low", borderOpacity: 0.14 },
      sidebar: { width: 220, background: "#241a10" },
      background: { type: "gradient", value: "linear-gradient(180deg,#1a120b 0%,#2e2114 100%)", overlayOpacity: 0.5 },
    }),
  },
  {
    id: "preset-clean-light",
    theme: p({
      name: "Clean Light",
      mode: "light",
      colors: {
        bg: "#ffffff", bg2: "#f5f6f8", surface: "#ffffff", surface2: "#eef0f3",
        border: "rgba(0,0,0,0.08)", border2: "rgba(0,0,0,0.12)", borderStrong: "rgba(0,0,0,0.20)",
        text: "rgba(0,0,0,0.92)", textDim: "rgba(0,0,0,0.60)", textFaint: "rgba(0,0,0,0.40)",
        accent: "#2563eb", danger: "#dc2626",
      },
      typography: { baseSize: 14, letterSpacing: -0.005 },
      shadows: {
        low: "0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.05)",
        mid: "0 4px 14px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)",
        high: "0 22px 50px -12px rgba(0,0,0,0.18), 0 8px 20px -4px rgba(0,0,0,0.10)",
      },
      card: { shadow: "low", hoverLift: 3, borderOpacity: 0.08, radius: 12 },
      sidebar: { width: 240, background: "#f5f6f8" },
      topbar: { height: 56, background: "#ffffff", transparency: 0.88, borderOpacity: 0.08 },
    }),
  },
  {
    id: "preset-artwork-immersive",
    theme: p({
      name: "Artwork-Focused Immersive",
      colors: {
        bg: "#000000", bg2: "rgba(10,10,12,0.4)", surface: "rgba(20,20,24,0.5)", surface2: "rgba(30,30,36,0.6)",
        border: "rgba(255,255,255,0.08)", borderStrong: "rgba(255,255,255,0.20)",
        text: "rgba(255,255,255,0.95)", textDim: "rgba(255,255,255,0.70)", textFaint: "rgba(255,255,255,0.45)",
        accent: "#f59e0b",
      },
      card: { aspectRatio: "3/4", minWidth: 280, gap: 20, radius: 14, hoverLift: 6, shadow: "high", borderOpacity: 0.08 },
      sidebar: { width: 220, background: "rgba(0,0,0,0.6)" },
      topbar: { height: 52, background: "rgba(0,0,0,0.4)", transparency: 0.4, borderOpacity: 0.04 },
      background: { type: "image", value: "", blur: 18, overlayOpacity: 0.55, parallax: true },
      animations: { speedMultiplier: 0.9, hoverEffects: true, cardEntrance: true },
    }),
  },
  {
    id: "preset-compact-power",
    theme: p({
      name: "Compact Power-User",
      colors: {
        bg: "#0a0a0c", bg2: "#101012", surface: "#141416", surface2: "#1a1a1d",
        accent: "#22d3ee",
      },
      typography: { baseSize: 12.5, titleSize: 18, letterSpacing: -0.015, lineHeight: 1.35 },
      spacing: { scale: 0.8 },
      radius: { sm: 4, md: 6, lg: 8, xl: 10 },
      card: { minWidth: 170, gap: 10, radius: 6, hoverLift: 2, shadow: "low", density: "compact", aspectRatio: "3/4" },
      sidebar: { width: 200, background: "#101012" },
      topbar: { height: 44, background: "#0a0a0c", transparency: 0.92 },
      animations: { speedMultiplier: 0.8, cardEntrance: false },
    }),
  },
];

// Build a map of preset-id → config for the DB seeder.
export function presetById(id: string): ThemeConfig | undefined {
  return PRESET_THEMES.find((p) => p.id === id)?.theme;
}
