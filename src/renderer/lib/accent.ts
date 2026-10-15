// v4.2.0 — Accent color helper. The accent is the ONLY non-monochrome color
// in the UI. It is stored as a hex string in localStorage ("nx-accent") and
// applied to the CSS :root as three tokens so every accent-derived tint
// (rgba(var(--accent-rgb), …)) follows the user's choice live, with no restart.
//
// Tokens set on :root:
//   --accent        the hex color itself
//   --accent-rgb    "r, g, b" triplet for rgba() tints
//   --accent-fg     black or white text color for use ON TOP of --accent fills
//   --accent-hover  a 14% lighter shade for hover states

const DEFAULT_ACCENT = "#2dd4bf";

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

export function applyAccent(hex: string): void {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const { r, g, b } = rgb;
  const full =
    "#" +
    [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  const root = document.documentElement;
  root.style.setProperty("--accent", full);
  root.style.setProperty("--accent-rgb", `${r}, ${g}, ${b}`);
  // Perceived luminance → pick black or white text on accent fills.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  root.style.setProperty("--accent-fg", lum > 0.6 ? "#08080a" : "#ffffff");
  // A slightly brighter hover shade (mix with white 14%).
  const mix = (ch: number) => Math.round(ch + (255 - ch) * 0.14);
  root.style.setProperty("--accent-hover", `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`);
}

export function getAccent(): string {
  return localStorage.getItem("nx-accent") || DEFAULT_ACCENT;
}

export function setAccent(hex: string): void {
  localStorage.setItem("nx-accent", hex);
  applyAccent(hex);
}
