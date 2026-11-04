// v7.3.0 — NEXUS TV changelog.
// Every version's changes are recorded here. The "What's New" modal reads
// this so users can see exactly what each update added — making the
// autonomous update pipeline visible inside the app.

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
  kind: "major" | "feature" | "polish";
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "7.3.0",
    date: "2026-11-04",
    title: "What's New panel + filmic grain + update pipeline",
    kind: "feature",
    items: [
      "New: What's New panel — see every version's changes inside the app (this panel)",
      "New: Filmic grain + vignette overlay for a cinematic feel across all views",
      "New: Sidebar 'What's New' button with a rose notification dot on updates",
      "Autonomous update pipeline: the app now improves itself on a schedule",
    ],
  },
  {
    version: "7.2.0",
    date: "2026-11-03",
    title: "20+ major features: Stats, Collections, Discover, ratings, reviews",
    kind: "major",
    items: [
      "New: Statistics Dashboard — watch streak, 6 stat cards, average rating",
      "New: Collections — user-created playlists with poster-stack thumbnails",
      "New: Discover — Daily Pick, mood-based recommendations (5 moods), Discovery Shuffle",
      "New: User star rating (1-10) on every detail page",
      "New: My Review tab — personal notes + reviews per title",
      "New: Add to Collection dropdown on detail pages",
      "Fixed: YouTube trailer 'Video Player Configuration Error'",
      "Fixed: Info panel overlapping the poster",
      "Fixed: Duplicate search buttons (now one)",
    ],
  },
  {
    version: "7.1.0",
    date: "2026-11-03",
    title: "Completely redesigned detail/info page",
    kind: "major",
    items: [
      "Cinematic hero: taller (58vh), Ken Burns zoom, deeper gradients",
      "Rating ring: circular SVG with TMDB percentage score",
      "Action bar: Watch Now / Trailer / IMDb / Homepage",
      "Tabbed info panel: Overview / Cast & Crew / Where to Watch / Facts",
      "Top-bar icon actions: My List toggle + Copy Link",
    ],
  },
  {
    version: "7.0.0",
    date: "2026-11-03",
    title: "Major UI overhaul: glitch fixes, immersive hero, keep-alive",
    kind: "major",
    items: [
      "Fixed: poster collapsed to 23px (now 228px)",
      "Fixed: ambient backdrop covering the sidebar",
      "Fixed: view-transition remount flash (keep-alive home)",
      "Fixed: z-index conflicts across overlays",
      "New: Ken Burns hero zoom + Because You Watched rail",
      "Screen real estate: taller hero, wider rails, denser cards",
    ],
  },
  {
    version: "6.7.0",
    date: "2026-11-03",
    title: "Genre quick-bar + Copy Link",
    kind: "feature",
    items: [
      "New: Browse-by-genre quick bar on home (14 chips)",
      "New: Copy Link button on detail pages",
    ],
  },
  {
    version: "6.6.0",
    date: "2026-11-03",
    title: "Hero Watch Trailer + ambient detail backdrop",
    kind: "feature",
    items: [
      "New: Watch Trailer button on hero + YouTube trailer modal",
      "New: Ambient blurred backdrop on detail pages",
    ],
  },
  {
    version: "6.5.0",
    date: "2026-11-03",
    title: "Settings panel + My List badge + shortcuts",
    kind: "feature",
    items: [
      "New: Settings panel (hero autoplay, reduced motion, clear data)",
      "New: My List count badge in the sidebar",
      "New: 's' = Surprise Me, ',' = Settings shortcuts",
    ],
  },
  {
    version: "6.4.0",
    date: "2026-11-03",
    title: "Toast notifications + Surprise Me",
    kind: "feature",
    items: [
      "New: Toast notification system (success/info/error)",
      "New: Surprise Me — random pick + instant playback",
    ],
  },
  {
    version: "6.3.0",
    date: "2026-11-03",
    title: "Keyboard shortcuts overlay + Recently Viewed",
    kind: "feature",
    items: [
      "New: Keyboard shortcuts overlay (press ?)",
      "New: Recently Viewed rail with clear button",
    ],
  },
  {
    version: "6.2.0",
    date: "2026-11-03",
    title: "Command palette + hero arrows + NEW badges",
    kind: "feature",
    items: [
      "New: Command palette (Ctrl+K) with fuzzy search",
      "New: Hero manual prev/next arrows + Up Next chip",
      "New: NEW badge on recent releases",
    ],
  },
  {
    version: "6.1.0",
    date: "2026-11-03",
    title: "Hover previews + Top 10 + arrow-key nav",
    kind: "feature",
    items: [
      "New: Netflix-style hover preview popovers",
      "New: Top 10 Movies rail with numbered stroked numerals",
      "New: Arrow-key navigation across cards",
      "New: Scroll-to-top FAB + view transitions",
    ],
  },
  {
    version: "6.0.0",
    date: "2026-11-03",
    title: "Entertainment UI overhaul — full OTT design system",
    kind: "major",
    items: [
      "Complete NEXUS TV design system: rose identity, glass surfaces",
      "App shell: icon sidebar, floating clock, keyboard shortcuts",
      "Cinematic hero + landscape rails + poster grids",
      "Browse / My List / Search / Detail / Player views",
      "Full CineSrc streaming playback with local progress tracking",
    ],
  },
];

export function getLatestVersion(): ChangelogEntry {
  return CHANGELOG[0];
}
