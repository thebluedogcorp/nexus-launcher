// IconGlyph — resolves a string icon KEY to a real SVG icon from lucide-react.
//
// v4.3.1 — the app no longer uses emojis as icons. Collections and
// achievements store an `icon` field as a string KEY (e.g. "trophy",
// "folder", "gamepad"). This module maps each key to a lucide-react
// component so every icon in the app comes from a recognized icon library.
//
// Old collections created in v4.3.0 stored an emoji in `icon`. Those keys
// won't match a lucide export, so resolveIconGlyph falls back to Folder —
// the user can re-pick a real icon via the edit dialog.

import type { ComponentType, ReactNode } from "react";
import {
  Folder, Gamepad2, Trophy, Star, Heart, Flame, Target, Dice5, Palette,
  Rocket, Swords, Shield, Globe, Skull, Gem, Joystick, Puzzle, Film,
  BookOpen, Zap, Bookmark, Clock, Sparkles, Play, Search, Download, Save,
  Waves, Settings, CheckCircle, Award, Pencil, Hourglass, Library,
  ClipboardList, Landmark, Crown, Cog, Wand2, BadgePlus,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

// Map of icon KEY -> lucide component. Keys are lowercase, stable strings.
const GLYPHS: Record<string, ComponentType<LucideProps>> = {
  folder: Folder,
  gamepad: Gamepad2,
  trophy: Trophy,
  star: Star,
  heart: Heart,
  flame: Flame,
  target: Target,
  dice: Dice5,
  palette: Palette,
  rocket: Rocket,
  swords: Swords,
  shield: Shield,
  globe: Globe,
  skull: Skull,
  gem: Gem,
  joystick: Joystick,
  puzzle: Puzzle,
  film: Film,
  book: BookOpen,
  zap: Zap,
  bookmark: Bookmark,
  clock: Clock,
  sparkles: Sparkles,
  play: Play,
  search: Search,
  download: Download,
  save: Save,
  waves: Waves,
  settings: Settings,
  check: CheckCircle,
  award: Award,
  pencil: Pencil,
  hourglass: Hourglass,
  library: Library,
  clipboard: ClipboardList,
  landmark: Landmark,
  crown: Crown,
  cog: Cog,
  wand: Wand2,
  badgeplus: BadgePlus,
};

// Curated key list for the collection-icon picker (CreateCollectionDialog).
export const COLLECTION_ICON_KEYS: string[] = [
  "folder", "gamepad", "trophy", "star", "heart", "flame", "target", "dice",
  "palette", "rocket", "swords", "shield", "globe", "skull", "gem", "joystick",
  "puzzle", "film", "book", "zap", "bookmark", "clock", "sparkles", "crown",
];

/** Resolve an icon key to a lucide-react component, falling back to Folder. */
export function resolveIconGlyph(key: string): ComponentType<LucideProps> {
  return GLYPHS[key] ?? GLYPHS.folder;
}

/** Render a lucide icon by key. Returns a Folder fallback for unknown keys. */
export function IconGlyph({ k, size = 16, className }: { k: string; size?: number; className?: string }): ReactNode {
  const Cmp = resolveIconGlyph(k);
  return <Cmp size={size} strokeWidth={2} className={className} aria-hidden />;
}
