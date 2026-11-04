// v6.5.0 — NEXUS TV preferences store.
// v8.0.0 — expanded: autoplay-next, data saver, parental controls, quiet hours,
//          show-watched-badges. Persists user settings to localStorage with a
//          tiny pub/sub so settings panels re-render live.

const PREFS_KEY = "nx-ent-prefs";

export interface EntPrefs {
  /** Auto-advance the hero carousel every 8s. */
  heroAutoplay: boolean;
  /** Respect prefers-reduced-motion (disable non-essential animations). */
  reduceMotion: boolean;
  /** Show the NEW badge on recent releases. */
  showNewBadges: boolean;
  /** v8.0.0 — auto-play the next episode when the current one finishes. */
  autoplayNext: boolean;
  /** v8.0.0 — data saver: use smaller image sizes (w185/w342 instead of w500/w1280). */
  dataSaver: boolean;
  /** v8.0.0 — show a "Watched" check overlay on cards you've marked watched. */
  showWatchedBadges: boolean;
  /** v8.0.0 — parental control max content rating (NC-17/R/PG-13/PG/G). '' = off. */
  parentalRating: string;
  /** v8.0.0 — quiet-hours start (HH:MM). Notifications suppressed in this window. */
  quietHoursStart: string;
  /** v8.0.0 — quiet-hours end (HH:MM). */
  quietHoursEnd: string;
  /** v8.0.0 — enable in-app notifications (new episodes, streaks). */
  notificationsEnabled: boolean;
}

const DEFAULTS: EntPrefs = {
  heroAutoplay: true,
  reduceMotion: false,
  showNewBadges: true,
  autoplayNext: true,
  dataSaver: false,
  showWatchedBadges: true,
  parentalRating: "",
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  notificationsEnabled: true,
};

function read(): EntPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<EntPrefs>) };
  } catch {
    return DEFAULTS;
  }
}

function write(p: EntPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* non-fatal */ }
}

let listeners: Array<(p: EntPrefs) => void> = [];
let current: EntPrefs = read();

function emit() { for (const l of listeners) l(current); }

export function getPrefs(): EntPrefs { return current; }

export function setPrefs(patch: Partial<EntPrefs>): void {
  current = { ...current, ...patch };
  write(current);
  emit();
}

export function subscribePrefs(l: (p: EntPrefs) => void): () => void {
  listeners.push(l);
  return () => { listeners = listeners.filter(x => x !== l); };
}

// ─── v8.0.0 — Quiet-hours helper ────────────────────────────────────────────

/** True if the current local time falls inside the configured quiet-hours window. */
export function isQuietHours(): boolean {
  const p = current;
  if (!p.notificationsEnabled) return true; // notifications off entirely
  if (!p.quietHoursStart || !p.quietHoursEnd) return false;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = p.quietHoursStart.split(":").map(Number);
  const [eh, em] = p.quietHoursEnd.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  // Handle overnight wrap (e.g. 22:00 → 08:00).
  if (start < end) return mins >= start && mins < end;
  return mins >= start || mins < end;
}

// ─── v8.0.0 — Data-saver image size picker ──────────────────────────────────

/** Returns the smaller image size when data-saver is on, else the requested size. */
export function imgSize(size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "w1280" | "original"): typeof size {
  if (!current.dataSaver) return size;
  const down: Record<string, typeof size> = {
    original: "w780",
    w1280: "w780",
    w780: "w500",
    w500: "w342",
    w342: "w185",
    w185: "w185",
    w154: "w154",
    w92: "w92",
  };
  return down[size] ?? size;
}
