// v6.5.0 — NEXUS TV preferences store.
// Persists user settings (hero autoplay, reduced motion) to localStorage.
// A thin wrapper around the same read/write helpers as ent-store.

const PREFS_KEY = "nx-ent-prefs";

export interface EntPrefs {
  /** Auto-advance the hero carousel every 8s. */
  heroAutoplay: boolean;
  /** Respect prefers-reduced-motion (disable non-essential animations). */
  reduceMotion: boolean;
  /** Show the NEW badge on recent releases. */
  showNewBadges: boolean;
}

const DEFAULTS: EntPrefs = {
  heroAutoplay: true,
  reduceMotion: false,
  showNewBadges: true,
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
