// Real RAWG API client — fetches live game metadata from https://rawg.io.
//
// Requires an API key (free at https://rawg.io/apidocs). The key is stored in
// the local SQLite settings table and read via the db module.
//
// Endpoints used:
//   GET /games?key=...&search=<q>&page_size=N
//   GET /games/<id>?key=...
//
// All requests go through fetch() with a 10s timeout.

import type { MetadataResult } from "@shared/types";
import { getSetting } from "../db";

const BASE = "https://api.rawg.io/api";

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
  return fromDb || process.env.RAWG_API_KEY || null;
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
    const res = await withTimeout(
      fetch(`${BASE}/games/${rawgId}?key=${encodeURIComponent(key)}`, {
        headers: { Accept: "application/json" },
      }),
      10_000,
    );
    if (!res.ok) return null;
    const r = (await res.json()) as Record<string, unknown>;
    const developers = Array.isArray(r.developers) ? r.developers : [];
    const publishers = Array.isArray(r.publishers) ? r.publishers : [];
    const genres = Array.isArray(r.genres) ? r.genres : [];
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
      coverImage: r.background_image ? String(r.background_image) : undefined,
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
  return (
    results.find((r) => r.title.toLowerCase() === lower) ??
    results.find((r) => r.title.toLowerCase().includes(lower)) ??
    results[0]
  );
}
