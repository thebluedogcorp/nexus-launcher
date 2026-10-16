// v4.5.0 — Download-source registry + acquisition-option resolver.
//
// Given a game, resolveAcquisitionOptions() returns the list of authorized
// ways the user can acquire it:
//   - open-source-catalog: if the game title matches a catalog entry → "Get"
//     (opens the official download page) or "Download" (if a stable direct URL
//     is known — engine-streamable).
//   - store-link: if the game has a steamAppId → "View Store" (opens the
//     official Steam store page in the browser). Other platforms fall back to
//     their storefront homepage.
//   - user-http: each user-configured HTTP source → a "Download" option (the
//     engine streams it; the user is responsible for the URL being one they
//     are authorized to download).
//
// Adapters truthfully report their capabilities. This file is the single
// integration point — adding a new authorized source means adding a branch
// here + (if it transfers files) wiring it through the DownloadManager.

import type { Game, AcquisitionOption, DownloadSourceDescriptor, HttpSourceEntry } from "@shared/types";
import { findCatalogEntry, OPEN_SOURCE_CATALOG } from "./catalog";
import { listHttpSources } from "../db";

export const SOURCE_DESCRIPTORS: DownloadSourceDescriptor[] = [
  { kind: "open-source-catalog", name: "Open-Source Games", capabilities: { search: true, download: true, storePage: false, ownership: false }, configurable: false },
  { kind: "store-link", name: "Official Store", capabilities: { search: false, download: false, storePage: true, ownership: false }, configurable: false },
  { kind: "user-http", name: "Direct HTTP", capabilities: { search: false, download: true, storePage: false, ownership: false }, configurable: true },
];

/** Resolve the official store URL for a game (only Steam has a clean app URL
 *  by id; others fall back to their storefront homepage). */
export function storeUrlFor(game: Game): string | null {
  if (game.steamAppId) {
    return `https://store.steampowered.com/app/${game.steamAppId}`;
  }
  // Other stores don't have clean public per-game URLs from their ids alone.
  switch (game.platform) {
    case "epic": return "https://store.epicgames.com/";
    case "gog": return game.gogId ? `https://www.gog.com/game/${game.gogId}` : "https://www.gog.com/";
    case "battlenet": return "https://us.shop.battle.net/";
    case "ea": return "https://www.ea.com/store";
    case "ubisoft": return "https://store.ubi.com/";
    case "riot": return "https://playvalorant.com/";
    case "xbox": return "https://www.xbox.com/games";
    default: return null;
  }
}

/** Resolve every acquisition option for a game. */
export function resolveAcquisitionOptions(game: Game): AcquisitionOption[] {
  const opts: AcquisitionOption[] = [];

  // 1. Open-source catalog match.
  const cat = findCatalogEntry(game.title);
  if (cat) {
    if (cat.directDownloadUrl) {
      opts.push({
        sourceKind: "open-source-catalog",
        sourceName: "Open-Source Games",
        label: "Download",
        downloadUrl: cat.directDownloadUrl,
        totalBytes: cat.directDownloadSize ?? null,
        sha256: cat.directDownloadSha256 ?? null,
        note: "Free, open-source. Downloaded + verified by NEXUS.",
      });
    } else {
      opts.push({
        sourceKind: "open-source-catalog",
        sourceName: "Open-Source Games",
        label: "Get",
        storeUrl: cat.downloadPageUrl,
        note: "Free, open-source. Opens the official download page.",
      });
    }
  }

  // 2. Official store page.
  const storeUrl = storeUrlFor(game);
  if (storeUrl) {
    opts.push({
      sourceKind: "store-link",
      sourceName: game.platform === "steam" ? "Steam Store" : "Official Store",
      label: game.platform === "steam" ? "View Store" : "View Store",
      storeUrl,
      note: game.platform === "steam" ? "Opens the Steam store page." : "Opens the official store.",
    });
  }

  // 3. User-configured HTTP sources (the user is responsible for authorization).
  const httpSources = listHttpSources();
  for (const s of httpSources) {
    opts.push({
      sourceKind: "user-http",
      sourceName: s.name || "Direct HTTP",
      label: "Download",
      downloadUrl: s.url,
      note: s.note ?? "User-configured direct download. You are responsible for ensuring you are authorized to download this content.",
    });
  }

  return opts;
}

/** The catalog search (used by the "Add Game → Browse catalog" flow). */
export function searchCatalog(query: string): { title: string; developer: string; description: string; downloadPageUrl: string; homepage: string; genres: string[] }[] {
  const q = query.trim().toLowerCase();
  if (!q) return OPEN_SOURCE_CATALOG.map((e) => ({ title: e.title, developer: e.developer, description: e.description, downloadPageUrl: e.downloadPageUrl, homepage: e.homepage, genres: e.genres }));
  return OPEN_SOURCE_CATALOG
    .filter((e) => e.title.toLowerCase().includes(q) || e.developer.toLowerCase().includes(q) || e.genres.some((g) => g.toLowerCase().includes(q)))
    .map((e) => ({ title: e.title, developer: e.developer, description: e.description, downloadPageUrl: e.downloadPageUrl, homepage: e.homepage, genres: e.genres }));
}
