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

  // ── My List helpers (tick re-renders consumers) ──
  const inListFn = useCallback((mt: TmdbMediaType, id: number) => listHas(mt, id), [listTick]);
  const toggleListFn = useCallback((item: { mediaType: TmdbMediaType; id: number; title: string; posterPath?: string | null; rating?: number; year?: string }) => {
    toggleStore({
      mediaType: item.mediaType,
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, watching, backFromDetail, go]);

  const sideBtn = (active: boolean, label: string, icon: React.ReactNode, onClick: () => void) => (
    <button
      className={active ? "ent-side-btn on" : "ent-side-btn"}
      onClick={onClick}
      title={label}
      aria-label={label}
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
        {/* Floating glass clock (image 3) */}
        <div className="ent-clock" aria-hidden="true">
          <span className="ent-clock-time">{timeStr}</span>
          <span className="ent-clock-date">{dateStr}</span>
        </div>

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
          <EntBrowse mediaType="movie" onOpen={openDetail} inList={inListFn} />
        )}
        {view === "tv" && (
          <EntBrowse mediaType="tv" onOpen={openDetail} inList={inListFn} />
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
          <EntSearchView focusSignal={searchSignal} onOpen={openDetail} inList={inListFn} />
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
