// v4.5.2 — Intelligent store-link resolver. Given a game, returns the
// official store page where the user can buy/get it — with ZERO
// configuration. The system figures out which store(s) carry the game:
//   - If the game already has a platform id (steamAppId, gogId, …) from
//     detection, deep-link straight to that store's exact app page.
//   - Otherwise, live-search the Steam store API to find the exact app id
//     by title, and deep-link to it.
//   - For stores without a known id or a reliable public search API, fall
//     back to that store's search-results page (URL-encoded title) — which
//     always works and lands the user on the official site's results for
//     the game.
// All links open in the user's default browser via shell.openExternal. The
// launcher never downloads or launches from these — they're official store
// pages, so this works for any game, paid or free, with no user setup.

import type { Game, AcquisitionOption } from "@shared/types";

// --- Per-store URL builders ---

function steamAppUrl(appId: string | number): string {
  return `https://store.steampowered.com/app/${appId}`;
}
function steamSearchUrl(title: string): string {
  return `https://store.steampowered.com/search/?term=${encodeURIComponent(title)}`;
}
function gogGameUrl(slug: string): string {
  // GOG slugs can be old-style /game/<slug> or /en/game/<slug>; normalize.
  if (slug.startsWith("http")) return slug;
  return slug.startsWith("/en/") ? `https://www.gog.com${slug}` : `https://www.gog.com/en/game/${slug}`;
}
function gogSearchUrl(title: string): string {
  return `https://www.gog.com/en/games?query=${encodeURIComponent(title)}`;
}
function epicSearchUrl(title: string): string {
  return `https://store.epicgames.com/en-US/browse?q=${encodeURIComponent(title)}&sortBy=releaseDate&sortDir=DESC`;
}
function xboxSearchUrl(title: string): string {
  return `https://www.microsoft.com/en-us/search/shop/games?q=${encodeURIComponent(title)}`;
}
function webSearchUrl(title: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(title + " game buy")}`;
}

// --- Live Steam store search (best-effort, no key, 8s timeout) ---
// The Steam storesearch endpoint is public and undocumented-but-stable.
// Returns the best-matching app id + name, or null on failure/timeout.

interface SteamSearchItem { id: number; name: string; }
export async function searchSteamStore(title: string): Promise<{ appId: string; name: string } | null> {
  const q = title.trim();
  if (!q) return null;
  const url = `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(q)}&l=english&cc=US`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json() as { total?: number; items?: SteamSearchItem[] };
    const items = data.items ?? [];
    if (items.length === 0) return null;
    // Best match: prefer an exact (case-insensitive) name match; else the first.
    const exact = items.find((it) => it.name.toLowerCase() === q.toLowerCase());
    const best = exact ?? items[0];
    return { appId: String(best.id), name: best.name };
  } catch {
    return null;
  }
}

// --- Live GOG catalog search (best-effort) ---
export async function searchGogStore(title: string): Promise<{ url: string; name: string } | null> {
  const q = title.trim();
  if (!q) return null;
  const url = `https://catalog.gog.com/v1/search?query=${encodeURIComponent(q)}&productsInPage=5&country=US&locale=en-US&order=desc:score`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json() as { products?: Array<{ title: string; url: string }> };
    const products = data.products ?? [];
    if (products.length === 0) return null;
    const exact = products.find((p) => p.title.toLowerCase() === q.toLowerCase());
    const best = exact ?? products[0];
    return { url: gogGameUrl(best.url), name: best.title };
  } catch {
    return null;
  }
}

// --- The intelligent resolver ---

export async function resolveStoreLinks(game: Game): Promise<AcquisitionOption[]> {
  const opts: AcquisitionOption[] = [];
  const title = game.title;

  // 1. Steam — exact app page if we have an id; else live-search; else search page.
  if (game.steamAppId) {
    opts.push({ sourceKind: "store-link", sourceName: "Steam", label: "Get on Steam", storeUrl: steamAppUrl(game.steamAppId), note: "Opens the official Steam store page for this game." });
  } else {
    const hit = await searchSteamStore(title);
    if (hit) {
      opts.push({ sourceKind: "store-link", sourceName: "Steam", label: "Get on Steam", storeUrl: steamAppUrl(hit.appId), note: `Found "${hit.name}" on Steam — opens the official store page.` });
    } else {
      opts.push({ sourceKind: "store-link", sourceName: "Steam", label: "Search on Steam", storeUrl: steamSearchUrl(title), note: "Opens Steam's search results for this title." });
    }
  }

  // 2. GOG — exact page if we have an id; else live catalog search; else search page.
  if (game.gogId) {
    opts.push({ sourceKind: "store-link", sourceName: "GOG", label: "Get on GOG", storeUrl: gogGameUrl(game.gogId), note: "Opens the official GOG store page for this game." });
  } else {
    const hit = await searchGogStore(title);
    if (hit) {
      opts.push({ sourceKind: "store-link", sourceName: "GOG", label: "Get on GOG", storeUrl: hit.url, note: `Found "${hit.name}" on GOG — opens the official store page.` });
    } else {
      opts.push({ sourceKind: "store-link", sourceName: "GOG", label: "Search on GOG", storeUrl: gogSearchUrl(title), note: "Opens GOG's search results for this title." });
    }
  }

  // 3. Epic — no reliable public per-game search API; use the browse page.
  opts.push({ sourceKind: "store-link", sourceName: "Epic Games", label: "Search on Epic", storeUrl: epicSearchUrl(title), note: "Opens the Epic Games Store search results for this title." });

  // 4. Xbox / Microsoft Store — search page.
  opts.push({ sourceKind: "store-link", sourceName: "Xbox / Microsoft Store", label: "Search on Xbox", storeUrl: xboxSearchUrl(title), note: "Opens the Microsoft Store search results for this title." });

  // 5. Catch-all web search.
  opts.push({ sourceKind: "store-link", sourceName: "Web", label: "Search the web", storeUrl: webSearchUrl(title), note: "Opens a web search for buying this game." });

  return opts;
}
