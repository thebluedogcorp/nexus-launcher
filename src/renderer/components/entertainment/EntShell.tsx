// v6.0.0 — EntShell: the NEXUS TV app shell (reference image 3).
// Narrow icon sidebar (search / home / movies / tv / my list + games/selector
// at the bottom), floating glass clock (top-right), keyboard shortcuts
// ("/" → search, Esc → back, Ctrl/Cmd+K → command palette), view routing,
// and the player overlay.

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icons";
import { NexusMark } from "../Logo";
import { EntHome } from "./EntHome";
import { EntBrowse } from "./EntBrowse";
import { EntMyList } from "./EntMyList";
import { EntSearchView } from "./EntSearchView";
import { EntDetailPage } from "./EntDetailPage";
import { EntStatsView } from "./EntStatsView";
import { EntCollectionsView } from "./EntCollectionsView";
import { EntDiscoverView } from "./EntDiscoverView";
import { EntAnimeView } from "./EntAnimeView";
import { EntNewPopularView } from "./EntNewPopularView";
import { EntHindiDubView } from "./EntHindiDubView";
import { EntAccountView } from "./EntAccountView";
import { EntPlayer, type WatchPayload } from "./EntPlayer";
import { EntCommandPalette, type CmdAction } from "./EntCommandPalette";
import { EntShortcuts } from "./EntShortcuts";
import { EntToaster, pushToast } from "./EntToaster";
import { EntSettings } from "./EntSettings";
import { EntWhatsNew } from "./EntWhatsNew";
import { EntNotifications } from "./EntNotifications";
import { inList as listHas, toggleList as toggleStore, recordHistory, getList } from "../../lib/ent-store";
import { recordWatchDay, unreadNotificationCount } from "../../lib/ent-userdata";
import { getLatestVersion } from "../../lib/ent-changelog";
import type { TmdbItem, TmdbMediaType } from "../../lib/tmdb-types";

type EntView = "home" | "movies" | "tv" | "anime" | "new" | "hindi" | "mylist" | "search" | "detail" | "stats" | "collections" | "discover" | "account";

interface ShellProps {
  onBackToSplash: () => void;
  onSwitchToGames: () => void;
}

export function EntShell({ onBackToSplash, onSwitchToGames }: ShellProps) {
  const [view, setView] = useState<EntView>("home");
  const [detail, setDetail] = useState<{ mediaType: TmdbMediaType; id: number } | null>(null);
  const [watching, setWatching] = useState<WatchPayload | null>(null);
  // Browse pre-selection (genre quick-filter from home).
  const [browseGenre, setBrowseGenre] = useState<{ mediaType: "movie" | "tv"; genreId: number } | null>(null);
  // Ticks so views re-read the local stores after mutations.
  const [listTick, setListTick] = useState(0);
  const [progressTick, setProgressTick] = useState(0);
  const [searchSignal, setSearchSignal] = useState(0);
  // Command palette (Ctrl/Cmd+K) + cached trending titles for fuzzy search.
  const [cmdOpen, setCmdOpen] = useState(false);
  const [scOpen, setScOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [wnOpen, setWnOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(() => unreadNotificationCount());
  const [cmdTitles, setCmdTitles] = useState<TmdbItem[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // ── Clock (image 3 telemetry feel) ──
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateStr = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  // ── Cache trending titles for the command palette (one-time fetch) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await window.nexus.tmdbTrendingAll();
        if (!cancelled && Array.isArray(items)) setCmdTitles(items as TmdbItem[]);
      } catch { /* non-fatal — palette still works with My List */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Navigation ──
  const go = useCallback((v: EntView) => {
    setView(v);
    if (v !== "detail") setDetail(null);
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
  }, []);

  // Jump to browse with a genre pre-selected (from the home genre quick-bar).
  const browseToGenre = useCallback((mediaType: "movie" | "tv", genreId: number) => {
    setBrowseGenre({ mediaType, genreId });
    setView(mediaType === "movie" ? "movies" : "tv");
    setDetail(null);
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

  const watch = useCallback((payload: WatchPayload) => {
    setWatching(payload);
    recordWatchDay(); // track watch streak (v7.2.0)
    pushToast(`Now playing: ${payload.title}`, "success", <Icon.Play size={14} />);
  }, []);

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

  // ── Command palette actions ──
  const cmdActions: CmdAction[] = [
    { id: "home", label: "Go to Home", icon: <Icon.Home size={15} />, group: "Navigate", run: () => go("home") },
    { id: "discover", label: "Discover — Daily Pick + Moods", icon: <Icon.Sparkles size={15} />, group: "Navigate", run: () => go("discover") },
    { id: "movies", label: "Browse Movies", icon: <Icon.Film size={15} />, group: "Navigate", run: () => go("movies") },
    { id: "tv", label: "Browse TV Shows", icon: <Icon.Tv size={15} />, group: "Navigate", run: () => go("tv") },
    { id: "anime", label: "Anime Hub", hint: "a", icon: <Icon.Sparkles size={15} />, group: "Navigate", run: () => go("anime") },
    { id: "new", label: "New & Popular", hint: "p", icon: <Icon.TrendingUp size={15} />, group: "Navigate", run: () => go("new") },
    { id: "hindi", label: "Hindi Dub", hint: "h", icon: <Icon.Globe size={15} />, group: "Navigate", run: () => go("hindi") },
    { id: "mylist", label: "Open My List", icon: <Icon.Bookmark size={15} />, group: "Navigate", run: () => go("mylist") },
    { id: "collections", label: "My Collections", icon: <Icon.Library size={15} />, group: "Navigate", run: () => go("collections") },
    { id: "stats", label: "Statistics Dashboard", icon: <Icon.TrendingUp size={15} />, group: "Navigate", run: () => go("stats") },
    { id: "account", label: "Account & Downloads", hint: "u", icon: <Icon.Users size={15} />, group: "Navigate", run: () => go("account") },
    { id: "search", label: "Search", hint: "/", icon: <Icon.Search size={15} />, group: "Navigate", run: () => { setView("search"); setSearchSignal(s => s + 1); } },
    { id: "games", label: "Switch to Games mode", hint: "g", icon: <Icon.Gamepad size={15} />, group: "Mode", run: onSwitchToGames },
    { id: "splash", label: "Mode selector", icon: <Icon.Grid size={15} />, group: "Mode", run: onBackToSplash },
  ];

  // ── My List helpers (tick re-renders consumers) ──
  const listCount = listTick >= 0 ? getList().length : 0;
  const inListFn = useCallback((mt: TmdbMediaType, id: number) => listHas(mt, id), [listTick]);
  const toggleListFn = useCallback((item: { mediaType?: TmdbMediaType; id: number; title: string; posterPath?: string | null; rating?: number; year?: string }) => {
    const wasIn = listHas(item.mediaType ?? "movie", item.id);
    toggleStore({
      mediaType: item.mediaType ?? "movie",
      id: item.id,
      title: item.title,
      posterPath: item.posterPath ?? null,
      rating: item.rating ?? 0,
      year: item.year ?? "",
    });
    setListTick(t => t + 1);
    pushToast(
      wasIn ? `Removed “${item.title}” from My List` : `Added “${item.title}” to My List`,
      wasIn ? "info" : "success",
      <Icon.Bookmark size={14} filled={!wasIn} />,
    );
  }, [listTick]);

  // Hero passes a full TmdbItem — adapt to the toggle signature.
  const toggleListItem = useCallback((item: TmdbItem) => {
    toggleListFn(item);
  }, [toggleListFn]);

  // ── Keyboard shortcuts (native app feel) ──
  //  Ctrl/Cmd+K → command palette · / → search · Esc → back · g → games
  //  Arrow keys move focus across cards ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (watching) return; // player handles its own Esc
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      // Ctrl/Cmd+K → command palette (works even while typing in a search box).
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setCmdOpen(o => !o);
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setView("search");
        setSearchSignal(s => s + 1);
        requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setScOpen(o => !o);
      } else if (e.key === "Escape") {
        if (view === "detail") backFromDetail();
        else if (view !== "home") go("home");
      } else if ((e.key === "g" || e.key === "G") && !typing) {
        onSwitchToGames();
      } else if ((e.key === "n" || e.key === "N") && !typing) {
        // What's New — changelog of every update (v7.3.0).
        e.preventDefault();
        setWnOpen(o => !o);
      } else if ((e.key === "b" || e.key === "B") && !typing) {
        // v8.0.0 — Notifications center.
        e.preventDefault();
        setNotifOpen(o => !o);
      } else if ((e.key === "a" || e.key === "A") && !typing) {
        // v9.0.0 — Anime hub.
        e.preventDefault();
        go("anime");
      } else if ((e.key === "p" || e.key === "P") && !typing) {
        // v9.0.0 — New & Popular.
        e.preventDefault();
        go("new");
      } else if ((e.key === "h" || e.key === "H") && !typing) {
        // v9.1.0 — Hindi Dub hub.
        e.preventDefault();
        go("hindi");
      } else if ((e.key === "u" || e.key === "U") && !typing) {
        // v9.0.0 — Account & Downloads.
        e.preventDefault();
        go("account");
      } else if ((e.key === "s" || e.key === "S") && !typing) {
        // Surprise Me — dispatch a global event EntHome listens for.
        e.preventDefault();
        if (view !== "home") { go("home"); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("nx-surprise"))); }
        else window.dispatchEvent(new CustomEvent("nx-surprise"));
      } else if ((e.key === "," || e.key === "<") && !typing) {
        // Settings (comma — like a gear-ish key).
        e.preventDefault();
        setSetOpen(o => !o);
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
        {sideBtn(view === "tv", "TV Shows", <Icon.Tv size={17} />, () => go("tv"))}
        {sideBtn(view === "movies", "Movies", <Icon.Film size={17} />, () => go("movies"))}
        <div className="ent-side-sep" />
        {sideBtn(view === "anime", "Anime  (press a)", <Icon.Sparkles size={17} />, () => go("anime"))}
        {sideBtn(view === "new", "New & Popular  (press p)", <Icon.TrendingUp size={17} />, () => go("new"))}
        {sideBtn(view === "hindi", "Hindi Dub  (press h)", <Icon.Globe size={17} />, () => go("hindi"))}
        <div className="ent-side-sep" />
        {/* My List with count badge */}
        <button
          className={view === "mylist" ? "ent-side-btn on" : "ent-side-btn"}
          onClick={() => go("mylist")}
          title="My List"
          aria-label="My List"
          data-label="My List"
        >
          <Icon.Bookmark size={17} />
          <span className="ent-side-bar" />
          {listCount > 0 && <span className="ent-side-badge">{listCount}</span>}
        </button>
        <div className="ent-side-sep" />
        {sideBtn(view === "discover", "Discover", <Icon.Wand size={17} />, () => go("discover"))}
        {sideBtn(view === "collections", "Collections", <Icon.Library size={17} />, () => go("collections"))}
        {sideBtn(view === "stats", "Statistics", <Icon.TrendingUp size={17} />, () => go("stats"))}

        <div className="ent-side-spacer" />

        {sideBtn(view === "account", "Account & Downloads  (press u)", <Icon.Users size={17} />, () => go("account"))}
        <div className="ent-side-sep" />
        {sideBtn(false, "Switch to Games mode", <Icon.Gamepad size={17} />, onSwitchToGames)}
        {sideBtn(false, "Mode selector", <Icon.Grid size={17} />, onBackToSplash)}
        {sideBtn(false, "Keyboard shortcuts  (press ?)", <Icon.Keyboard size={17} />, () => setScOpen(true))}
        {/* v8.0.0 — Notifications bell with unread badge */}
        <button
          className={notifOpen ? "ent-side-btn on" : "ent-side-btn"}
          onClick={() => setNotifOpen(true)}
          title="Notifications  (press b)"
          aria-label="Notifications  (press b)"
          data-label="Notifications  (b)"
        >
          <Icon.Bell size={17} />
          <span className="ent-side-bar" />
          {notifCount > 0 && <span className="ent-side-badge notif">{notifCount > 9 ? "9+" : notifCount}</span>}
        </button>
        {sideBtn(false, "Settings", <Icon.Settings size={17} />, () => setSetOpen(true))}
        {/* What's New — changelog with notification dot on updates */}
        <button
          className="ent-side-btn ent-side-wn"
          onClick={() => setWnOpen(true)}
          title="What's New  (press n)"
          aria-label="What's New  (press n)"
          data-label="What's New  (n)"
        >
          <Icon.Sparkles size={17} />
          <span className="ent-side-bar" />
          <span className="ent-wn-dot" title={`New in ${getLatestVersion().version}`} />
        </button>
      </aside>

      {/* ── Content ── */}
      <div className="ent-body" ref={bodyRef}>
        {/* Floating glass clock */}
        <div className="ent-clock" aria-hidden="true">
          <span className="ent-clock-time">{timeStr}</span>
          <span className="ent-clock-date">{dateStr}</span>
        </div>

        {/* View layer — Home is keep-alive (stays mounted, retains data);
            other views mount on demand. Eliminates the refetch flash. */}
        <div className={view === "home" ? "ent-view ent-view-active" : "ent-view ent-view-hidden"} aria-hidden={view !== "home"}>
          <EntHome
            progressTick={progressTick}
            historyTick={historyTick}
            onOpen={openDetail}
            onWatch={watch}
            inList={inListFn}
            onToggleList={toggleListItem}
            onBrowseGenre={browseToGenre}
          />
        </div>

        {view !== "home" && (
          <div className="ent-view ent-view-active" key={view === "detail" ? `detail-${detail?.mediaType}-${detail?.id}` : view}>
            {view === "movies" && (
              <EntBrowse mediaType="movie" initialGenre={browseGenre?.mediaType === "movie" ? browseGenre.genreId : null} onOpen={openDetail} inList={inListFn} onWatch={watchFromCard} onToggleList={toggleListFn} onGenreCleared={() => setBrowseGenre(null)} />
            )}
            {view === "tv" && (
              <EntBrowse mediaType="tv" initialGenre={browseGenre?.mediaType === "tv" ? browseGenre.genreId : null} onOpen={openDetail} inList={inListFn} onWatch={watchFromCard} onToggleList={toggleListFn} onGenreCleared={() => setBrowseGenre(null)} />
            )}
            {view === "anime" && (
              <EntAnimeView onOpen={openDetail} onWatch={watch} inList={inListFn} onToggleList={toggleListFn} />
            )}
            {view === "new" && (
              <EntNewPopularView onOpen={openDetail} onWatch={watch} inList={inListFn} onToggleList={toggleListFn} />
            )}
            {view === "hindi" && (
              <EntHindiDubView onOpen={openDetail} onWatch={watch} inList={inListFn} onToggleList={toggleListFn} />
            )}
            {view === "account" && (
              <EntAccountView onOpen={openDetail} onDataChanged={() => setListTick(t => t + 1)} />
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
            {view === "discover" && (
              <EntDiscoverView onOpen={openDetail} onWatch={watch} />
            )}
            {view === "collections" && (
              <EntCollectionsView listTick={listTick} onOpen={openDetail} />
            )}
            {view === "stats" && (
              <EntStatsView listTick={listTick} />
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
                onHistoryChange={() => setHistoryTick(t => t + 1)}
              />
            )}
          </div>
        )}

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

      {/* ── Command palette (Ctrl/Cmd+K) ── */}
      <EntCommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        actions={cmdActions}
        titles={cmdTitles}
        onOpenTitle={openDetail}
      />

      {/* ── Keyboard shortcuts overlay (? key) ── */}
      <EntShortcuts open={scOpen} onClose={() => setScOpen(false)} />

      {/* ── What's New changelog (n key / sparkle icon) ── */}
      <EntWhatsNew open={wnOpen} onClose={() => setWnOpen(false)} />

      {/* ── Notifications center (b key / bell icon) ── */}
      <EntNotifications
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onOpen={openDetail}
        onCountChange={setNotifCount}
      />

      {/* ── Settings panel (comma key / gear icon) ── */}
      <EntSettings
        open={setOpen}
        onClose={() => setSetOpen(false)}
        onDataCleared={() => { setListTick(t => t + 1); setHistoryTick(t => t + 1); }}
      />

      {/* ── Toast notifications ── */}
      <EntToaster />
    </div>
  );
}
