// v6.2.0 — EntCommandPalette: a native-app command palette (Ctrl/Cmd+K).
// Instant fuzzy search across cached trending + my-list titles, plus quick
// navigation actions (Home / Movies / TV / My List / Search / Switch to Games).
// Keyboard-first: arrow keys navigate, Enter activates, Esc closes.

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icons";
import { tmdbImg, type TmdbItem, type TmdbMediaType } from "../../lib/tmdb-types";
import { getList } from "../../lib/ent-store";

export interface CmdAction {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
  group: "Navigate" | "Mode";
}

export interface CmdTitleHit {
  id: number;
  title: string;
  mediaType: TmdbMediaType;
  posterPath: string | null;
  year: string;
  rating: number;
}

interface PaletteProps {
  open: boolean;
  onClose: () => void;
  actions: CmdAction[];
  /** Cached trending items to search across (passed from the shell). */
  titles: TmdbItem[];
  onOpenTitle: (mediaType: TmdbMediaType, id: number) => void;
}

function fuzzy(query: string, text: string): number {
  // Simple subsequence scoring. Returns a score (higher = better) or -1.
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t.includes(q)) return 100 + q.length - (t.indexOf(q) === 0 ? 0 : 1);
  let qi = 0;
  let score = 0;
  let lastMatch = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += ti === lastMatch + 1 ? 4 : 1; // bonus for consecutive
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : -1;
}

export function EntCommandPalette({ open, onClose, actions, titles, onOpenTitle }: PaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build the searchable title index (trending + my-list, deduped).
  const titleHits: CmdTitleHit[] = useMemo(() => {
    const map = new Map<string, CmdTitleHit>();
    for (const t of titles) {
      const key = `${t.mediaType}-${t.id}`;
      if (!map.has(key)) map.set(key, {
        id: t.id, title: t.title, mediaType: t.mediaType,
        posterPath: t.posterPath, year: t.year, rating: t.rating,
      });
    }
    for (const li of getList()) {
      const key = `${li.mediaType}-${li.id}`;
      if (!map.has(key)) map.set(key, {
        id: li.id, title: li.title, mediaType: li.mediaType,
        posterPath: li.posterPath, year: li.year, rating: li.rating,
      });
    }
    return Array.from(map.values());
  }, [titles, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Score + sort results.
  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const scored = titleHits
      .map(h => ({ hit: h, score: fuzzy(q, h.title) }))
      .filter(r => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    return scored.map(r => r.hit);
  }, [query, titleHits]);

  // Flat list of all selectable rows (actions first, then title hits).
  const rows: ({ kind: "action"; a: CmdAction } | { kind: "title"; h: CmdTitleHit })[] = useMemo(() => {
    const actionRows = actions.map(a => ({ kind: "action" as const, a }));
    return [...actionRows, ...results.map(h => ({ kind: "title" as const, h }))];
  }, [actions, results]);

  // Reset on open.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep active in range.
  useEffect(() => { setActive(a => Math.min(a, Math.max(0, rows.length - 1))); }, [rows.length]);

  // Keyboard nav.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, rows.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const row = rows[active];
        if (!row) return;
        if (row.kind === "action") row.a.run();
        else { onOpenTitle(row.h.mediaType, row.h.id); }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, rows, active, onClose, onOpenTitle]);

  // Scroll active row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  return (
    <div className="ent-cmd-overlay" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={onClose}>
      <div className="ent-cmd" onMouseDown={e => e.stopPropagation()}>
        <div className="ent-cmd-input-wrap">
          <Icon.Search size={18} />
          <input
            ref={inputRef}
            className="ent-cmd-input"
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            placeholder="Search titles or jump to a view…  (↑↓ to navigate, ↵ to open, Esc to close)"
            spellCheck={false}
          />
          <kbd className="ent-cmd-kbd">Esc</kbd>
        </div>

        <div className="ent-cmd-list" ref={listRef}>
          {rows.length === 0 && (
            <div className="ent-cmd-empty">
              <Icon.Search size={26} />
              <p>{query.trim() ? `No matches for “${query.trim()}”` : "Type to search across trending + your list"}</p>
            </div>
          )}

          {/* Quick actions (always shown) */}
          {actions.length > 0 && (
            <div className="ent-cmd-group">
              <div className="ent-cmd-group-h">Quick Actions</div>
              {actions.map((a, i) => (
                <button
                  key={a.id}
                  data-idx={i}
                  className={i === active ? "ent-cmd-row on" : "ent-cmd-row"}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { a.run(); onClose(); }}
                >
                  <span className="ent-cmd-row-icon">{a.icon}</span>
                  <span className="ent-cmd-row-label">{a.label}</span>
                  {a.hint && <span className="ent-cmd-row-hint">{a.hint}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Title hits */}
          {results.length > 0 && (
            <div className="ent-cmd-group">
              <div className="ent-cmd-group-h">Titles</div>
              {results.map((h, i) => {
                const idx = actions.length + i;
                return (
                  <button
                    key={`${h.mediaType}-${h.id}`}
                    data-idx={idx}
                    className={idx === active ? "ent-cmd-row on" : "ent-cmd-row"}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => { onOpenTitle(h.mediaType, h.id); onClose(); }}
                  >
                    <span className="ent-cmd-row-poster">
                      {h.posterPath
                        ? <img src={tmdbImg(h.posterPath, "w92") ?? ""} alt="" />
                        : <span className="ent-cmd-row-poster-ph"><Icon.Film size={13} /></span>}
                    </span>
                    <span className="ent-cmd-row-label">{h.title}</span>
                    <span className="ent-cmd-row-meta">
                      <span className={h.mediaType === "tv" ? "ent-cmd-tag tv" : "ent-cmd-tag"}>{h.mediaType === "tv" ? "TV" : "Film"}</span>
                      {h.year && <span>{h.year}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="ent-cmd-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
          <span className="ent-cmd-foot-brand">NEXUS TV · Command</span>
        </div>
      </div>
    </div>
  );
}
