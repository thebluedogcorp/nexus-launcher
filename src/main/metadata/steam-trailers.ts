// v4.6.3 — Steam trailer provider. Fetches the game's trailer from Steam's
// public appdetails API (NO API KEY REQUIRED) and constructs a direct mp4
// URL that plays in an HTML5 <video> element.
//
// The appdetails API returns a `movies` array. Each movie has an `id`. The
// old-style direct mp4 URL pattern still works:
//   https://cdn.akamai.steamstatic.com/steam/apps/<movieId>/movie_max.mp4
// (verified: returns 200 video/mp4). This is more reliable than RAWG clips
// (which need an API key + are on a separate CDN) and covers ALL Steam games.

const APPDETAILS = "https://store.steampowered.com/api/appdetails";

interface SteamMovie {
  id: number;
  name?: string;
  thumbnail?: string;
  highlight?: boolean;
}

/**
 * Fetch the best trailer mp4 URL for a Steam game. No API key needed.
 * Returns the direct mp4 URL + the thumbnail/poster, or null if no trailer.
 */
export async function fetchSteamTrailer(
  steamAppId: string,
): Promise<{ url: string; poster?: string; name?: string } | null> {
  if (!steamAppId) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(
      `${APPDETAILS}?appids=${encodeURIComponent(steamAppId)}&cc=us&l=en`,
      { signal: ctrl.signal, redirect: "follow" },
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, { success: boolean; data?: { movies?: SteamMovie[] } }>;
    const entry = data[steamAppId];
    if (!entry?.success || !entry.data?.movies?.length) return null;
    // Prefer the highlighted trailer; else the first.
    const movies = entry.data.movies;
    const movie = movies.find((m) => m.highlight) ?? movies[0];
    if (!movie?.id) return null;
    // Construct the direct mp4 URL. The old-style pattern works (verified
    // 200 video/mp4) even though the appdetails API now returns DASH/HLS.
    const url = `https://cdn.akamai.steamstatic.com/steam/apps/${movie.id}/movie_max.mp4`;
    // v4.6.3 — HEAD-check the URL before returning. Some games use a
    // different naming pattern (movie_max returns 404). In that case, try
    // movie480.mp4 as a fallback. If both fail, return null (no trailer —
    // the poster shows instead, which is correct graceful degradation).
    const head = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    if (head.ok && (head.headers.get("content-type") ?? "").includes("video")) {
      console.log(`[trailers] Steam app ${steamAppId}: found trailer ${url.slice(0, 80)}`);
      return { url, poster: movie.thumbnail, name: movie.name };
    }
    // Fallback: try the 480p version.
    const url480 = `https://cdn.akamai.steamstatic.com/steam/apps/${movie.id}/movie480.mp4`;
    const head480 = await fetch(url480, { method: "HEAD", signal: ctrl.signal });
    if (head480.ok && (head480.headers.get("content-type") ?? "").includes("video")) {
      return { url: url480, poster: movie.thumbnail, name: movie.name };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch trailers for multiple Steam games in sequence (throttled to avoid
 * rate-limiting). Returns a map of steamAppId → trailer URL.
 */
export async function batchFetchSteamTrailers(
  appIds: string[],
  onProgress?: (current: number, total: number, appId: string, result: string | null) => void,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < appIds.length; i++) {
    const appId = appIds[i];
    const result = await fetchSteamTrailer(appId);
    if (result?.url) out[appId] = result.url;
    onProgress?.(i + 1, appIds.length, appId, result?.url ?? null);
    // Small delay to be a good citizen (Steam doesn't document rate limits
    // for this endpoint, but 200ms between calls is conservative).
    if (i < appIds.length - 1) await new Promise((r) => setTimeout(r, 200));
  }
  return out;
}
