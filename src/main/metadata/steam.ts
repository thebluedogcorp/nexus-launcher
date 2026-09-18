// Steam Store API client — completely free, no API key required.
//
// Endpoint: https://store.steampowered.com/api/appdetails?appids=<id>&l=english
// Returns rich data for any Steam app: name, detailed_description, header_image,
// screenshots, developers, publishers, genres, release_date, metacritic_score.
//
// Used as a secondary metadata source after RAWG (RAWG covers non-Steam games;
// Steam covers Steam games with the best screenshot galleries).

export interface SteamMetadata {
  steamAppId: number;
  title: string;
  description?: string;
  shortDescription?: string;
  developer?: string;
  publisher?: string;
  releaseDate?: string;
  genres: string[];
  headerImage?: string;       // 460x215 banner
  capsuleImage?: string;      // 231x87 small banner
  screenshots: string[];
  metacritic?: number;
  type?: string;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Steam request timed out")), ms),
    ),
  ]);
}

/** Fetch the Steam Store details for an app id. Returns null on any failure. */
export async function fetchSteamApp(appId: number | string): Promise<SteamMetadata | null> {
  const id = Number(appId);
  if (!id) return null;
  try {
    const res = await withTimeout(
      fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english`, {
        headers: { Accept: "application/json" },
      }),
      10_000,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, { success?: boolean; data?: Record<string, unknown> }>;
    const entry = json[String(id)];
    if (!entry?.success || !entry.data) return null;
    const d = entry.data;
    const screenshots = Array.isArray(d.screenshots)
      ? d.screenshots
          .map((s: Record<string, unknown>) => (s.path_full as string) || (s.path_thumbnail as string))
          .filter(Boolean)
      : [];
    const genres = Array.isArray(d.genres)
      ? d.genres.map((g: Record<string, unknown>) => String(g.description ?? "")).filter(Boolean)
      : [];
    const developers = Array.isArray(d.developers) ? d.developers : [];
    const publishers = Array.isArray(d.publishers) ? d.publishers : [];
    const releaseDate =
      d.release_date && typeof d.release_date === "object" && "date" in (d.release_date as Record<string, unknown>)
        ? String((d.release_date as Record<string, unknown>).date)
        : undefined;
    return {
      steamAppId: id,
      title: String(d.name ?? ""),
      description: d.detailed_description ? String(d.detailed_description) : undefined,
      shortDescription: d.short_description ? String(d.short_description) : undefined,
      developer: developers[0] ? String(developers[0]) : undefined,
      publisher: publishers[0] ? String(publishers[0]) : undefined,
      releaseDate,
      genres,
      headerImage: d.header_image ? String(d.header_image) : undefined,
      capsuleImage: d.capsule_image ? String(d.capsule_image) : undefined,
      screenshots: screenshots.slice(0, 8),
      metacritic:
        d.metacritic && typeof d.metacritic === "object" && "score" in (d.metacritic as Record<string, unknown>)
          ? Number((d.metacritic as Record<string, unknown>).score)
          : undefined,
      type: d.type ? String(d.type) : undefined,
    };
  } catch {
    return null;
  }
}
