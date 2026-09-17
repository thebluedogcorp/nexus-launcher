// Helpers shared by renderer components.

import { PLATFORMS } from "@shared/types";
import type { PlatformId } from "@shared/types";

export function formatPlaytime(seconds: number): string {
  if (!seconds || seconds < 60) return "Never played";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatPlaytimeShort(seconds: number): string {
  if (!seconds || seconds < 60) return "0h";
  const h = Math.floor(seconds / 3600);
  if (h >= 1000) return `${(h / 1000).toFixed(1)}k h`;
  return `${h}h`;
}

export function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").getTime();
  if (isNaN(d)) return "—";
  const diff = Date.now() - d;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "Just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(day / 365)}y ago`;
}

export function seedFromString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const PALETTES = [
  { from: "#0f766e", to: "#022c22", accent: "#2dd4bf" },
  { from: "#15803d", to: "#052e16", accent: "#34d399" },
  { from: "#a16207", to: "#1c1917", accent: "#fbbf24" },
  { from: "#9a3412", to: "#1c1917", accent: "#fb923c" },
  { from: "#86198f", to: "#1c1917", accent: "#e879f9" },
  { from: "#be123c", to: "#1c1917", accent: "#fb7185" },
  { from: "#047857", to: "#022c22", accent: "#10b981" },
  { from: "#7c2d12", to: "#0a0a0a", accent: "#f97316" },
  { from: "#166534", to: "#0a0a0a", accent: "#4ade80" },
  { from: "#155e75", to: "#0a0a0a", accent: "#22d3ee" },
];

export function gradientFor(title: string) {
  return PALETTES[seedFromString(title) % PALETTES.length];
}

export function initials(title: string): string {
  const words = title.replace(/[^a-zA-Z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function platformColor(id: PlatformId): string {
  return PLATFORMS[id]?.accent ?? "#64748b";
}

export function platformLabel(id: PlatformId): string {
  return PLATFORMS[id]?.label ?? id;
}

export function platformMonogram(id: PlatformId): string {
  return PLATFORMS[id]?.monogram ?? "—";
}
