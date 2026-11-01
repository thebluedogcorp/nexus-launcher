#!/usr/bin/env python3
"""Generate dist-renderer/test-mock.html from the built index.html.

Injects a comprehensive window.nexus stub (mock IPC) so the renderer bundle
can run in a plain browser (no Electron) for agent-browser QA. The stub
returns safe defaults for every channel and mock TMDB data for the new
Entertainment mode.
"""
import re
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist-renderer"
SRC = DIST / "index.html"
OUT = DIST / "test-mock.html"

if not SRC.exists():
    print("ERROR: dist-renderer/index.html not found — run `npx vite build` first", file=sys.stderr)
    sys.exit(1)

html = SRC.read_text(encoding="utf-8")

# Strip the CSP meta so the mock browser can run inline scripts + load images freely.
html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', "", html)

STUB = r"""
<script>
// ===== MOCK window.nexus — mirrors preload.ts surface with safe defaults =====
(function () {
  const noop = () => {};
  const pend = (v) => Promise.resolve(v);
  const unsub = () => () => {};

  // Mock TMDB items (movies + tv) with real-ish poster/backdrop paths so images load.
  const mockItems = [
    { id: 1, title: "Echoes of Tomorrow", overview: "A lone engineer races to decode a signal from a dying star before its collapse erases humanity's last archive.", posterPath: "/8Gxv8dS7yKh4xTMutVqUuT5v5i7.jpg", backdropPath: "/3Ggz7tX1x5Qz5Z5z5z5z5.jpg", rating: 8.4, year: "2025", genreIds: [878, 18], mediaType: "movie" },
    { id: 2, title: "The Last Frontier", overview: "On the edge of charted space, a salvage crew uncovers a derelict habitat hiding a living secret.", posterPath: "/kAVRgw7GgK1Ccr7l5Z5z5.jpg", backdropPath: "/9Gxv8dS7yKh4xTMutVqUuT5v5i8.jpg", rating: 7.9, year: "2024", genreIds: [878, 28], mediaType: "movie" },
    { id: 3, title: "Crimson Tide Rising", overview: "A coastal town confronts an ancient force awakened by deep-sea drilling.", posterPath: "/lAVRgw7GgK1Ccr7l5Z5z6.jpg", backdropPath: "/7Gxv8dS7yKh4xTMutVqUuT5v6i7.jpg", rating: 7.2, year: "2025", genreIds: [27, 53], mediaType: "movie" },
    { id: 4, title: "Neon Hearts", overview: "Two strangers cross paths nightly in a rain-soaked metropolis that never sleeps.", posterPath: "/mAVRgw7GgK1Ccr7l5Z5z7.jpg", backdropPath: "/5Gxv8dS7yKh4xTMutVqUuT5v7i8.jpg", rating: 8.1, year: "2023", genreIds: [18, 10749], mediaType: "movie" },
    { id: 5, title: "The Quantum Heist", overview: "A thief who can glimpse thirty seconds into the future plans one final impossible job.", posterPath: "/nAVRgw7GgK1Ccr7l5Z5z8.jpg", backdropPath: "/4Gxv8dS7yKh4xTMutVqUuT5v8i7.jpg", rating: 8.6, year: "2025", genreIds: [28, 12], mediaType: "movie" },
    { id: 6, title: "Silent Kingdom", overview: "A wildlife dynasty endures drought, fire, and rival predators across a vanishing savanna.", posterPath: "/pAVRgw7GgK1Ccr7l5Z5z9.jpg", backdropPath: "/2Gxv8dS7yKh4xTMutVqUuT5v9i7.jpg", rating: 8.8, year: "2024", genreIds: [99], mediaType: "tv" },
    { id: 7, title: "Verdant", overview: "A botanist returns to her ancestral village to find the forest has begun to remember.", posterPath: "/qAVRgw7GgK1Ccr7l5Z5a0.jpg", backdropPath: "/1Gxv8dS7yKh4xTMutVqUuT5a0i7.jpg", rating: 7.5, year: "2025", genreIds: [18, 14], mediaType: "tv" },
    { id: 8, title: "Orbital", overview: "Six astronauts aboard a failing station must choose who lives when the air runs out.", posterPath: "/rAVRgw7GgK1Ccr7l5Z5a1.jpg", backdropPath: "/8Hxv8dS7yKh4xTMutVqUuT5a1i7.jpg", rating: 8.2, year: "2024", genreIds: [18, 878], mediaType: "tv" },
  ];

  const mockMovies = mockItems.map(m => ({ ...m, mediaType: "movie" }));
  const mockTv = mockItems.slice(4).map(m => ({ ...m, mediaType: "tv" }));

  function mockDetails(mediaType, id) {
    const base = mockItems.find(m => m.id === id) || mockItems[0];
    return {
      ...base,
      mediaType: "movie",
      tagline: "Every ending has a beginning.",
      runtime: mediaType === "tv" ? 52 : 124,
      status: "Released",
      homepage: "https://example.com/" + base.id,
      imdbId: mediaType === "tv" ? null : "tt" + String(1000000 + base.id),
      genres: [{ id: 1, name: "Drama" }, { id: 2, name: "Sci-Fi" }, { id: 3, name: "Thriller" }],
      cast: Array.from({ length: 8 }).map((_, i) => ({
        id: 100 + i, name: ["Maya Chen", "Eli Voss", "Aria Khan", "Tom Reyes", "Lena Park", "Jet Cole", "Iris Vale", "Kai Dodd"][i],
        character: ["Lead", "Engineer", "Captain", "Rogue", "Scientist", "Pilot", "Archivist", "Hunter"][i],
        profilePath: i % 2 ? "/yFhhS7yKh4xTMutVqUuT5v5i7.jpg" : null,
      })),
      director: mediaType === "tv" ? null : "N. Adeyemi",
      trailerKey: "dQw4w9WgXcQ",
      providers: [
        { providerId: 8, providerName: "Netflix", logoPath: "/9ghg7yKh4xTMutVqUuT5v5i7.jpg" },
        { providerId: 119, providerName: "Amazon Prime", logoPath: "/8ghg7yKh4xTMutVqUuT5v5i8.jpg" },
      ],
      providerLink: "https://www.justwatch.com",
      numberOfSeasons: mediaType === "tv" ? 3 : null,
      numberOfEpisodes: mediaType === "tv" ? 24 : null,
    };
  }

  window.nexus = {
    // Games
    listGames: () => pend([]),
    getGame: () => pend(null),
    addGame: (i) => pend({ id: 1, title: i.title, platform: i.platform || "steam", installed: true, favorite: false, hidden: false, playtimeSec: 0, launchCount: 0, lastPlayedAt: null, sizeBytes: i.sizeBytes || null, executable: i.executable || null, installDir: i.installDir || null, coverImage: null, bannerImage: null, description: null, developer: null, publisher: null, releaseDate: null, rating: null, ratingCount: null, genres: [], tags: [], rawgId: null, source: "manual", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    updateGame: (id, p) => pend({ id, ...p }),
    deleteGame: () => pend(true),
    launchGame: () => pend({ ok: true, message: "launched", startedAt: new Date().toISOString() }),
    patchMetadata: () => pend(null),
    patchAllMetadata: () => pend({ patched: 0, attempted: 0 }),
    onPatchProgress: unsub, onPatchGameUpdated: unsub, onPatchDone: unsub,
    // Auto-update
    checkForUpdates: () => pend({ ok: true, message: "no update", updateAvailable: false }),
    downloadAndInstallUpdate: () => pend({ ok: false, message: "mock" }),
    onUpdateProgress: unsub,
    cleanupInstallers: () => pend({ ok: true, bytesFreed: 0, filesRemoved: [], message: "mock" }),
    getInstallerCacheInfo: () => pend({ bytes: 0, files: [] }),
    openExternal: () => pend({ ok: true }),
    openPath: () => pend({ ok: true }),
    pickFile: () => pend({ ok: false, path: null }),
    pickFolder: () => pend({ ok: false, path: null }),
    exportLibrary: () => pend("[]"),
    importLibrary: () => pend({ imported: 0, skipped: 0 }),
    checkMissingGames: () => pend([]),
    getDetailedStats: () => pend({ totalGames: 0, totalPlaytimeSec: 0, totalLaunches: 0, totalSizeBytes: 0, avgRating: null, favorites: 0, hidden: 0, byPlatform: {}, byStatus: {}, byGenre: {}, topPlayed: [], recentlyPlayed: [], recentlyAdded: [], largestGames: [], neverPlayed: 0, completionRate: 0 }),
    recordSession: () => pend(true),
    // Collections
    listCollections: () => pend([]),
    createCollection: (i) => pend({ id: 1, name: i.name, icon: i.icon || "folder", color: i.color || null, description: i.description || null, pinned: false, sortOrder: 0 }),
    updateCollection: (id, p) => pend({ id, ...p }),
    addGameToCollection: () => pend(true),
    removeGameFromCollection: () => pend(true),
    deleteCollection: () => pend(true),
    reorderCollections: () => pend(true),
    getGamesInCollection: () => pend([]),
    getCollectionsForGame: () => pend([]),
    // Themes
    listThemes: () => pend([]),
    getTheme: () => pend(null),
    createTheme: (n) => pend({ id: 1, name: n, config: {}, createdAt: new Date().toISOString() }),
    updateTheme: (id, p) => pend({ id, ...p }),
    deleteTheme: () => pend(true),
    duplicateTheme: (id, n) => pend({ id: 2, name: n, config: {} }),
    verifyInstalled: () => pend(true),
    verifyAllInstalled: () => pend([]),
    resolveStoreLinks: () => pend([]),
    // Plugins
    pluginsList: () => pend([]),
    pluginsInstall: () => pend({ error: "mock" }),
    pluginsInstallFromCode: () => pend({ error: "mock" }),
    pluginsEnable: () => pend(true),
    pluginsDisable: () => pend(true),
    pluginsRemove: () => pend(true),
    pluginsReadEntry: () => pend(null),
    pluginsMarkError: () => pend(true),
    pluginsStorageGet: () => pend(null),
    pluginsStorageSet: () => pend(true),
    pluginsSelectDir: () => pend(null),
    pluginsCheckUpdates: () => pend({ ok: true, updates: [] }),
    pluginsUpdateFromCode: () => pend({ error: "mock" }),
    pluginsNetworkFetch: () => pend({ ok: false, status: 0, body: "" }),
    pluginsClipboardRead: () => pend(""),
    pluginsClipboardWrite: () => pend(true),
    pluginsShowItemInFolder: () => pend({ ok: true }),
    // TMDB
    tmdbTrending: () => pend(mockMovies),
    tmdbTrendingAll: () => pend(mockItems),
    tmdbPopular: () => pend(mockMovies),
    tmdbTopRated: () => pend(mockMovies),
    tmdbNowPlaying: () => pend(mockMovies),
    tmdbPopularTv: () => pend(mockTv),
    tmdbTopRatedTv: () => pend(mockTv),
    tmdbByGenre: () => pend(mockMovies),
    tmdbSearch: () => pend(mockMovies),
    tmdbSearchMulti: (q) => pend(mockItems.filter(m => m.title.toLowerCase().includes((q || "").toLowerCase()))),
    tmdbDetails: (id) => pend(mockDetails("movie", id)),
    tmdbDetailsTv: (id) => pend(mockDetails("tv", id)),
    tmdbDetailsAny: (mt, id) => pend(mockDetails(mt, id)),
    tmdbOpenExternal: () => pend({ ok: true }),
    // Achievements
    getAchievements: () => pend([]),
    checkAchievements: () => pend({ newlyUnlocked: [] }),
    // Scan
    runScan: () => pend({ detected: [], summary: { total: 0, byPlatform: {}, scannedPlatforms: [] } }),
    onScanProgress: unsub,
    importDetected: () => pend([]),
    scanFilesystem: () => pend({ detected: [], totalFound: 0, skipped: 0, errors: [] }),
    // Metadata
    searchMetadata: () => pend([]),
    // Stats & settings
    getStats: () => pend({ totalGames: 0, byPlatform: {}, totalPlaytimeSec: 0, totalLaunches: 0, totalSizeBytes: 0, favorites: 0, avgRating: null, playedToday: 0 }),
    getSettings: () => pend({}),
    setSettings: (s) => pend(s),
    // Playtime
    stopPlaytimeTracking: () => pend({ durationSec: 0 }),
    getActivePlaytimeSessions: () => pend([]),
    getPlaytimeSessions: () => pend([]),
    getPlaytimeSummaries: () => pend([]),
    onPlaytimeStarted: unsub, onPlaytimeTick: unsub, onPlaytimeStopped: unsub,
    // Startup & close
    isLaunchOnStartupEnabled: () => pend(false),
    setLaunchOnStartup: () => pend(true),
    getCloseBehavior: () => pend("exit"),
    setCloseBehavior: () => pend("exit"),
    // Overlay
    overlayToggle: () => pend(false), overlayShow: () => pend(false), overlayHide: () => pend(false),
    overlayToggleClickThrough: () => pend(false),
    overlayGetActiveConfig: () => pend({ config: null, gameId: null }),
    overlayGetProfile: () => pend(null), overlaySaveProfile: () => pend(true), overlayDeleteProfile: () => pend(true),
    overlayGetAllProfiles: () => pend([]),
    overlayGetStats: () => pend({ cpu: { usage: 0, temp: null }, gpu: { usage: 0, temp: null }, ram: { totalGB: 16, usedGB: 4, usagePct: 25 }, vram: { totalGB: 8, usedGB: 2, usagePct: 25 }, fps: 60, frametime: 16.6, network: { downloadMbps: 0, uploadMbps: 0, pingMs: null }, audioLevel: 50 }),
    overlayOpenUrl: () => pend(true),
    overlayGetActiveGame: () => pend(null),
    onOverlayShown: unsub, onOverlayConfigChanged: unsub, onOverlayClickThrough: unsub,
  };

  // Capture console errors for QA reporting.
  window.__mockErrors = [];
  const origErr = console.error.bind(console);
  console.error = function (...a) {
    try { window.__mockErrors.push(a.map(x => (x && x.stack) ? x.stack : String(x)).join(" ")); } catch (e) {}
    origErr(...a);
  };
  window.addEventListener("error", (e) => {
    window.__mockErrors.push("window.error: " + (e.error && e.error.stack ? e.error.stack : e.message));
  });
  window.addEventListener("unhandledrejection", (e) => {
    window.__mockErrors.push("unhandledrejection: " + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason)));
  });
})();
</script>
"""

# Inject the stub right before the bundle <script type="module"> tag.
html = html.replace('<script type="module"', STUB + '\n<script type="module"', 1)

OUT.write_text(html, encoding="utf-8")
print(f"Wrote {OUT}")
