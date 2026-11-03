// v6.0.0 — EntShell: the NEXUS TV app shell (reference image 3).
// Narrow icon sidebar (search / home / movies / tv / my list + games/selector
// at the bottom), floating glass clock (top-right), keyboard shortcuts
// ("/" → search, Esc → back), view routing, and the player overlay.

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icons";
import { NexusMark } from "../Logo";
import { EntHome } from "./EntHome";
import { EntBrowse } from "./EntBrowse";
import { EntMyList } from "./EntMyList";
import { EntSearchView } from "./EntSearchView";
import { EntDetailPage } from "./EntDetailPage";
import { EntPlayer, type WatchPayload } from "./EntPlayer";
import { inList as listHas, toggleList as toggleStore } from "../../lib/ent-store";
import type { TmdbItem, TmdbMediaType } from "../../lib/tmdb-types";

type EntView = "home" | "movies" | "tv" | "mylist" | "search" | "detail";

interface ShellProps {
  onBackToSplash: () => void;
  onSwitchToGames: () => void;
}

export function EntShell({ onBackToSplash, onSwitchToGames }: ShellProps) {
  const [view, setView] = useState<EntView>("home");
  const [detail, setDetail] = useState<{ mediaType: TmdbMediaType; id: number } | null>(null);
  const [watching, setWatching] = useState<WatchPayload | null>(null);
  // Ticks so views re-read the local stores after mutations.
  const [listTick, setListTick] = useState(0);
  const [progressTick, setProgressTick] = useState(0);
  const [searchSignal, setSearchSignal] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // ── Clock (image 3 telemetry feel) ──
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateStr = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  // ── Navigation ──
  const go = useCallback((v: EntView) => {
    setView(v);
    if (v !== "detail") setDetail(null);
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
  }, []);

  const openDetail = useCallback((mediaType: TmdbMediaType, id: number) => {
    setDetail({ mediaType, id });
    setView("detail");
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
  }, []);

  const backFromDetail = useCallback(() => {
    setView("home");
    setDetail(null);
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
  }, []);

  const watch = useCallback((payload: WatchPayload) => setWatching(payload), []);

  // Card → watch bridge (EntRails uses onWatch(mt, id, title); detail page
  // already has the full payload, but browse/search/home rails need this adapter).
  const watchFromCard = useCallback((mt: TmdbMediaType, id: number, title: string) => {
    watch({ mediaType: mt, id, title });
  }, [watch]);

  // ── Scroll-to-top FAB ──
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onScroll = () => setShowTop(el.scrollTop > 600);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [view]);
  const scrollTop = () => bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  // ── My List helpers (tick re-renders consumers) ──
  const inListFn = useCallback((mt: TmdbMediaType, id: number) => listHas(mt, id), [listTick]);
  const toggleListFn = useCallback((item: { mediaType?: TmdbMediaType; id: number; title: string; posterPath?: string | null; rating?: number; year?: string }) => {
    toggleStore({
      mediaType: item.mediaType ?? "movie",
      id: item.id,
      title: item.title,
      posterPath: item.posterPath ?? null,
      rating: item.rating ?? 0,
      year: item.year ?? "",
    });
    setListTick(t => t + 1);
  }, [listTick]);

  // Hero passes a full TmdbItem — adapt to the toggle signature.
  const toggleListItem = useCallback((item: TmdbItem) => {
    toggleListFn(item);
  }, [toggleListFn]);

  // ── Keyboard shortcuts (native app feel) ──
  //  / → search · Esc → back · g → games · Arrow keys move focus across cards ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (watching) return; // player handles its own Esc
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setView("search");
        setSearchSignal(s => s + 1);
        requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
      } else if (e.key === "Escape") {
        if (view === "detail") backFromDetail();
        else if (view !== "home") go("home");
      } else if ((e.key === "g" || e.key === "G") && !typing) {
        onSwitchToGames();
      } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !typing) {
        // Focus-card navigation (gamepad-like). Move between cards in the
        // currently visible rail/grid, scrolling into view as needed.
        const cards = Array.from(document.querySelectorAll<HTMLElement>(
          ".ent-lcard, .ent-pcard, .ent-top10-item .ent-pcard"
        ));
        if (cards.length === 0) return;
        const current = document.activeElement as HTMLElement | null;
        const idx = cards.indexOf(current as HTMLElement);
        let nextIdx = idx < 0 ? 0 : (e.key === "ArrowRight" ? idx + 1 : idx - 1);
        nextIdx = Math.max(0, Math.min(cards.length - 1, nextIdx));
        const next = cards[nextIdx];
        next.focus({ preventScroll: false });
        next.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
        e.preventDefault();
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !typing) {
        // Vertical nav: jump to the prev/next rail/row in the same column.
        const cards = Array.from(document.querySelectorAll<HTMLElement>(".ent-lcard, .ent-pcard"));
        if (cards.length === 0) return;
        const current = document.activeElement as HTMLElement | null;
        const idx = cards.indexOf(current as HTMLElement);
        if (idx < 0) { cards[0].focus(); e.preventDefault(); return; }
        const curRect = current!.getBoundingClientRect();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        let best: HTMLElement | null = null;
        let bestDist = Infinity;
        for (let i = 0; i < cards.length; i++) {
          if (i === idx) continue;
          const r = cards[i].getBoundingClientRect();
          if (dir > 0 ? r.top <= curRect.top + 4 : r.top >= curRect.top - 4) continue;
          const horiz = Math.abs(r.left - curRect.left);
          const vert = Math.abs(r.top - curRect.top);
          const d = vert + horiz * 0.4;
          if (d < bestDist) { bestDist = d; best = cards[i]; }
        }
        if (best) { best.focus(); best.scrollIntoView({ block: "center", behavior: "smooth" }); e.preventDefault(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, watching, backFromDetail, go, onSwitchToGames]);

  const sideBtn = (active: boolean, label: string, icon: React.ReactNode, onClick: () => void) => (
    <button
      className={active ? "ent-side-btn on" : "ent-side-btn"}
      onClick={onClick}
      title={label}
      aria-label={label}
      data-label={label}
    >
      {icon}
      <span className="ent-side-bar" />
    </button>
  );

  return (
    <div className="ent-shell">
      {/* ── Sidebar (image 3) ── */}
      <aside className="ent-side">
        <button className="ent-side-mark" onClick={() => go("home")} title="NEXUS TV — Home">
          <NexusMark size={22} />
        </button>
        <div className="ent-side-sep" />

        {sideBtn(view === "search", "Search  (press /)", <Icon.Search size={17} />, () => { setView("search"); setSearchSignal(s => s + 1); })}
        {sideBtn(view === "home", "Home", <Icon.Home size={17} />, () => go("home"))}
        {sideBtn(view === "movies", "Movies", <Icon.Film size={17} />, () => go("movies"))}
        {sideBtn(view === "tv", "TV Shows", <Icon.Tv size={17} />, () => go("tv"))}
        {sideBtn(view === "mylist", "My List", <Icon.Bookmark size={17} />, () => go("mylist"))}

        <div className="ent-side-spacer" />

        {sideBtn(false, "Switch to Games mode", <Icon.Gamepad size={17} />, onSwitchToGames)}
        {sideBtn(false, "Mode selector", <Icon.Grid size={17} />, onBackToSplash)}
      </aside>

      {/* ── Content ── */}
      <div className="ent-body" ref={bodyRef}>
        {/* Floating glass clock */}
        <div className="ent-clock" aria-hidden="true">
          <span className="ent-clock-time">{timeStr}</span>
          <span className="ent-clock-date">{dateStr}</span>
        </div>

        {/* View transition wrapper — key forces remount + fade-in animation */}
        <div className="ent-view" key={view}>
          {view === "home" && (
            <EntHome
              progressTick={progressTick}
              onOpen={openDetail}
              onWatch={watch}
              inList={inListFn}
              onToggleList={toggleListItem}
            />
          )}
          {view === "movies" && (
            <EntBrowse mediaType="movie" onOpen={openDetail} inList={inListFn} onWatch={watchFromCard} onToggleList={toggleListFn} />
          )}
          {view === "tv" && (
            <EntBrowse mediaType="tv" onOpen={openDetail} inList={inListFn} onWatch={watchFromCard} onToggleList={toggleListFn} />
          )}
          {view === "mylist" && (
            <EntMyList
              listTick={listTick}
              progressTick={progressTick}
              onOpen={openDetail}
              onWatch={watch}
              inList={inListFn}
            />
          )}
          {view === "search" && (
            <EntSearchView focusSignal={searchSignal} onOpen={openDetail} inList={inListFn} onWatch={watchFromCard} onToggleList={toggleListFn} />
          )}
          {view === "detail" && detail && (
            <EntDetailPage
              mediaType={detail.mediaType}
              id={detail.id}
              onBack={backFromDetail}
              onOpenDetail={openDetail}
              onWatch={watch}
              inList={inListFn}
              onToggleList={toggleListFn}
            />
          )}
        </div>

        {/* Scroll-to-top FAB */}
        {showTop && (
          <button
            className="ent-fab-top"
            onClick={scrollTop}
            aria-label="Scroll to top"
            title="Back to top"
          >
            <Icon.Chevron size={20} />
          </button>
        )}

        {/* Footer */}
        <footer className="ent-foot">
          <div className="ent-foot-brand">
            <span className="ent-foot-mark"><NexusMark size={14} /></span>
            <strong>NEXUS TV</strong> · <span className="dim">Metadata by TMDB · Streams via CineSrc</span>
          </div>
          <div className="ent-foot-meta">
            <span><Icon.Play size={11} /> Full streaming</span>
            <span><Icon.Bookmark size={11} /> Local watchlist</span>
            <span><Icon.Shield size={11} /> No telemetry</span>
          </div>
        </footer>
      </div>

      {/* ── Player overlay ── */}
      <EntPlayer
        open={watching !== null}
        payload={watching}
        onClose={() => setWatching(null)}
        onProgress={() => setProgressTick(t => t + 1)}
      />
    </div>
  );
}
