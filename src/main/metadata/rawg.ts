// Real RAWG API client — fetches live game metadata from https://rawg.io.
//
// Requires an API key (free at https://rawg.io/apidocs). The key is stored in
// the local SQLite settings table and read via the db module.
//
// A built-in default key is shipped with the app so metadata works out of the
// box — the user can override it in Settings.
//
// Endpoints used:
//   GET /games?key=...&search=<q>&page_size=N
//   GET /games/<id>?key=...                          (full details + screenshots)
//   GET /games/<id>/screenshots?key=...             (gallery)
//
// All requests go through fetch() with a 10s timeout.

import type { MetadataResult } from "@shared/types";
import { getSetting } from "../db";

const BASE = "https://api.rawg.io/api";

// Built-in default key so the launcher works out of the box. The user can
// override this in Settings → RAWG API Key.
const DEFAULT_API_KEY = "b40b7e92960a8a24bae2e6df1b40a";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("RAWG request timed out")), ms),
    ),
  ]);
}

async function getApiKey(): Promise<string | null> {
  const fromDb = await getSetting("rawgApiKey");
  return fromDb || DEFAULT_API_KEY || process.env.RAWG_API_KEY || null;
}

export interface RawgScreenshot {
  id: number;
  image: string;
  width: number;
  height: number;
}

/** Fetch the screenshot gallery for a RAWG game id. */
export async function fetchScreenshots(rawgId: number): Promise<RawgScreenshot[]> {
  const key = await getApiKey();
  if (!key) return [];
  try {
    const res = await withTimeout(
      fetch(`${BASE}/games/${rawgId}/screenshots?key=${encodeURIComponent(key)}`, {
        headers: { Accept: "application/json" },
      }),
      10_000,
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
    return (json.results ?? [])
      .filter((r) => r.image)
      .map((r) => ({
        id: Number(r.id),
        image: String(r.image),
        width: Number(r.width) || 0,
        height: Number(r.height) || 0,
      }));
  } catch {
    return [];
  }
}

export async function searchRawg(query: string, limit = 8): Promise<MetadataResult[]> {
  const key = await getApiKey();
  if (!key) return [];
  const q = query.trim();
  if (!q) return [];
  try {
    const url = `${BASE}/games?key=${encodeURIComponent(
      key,
    )}&search=${encodeURIComponent(q)}&page_size=${limit}`;
    const res = await withTimeout(
      fetch(url, { headers: { Accept: "application/json" } }),
      10_000,
    );
    if (!res.ok) throw new Error(`RAWG ${res.status}`);
    const json = (await res.json()) as {
      results?: Array<Record<string, unknown>>;
    };
    const out: MetadataResult[] = [];
    for (const r of json.results ?? []) {
      out.push({
        rawgId: Number(r.id),
        title: String(r.name ?? ""),
        releaseDate: r.released ? String(r.released) : undefined,
        rating: typeof r.rating === "number" ? r.rating : undefined,
        ratingCount:
          typeof r.ratings_count === "number" ? r.ratings_count : undefined,
        genres: Array.isArray(r.genres)
          ? r.genres
              .map((g: Record<string, unknown>) => String(g.name ?? ""))
              .filter(Boolean)
          : [],
        coverImage: r.background_image ? String(r.background_image) : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchRawg(rawgId: number): Promise<MetadataResult | null> {
  const key = await getApiKey();
  if (!key) return null;
  try {
    // Fetch the game details and its screenshot gallery in parallel.
    const [detailsRes, shotsRes] = await Promise.all([
      withTimeout(
        fetch(`${BASE}/games/${rawgId}?key=${encodeURIComponent(key)}`, {
          headers: { Accept: "application/json" },
        }),
        10_000,
      ),
      fetchScreenshots(rawgId),
    ]);
    if (!detailsRes.ok) return null;
    const r = (await detailsRes.json()) as Record<string, unknown>;
    const developers = Array.isArray(r.developers) ? r.developers : [];
    const publishers = Array.isArray(r.publishers) ? r.publishers : [];
    const genres = Array.isArray(r.genres) ? r.genres : [];
    const banner = r.background_image ? String(r.background_image) : undefined;
    // RAWG also exposes an additional_images array with wider crops.
    const additional = Array.isArray(r.background_image_additional)
      ? (r.background_image_additional as string[]).filter(Boolean)
      : [];
    const screenshots = Array.from(
      new Set([...shotsRes.map((s) => s.image), ...additional]),
    ).slice(0, 8);
    return {
      rawgId: Number(r.id),
      title: String(r.name ?? ""),
      developer: developers[0]?.name ? String(developers[0].name) : undefined,
      publisher: publishers[0]?.name ? String(publishers[0].name) : undefined,
      releaseDate: r.released ? String(r.released) : undefined,
      rating: typeof r.rating === "number" ? r.rating : undefined,
      ratingCount:
        typeof r.ratings_count === "number" ? r.ratings_count : undefined,
      genres: genres
        .map((g: Record<string, unknown>) => String(g.name ?? ""))
        .filter(Boolean),
      description: r.description_raw
        ? String(r.description_raw)
        : r.description
          ? String(r.description)
          : undefined,
      coverImage: banner,
      bannerImage: banner,
      screenshots,
    };
  } catch {
    return null;
  }
}

/** Best RAWG match for a free-text title (used during metadata patch). */
export async function bestMatchForTitle(
  title: string,
): Promise<MetadataResult | null> {
  const results = await searchRawg(title, 5);
  if (results.length === 0) return null;
  const lower = title.trim().toLowerCase();
  const best =
    results.find((r) => r.title.toLowerCase() === lower) ??
    results.find((r) => r.title.toLowerCase().includes(lower)) ??
    results[0];
  // Upgrade to the full record so we get banner + screenshots + description.
  if (best) {
    const full = await fetchRawg(best.rawgId);
    if (full) return full;
  }
  return best;
}
