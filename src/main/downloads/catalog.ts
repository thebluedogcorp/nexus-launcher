// v4.5.0 — Open-source game catalog. A curated list of REAL free/open-source
// games, each with a link to its OFFICIAL download page. The "Get" action for
// these opens the official page in the user's browser — the user downloads
// from the authoritative source, which is the legitimate, authorized path.
//
// Where a stable, legally-distributable DIRECT download URL is known, it is
// provided as a `directDownloadUrl` so the download engine can stream it
// directly. Most open-source projects version their release-asset filenames,
// so stable direct URLs are rare; the official download page is the default.
//
// To ADD a game: append to CATALOG below. Match is by normalized title.

import type { PlatformId } from "@shared/types";

export interface CatalogEntry {
  title: string;
  developer: string;
  publisher: string;
  homepage: string;
  downloadPageUrl: string;        // official download page (browser-open)
  directDownloadUrl?: string;    // stable direct http(s) URL (rare; engine-streamable)
  directDownloadSize?: number;   // bytes, if known
  directDownloadSha256?: string;  // expected hash, if known
  description: string;
  genres: string[];
  releaseDate: string;           // ISO or year
  coverColor: string;            // for procedural cover art
}

export const OPEN_SOURCE_CATALOG: CatalogEntry[] = [
  {
    title: "SuperTuxKart",
    developer: "STK Team",
    publisher: "Community",
    homepage: "https://supertuxkart.net/",
    downloadPageUrl: "https://supertuxkart.net/Download",
    description: "A 3D open-source kart racer — Mario Kart-style fun with mascots from open-source projects. Free, cross-platform, community-developed.",
    genres: ["Racing", "Arcade", "Multiplayer"],
    releaseDate: "2007",
    coverColor: "#1e7fd0",
  },
  {
    title: "0 A.D.",
    developer: "Wildfire Games",
    publisher: "Community",
    homepage: "https://play0ad.com/",
    downloadPageUrl: "https://play0ad.com/download/",
    description: "A free, open-source real-time strategy game of ancient warfare. Empires, economy, and large-scale battles.",
    genres: ["Strategy", "RTS", "Historical"],
    releaseDate: "2002",
    coverColor: "#8a6d3b",
  },
  {
    title: "Mindustry",
    developer: "Anuken",
    publisher: "AnukenDev",
    homepage: "https://anuke.itch.io/mindustry",
    downloadPageUrl: "https://github.com/Anuken/Mindustry/releases",
    description: "A hybrid tower-defense + factory game. Build production chains, defend your core, launch attacks. Open-source (GPL).",
    genres: ["Tower Defense", "Factory", "Strategy"],
    releaseDate: "2017",
    coverColor: "#ffcd3c",
  },
  {
    title: "OpenTTD",
    developer: "OpenTTD Team",
    publisher: "Community",
    homepage: "https://www.openttd.org/",
    downloadPageUrl: "https://www.openttd.org/downloads/openttd-releases/latest",
    description: "An open-source simulation game based on Transport Tycoon Deluxe. Build transport networks by rail, road, air, sea.",
    genres: ["Simulation", "Management", "Sandbox"],
    releaseDate: "2004",
    coverColor: "#2d7a3e",
  },
  {
    title: "Shattered Pixel Dungeon",
    developer: "Evan Debenham",
    publisher: "00-Evan",
    homepage: "https://shatteredpixel.com/",
    downloadPageUrl: "https://github.com/00-Evan/shattered-pixel-dungeon/releases",
    description: "A roguelike dungeon crawler — descend floors, collect gear, fight monsters. Open-source (GPL), polished pixel art.",
    genres: ["Roguelike", "RPG", "Dungeon Crawler"],
    releaseDate: "2014",
    coverColor: "#7b3fa0",
  },
  {
    title: "Battle for Wesnoth",
    developer: "Wesnoth Team",
    publisher: "Community",
    homepage: "https://www.wesnoth.org/",
    downloadPageUrl: "https://www.wesnoth.org/get-wesnoth/",
    description: "A turn-based strategy game with a high fantasy theme. Single-player campaigns + multiplayer, open-source (GPL).",
    genres: ["Turn-Based Strategy", "Fantasy", "RPG"],
    releaseDate: "2003",
    coverColor: "#5c4a2a",
  },
  {
    title: "Veloren",
    developer: "Veloren Community",
    publisher: "Community",
    homepage: "https://veloren.net/",
    downloadPageUrl: "https://veloren.net/download/",
    description: "An open-world, open-source action RPG in voxel style. Crafting, combat, exploration. Written in Rust (GPL).",
    genres: ["Action RPG", "Open World", "Voxel"],
    releaseDate: "2018",
    coverColor: "#d98a3b",
  },
  {
    title: "Endless Sky",
    developer: "Michael Z \"endless_sky\"",
    publisher: "Community",
    homepage: "https://endless-sky.github.io/",
    downloadPageUrl: "https://github.com/endless-sky/endless-sky/releases",
    description: "A 2D space exploration + trading + combat game. Open-source (GPL), inspired by Escape Velocity.",
    genres: ["Space Sim", "Trading", "Exploration"],
    releaseDate: "2015",
    coverColor: "#1a2b4a",
  },
  {
    title: "Freeciv",
    developer: "Freeciv Project",
    publisher: "Community",
    homepage: "https://www.freeciv.org/",
    downloadPageUrl: "https://www.freeciv.org/download/",
    description: "A free, open-source empire-building strategy game inspired by Civilization. Single + multiplayer (GPL).",
    genres: ["Turn-Based Strategy", "4X", "Historical"],
    releaseDate: "1995",
    coverColor: "#6b5b3a",
  },
  {
    title: "Cataclysm: Dark Days Ahead",
    developer: "CDDA Community",
    publisher: "Community",
    homepage: "https://cataclysmdda.org/",
    downloadPageUrl: "https://cataclysmdda.org/releases/",
    description: "A post-apocalyptic survival roguelike. Scavenge, craft, survive zombies + worse. Open-source (CC BY-SA).",
    genres: ["Roguelike", "Survival", "Post-Apocalyptic"],
    releaseDate: "2013",
    coverColor: "#3a3a3a",
  },
];

/** Normalize a title for matching: lowercase, alnum-only. */
export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Find a catalog entry matching the given game title (normalized, includes-substring). */
export function findCatalogEntry(title: string): CatalogEntry | null {
  const nt = normalizeTitle(title);
  if (!nt) return null;
  // Exact match first, then prefix, then substring.
  let hit = OPEN_SOURCE_CATALOG.find((e) => normalizeTitle(e.title) === nt);
  if (!hit) hit = OPEN_SOURCE_CATALOG.find((e) => normalizeTitle(e.title).startsWith(nt) || nt.startsWith(normalizeTitle(e.title)));
  if (!hit) hit = OPEN_SOURCE_CATALOG.find((e) => normalizeTitle(e.title).includes(nt) || nt.includes(normalizeTitle(e.title)));
  return hit ?? null;
}
