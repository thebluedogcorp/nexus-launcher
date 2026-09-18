// Metadata aggregator — automatically patches a game's metadata using multiple
// sources in priority order:
//
//   1. RAWG (best for non-Steam games: Epic, GOG, console ports)
//   2. Steam Store API (best for Steam games: rich screenshot galleries, no key)
//   3. PCGamingWiki (fallback for supplementary genres / developers)
//
// The aggregator merges results: it tries each source, fills missing fields,
// and returns a single unified MetadataResult. Used by the auto-patch flow.

import type { MetadataResult } from "@shared/types";
import { searchRawg, fetchRawg, bestMatchForTitle } from "./rawg";
import { fetchSteamApp } from "./steam";

/** Resolve a game's Steam app id by title via Steam's search suggest endpoint. */
async function resolveSteamAppId(title: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(title)}&l=english&cc=us`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { total?: number; items?: Array<{ id: number; name: string }> };
    if (!json.items || json.items.length === 0) return null;
    const lower = title.trim().toLowerCase();
    // Prefer an exact name match; otherwise take the first result.
    const exact = json.items.find((it) => it.name.toLowerCase() === lower);
    return (exact ?? json.items[0]).id;
  } catch {
    return null;
  }
}

/**
 * Try every source and merge the richest result. Used for automatic patching.
 * If `steamAppId` is already known we can skip the title search.
 */
export async function fetchAggregated(
  title: string,
  steamAppId?: string | number | null,
  rawgId?: number | null,
): Promise<MetadataResult | null> {
  const tasks: Promise<MetadataResult | null>[] = [];

  // 1. RAWG — by id if known, else by title search.
  if (rawgId) {
    tasks.push(fetchRawg(rawgId));
  } else {
    tasks.push(bestMatchForTitle(title));
  }

  // 2. Steam — by id if known, else resolve by title.
  let steamId: number | null = null;
  if (steamAppId) {
    steamId = Number(steamAppId);
  } else {
    steamId = await resolveSteamAppId(title);
  }
  if (steamId) {
    tasks.push(
      fetchSteamApp(steamId).then((s) =>
        s
          ? {
              rawgId: 0,
              title: s.title,
              description: s.shortDescription || s.description,
              developer: s.developer,
              publisher: s.publisher,
              releaseDate: s.releaseDate,
              rating: s.metacritic ? s.metacritic / 20 : undefined, // 0..100 -> 0..5
              ratingCount: undefined,
              genres: s.genres,
              coverImage: s.headerImage,
              bannerImage: s.headerImage,
              screenshots: s.screenshots,
            }
          : null,
      ),
    );
  }

  const [rawg, steam] = await Promise.all(tasks);

  // Merge: prefer RAWG for descriptive fields, Steam for screenshots (richer).
  const merged: MetadataResult | null =
    rawg ?? steam ?? null;
  if (!merged) return null;

  if (steam) {
    if (!merged.bannerImage && steam.bannerImage) merged.bannerImage = steam.bannerImage;
    if (!merged.coverImage && steam.coverImage) merged.coverImage = steam.coverImage;
    if (!merged.screenshots || merged.screenshots.length === 0) {
      merged.screenshots = steam.screenshots ?? [];
    } else if (steam.screenshots && steam.screenshots.length) {
      // Combine + dedupe screenshots, Steam first (usually higher quality).
      const seen = new Set(merged.screenshots);
      for (const s of steam.screenshots) {
        if (!seen.has(s)) {
          merged.screenshots.unshift(s);
          seen.add(s);
        }
      }
      merged.screenshots = merged.screenshots.slice(0, 10);
    }
    if (!merged.developer && steam.developer) merged.developer = steam.developer;
    if (!merged.publisher && steam.publisher) merged.publisher = steam.publisher;
    if (!merged.releaseDate && steam.releaseDate) merged.releaseDate = steam.releaseDate;
    if (merged.genres.length === 0 && steam.genres.length) merged.genres = steam.genres;
    if (merged.rating === undefined && steam.rating !== undefined) merged.rating = steam.rating;
  }

  return merged;
}

export { searchRawg, fetchRawg, bestMatchForTitle, fetchSteamApp };
