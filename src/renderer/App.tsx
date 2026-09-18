import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DetectedGame, Game, LauncherSettings, PlatformId, SortKey, Stats } from "@shared/types";
import { PLATFORM_LIST } from "@shared/types";
import { Icon } from "./components/Icons";
import { GamePage } from "./components/GamePage";
import { AddGameDialog } from "./components/AddGameDialog";
import { ScanDialog } from "./components/ScanDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { UpdateDialog } from "./components/UpdateDialog";
import { ToastContainer, type Toast } from "./components/Toast";
import { useGamepadController } from "./lib/useGamepad";
import { formatPlaytime, formatPlaytimeShort, formatSize, platformColor, platformLabel, gradientFor, initials, relativeTime } from "./lib/helpers";

interface Filters { platform: string; favOnly: boolean; query: string; sort: SortKey }
const DEFAULT_FILTERS: Filters = { platform: "all", favOnly: false, query: "", sort: "recent" };
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recently Played" },
  { value: "name", label: "Name A–Z" },
  { value: "playtime", label: "Most Played" },
  { value: "rating", label: "Top Rated" },
];

export function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<LauncherSettings | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [pageGame, setPageGame] = useState<Game | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [focusedIdx, setFocusedIdxState] = useState(0);
  // TRULY synchronous ref — updated BEFORE React state, so the gamepad
  // callback always reads the real current value even during rapid navigation.
  const focusedIdxRef = useRef(0);
  const setFocusedIdx = useCallback((updater: number | ((prev: number) => number)) => {
    const prev = focusedIdxRef.current;
    const next = typeof updater === "function" ? updater(prev) : updater;
    focusedIdxRef.current = next; // synchronous, before React processes anything
    setFocusedIdxState(next);     // just sync React state to match
  }, []);
  const [patching, setPatching] = useState(false);
  const [patchProgress, setPatchProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  // v2.0 features state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; game: Game } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [editorGame, setEditorGame] = useState<Game | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version?: string; releaseUrl?: string; downloadUrl?: string; downloadSize?: number } | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  const toast = useCallback((type: Toast["type"], title: string, desc?: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, title, desc }]);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const refreshGames = useCallback(async () => {
    setGames(await window.nexus.listGames({ platform: filters.platform, favOnly: filters.favOnly, query: filters.query, sort: filters.sort }));
  }, [filters]);
  const refreshStats = useCallback(async () => setStats(await window.nexus.getStats()), []);
  const refreshAll = useCallback(async () => {
    setLoading(true);
    try { await Promise.all([refreshGames(), refreshStats()]); } finally { setLoading(false); }
  }, [refreshGames, refreshStats]);

  useEffect(() => {
    (async () => {
      try {
        const s = await window.nexus.getSettings();
        setSettings(s);
        setFilters((f) => ({ ...f, sort: s.defaultSort }));
        await refreshAll();
        if (s.autoScanOnStart) {
          try {
            const summary = await window.nexus.runScan(PLATFORM_LIST.filter((p) => p.id !== "custom" && p.id !== "manual").map((p) => p.id as PlatformId));
            if (summary.detected.length > 0) {
              const imported = await window.nexus.importDetected(summary.detected);
              if (imported.length > 0) toast("success", `Found ${imported.length} new game${imported.length === 1 ? "" : "s"}`, "Artwork fetched automatically.");
            }
          } catch {}
        }
        try {
          const upd = await window.nexus.checkForUpdates();
          if (upd.ok && upd.updateAvailable) setUpdateAvailable({ version: upd.version, releaseUrl: upd.releaseUrl, downloadUrl: upd.downloadUrl, downloadSize: upd.downloadSize });
        } catch {}
      } catch (e) {
        toast("error", "Couldn't load library", "The local database may be locked.");
      } finally { setLoading(false); }
    })();
    const offP = (window as unknown as { nexus?: { onPatchProgress?: (cb: (p: { gameId: number; title: string; current: number; total: number }) => void) => () => void } }).nexus?.onPatchProgress?.((p) => { setPatching(true); setPatchProgress({ current: p.current, total: p.total, title: p.title }); });
    const offG = (window as unknown as { nexus?: { onPatchGameUpdated?: (cb: (p: { game: Game }) => void) => () => void } }).nexus?.onPatchGameUpdated?.(({ game }) => { setGames((prev) => prev.map((g) => (g.id === game.id ? game : g))); if (pageGame?.id === game.id) setPageGame(game); refreshStats(); });
    const offD = (window as unknown as { nexus?: { onPatchDone?: (cb: (p: { patched: number; attempted: number }) => void) => () => void } }).nexus?.onPatchDone?.(({ patched, attempted }) => { setPatching(false); setPatchProgress(null); if (patched > 0) toast("success", `Enriched ${patched} of ${attempted} games`, "Artwork fetched automatically."); refreshAll(); });
    return () => { offP?.(); offG?.(); offD?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!loading) refreshGames(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters]);

  const openPage = useCallback(async (id: number) => setPageGame(await window.nexus.getGame(id)), []);
  const handleLaunch = useCallback(async (g: Game) => {
    toast("info", `Launching ${g.title}…`);
    const res = await window.nexus.launchGame(g.id);
    if (res.ok) { toast("success", `${g.title} is running`, "Play session recorded."); await refreshAll(); if (pageGame?.id === g.id) setPageGame(await window.nexus.getGame(g.id)); }
    else toast("error", "Launch failed", res.message);
  }, [refreshAll, toast, pageGame]);
  const handlePatch = useCallback(async (g: Game) => {
    toast("info", "Patching metadata…");
    const updated = await window.nexus.patchMetadata(g.id);
    if (updated) { toast("success", "Metadata updated"); await refreshAll(); if (pageGame?.id === g.id) setPageGame(updated); }
    else toast("error", "No metadata found");
  }, [refreshAll, toast, pageGame]);
  const handleToggleFav = useCallback(async (g: Game) => {
    await window.nexus.updateGame(g.id, { favorite: !g.favorite });
    await refreshAll();
    if (pageGame?.id === g.id) setPageGame(await window.nexus.getGame(g.id));
  }, [refreshAll, pageGame]);
  const handleDelete = useCallback(async (g: Game) => {
    await window.nexus.deleteGame(g.id);
    toast("success", "Removed from library", g.title);
    setPageGame(null);
    await refreshAll();
  }, [refreshAll, toast]);
  const handleAdd = useCallback(async (input: { title: string; platform: PlatformId; executable?: string | null; installDir?: string | null; launchCommand?: string | null; autoPatch?: boolean }) => {
    const g = await window.nexus.addGame(input);
    toast("success", `${g.title} added`, input.autoPatch !== false ? "Metadata auto-patched." : undefined);
    await refreshAll();
    return g;
  }, [refreshAll, toast]);
  const handleRunScan = useCallback(async (platforms: PlatformId[]) => window.nexus.runScan(platforms), []);
  const handleDeepScan = useCallback(async (customPaths: string[]) => window.nexus.scanFilesystem(customPaths), []);
  const handleImport = useCallback(async (items: DetectedGame[]) => {
    const imported = await window.nexus.importDetected(items);
    toast("success", `Imported ${imported.length} game${imported.length === 1 ? "" : "s"}`, "Artwork fetched automatically.");
    await refreshAll();
    return imported;
  }, [refreshAll, toast]);
  const handleSaveSettings = useCallback(async (s: Partial<LauncherSettings>) => { const next = await window.nexus.setSettings(s); setSettings(next); toast("success", "Settings saved"); return next; }, [toast]);
  const handleCheckUpdates = useCallback(async () => {
    toast("info", "Checking for updates…");
    try {
      const upd = await window.nexus.checkForUpdates();
      if (upd.ok && upd.updateAvailable) { setUpdateAvailable({ version: upd.version, releaseUrl: upd.releaseUrl, downloadUrl: upd.downloadUrl, downloadSize: upd.downloadSize }); setUpdateDialogOpen(true); }
      else if (upd.ok) toast("success", "You're up to date", upd.message);
      else toast("error", "Update check failed", upd.message);
    } catch (e) { toast("error", "Update check failed", e instanceof Error ? e.message : String(e)); }
  }, [toast]);
  const handlePatchAll = useCallback(async () => {
    setPatching(true); setPatchProgress({ current: 0, total: 0, title: "" });
    try {
      const res = await window.nexus.patchAllMetadata();
      if (res.patched > 0) toast("success", `Enriched ${res.patched} game${res.patched === 1 ? "" : "s"}`, "Artwork fetched.");
      else toast("info", "Everything's already enriched");
      await refreshAll();
    } catch (e) { toast("error", "Bulk patch failed", e instanceof Error ? e.message : String(e)); }
    finally { setPatching(false); setPatchProgress(null); }
  }, [refreshAll, toast]);

  // Controller support — full app navigation
  // Focus zones: "topbar" → "filters" → "carousel" → "info" → "hints"
  const [gpZone, setGpZone] = useState<"topbar" | "filters" | "carousel" | "info">("carousel");
  const gpZoneRef = useRef<"topbar" | "filters" | "carousel" | "info">("carousel");
  gpZoneRef.current = gpZone;
  // Sub-index within each zone (e.g. which button in the topbar)
  const gpSubIdx = useRef(0);
  const stateRef = useRef({ games, pageGame, addOpen, scanOpen, settingsOpen, updateDialogOpen });
  stateRef.current = { games, pageGame, addOpen, scanOpen, settingsOpen, updateDialogOpen };

  const onGamepad = useCallback((action: string) => {
    const s = stateRef.current;
    // Modal handling — controller navigates within the modal
    if (s.addOpen || s.scanOpen || s.settingsOpen || s.updateDialogOpen) {
      if (action === "back") {
        if (s.addOpen) setAddOpen(false);
        else if (s.scanOpen) setScanOpen(false);
        else if (s.settingsOpen) setSettingsOpen(false);
        else if (s.updateDialogOpen) setUpdateDialogOpen(false);
      } else if (action === "confirm" || action === "play") {
        // Click the focused element in the modal
        const el = document.querySelector(".modal .gp-focus, .modal-overlay .gp-focus") as HTMLElement;
        if (el) el.click();
      } else if (action === "up" || action === "down") {
        // Navigate up/down within modal focusable elements
        const focusables = Array.from(document.querySelectorAll<HTMLElement>(
          ".modal button:not([disabled]), .modal input, .modal select, .modal textarea, .modal-overlay button:not([disabled])"
        )).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const currentIdx = focusables.findIndex((el) => el.classList.contains("gp-focus"));
        const dir = action === "down" ? 1 : -1;
        const nextIdx = currentIdx === -1 ? 0 : Math.max(0, Math.min(focusables.length - 1, currentIdx + dir));
        focusables.forEach((el) => el.classList.remove("gp-focus"));
        focusables[nextIdx].classList.add("gp-focus");
        focusables[nextIdx].focus();
      } else if (action === "left" || action === "right") {
        // For platform cards in scan dialog, navigate left/right
        const focusables = Array.from(document.querySelectorAll<HTMLElement>(".platform-card")).filter((el) => el.offsetParent !== null);
        if (focusables.length > 0) {
          const currentIdx = focusables.findIndex((el) => el.classList.contains("gp-focus"));
          const dir = action === "right" ? 1 : -1;
          const nextIdx = currentIdx === -1 ? 0 : Math.max(0, Math.min(focusables.length - 1, currentIdx + dir));
          focusables.forEach((el) => el.classList.remove("gp-focus"));
          focusables[nextIdx].classList.add("gp-focus");
          focusables[nextIdx].focus();
        }
      }
      return;
    }
    // Game page — back closes, play launches
    if (s.pageGame) {
      if (action === "back") setPageGame(null);
      else if (action === "play" || action === "confirm") handleLaunch(s.pageGame);
      return;
    }
    if (s.games.length === 0) {
      if (action === "scan" || action === "confirm") setScanOpen(true);
      return;
    }

    // Zone-based navigation
    const zone = gpZoneRef.current;

    if (action === "up") {
      // Move to the zone above
      if (zone === "info") { gpZoneRef.current = "carousel"; setGpZone("carousel"); }
      else if (zone === "carousel") { gpZoneRef.current = "filters"; setGpZone("filters"); gpSubIdx.current = 0; }
      else if (zone === "filters") { gpZoneRef.current = "topbar"; setGpZone("topbar"); gpSubIdx.current = 0; }
      updateFocus();
      return;
    }
    if (action === "down") {
      // Move to the zone below
      if (zone === "topbar") { gpZoneRef.current = "filters"; setGpZone("filters"); gpSubIdx.current = 0; }
      else if (zone === "filters") { gpZoneRef.current = "carousel"; setGpZone("carousel"); }
      else if (zone === "carousel") { gpZoneRef.current = "info"; setGpZone("info"); gpSubIdx.current = 0; }
      updateFocus();
      return;
    }

    if (zone === "carousel") {
      // Carousel: left/right navigates tiles, up/down changes zones
      if (action === "left") { focusSourceRef.current = "nav"; setFocusedIdx((i) => Math.max(0, i - 1)); }
      else if (action === "right") { focusSourceRef.current = "nav"; setFocusedIdx((i) => Math.min(s.games.length - 1, i + 1)); }
      else if (action === "confirm") { const g = s.games[focusedIdxRef.current]; if (g) openPage(g.id); }
      else if (action === "play") { const g = s.games[focusedIdxRef.current]; if (g) handleLaunch(g); }
      else if (action === "details") { const g = s.games[focusedIdxRef.current]; if (g) openPage(g.id); }
      else if (action === "menu") setSettingsOpen(true);
      else if (action === "scan") setScanOpen(true);
    } else if (zone === "topbar") {
      // Topbar: left/right navigates between buttons
      const focusables = getZoneFocusables("topbar");
      if (focusables.length === 0) return;
      if (action === "left" || action === "right") {
        const dir = action === "right" ? 1 : -1;
        gpSubIdx.current = Math.max(0, Math.min(focusables.length - 1, gpSubIdx.current + dir));
        updateFocus();
      } else if (action === "confirm") {
        if (focusables[gpSubIdx.current]) focusables[gpSubIdx.current].click();
      }
    } else if (zone === "filters") {
      // Filter pills: left/right navigates between pills
      const focusables = getZoneFocusables("filters");
      if (focusables.length === 0) return;
      if (action === "left" || action === "right") {
        const dir = action === "right" ? 1 : -1;
        gpSubIdx.current = Math.max(0, Math.min(focusables.length - 1, gpSubIdx.current + dir));
        updateFocus();
      } else if (action === "confirm") {
        if (focusables[gpSubIdx.current]) focusables[gpSubIdx.current].click();
      }
    } else if (zone === "info") {
      // Info actions: left/right navigates between buttons
      const focusables = getZoneFocusables("info");
      if (focusables.length === 0) return;
      if (action === "left" || action === "right") {
        const dir = action === "right" ? 1 : -1;
        gpSubIdx.current = Math.max(0, Math.min(focusables.length - 1, gpSubIdx.current + dir));
        updateFocus();
      } else if (action === "confirm" || action === "play") {
        if (focusables[gpSubIdx.current]) focusables[gpSubIdx.current].click();
      }
    }
  }, [handleLaunch, openPage]);

  // Get all focusable elements within a zone
  const getZoneFocusables = (zone: string): HTMLElement[] => {
    let selector: string;
    if (zone === "topbar") {
      selector = ".topbar button, .topbar select, .topbar .update-badge";
    } else if (zone === "filters") {
      selector = ".filter-pill, .filter-row button";
    } else if (zone === "info") {
      selector = ".info-actions button";
    } else {
      return [];
    }
    return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => el.offsetParent !== null);
  };

  // Apply/remove the .gp-focus class based on the current zone + sub-index
  const updateFocus = () => {
    // Clear all existing gp-focus
    document.querySelectorAll(".gp-focus").forEach((el) => el.classList.remove("gp-focus"));

    const zone = gpZoneRef.current;
    if (zone === "carousel") return; // carousel uses .tile.focused, not .gp-focus

    const focusables = getZoneFocusables(zone);
    if (focusables.length > 0 && focusables[gpSubIdx.current]) {
      focusables[gpSubIdx.current].classList.add("gp-focus");
    }
  };

  // Update focus when zone changes or games change
  useEffect(() => { updateFocus(); });

  const { connected: controllerConnected } = useGamepadController({ onAction: onGamepad });

  // v2.0 feature handlers
  const handleSetStatus = useCallback(async (g: Game, status: string) => {
    await window.nexus.updateGame(g.id, { completionStatus: status });
    await refreshAll();
    if (pageGame?.id === g.id) setPageGame(await window.nexus.getGame(g.id));
  }, [refreshAll, pageGame]);
  const handleSetUserRating = useCallback(async (g: Game, rating: number) => {
    await window.nexus.updateGame(g.id, { userRating: rating === g.userRating ? null : rating });
    await refreshAll();
    if (pageGame?.id === g.id) setPageGame(await window.nexus.getGame(g.id));
  }, [refreshAll, pageGame]);
  const handleOpenDir = useCallback(async (g: Game) => {
    const path = g.installDir || g.executable;
    if (!path) { toast("error", "No install directory", "This game has no known install path."); return; }
    const res = await window.nexus.openPath(path);
    if (!res.ok) toast("error", "Couldn't open directory", res.message);
  }, [toast]);
  const handleExport = useCallback(async () => {
    const json = await window.nexus.exportLibrary();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `nexus-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast("success", "Library exported", "Downloaded as JSON backup.");
  }, [toast]);
  const handleImportFile = useCallback(async (file: File) => {
    const text = await file.text();
    const res = await window.nexus.importLibrary(text);
    toast("success", `Imported ${res.imported} game${res.imported === 1 ? "" : "s"}`, res.skipped > 0 ? `${res.skipped} already existed.` : undefined);
    await refreshAll();
  }, [refreshAll, toast]);
  const handleCheckMissing = useCallback(async () => {
    const missing = await window.nexus.checkMissingGames();
    if (missing.length === 0) toast("success", "All games installed", "No missing games found.");
    else toast("info", `${missing.length} game${missing.length === 1 ? "" : "s"} missing`, missing.map((m: { title: string }) => m.title).slice(0, 3).join(", ") + (missing.length > 3 ? "…" : ""));
  }, [toast]);
  const handleEditGame = useCallback(async (g: Game, patch: Record<string, unknown>) => {
    await window.nexus.updateGame(g.id, patch);
    toast("success", "Game updated");
    await refreshAll();
    if (pageGame?.id === g.id) setPageGame(await window.nexus.getGame(g.id));
    setEditorGame(null);
  }, [refreshAll, toast, pageGame]);
  // Same as handleEditGame but keeps the page open (used by GamePage inline edit)
  const handleUpdateFromPage = useCallback(async (g: Game, patch: Record<string, unknown>) => {
    await window.nexus.updateGame(g.id, patch);
    toast("success", "Updated", "Game details saved.");
    await refreshAll();
    if (pageGame?.id === g.id) setPageGame(await window.nexus.getGame(g.id));
  }, [refreshAll, toast, pageGame]);

  // Keyboard shortcuts — edge-triggered, no auto-repeat
  useEffect(() => {
    let lastKeyTime = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Debounce key repeat so holding doesn't skip cards too fast
      const now = performance.now();
      if (e.repeat && now - lastKeyTime < 200) return;
      lastKeyTime = now;

      if (pageGame) { if (e.key === "Escape") setPageGame(null); return; }
      if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key === "k")) { e.preventDefault(); const el = document.querySelector(".tb-search input") as HTMLInputElement; el?.focus(); }
      else if (e.key === "ArrowLeft") { focusSourceRef.current = "nav"; setFocusedIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === "ArrowRight") { focusSourceRef.current = "nav"; setFocusedIdx((i) => Math.min(games.length - 1, i + 1)); }
      else if (e.key === "Enter") { const g = games[focusedIdx]; if (g) openPage(g.id); }
      else if (e.key === "s") setScanOpen(true);
      else if (e.key === "a") setAddOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageGame, games, focusedIdx, openPage]);

  // Track whether the last focus change was from mouse or keyboard/controller.
  // Mouse hover should NOT trigger auto-scroll — the instant scroll repositions
  // tiles under the cursor, causing cascading onMouseEnter on the WRONG tile
  // (e.g. hover 7th → scroll → 9th lands under cursor → 9th focused → skip).
  const focusSourceRef = useRef<"mouse" | "nav">("mouse");

  // Mouse wheel → horizontal scroll for the carousel.
  // Most mice don't have a horizontal wheel, so we convert vertical wheel
  // events to horizontal scroll. This lets mouse-only users scroll through
  // all tiles without needing the keyboard.
  useEffect(() => {
    const carousel = document.querySelector(".carousel") as HTMLElement | null;
    if (!carousel) return;
    const onWheel = (e: WheelEvent) => {
      // If the user is scrolling vertically (most common), convert to horizontal.
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        carousel.scrollLeft += e.deltaY;
      }
    };
    carousel.addEventListener("wheel", onWheel, { passive: false });
    return () => carousel.removeEventListener("wheel", onWheel);
  }, []);

  // Instantly scroll the focused tile to CENTER — but ONLY for keyboard/controller
  // navigation, NOT for mouse hover. Mouse users scroll with the wheel/drag.
  useEffect(() => {
    if (focusSourceRef.current === "mouse") return; // skip auto-scroll on hover
    const carousel = document.querySelector(".carousel") as HTMLElement | null;
    const tile = document.querySelector(".tile.focused") as HTMLElement | null;
    if (!carousel || !tile) return;
    const tileCenter = tile.offsetLeft + tile.offsetWidth / 2;
    const carouselCenter = carousel.clientWidth / 2;
    carousel.scrollLeft = Math.max(0, tileCenter - carouselCenter);
  }, [focusedIdx]);

  const focusedGame = games[focusedIdx] ?? null;

  // Game page
  if (pageGame) {
    return (
      <>
        <GamePage game={pageGame} onClose={() => setPageGame(null)} onLaunch={handleLaunch} onPatch={handlePatch} onDelete={handleDelete} onToggleFav={handleToggleFav} onUpdate={handleUpdateFromPage} onOpenDir={handleOpenDir} />
        {controllerConnected && <div className="hints-bar"><span className="hint"><span className="k r">B</span> Back</span><span className="hint"><span className="k r">A</span>/<span className="k r">X</span> Play</span></div>}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Main PS5 UI
  return (
    <div className="app">
      <DynamicBackground games={games} focusedIdx={focusedIdx} focusedGame={focusedGame} />

      {/* Top bar */}
      <header className="topbar">
        <div className="tb-brand">
          <div className="tb-logo"><Icon.Gamepad size={16} /></div>
          <div><div className="tb-name">NEXUS</div><div className="tb-sub">Launcher</div></div>
        </div>
        <div className="tb-search">
          <span className="icon"><Icon.Search size={15} /></span>
          <input value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} placeholder="Search library…  (press /)" />
        </div>
        <select className="tb-select" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {updateAvailable && (
          <button className="update-badge" onClick={() => setUpdateDialogOpen(true)} title={`NEXUS ${updateAvailable.version} available`}>
            <Icon.DownloadCloud size={13} /> {updateAvailable.version}
          </button>
        )}
        <button className="tb-icon" onClick={() => setScanOpen(true)} title="Scan (S)"><Icon.Scan size={16} /></button>
        <button className="tb-icon primary" onClick={() => setAddOpen(true)} title="Add (A)"><Icon.Plus size={15} /> Add</button>
        <button className="tb-icon" onClick={() => setStatsOpen(true)} title="Stats dashboard"><Icon.TrendingUp size={16} /></button>
        <button className="tb-icon" onClick={() => setSettingsOpen(true)} title="Settings"><Icon.Settings size={16} /></button>
      </header>

      {/* Stage: carousel + info zone */}
      <main className="stage">
        {/* Filter pills */}
        <div className="filter-row">
          <button className={filters.platform === "all" && !filters.favOnly ? "filter-pill active" : "filter-pill"} onClick={() => setFilters((f) => ({ ...f, platform: "all", favOnly: false }))}>All</button>
          <button className={filters.favOnly ? "filter-pill active" : "filter-pill"} onClick={() => setFilters((f) => ({ ...f, favOnly: !f.favOnly }))}><Icon.Star size={11} filled={filters.favOnly} /> Favorites</button>
          <div className="filter-sep" />
          {PLATFORM_LIST.filter((p) => p.id !== "custom").map((p) => (
            <button key={p.id} className={filters.platform === p.id ? "filter-pill active" : "filter-pill"} onClick={() => setFilters((f) => ({ ...f, platform: p.id, favOnly: false }))}>
              <span className="d" style={{ background: p.accent }} />
              {p.label}
              {stats?.byPlatform?.[p.id] ? <span style={{ opacity: 0.6 }}>{stats.byPlatform[p.id]}</span> : null}
            </button>
          ))}
        </div>

        {/* Enrichment banner */}
        {patching && patchProgress && (
          <div className="enrich-banner">
            <div className="iw"><Icon.Spinner size={14} /></div>
            <div><div className="t">Enriching library <span className="c">{patchProgress.current}/{patchProgress.total || "…"}</span></div><div className="s">{patchProgress.title}</div></div>
          </div>
        )}

        {/* Carousel + Info zone */}
        {loading ? (
          <div style={{ display: "flex", gap: 14, overflow: "hidden", padding: "60px 0 40px", alignItems: "center", justifyContent: "center", flex: 1 }}>
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer" style={{ width: 160, aspectRatio: "3/4", borderRadius: 14, flexShrink: 0 }} />)}
          </div>
        ) : games.length === 0 ? (
          <div className="empty">
            <div className="box"><Icon.Gamepad size={34} /></div>
            <h3>{filters.query ? "No matches found" : "Your library is empty"}</h3>
            <p>{filters.query ? "Try a different search." : "Scan your system to auto-detect installed games. NEXUS fetches cover art automatically."}</p>
            {!filters.query && <div className="empty-actions"><button className="btn btn-primary" onClick={() => setScanOpen(true)}><Icon.Scan size={17} /> Scan System</button><button className="btn btn-ghost" onClick={() => setAddOpen(true)}><Icon.Plus size={16} /> Add Manually</button></div>}
          </div>
        ) : (
          <>
            {/* Carousel with arrow buttons for mouse navigation */}
            <div className="carousel-wrap" onMouseMove={(e) => {
              // Edge-hover auto-scroll: mouse near left/right edge → scroll that direction
              const carousel = e.currentTarget.querySelector(".carousel") as HTMLElement;
              if (!carousel) return;
              const rect = carousel.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const edgeZone = 80; // px from edge
              const scrollSpeed = 6;
              if (x < edgeZone && carousel.scrollLeft > 0) {
                carousel.scrollLeft -= scrollSpeed;
              } else if (x > rect.width - edgeZone && carousel.scrollLeft < carousel.scrollWidth - carousel.clientWidth) {
                carousel.scrollLeft += scrollSpeed;
              }
            }}>
              {/* Left arrow */}
              <button className="carousel-arrow left" onClick={() => {
                const carousel = document.querySelector(".carousel") as HTMLElement;
                if (carousel) carousel.scrollLeft -= 300;
              }}>
                <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.Chevron size={22} /></span>
              </button>
              {/* Right arrow */}
              <button className="carousel-arrow right" onClick={() => {
                const carousel = document.querySelector(".carousel") as HTMLElement;
                if (carousel) carousel.scrollLeft += 300;
              }}>
                <Icon.Chevron size={22} />
              </button>
              <div className="carousel">
                {games.map((g, i) => (
                  <div key={g.id} className={i === focusedIdx ? "tile focused" : "tile"} onMouseEnter={() => { focusSourceRef.current = "mouse"; setFocusedIdx(i); }} onClick={() => openPage(g.id)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, game: g }); }}>
                    {g.coverImage || g.bannerImage ? (
                      <img src={(g.coverImage || g.bannerImage) ?? undefined} alt={g.title} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="tile-proc" style={{ background: `radial-gradient(120% 120% at 20% 0%, ${gradientFor(g.title).from} 0%, ${gradientFor(g.title).to} 70%, #050505 100%)` }}>
                        <div className="ln" /><div className="gl" style={{ background: gradientFor(g.title).accent }} /><span className="mono">{initials(g.title)}</span>
                      </div>
                    )}
                    <div className="tile-overlay" />
                    <div className="tile-chips">
                      {g.source === "auto" ? <span className="chip auto">Detected</span> : <span className="chip">Manual</span>}
                      {g.rating !== null && <span className="chip gold"><Icon.Star size={10} filled /> {g.rating.toFixed(1)}</span>}
                    </div>
                    {i === focusedIdx && (
                      <button className={g.favorite ? "fav-btn on" : "fav-btn"} onClick={(e) => { e.stopPropagation(); handleToggleFav(g); }} style={{ position: "absolute", top: 8, right: 8, zIndex: 3 }}>
                        <Icon.Star size={13} filled={g.favorite} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Info zone below */}
            {focusedGame && (
              <div className="info-zone">
                <div className="info-left">
                  <h1 className="info-title">{focusedGame.title}</h1>
                  <div className="info-meta">
                    <span className="pat"><span style={{ width: 7, height: 7, borderRadius: "50%", background: platformColor(focusedGame.platform), display: "inline-block" }} />{platformLabel(focusedGame.platform)}</span>
                    {focusedGame.developer && <><span className="dot" />{focusedGame.developer}</>}
                    {focusedGame.releaseDate && <><span className="dot" />{focusedGame.releaseDate.slice(0, 4)}</>}
                    {focusedGame.rating !== null && <><span className="dot" /><span className="rating"><Icon.Star size={12} filled /> {focusedGame.rating.toFixed(1)}</span></>}
                    {focusedGame.playtimeSec > 0 && <><span className="dot" />{formatPlaytime(focusedGame.playtimeSec)} played</>}
                    {focusedGame.lastPlayedAt && <><span className="dot" />Last: {relativeTime(focusedGame.lastPlayedAt)}</>}
                  </div>
                  <div className="info-actions">
                    <button className="btn btn-primary" onClick={() => handleLaunch(focusedGame)}><Icon.Play size={17} /> Play</button>
                    <button className="btn btn-ghost" onClick={() => openPage(focusedGame.id)}><Icon.Info size={16} /> Details</button>
                    <button className="btn btn-icon" onClick={() => handleToggleFav(focusedGame)} title={focusedGame.favorite ? "Remove favorite" : "Add favorite"} style={focusedGame.favorite ? { background: "rgba(251,191,36,0.12)", borderColor: "rgba(251,191,36,0.36)", color: "var(--gold)" } : {}}><Icon.Star size={16} filled={focusedGame.favorite} /></button>
                    <button className="btn btn-icon" onClick={() => handleOpenDir(focusedGame)} title="Open install directory"><Icon.Folder size={16} /></button>
                    <button className="btn btn-icon" onClick={() => setEditorGame(focusedGame)} title="Edit game"><Icon.FileCog size={16} /></button>
                    {!patching && games.some((g) => !g.bannerImage) && <button className="btn btn-outline" onClick={handlePatchAll} title="Fetch artwork for all games"><Icon.Wand size={15} /> Enrich All</button>}
                  </div>
                  {/* Completion status pills */}
                  <div className="status-pills">
                    {(["playing", "completed", "backlog", "abandoned", "wishlist"] as const).map((s) => (
                      <button key={s} className={`status-pill ${focusedGame.completionStatus === s ? `active ${s}` : ""}`} onClick={() => handleSetStatus(focusedGame, focusedGame.completionStatus === s ? "" : s)}>{s}</button>
                    ))}
                  </div>
                  {/* User rating stars */}
                  <div className="user-rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} className={`star ${focusedGame.userRating && focusedGame.userRating >= n ? "filled" : ""}`} onClick={() => handleSetUserRating(focusedGame, n)}><Icon.Star size={16} filled={focusedGame.userRating ? focusedGame.userRating >= n : false} /></button>
                    ))}
                  </div>
                </div>
                {/* Detail card */}
                <div className="info-card">
                  <div className="info-card-cover">
                    {focusedGame.coverImage || focusedGame.bannerImage ? (
                      <img src={(focusedGame.coverImage || focusedGame.bannerImage) ?? undefined} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="info-card-proc" style={{ background: `radial-gradient(circle at 30% 20%, ${gradientFor(focusedGame.title).from}, #050505 70%)` }}>
                        <span style={{ fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,0.85)" }}>{initials(focusedGame.title)}</span>
                      </div>
                    )}
                  </div>
                  <div className="info-card-body">
                    <span className="info-card-label"><Icon.Shield size={10} /> Full Game</span>
                    <div className="info-card-stat"><Icon.Play size={12} /><span className="v">{focusedGame.launchCount}</span> launches</div>
                    <div className="info-card-stats">
                      <div className="info-card-stat"><Icon.Clock size={11} /><span className="v">{formatPlaytimeShort(focusedGame.playtimeSec)}</span></div>
                      <div className="info-card-stat"><Icon.HardDrive size={11} /><span className="v">{formatSize(focusedGame.sizeBytes)}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Dialogs */}
      {addOpen && <AddGameDialog onClose={() => setAddOpen(false)} onAdd={handleAdd} />}
      {scanOpen && <ScanDialog onClose={() => setScanOpen(false)} onRunScan={handleRunScan} onImport={handleImport} onDeepScan={handleDeepScan} />}
      {settingsOpen && settings && <SettingsDialog initial={settings} onClose={() => setSettingsOpen(false)} onSave={handleSaveSettings} onCheckUpdates={handleCheckUpdates} />}
      {updateDialogOpen && updateAvailable && <UpdateDialog info={updateAvailable} onClose={() => setUpdateDialogOpen(false)} />}

      {/* Context menu (right-click on tiles) */}
      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={() => setCtxMenu(null)}>
          <button className="ctx-item" onClick={() => { handleLaunch(ctxMenu.game); setCtxMenu(null); }}><Icon.Play size={15} /> Play</button>
          <button className="ctx-item" onClick={() => { openPage(ctxMenu.game.id); setCtxMenu(null); }}><Icon.Info size={15} /> Details</button>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => { handleToggleFav(ctxMenu.game); setCtxMenu(null); }}><Icon.Star size={15} filled={ctxMenu.game.favorite} /> {ctxMenu.game.favorite ? "Unfavorite" : "Favorite"}</button>
          <button className="ctx-item" onClick={() => { handleOpenDir(ctxMenu.game); setCtxMenu(null); }}><Icon.Folder size={15} /> Open Directory</button>
          <button className="ctx-item" onClick={() => { handlePatch(ctxMenu.game); setCtxMenu(null); }}><Icon.Refresh size={15} /> Patch Metadata</button>
          <button className="ctx-item" onClick={() => { setEditorGame(ctxMenu.game); setCtxMenu(null); }}><Icon.FileCog size={15} /> Edit Game</button>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => { handleSetStatus(ctxMenu.game, "playing"); setCtxMenu(null); }}><Icon.Play size={14} /> Mark as Playing</button>
          <button className="ctx-item" onClick={() => { handleSetStatus(ctxMenu.game, "completed"); setCtxMenu(null); }}><Icon.CheckCircle size={14} /> Mark as Completed</button>
          <button className="ctx-item" onClick={() => { handleSetStatus(ctxMenu.game, "backlog"); setCtxMenu(null); }}><Icon.Library size={14} /> Add to Backlog</button>
          <div className="ctx-sep" />
          <button className="ctx-item danger" onClick={() => { handleDelete(ctxMenu.game); setCtxMenu(null); }}><Icon.Trash size={15} /> Remove</button>
        </div>
      )}

      {/* Game editor */}
      {editorGame && <GameEditor game={editorGame} onSave={(patch) => handleEditGame(editorGame, patch)} onClose={() => setEditorGame(null)} />}

      {/* Stats dashboard */}
      {statsOpen && <StatsDashboard onClose={() => setStatsOpen(false)} onExport={handleExport} onImport={handleImportFile} onCheckMissing={handleCheckMissing} />}

      {controllerConnected && !pageGame && <div className="hints-bar"><span className="hint"><span className="k">↑↓</span> {gpZone === "topbar" ? "Top Bar" : gpZone === "filters" ? "Filters" : gpZone === "carousel" ? "Games" : "Actions"}</span><span className="hint"><span className="k">←→</span> Navigate</span><span className="hint"><span className="k r">A</span> Select</span><span className="hint"><span className="k r">X</span> Play</span><span className="hint"><span className="k r">Y</span> Details</span><span className="hint"><span className="k r">B</span> Back</span><span className="hint"><span className="k">☰</span> Settings</span></div>}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function DynamicBackground({ games, focusedIdx, focusedGame }: { games: Game[]; focusedIdx: number; focusedGame: Game | null }) {
  const visible = useMemo(() => {
    const list: { id: number; image: string }[] = [];
    const seen = new Set<number>();
    for (let i = focusedIdx; i < games.length && list.length < 3; i++) {
      const g = games[i];
      const img = g.bannerImage || g.coverImage;
      if (img && !seen.has(g.id)) { list.push({ id: g.id, image: img }); seen.add(g.id); }
    }
    if (list.length === 0 && focusedGame) {
      const grad = gradientFor(focusedGame.title);
      return [{ id: focusedGame.id, image: `radial-gradient(circle at 30% 20%, ${grad.from}, #08080c 70%)` }];
    }
    return list;
  }, [games, focusedIdx, focusedGame]);
  return (
    <>
      <div className="bg-layer">
        {visible.map((v, i) => <div key={v.id} className={i === 0 ? "bg-slide active" : "bg-slide"} style={{ backgroundImage: v.image.startsWith("radial") ? v.image : `url(${v.image})` }} />)}
      </div>
      <div className="bg-overlay" />
    </>
  );
}

/** Stats Dashboard modal — shows library analytics + tools (export/import/check-missing). */
function StatsDashboard({ onClose, onExport, onImport, onCheckMissing }: {
  onClose: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onCheckMissing: () => void;
}) {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof window.nexus.getDetailedStats>> | null>(null);
  useEffect(() => { window.nexus.getDetailedStats().then(setStats); }, []);
  if (!stats) return <div className="modal-overlay" onClick={onClose}><div className="modal modal-wide" onClick={(e) => e.stopPropagation()}><div className="modal-body"><div className="shimmer" style={{ height: 200, borderRadius: 12 }} /></div></div></div>;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title"><Icon.TrendingUp size={18} /> Library Statistics</div>
          <button className="modal-close" onClick={onClose}><Icon.Close size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="stats-grid">
            <div className="stat-card"><div className="i"><Icon.Library size={18} /></div><div className="v">{stats.totalGames}</div><div className="l">Total Games</div></div>
            <div className="stat-card"><div className="i"><Icon.Clock size={18} /></div><div className="v">{formatPlaytimeShort(stats.totalPlaytimeSec)}</div><div className="l">Playtime</div></div>
            <div className="stat-card"><div className="i"><Icon.HardDrive size={18} /></div><div className="v">{formatSize(stats.totalSizeBytes)}</div><div className="l">Disk Used</div></div>
            <div className="stat-card"><div className="i"><Icon.Star size={18} /></div><div className="v">{stats.avgRating ? stats.avgRating.toFixed(1) : "—"}</div><div className="l">Avg Rating</div></div>
          </div>
          <div className="stats-grid">
            <div className="stat-card"><div className="i"><Icon.Play size={18} /></div><div className="v">{stats.totalLaunches}</div><div className="l">Total Launches</div></div>
            <div className="stat-card"><div className="i"><Icon.Star size={18} /></div><div className="v">{stats.favorites}</div><div className="l">Favorites</div></div>
            <div className="stat-card"><div className="i"><Icon.Gamepad size={18} /></div><div className="v">{stats.neverPlayed}</div><div className="l">Never Played</div></div>
            <div className="stat-card"><div className="i"><Icon.CheckCircle size={18} /></div><div className="v">{stats.completionRate.toFixed(0)}%</div><div className="l">Completion</div></div>
          </div>
          {/* By platform */}
          <div className="stats-section">
            <div className="stats-section-title"><span style={{ width: 3, height: 13, borderRadius: 2, background: "#4ade80" }} /> By Platform</div>
            {Object.entries(stats.byPlatform as Record<string, number>).sort((a: [string, number], b: [string, number]) => b[1] - a[1]).map(([k, v]: [string, number]) => (
              <div key={k} className="stats-row">
                <span className="name">{PLATFORM_LIST.find((p) => p.id === k)?.label ?? k}</span>
                <div className="stats-bar"><div style={{ width: `${stats.totalGames > 0 ? (v / stats.totalGames) * 100 : 0}%` }} /></div>
                <span className="val">{v}</span>
              </div>
            ))}
          </div>
          {/* By status */}
          <div className="stats-section">
            <div className="stats-section-title"><span style={{ width: 3, height: 13, borderRadius: 2, background: "#22d3ee" }} /> By Status</div>
            {Object.entries(stats.byStatus as Record<string, number>).sort((a: [string, number], b: [string, number]) => b[1] - a[1]).map(([k, v]: [string, number]) => (
              <div key={k} className="stats-row"><span className="name">{k}</span><span className="val">{v}</span></div>
            ))}
          </div>
          {/* Top played */}
          <div className="stats-section">
            <div className="stats-section-title"><span style={{ width: 3, height: 13, borderRadius: 2, background: "#fbbf24" }} /> Top Played</div>
            {stats.topPlayed.slice(0, 5).map((g: { id: number; title: string; playtimeSec: number }) => (
              <div key={g.id} className="stats-row"><span className="name">{g.title}</span><span className="val">{formatPlaytimeShort(g.playtimeSec)}</span></div>
            ))}
          </div>
          {/* Largest games */}
          <div className="stats-section">
            <div className="stats-section-title"><span style={{ width: 3, height: 13, borderRadius: 2, background: "#60a5fa" }} /> Largest Games</div>
            {stats.largestGames.slice(0, 5).map((g: { id: number; title: string; sizeBytes: number | null }) => (
              <div key={g.id} className="stats-row"><span className="name">{g.title}</span><span className="val">{formatSize(g.sizeBytes)}</span></div>
            ))}
          </div>
          {/* Tools */}
          <div className="stats-section">
            <div className="stats-section-title"><span style={{ width: 3, height: 13, borderRadius: 2, background: "#a78bfa" }} /> Library Tools</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-ghost btn-sm" onClick={onExport}><Icon.Download size={14} /> Export Library</button>
              <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
                <Icon.DownloadCloud size={14} /> Import Library
                <input type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); }} />
              </label>
              <button className="btn btn-ghost btn-sm" onClick={onCheckMissing}><Icon.Scan size={14} /> Check Missing Games</button>
            </div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-primary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

/** Game Editor modal — edit title, platform, paths, notes, tags. */
function GameEditor({ game, onSave, onClose }: { game: Game; onSave: (patch: Record<string, unknown>) => void; onClose: () => void }) {
  const [title, setTitle] = useState(game.title);
  const [platform, setPlatform] = useState(game.platform);
  const [executable, setExecutable] = useState(game.executable ?? "");
  const [installDir, setInstallDir] = useState(game.installDir ?? "");
  const [launchCommand, setLaunchCommand] = useState(game.launchCommand ?? "");
  const [notes, setNotes] = useState(game.notes ?? "");
  const [coverImage, setCoverImage] = useState(game.coverImage ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    onSave({ title, platform, executable: executable || null, installDir: installDir || null, launchCommand: launchCommand || null, notes: notes || null, coverImage: coverImage || null });
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title"><Icon.FileCog size={18} /> Edit Game</div>
          <button className="modal-close" onClick={onClose}><Icon.Close size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="editor-field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="editor-row">
            <div className="editor-field"><label>Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as Game["platform"])}>
                {PLATFORM_LIST.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="editor-field"><label>Cover Image URL</label><input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://…" /></div>
          </div>
          <div className="editor-field"><label>Executable Path</label><input value={executable} onChange={(e) => setExecutable(e.target.value)} placeholder="C:\Games\game.exe" /></div>
          <div className="editor-field"><label>Install Directory</label><input value={installDir} onChange={(e) => setInstallDir(e.target.value)} placeholder="C:\Games\MyGame" /></div>
          <div className="editor-field"><label>Launch Command</label><input value={launchCommand} onChange={(e) => setLaunchCommand(e.target.value)} placeholder="steam://run/123456" /></div>
          <div className="editor-field"><label>Notes</label><textarea className="notes-area" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Your personal notes about this game…" /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Icon.Spinner size={15} /> : <Icon.Check size={15} />} Save Changes</button>
        </div>
      </div>
    </div>
  );
}
