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
    version: "9.1.1",
    date: "2026-11-05",
    title: "Hindi Dub honesty fix — verified-playback via CineSrc, fake audio switch removed",
    kind: "major",
    items: [
      "Fix: clicking Hindi no longer errors — the broken 2Embed route (CSP-blocked + does not actually play in an iframe) has been removed",
      "Verified via network tracking: CineSrc is the ONLY source that genuinely plays (loads .m3u8 + init.mp4 + segments). 2Embed and VidSrc embeds return HTTP 200 but load only their document shell and make zero video requests — they do not play",
      "Fix: all playback now routes through CineSrc (the verified-working, CSP-allowed source) — no more ERR_BLOCKED_BY_CSP",
      "Honest redesign: removed the fake EN/हिं audio toggle that pretended to switch audio tracks (impossible cross-origin). The stream-source selector remains (CineSrc recommended; 2Embed/VidSrc labeled experimental)",
      "Hindi Dub hub is the genuine Hindi delivery: Hindi-origin titles (Bollywood etc.) play with Hindi audio automatically via CineSrc (India-focused). For Hollywood dubbed in Hindi, the player shows a one-time guide toast to pick a Hindi server in CineSrc's in-player ⚙ Settings",
      "Verified there is no URL param to force Hindi on CineSrc (embed HTML identical with/without ?lang=hi) — audio selection is inside CineSrc's player UI, so the honest path is content-selection + in-player guidance",
    ],
  },
  {
    version: "9.1.0",
    date: "2026-11-04",
    title: "Hindi Dub — dedicated hub + multi-source player with live audio-language switching",
    kind: "major",
    items: [
      "New: Hindi Dub hub (press h) — Hindi Originals (Bollywood + Hindi cinema), Hindi Series, Top-Rated Hindi Cinema, and Hollywood in Hindi (curated blockbusters widely available dubbed)",
      "New: Multi-source player engine — the player now routes to the right embed per language: CineSrc for English, 2Embed with ?aud=hi for Hindi (a real, server-accepted Hindi-audio parameter), VidSrc as a manual fallback",
      "New: Live audio-language selector in the player bar — EN / हिं toggle switches the stream on the fly (the iframe remounts via key={src}, so the switch is real, not cosmetic)",
      "New: Stream-source selector (Auto / CineSrc / 2Embed / VidSrc) for manual control when a title's Hindi track is unavailable on one source",
      "New: Watching from the Hindi Dub hub opens the player defaulted to Hindi audio; your last language choice is remembered across sessions",
      "New: Verified sources — CineSrc and 2Embed (?aud=hi) both return HTTP 200 with real player shells; per-title Hindi availability depends on the source (the selector lets you fall back instantly)",
      "New: Globe + Languages icons, keyboard shortcut h, command-palette entry, shortcuts-overlay entries, and an honest in-hub note explaining how Hindi dub works",
    ],
  },
  {
    version: "9.0.0",
    date: "2026-11-04",
    title: "OTT Premium Redesign — billboard hero, Anime + New & Popular hubs, Account with Downloads",
    kind: "major",
    items: [
      "New: Netflix-style billboard hero — N SERIES/FILM tag, green match %, maturity badge + right-edge rating strip, white Play + More Info CTAs, Ken Burns crossfade",
      "New: Anime hub (press a) — Popular Anime Series, All-Time Anime Greats, Anime Movies (Japanese animation via TMDB)",
      "New: New & Popular hub (press p) — Trending Now, New Releases, Top 10 Movies + Series, Worth the Wait",
      "New: Account & Downloads (press u) — editable profile with avatar and member-since, 8 stat cards, full downloads manager",
      "New: Downloads — adjustable download location (native folder picker), Auto Download (packages next episode when one finishes), Smart Download (removes watched episodes' packages), quality preference (Standard/High/Max), storage usage, and a downloads list with remove controls",
      "New: Download buttons on detail pages and in the player — save offline packages (title info, artwork, your rating/review/progress) to your chosen folder",
      "New: Grouped sidebar with separators — Browse / Hubs / Library / Account sections",
      "New: Home expanded to 12 rails — added Top 10 Series, Anime Spotlight, Coming Soon, Action & Adventure, Comedies (staggered loading keeps first paint instant)",
      "Polish: editorial rail titles, refined card and chip styling, responsive hero typography",
    ],
  },
  {
    version: "8.0.0",
    date: "2026-11-04",
    title: "OTT Completeness Update — episodes, enhanced search, notifications, watched tracking",
    kind: "major",
    items: [
      "New: Episodes tab on series detail pages — season selector + full episode list with stills, overviews, runtimes, air dates, ratings, per-episode watched tracking, and one-click play",
      "New: Enhanced universal search — filter panel (media type, genre multi-select, year range, min rating, sort order), instant suggestions dropdown, search history with clear, and a People row (cast/crew results with known-for titles)",
      "New: In-app Notifications center — bell in the sidebar (press b) with unread badge; auto-seeds new-episode alerts for saved/unfinished TV titles and watch-streak milestones; quiet-hours aware",
      "New: Mark as Watched / Unwatched on every title + per-episode watched checks with season progress counter",
      "New: Hide from Recommendations — bury titles you don't want surfaced",
      "New: Autoplay next episode — the player auto-advances to the next episode when one finishes (toggle in Settings)",
      "New: Expanded Settings — Playback (autoplay-next, data saver, watched badges), Parental Controls (content rating filter), Notifications (enable + quiet-hours window)",
      "New: Data-saver mode — uses smaller image sizes to reduce bandwidth",
      "New: 13 new icons (Bell, Eye, EyeOff, Filter, Sliders, Mic, History, Users, Share, Lock, Volume, Forward, CalendarCheck)",
    ],
  },
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
