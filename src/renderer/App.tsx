import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DetectedGame, Game, LauncherSettings, PlatformId, SortKey, Stats, Collection } from "@shared/types";
import { PLATFORM_LIST, PLATFORMS } from "@shared/types";
import { Icon } from "./components/Icons";
import { NexusMark } from "./components/Logo";
import { ModeToggle } from "./components/ModeToggle";
import { PlatformMark } from "./components/PlatformMark";
import { IconGlyph } from "./components/IconGlyph";
import { ThemeStudio } from "./components/theme/ThemeStudio";
import { AcquisitionPicker } from "./components/AcquisitionPicker";
import { DownloadsPanel } from "./components/DownloadsPanel";
import { useDownloads } from "./lib/useDownloads";
import { CreateCollectionDialog } from "./components/CreateCollectionDialog";
import { CollectionPicker } from "./components/CollectionPicker";
import { GamePage } from "./components/GamePage";
import { AddGameDialog } from "./components/AddGameDialog";
import { ScanDialog } from "./components/ScanDialog";
import { SettingsPage } from "./components/SettingsPage";
import { UpdateDialog } from "./components/UpdateDialog";
import { ToastContainer, type Toast } from "./components/Toast";
import { useGamepadController } from "./lib/useGamepad";
import { formatPlaytime, formatPlaytimeShort, formatSize, platformColor, platformLabel, gradientFor, initials, relativeTime } from "./lib/helpers";
import { applyAccent } from "./lib/accent";
import { applyActiveThemeOnStartup } from "./lib/applyTheme";

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
  // v4.0.0 — UI mode (console carousel vs desktop grid). localStorage is the source of truth.
  const [uiMode, setUiMode] = useState<"console" | "desktop">(
    () => (localStorage.getItem("nx-uimode") as "console" | "desktop") || "console"
  );
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
  const [activeTab, setActiveTab] = useState<"games" | "achievements" | "activity">("games");
  const [achievements, setAchievements] = useState<Array<{ id: string; name: string; description: string; icon: string; unlockedAt: string | null; progress: number; maxProgress: number }>>([]);
  const [editorGame, setEditorGame] = useState<Game | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version?: string; releaseUrl?: string; downloadUrl?: string; downloadSize?: number } | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  // v4.4.0 — Theme Studio (full-screen visual theme editor).
  const [studioOpen, setStudioOpen] = useState(false);
  // v4.5.0 — Acquisition + downloads.
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [acquireGame, setAcquireGame] = useState<{ id: number; title: string; installed: boolean } | null>(null);
  const { progressForGame } = useDownloads();
  // Playtime tracking state — shows live playtime when a game is running.
  const [activePlaytime, setActivePlaytime] = useState<{ gameId: number; gameTitle: string; elapsedSec: number; startedAt: number } | null>(null);
  // v4.3.0 — Collections + collapsible sidebar + platform visibility.
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollection, setActiveCollection] = useState<number | null>(null); // null = no collection filter (All Games / platform)
  const [createCollOpen, setCreateCollOpen] = useState(false);
  const [editColl, setEditColl] = useState<Collection | null>(null);
  const [collPickerGame, setCollPickerGame] = useState<{ id: number; title: string } | null>(null);
  // Per-section collapse state (Collections + Platforms) — persisted in localStorage.
  const [collectionsCollapsed, setCollectionsCollapsed] = useState(() => localStorage.getItem("nx-coll-collapsed") === "1");
  const [platformsCollapsed, setPlatformsCollapsed] = useState(() => localStorage.getItem("nx-plat-collapsed") === "1");

  const toast = useCallback((type: Toast["type"], title: string, desc?: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, title, desc }]);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const refreshCollections = useCallback(async () => {
    try { setCollections(await window.nexus.listCollections()); } catch { /* ignore */ }
  }, []);

  // Derived: which platforms are hidden from the sidebar (from settings).
  const hiddenPlatformSet = useMemo(() => {
    const s = settings?.hiddenPlatforms ?? "";
    return new Set(s.split("|").filter(Boolean));
  }, [settings]);
  const visiblePlatforms = useMemo(
    () => PLATFORM_LIST.filter((p) => p.id !== "custom" && !hiddenPlatformSet.has(p.id)),
    [hiddenPlatformSet]
  );

  const refreshGames = useCallback(async () => {
    // v4.3.0 — if a collection is selected, load its games directly (and apply
    // the search query client-side); otherwise use the normal platform/fav filter.
    if (activeCollection !== null) {
      let list: Game[] = [];
      try { list = await window.nexus.getGamesInCollection(activeCollection); } catch { /* ignore */ }
      if (filters.query.trim()) {
        const q = filters.query.toLowerCase();
        list = list.filter((g) => g.title.toLowerCase().includes(q));
      }
      setGames(list);
      return;
    }
    setGames(await window.nexus.listGames({ platform: filters.platform, favOnly: filters.favOnly, query: filters.query, sort: filters.sort }));
  }, [filters, activeCollection]);
  const refreshStats = useCallback(async () => setStats(await window.nexus.getStats()), []);
  const refreshAll = useCallback(async () => {
    setLoading(true);
    try { await Promise.all([refreshGames(), refreshStats(), refreshCollections()]); } finally { setLoading(false); }
  }, [refreshGames, refreshStats, refreshCollections]);

  useEffect(() => {
    // v4.2.0 — Apply the saved accent color on startup BEFORE painting the
    // library so the very first frame uses the user's chosen accent (not the
    // default teal). localStorage is the source of truth for appearance.
    applyAccent(localStorage.getItem("nx-accent") || "#2dd4bf");
    // v4.4.0 — Apply the active Theme Studio theme (supersedes the accent
    // above; the theme sets --accent + ~60 other tokens). Falls back to the
    // default theme if none saved. Never throws.
    void applyActiveThemeOnStartup();
    (async () => {
      try {
        const s = await window.nexus.getSettings();
        setSettings(s);
        setFilters((f) => ({ ...f, sort: s.defaultSort }));
        // v4.0.0 — sync uiMode from db if localStorage is empty (first run after upgrade)
        if (!localStorage.getItem("nx-uimode") && s.uiMode) {
          localStorage.setItem("nx-uimode", s.uiMode);
          setUiMode(s.uiMode);
        }
        // v4.5.0 — verify install state for every game (fix Play/Get actions).
        try { const changed = await window.nexus.verifyAllInstalled(); if (changed.length > 0) await refreshGames(); } catch {}
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
      // Check achievements on startup
      try {
        const res = await window.nexus.checkAchievements();
        if (res.newlyUnlocked.length > 0) {
          const achs = await window.nexus.getAchievements();
          setAchievements(achs);
          res.newlyUnlocked.forEach((id: string) => {
            const a = achs.find((x: { id: string }) => x.id === id);
            if (a) toast("success", "Achievement Unlocked", `${a.name} — ${a.description}`);
          });
        } else {
          setAchievements(await window.nexus.getAchievements());
        }
      } catch {}
    })();
    const offP = (window as unknown as { nexus?: { onPatchProgress?: (cb: (p: { gameId: number; title: string; current: number; total: number }) => void) => () => void } }).nexus?.onPatchProgress?.((p) => { setPatching(true); setPatchProgress({ current: p.current, total: p.total, title: p.title }); });
    const offG = (window as unknown as { nexus?: { onPatchGameUpdated?: (cb: (p: { game: Game }) => void) => () => void } }).nexus?.onPatchGameUpdated?.(({ game }) => { setGames((prev) => prev.map((g) => (g.id === game.id ? game : g))); if (pageGame?.id === game.id) setPageGame(game); refreshStats(); });
    const offD = (window as unknown as { nexus?: { onPatchDone?: (cb: (p: { patched: number; attempted: number }) => void) => () => void } }).nexus?.onPatchDone?.(({ patched, attempted }) => { setPatching(false); setPatchProgress(null); if (patched > 0) toast("success", `Enriched ${patched} of ${attempted} games`, "Artwork fetched automatically."); refreshAll(); });

    // ===== Playtime tracking — live updates when a game is running =====
    const offPtStart = window.nexus.onPlaytimeStarted?.((p: { gameId: number; gameTitle: string; startedAt: number }) => {
      setActivePlaytime({ gameId: p.gameId, gameTitle: p.gameTitle, elapsedSec: 0, startedAt: p.startedAt });
    });
    const offPtTick = window.nexus.onPlaytimeTick?.((p: { gameId: number; gameTitle: string; elapsedSec: number; startedAt: number }) => {
      setActivePlaytime({ gameId: p.gameId, gameTitle: p.gameTitle, elapsedSec: p.elapsedSec, startedAt: p.startedAt });
    });
    const offPtStop = window.nexus.onPlaytimeStopped?.((p: { gameId: number; gameTitle: string; durationSec: number; startedAt: number; endedAt: number }) => {
      setActivePlaytime(null);
      toast("success", `Playtime recorded: ${p.gameTitle}`, `Played for ${Math.round(p.durationSec / 60)} minutes.`);
      refreshAll();
    });

    return () => { offP?.(); offG?.(); offD?.(); offPtStart?.(); offPtTick?.(); offPtStop?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!loading) refreshGames(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters, activeCollection]);

  // v4.5.0 — when a download completes (files verified + game marked installed),
  // refresh the games list so the card/detail action flips from Get → Play Now.
  useEffect(() => {
    const off = window.nexus.onDownloadCompleted(() => { void refreshGames(); void refreshStats(); });
    return () => { off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPage = useCallback(async (id: number) => setPageGame(await window.nexus.getGame(id)), []);
  const handleLaunch = useCallback(async (g: Game) => {
    toast("info", `Launching ${g.title}…`, "Playtime tracking started.");
    const res = await window.nexus.launchGame(g.id);
    if (res.ok) {
      toast("success", `${g.title} is running`, "Playtime is being tracked — close the game to stop.");
      await refreshAll();
      if (pageGame?.id === g.id) setPageGame(await window.nexus.getGame(g.id));
    }
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
  const handleSaveSettings = useCallback(async (s: Partial<LauncherSettings>) => {
    const next = await window.nexus.setSettings(s);
    setSettings(next);
    // v4.0.0 — sync uiMode state if it was part of the save (e.g., from SettingsPage)
    if (next.uiMode) {
      setUiMode(next.uiMode);
      localStorage.setItem("nx-uimode", next.uiMode);
    }
    // v4.2.0 — re-apply accent in case the user changed it in Appearance
    applyAccent(localStorage.getItem("nx-accent") || "#2dd4bf");
    toast("success", "Settings saved");
    return next;
  }, [toast]);
  // v4.0.0 — Toggle the launcher layout between Console carousel and Desktop grid.
  // Persists to localStorage (instant toggle, no restart) AND to the database (for cross-session).
  const setUiModeAndPersist = useCallback(async (mode: "console" | "desktop") => {
    setUiMode(mode);
    localStorage.setItem("nx-uimode", mode);
    try { await window.nexus.setSettings({ uiMode: mode }); } catch {}
  }, []);

  // v4.3.0 — Collection actions.
  const selectCollection = useCallback((id: number | null) => {
    // selecting a collection clears the platform/fav filter (collection view takes over)
    setActiveCollection(id);
    if (id !== null) setFilters((f) => ({ ...f, platform: "all", favOnly: false }));
  }, []);
  const handleCreateCollection = useCallback(async (data: { name: string; icon: string; color: string; description: string }) => {
    try {
      const c = await window.nexus.createCollection(data);
      await refreshCollections();
      toast("success", "Collection created", `"${c.name}" is ready in your sidebar.`);
    } catch (e) { toast("error", "Couldn't create collection", e instanceof Error ? e.message : String(e)); }
  }, [refreshCollections, toast]);
  const handleUpdateCollection = useCallback(async (id: number, data: { name: string; icon: string; color: string; description: string }) => {
    try {
      await window.nexus.updateCollection(id, data);
      await refreshCollections();
      toast("success", "Collection updated");
    } catch (e) { toast("error", "Couldn't update collection", e instanceof Error ? e.message : String(e)); }
  }, [refreshCollections, toast]);
  const handleDeleteCollection = useCallback(async (c: Collection) => {
    if (c.id < 0) { toast("info", "Built-in collections can't be deleted"); return; }
    try {
      await window.nexus.deleteCollection(c.id);
      if (activeCollection === c.id) setActiveCollection(null);
      await refreshCollections();
      toast("success", "Collection deleted", `"${c.name}" was removed.`);
    } catch (e) { toast("error", "Couldn't delete collection", e instanceof Error ? e.message : String(e)); }
  }, [activeCollection, refreshCollections, toast]);
  const handleToggleGameInCollection = useCallback(async (collectionId: number, gameId: number, add: boolean) => {
    try {
      if (add) await window.nexus.addGameToCollection(collectionId, gameId);
      else await window.nexus.removeGameFromCollection(collectionId, gameId);
      await refreshCollections();
    } catch { /* ignore */ }
  }, [refreshCollections]);
  const toggleCollectionPin = useCallback(async (c: Collection) => {
    try { await window.nexus.updateCollection(c.id, { pinned: !c.pinned }); await refreshCollections(); } catch { /* ignore */ }
  }, [refreshCollections]);
  const toggleCollectionsCollapsed = useCallback(() => {
    setCollectionsCollapsed((v) => { const n = !v; localStorage.setItem("nx-coll-collapsed", n ? "1" : "0"); return n; });
  }, []);
  const togglePlatformsCollapsed = useCallback(() => {
    setPlatformsCollapsed((v) => { const n = !v; localStorage.setItem("nx-plat-collapsed", n ? "1" : "0"); return n; });
  }, []);

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

  // v4.0.0 — Removed the broken mouse-wheel → horizontal-scroll conversion.
  // In console mode the carousel scrolls ONLY via arrow buttons or keyboard/controller —
  // mouse users who want normal wheel scroll should use Desktop mode (grid view).
  // The "Instantly scroll the focused tile to CENTER" effect below remains — it's keyboard/
  // controller only (gated by focusSourceRef) so it never fights mouse hover.
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
        <GamePage game={pageGame} onClose={() => setPageGame(null)} onLaunch={handleLaunch} onPatch={handlePatch} onDelete={handleDelete} onToggleFav={handleToggleFav} onUpdate={handleUpdateFromPage} onOpenDir={handleOpenDir} onAddToCollection={(g) => setCollPickerGame({ id: g.id, title: g.title })} onGet={(g) => setAcquireGame({ id: g.id, title: g.title, installed: g.installed })} />
        {controllerConnected && <div className="hints-bar"><span className="hint"><span className="k r">B</span> Back</span><span className="hint"><span className="k r">A</span>/<span className="k r">X</span> Play</span></div>}
        {/* v4.3.0 — Collection dialogs accessible from the game page too */}
        {createCollOpen && <CreateCollectionDialog onClose={() => setCreateCollOpen(false)} onSave={handleCreateCollection} />}
        {editColl && <CreateCollectionDialog initial={editColl} onClose={() => setEditColl(null)} onSave={(d) => handleUpdateCollection(editColl.id, d)} />}
        {collPickerGame && (
          <CollectionPicker
            gameId={collPickerGame.id}
            gameTitle={collPickerGame.title}
            collections={collections}
            onClose={() => setCollPickerGame(null)}
            onToggle={(cid, add) => handleToggleGameInCollection(cid, collPickerGame.id, add)}
            onCreateNew={() => { setCollPickerGame(null); setCreateCollOpen(true); }}
          />
        )}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        {studioOpen && <ThemeStudio onClose={() => setStudioOpen(false)} />}
        {acquireGame && <AcquisitionPicker gameId={acquireGame.id} gameTitle={acquireGame.title} installed={acquireGame.installed} onClose={() => setAcquireGame(null)} onStarted={() => { setAcquireGame(null); setDownloadsOpen(true); }} />}
        {downloadsOpen && <DownloadsPanel onClose={() => setDownloadsOpen(false)} />}
      </>
    );
  }

  // Main UI — Console mode (PS5 carousel) or Desktop mode (Epic-style grid + sidebar)
  if (uiMode === "desktop" && !pageGame) {
    return (
      <div className="app desktop-mode">
        {/* Top bar */}
        <header className="topbar">
          <div className="tb-brand">
            <div className="tb-logo"><NexusMark size={18} /></div>
            <div><div className="tb-name">NEXUS</div><div className="tb-sub">Launcher</div></div>
          </div>
          <div className="tb-search">
            <span className="icon"><Icon.Search size={15} /></span>
            <input value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} placeholder="Search library…" />
          </div>
          <select className="tb-select" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {updateAvailable && (
            <button className="update-badge" onClick={() => setUpdateDialogOpen(true)} title={`NEXUS ${updateAvailable.version} available`}>
              <Icon.DownloadCloud size={13} /> {updateAvailable.version}
            </button>
          )}
          {activePlaytime && (
            <button
              className="playtime-badge"
              onClick={async () => { await window.nexus.stopPlaytimeTracking(activePlaytime.gameId); setActivePlaytime(null); }}
              title={`Click to stop tracking — ${activePlaytime.gameTitle}`}
            >
              <span className="playtime-badge__dot" />
              <span className="playtime-badge__text">{activePlaytime.gameTitle}</span>
              <span className="playtime-badge__time">{formatPlaytimeShort(activePlaytime.elapsedSec)}</span>
              <span className="playtime-badge__stop">Stop</span>
            </button>
          )}
          <ModeToggle current={uiMode} onSwitch={setUiModeAndPersist} />
          <button className="tb-icon" onClick={() => setScanOpen(true)} title="Scan"><Icon.Scan size={16} /></button>
          <button className="tb-icon primary" onClick={() => setAddOpen(true)} title="Add"><Icon.Plus size={15} /> Add</button>
          <button className="tb-icon" onClick={() => setStudioOpen(true)} title="Theme Studio"><IconGlyph k="palette" size={16} /></button>
          <button className="tb-icon" onClick={() => setSettingsOpen(true)} title="Settings"><Icon.Settings size={16} /></button>
        </header>

        {/* Desktop layout: left sidebar + main content */}
        <div className="desktop-layout">
          {/* Left sidebar */}
          <aside className="dt-sidebar">
            <div className="dt-sidebar-brand">
              <span className="dt-sidebar-mark"><NexusMark size={16} /></span>
              <span className="dt-sidebar-title">Library</span>
            </div>

            {/* Collections section (collapsible) */}
            <div className="dt-sidebar-section">
              <button
                className={collectionsCollapsed ? "dt-section-head collapsed" : "dt-section-head"}
                onClick={toggleCollectionsCollapsed}
                aria-expanded={!collectionsCollapsed}
              >
                <span className="chev"><Icon.Chevron size={11} /></span>
                <span className="lbl">Collections</span>
                <span className="count">{collections.length}</span>
                <span className="dt-coll-add" role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setCreateCollOpen(true); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setCreateCollOpen(true); } }}
                  title="New collection"
                  aria-label="New collection"
                ><Icon.Plus size={12} /></span>
              </button>
              <div className={collectionsCollapsed ? "dt-section-body collapsed" : "dt-section-body"}>
                {collections.map((c) => (
                  <button
                    key={c.id}
                    className={activeCollection === c.id ? "dt-coll-item active" : "dt-coll-item"}
                    style={{ ["--coll-accent" as string]: c.color || undefined }}
                    onClick={() => selectCollection(activeCollection === c.id ? null : c.id)}
                    onContextMenu={(e) => { e.preventDefault(); setEditColl(c); }}
                    title={c.description ?? c.name}
                  >
                    <span className="dt-coll-emoji"><IconGlyph k={c.icon} size={15} /></span>
                    <span className="dt-coll-name">{c.name}</span>
                    {c.pinned && <span className="dt-coll-pin" title="Pinned"><Icon.Star size={10} filled /></span>}
                    <span className="dt-coll-count">{c.gameCount}</span>
                  </button>
                ))}
                {collections.length === 0 && (
                  <button className="dt-coll-item" onClick={() => setCreateCollOpen(true)}>
                    <span className="dt-coll-emoji"><Icon.Plus size={14} /></span>
                    <span className="dt-coll-name" style={{ color: "var(--text-faint)" }}>Create your first collection</span>
                  </button>
                )}
              </div>
            </div>

            {/* Platforms section (collapsible, respects per-platform visibility) */}
            <div className="dt-sidebar-section">
              <button
                className={platformsCollapsed ? "dt-section-head collapsed" : "dt-section-head"}
                onClick={togglePlatformsCollapsed}
                aria-expanded={!platformsCollapsed}
              >
                <span className="chev"><Icon.Chevron size={11} /></span>
                <span className="lbl">Platforms</span>
                <span className="count">{visiblePlatforms.length}</span>
              </button>
              <div className={platformsCollapsed ? "dt-section-body collapsed" : "dt-section-body"}>
                {visiblePlatforms.map((p) => {
                  const count = stats?.byPlatform?.[p.id] ?? 0;
                  return (
                    <button
                      key={p.id}
                      className={filters.platform === p.id && activeCollection === null ? "dt-nav-item active" : "dt-nav-item"}
                      onClick={() => { setActiveCollection(null); setFilters((f) => ({ ...f, platform: p.id, favOnly: false })); }}
                    >
                      <span className="dt-plat-mark"><PlatformMark platform={p.id} size={16} /></span>
                      <span>{p.label}</span>
                      {count > 0 && <span className="dt-nav-count">{count}</span>}
                    </button>
                  );
                })}
                {visiblePlatforms.length === 0 && (
                  <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-faint)" }}>All platforms hidden — enable some in Settings → Sidebar.</div>
                )}
              </div>
            </div>

            <div className="dt-sidebar-section">
              <div className="dt-sidebar-label">Library Stats</div>
              <div className="dt-stat-mini"><span>Playtime</span><strong>{stats ? formatPlaytimeShort(stats.totalPlaytimeSec) : "—"}</strong></div>
              <div className="dt-stat-mini"><span>Launches</span><strong>{stats?.totalLaunches ?? "—"}</strong></div>
              <div className="dt-stat-mini"><span>Disk</span><strong>{stats ? formatSize(stats.totalSizeBytes) : "—"}</strong></div>
            </div>
          </aside>

          {/* Main content area */}
          <main className="dt-main">
            {/* Enrichment banner */}
            {patching && patchProgress && (
              <div className="enrich-banner">
                <div className="iw"><Icon.Spinner size={14} /></div>
                <div><div className="t">Enriching library <span className="c">{patchProgress.current}/{patchProgress.total || "…"}</span></div><div className="s">{patchProgress.title}</div></div>
              </div>
            )}

            {/* Nav tabs */}
            <div className="nav-tabs">
              <button className={activeTab === "games" ? "nav-tab active" : "nav-tab"} onClick={() => setActiveTab("games")}>Games</button>
              <button className={activeTab === "achievements" ? "nav-tab active" : "nav-tab"} onClick={() => setActiveTab("achievements")}>Achievements {achievements.filter((a) => a.unlockedAt).length > 0 && <span className="nav-tab-badge">{achievements.filter((a) => a.unlockedAt).length}</span>}</button>
              <button className={activeTab === "activity" ? "nav-tab active" : "nav-tab"} onClick={() => setActiveTab("activity")}>Activity</button>
            </div>

            {/* Tab content */}
            {activeTab === "achievements" ? (
              <div className="dt-scroll">
                <div className="ach-grid">
                  {achievements.map((a) => {
                    const unlocked = !!a.unlockedAt;
                    const pct = a.maxProgress > 0 ? Math.round((a.progress / a.maxProgress) * 100) : 0;
                    return (
                      <div key={a.id} className={`ach-card ${unlocked ? "unlocked" : "locked"}`}>
                        <div className={`ach-icon ${unlocked ? "unlocked" : "locked"}`}><IconGlyph k={a.icon} size={20} /></div>
                        <div className="ach-body">
                          <div className="ach-name">{a.name}</div>
                          <div className="ach-desc">{a.description}</div>
                          {!unlocked && a.maxProgress > 1 && (<><div className="ach-progress"><div style={{ width: `${pct}%` }} /></div><div className="ach-pct">{a.progress} / {a.maxProgress} ({pct}%)</div></>)}
                          {unlocked && <div className="ach-pct" style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon.Check size={12} /> Unlocked</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : activeTab === "activity" ? (
              <div className="dt-scroll">
                <div className="activity-list">
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16, letterSpacing: "-0.02em" }}>Recent Activity</div>
                  {games.filter((g) => g.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? "")).slice(0, 20).map((g) => (
                    <div key={g.id} className="activity-item" onClick={() => openPage(g.id)} style={{ cursor: "pointer" }}>
                      <div className="icon"><Icon.Play size={14} /></div>
                      <span className="title">{g.title}</span>
                      <span className="time">{relativeTime(g.lastPlayedAt)}</span>
                    </div>
                  ))}
                  {games.filter((g) => g.lastPlayedAt).length === 0 && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 40, textAlign: "center" }}>
                      <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(255,255,255,.04)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", marginBottom: 14 }}><Icon.Gamepad size={28} /></div>
                      <p style={{ fontSize: 14, color: "var(--text-dim)" }}>No activity yet. Launch a game to get started!</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Games tab — grid view */
              <div className="dt-scroll">
                {/* v4.3.0 — Collection view header (only when a collection is selected) */}
                {activeCollection !== null && (() => {
                  const c = collections.find((x) => x.id === activeCollection);
                  if (!c) return null;
                  return (
                    <div className="dt-view-header">
                      <span className="emoji"><IconGlyph k={c.icon} size={28} /></span>
                      <div className="stack">
                        <div className="title" style={{ ["--coll-accent" as string]: c.color || undefined, color: c.color || "#fff" }}>{c.name}</div>
                        <div className="meta">{c.gameCount} game{c.gameCount === 1 ? "" : "s"}{c.description ? " · " + c.description : ""}{c.kind !== "manual" ? " · auto-generated" : ""}</div>
                      </div>
                      <div className="actions">
                        {c.id >= 0 && c.kind === "manual" && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => toggleCollectionPin(c)} title={c.pinned ? "Unpin" : "Pin to top"}><Icon.Star size={13} filled={c.pinned} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditColl(c)} title="Edit collection"><Icon.FileCog size={13} /> Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteCollection(c)} title="Delete collection"><Icon.Trash size={13} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {loading ? (
                  <div className="desktop-grid">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="gc">
                        <div className="gc-cover" style={{ position: "relative" }}><div className="shimmer" style={{ position: "absolute", inset: 0 }} /></div>
                        <div className="gc-footer">
                          <div className="shimmer" style={{ height: 12, borderRadius: 4, marginBottom: 6 }} />
                          <div className="shimmer" style={{ height: 10, width: "60%", borderRadius: 4 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : games.length === 0 ? (
                  <div className="empty">
                    <div className="box"><Icon.Gamepad size={34} /></div>
                    <h3>{filters.query ? "No matches found" : "Your library is empty"}</h3>
                    <p>{filters.query ? "Try a different search." : "Scan your system to auto-detect installed games."}</p>
                    {!filters.query && <div className="empty-actions"><button className="btn btn-primary" onClick={() => setScanOpen(true)}><Icon.Scan size={17} /> Scan System</button><button className="btn btn-ghost" onClick={() => setAddOpen(true)}><Icon.Plus size={16} /> Add Manually</button></div>}
                  </div>
                ) : (
                  <div className="desktop-grid">
                    {games.map((g, i) => {
                      const banner = g.coverImage || g.bannerImage;
                      const grad = gradientFor(g.title);
                      return (
                        <div
                          key={g.id}
                          className="gc"
                          style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
                          onClick={() => openPage(g.id)}
                          onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, game: g }); }}
                        >
                          <div className="gc-cover">
                            {banner ? (
                              <img src={banner} alt={g.title} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="gc-proc" style={{ background: `radial-gradient(120% 120% at 20% 0%, ${grad.from} 0%, ${grad.to} 70%, #050505 100%)` }}>
                                <span className="mono">{initials(g.title)}</span>
                              </div>
                            )}
                            <div className="gc-overlay" />
                            <div className="gc-chips">
                              <span className="gc-platform"><span className="pm"><PlatformMark platform={g.platform} size={11} /></span>{platformLabel(g.platform)}</span>
                              <button className={g.favorite ? "gc-fav on" : "gc-fav"} onClick={(e) => { e.stopPropagation(); handleToggleFav(g); }} title={g.favorite ? "Remove favorite" : "Add favorite"}>
                                <Icon.Star size={13} filled={g.favorite} />
                              </button>
                            </div>
                            <div className="gc-hover-play">
                              {g.installed ? (
                                <button className="gc-play-btn" onClick={(e) => { e.stopPropagation(); handleLaunch(g); }} title={`Play ${g.title}`}>
                                  <Icon.Play size={20} />
                                </button>
                              ) : (progressForGame(g.id) ? (
                                <button className="gc-play-btn" onClick={(e) => { e.stopPropagation(); setDownloadsOpen(true); }} title="View download">
                                  <Icon.Download size={18} />
                                </button>
                              ) : (
                                <button className="gc-get-btn" onClick={(e) => { e.stopPropagation(); setAcquireGame({ id: g.id, title: g.title, installed: g.installed }); }} title={`Get ${g.title}`}>
                                  <Icon.Download size={14} /> Get
                                </button>
                              ))}
                            </div>
                          </div>
                          {(() => { const pg = progressForGame(g.id); const pct = pg && pg.totalBytes ? Math.min(100, Math.round((pg.downloadedBytes / pg.totalBytes) * 100)) : 0; return pg ? <div className="gc-progress"><div style={{ width: `${pct}%` }} /></div> : null; })()}
                          <div className="gc-footer">
                            <div className="gc-title" title={g.title}>{g.title}</div>
                            <div className="gc-meta">
                              {g.installed ? (
                                <span>{g.playtimeSec > 0 ? formatPlaytimeShort(g.playtimeSec) : "New"}</span>
                              ) : (
                                <span className="gc-not-installed">Not installed</span>
                              )}
                              {g.installed && (g.lastPlayedAt ? <span className="v">Played {relativeTime(g.lastPlayedAt)}</span> : <span style={{ color: "var(--text-faint)" }}>Never played</span>)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {/* Dialogs */}
        {addOpen && <AddGameDialog onClose={() => setAddOpen(false)} onAdd={handleAdd} />}
        {scanOpen && <ScanDialog onClose={() => setScanOpen(false)} onRunScan={handleRunScan} onImport={handleImport} onDeepScan={handleDeepScan} />}
        {settingsOpen && settings && <SettingsPage initial={settings} onClose={() => setSettingsOpen(false)} onSave={handleSaveSettings} onCheckUpdates={handleCheckUpdates} />}
        {updateDialogOpen && updateAvailable && <UpdateDialog info={updateAvailable} onClose={() => setUpdateDialogOpen(false)} />}

        {/* Context menu */}
        {ctxMenu && (
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={() => setCtxMenu(null)}>
            <button className="ctx-item" onClick={() => { handleLaunch(ctxMenu.game); setCtxMenu(null); }}><Icon.Play size={15} /> Play</button>
            <button className="ctx-item" onClick={() => { openPage(ctxMenu.game.id); setCtxMenu(null); }}><Icon.Info size={15} /> Details</button>
            <div className="ctx-sep" />
            <button className="ctx-item" onClick={() => { handleToggleFav(ctxMenu.game); setCtxMenu(null); }}><Icon.Star size={15} filled={ctxMenu.game.favorite} /> {ctxMenu.game.favorite ? "Unfavorite" : "Favorite"}</button>
            <button className="ctx-item" onClick={() => { setCollPickerGame({ id: ctxMenu.game.id, title: ctxMenu.game.title }); setCtxMenu(null); }}><Icon.Folder size={15} /> Add to Collection</button>
            <button className="ctx-item" onClick={() => { handleOpenDir(ctxMenu.game); setCtxMenu(null); }}><Icon.Folder size={15} /> Open Directory</button>
            <button className="ctx-item" onClick={() => { handlePatch(ctxMenu.game); setCtxMenu(null); }}><Icon.Refresh size={15} /> Patch Metadata</button>
            <button className="ctx-item" onClick={() => { setEditorGame(ctxMenu.game); setCtxMenu(null); }}><Icon.FileCog size={15} /> Edit Game</button>
            <div className="ctx-sep" />
            <button className="ctx-item danger" onClick={() => { handleDelete(ctxMenu.game); setCtxMenu(null); }}><Icon.Trash size={15} /> Remove</button>
          </div>
        )}
        {/* v4.3.0 — Collection dialogs (create/edit + add-to-collection picker) */}
        {createCollOpen && <CreateCollectionDialog onClose={() => setCreateCollOpen(false)} onSave={handleCreateCollection} />}
        {editColl && <CreateCollectionDialog initial={editColl} onClose={() => setEditColl(null)} onSave={(d) => handleUpdateCollection(editColl.id, d)} />}
        {collPickerGame && (
          <CollectionPicker
            gameId={collPickerGame.id}
            gameTitle={collPickerGame.title}
            collections={collections}
            onClose={() => setCollPickerGame(null)}
            onToggle={(cid, add) => handleToggleGameInCollection(cid, collPickerGame.id, add)}
            onCreateNew={() => { setCollPickerGame(null); setCreateCollOpen(true); }}
          />
        )}
        {editorGame && <GameEditor game={editorGame} onSave={(patch) => handleEditGame(editorGame, patch)} onClose={() => setEditorGame(null)} />}

        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        {studioOpen && <ThemeStudio onClose={() => setStudioOpen(false)} />}
        {acquireGame && <AcquisitionPicker gameId={acquireGame.id} gameTitle={acquireGame.title} installed={acquireGame.installed} onClose={() => setAcquireGame(null)} onStarted={() => { setAcquireGame(null); setDownloadsOpen(true); }} />}
        {downloadsOpen && <DownloadsPanel onClose={() => setDownloadsOpen(false)} />}
      </div>
    );
  }

  // Console mode UI (PS5-style carousel)
  return (
    <div className="app">
      <DynamicBackground games={games} focusedIdx={focusedIdx} focusedGame={focusedGame} />

      {/* Top bar */}
      <header className="topbar">
        <div className="tb-brand">
          <div className="tb-logo"><NexusMark size={18} /></div>
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
        {activePlaytime && (
          <button
            className="playtime-badge"
            onClick={async () => {
              await window.nexus.stopPlaytimeTracking(activePlaytime.gameId);
              setActivePlaytime(null);
            }}
            title={`Click to stop tracking — ${activePlaytime.gameTitle}`}
          >
            <span className="playtime-badge__dot" />
            <span className="playtime-badge__text">{activePlaytime.gameTitle}</span>
            <span className="playtime-badge__time">{formatPlaytimeShort(activePlaytime.elapsedSec)}</span>
            <span className="playtime-badge__stop">Stop</span>
          </button>
        )}
        {/* v4.0.0 — Mode toggle: Console carousel ↔ Desktop grid */}
        <ModeToggle current={uiMode} onSwitch={setUiModeAndPersist} />
        <button className="tb-icon" onClick={() => setScanOpen(true)} title="Scan (S)"><Icon.Scan size={16} /></button>
        <button className="tb-icon primary" onClick={() => setAddOpen(true)} title="Add (A)"><Icon.Plus size={15} /> Add</button>
        <button className="tb-icon" onClick={() => setStatsOpen(true)} title="Stats dashboard"><Icon.TrendingUp size={16} /></button>
        <button className="tb-icon" onClick={() => setStudioOpen(true)} title="Theme Studio"><IconGlyph k="palette" size={16} /></button>
        <button className="tb-icon" onClick={() => setDownloadsOpen(true)} title="Downloads"><Icon.Download size={16} /></button>
        <button className="tb-icon" onClick={() => setSettingsOpen(true)} title="Settings"><Icon.Settings size={16} /></button>
      </header>

      {/* Stage: carousel + info zone */}
      {/* Nav tabs */}
      <div className="nav-tabs">
        <button className={activeTab === "games" ? "nav-tab active" : "nav-tab"} onClick={() => setActiveTab("games")}>Games</button>
        <button className={activeTab === "achievements" ? "nav-tab active" : "nav-tab"} onClick={() => setActiveTab("achievements")}>Achievements {achievements.filter((a) => a.unlockedAt).length > 0 && <span className="nav-tab-badge">{achievements.filter((a) => a.unlockedAt).length}</span>}</button>
        <button className={activeTab === "activity" ? "nav-tab active" : "nav-tab"} onClick={() => setActiveTab("activity")}>Activity</button>
      </div>

      <main className="stage">
        {activeTab === "achievements" ? (
          /* ===== ACHIEVEMENTS TAB ===== */
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div className="ach-grid">
              {achievements.map((a) => {
                const unlocked = !!a.unlockedAt;
                const pct = a.maxProgress > 0 ? Math.round((a.progress / a.maxProgress) * 100) : 0;
                return (
                  <div key={a.id} className={`ach-card ${unlocked ? "unlocked" : "locked"}`}>
                    <div className={`ach-icon ${unlocked ? "unlocked" : "locked"}`}><IconGlyph k={a.icon} size={20} /></div>
                    <div className="ach-body">
                      <div className="ach-name">{a.name}</div>
                      <div className="ach-desc">{a.description}</div>
                      {!unlocked && a.maxProgress > 1 && (
                        <>
                          <div className="ach-progress"><div style={{ width: `${pct}%` }} /></div>
                          <div className="ach-pct">{a.progress} / {a.maxProgress} ({pct}%)</div>
                        </>
                      )}
                      {unlocked && <div className="ach-pct" style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon.Check size={12} /> Unlocked</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeTab === "activity" ? (
          /* ===== ACTIVITY TAB ===== */
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div className="activity-list">
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16, letterSpacing: "-0.02em" }}>Recent Activity</div>
              {games.filter((g) => g.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? "")).slice(0, 20).map((g) => (
                <div key={g.id} className="activity-item" onClick={() => openPage(g.id)} style={{ cursor: "pointer" }}>
                  <div className="icon"><Icon.Play size={14} /></div>
                  <span className="title">{g.title}</span>
                  <span className="time">{relativeTime(g.lastPlayedAt)}</span>
                </div>
              ))}
              {games.filter((g) => g.lastPlayedAt).length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 40, textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(74,222,128,.08)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", marginBottom: 14 }}><Icon.Gamepad size={28} /></div>
                  <p style={{ fontSize: 14, color: "var(--dim)" }}>No activity yet. Launch a game to get started!</p>
                </div>
              )}
            </div>
          </div>
        ) : (
        /* ===== GAMES TAB ===== */
        <>
        {/* Filter pills — v4.3.0: platform logos + collection-aware + respects visibility */}
        <div className="filter-row">
          <button className={filters.platform === "all" && !filters.favOnly && activeCollection === null ? "filter-pill active" : "filter-pill"} onClick={() => { setActiveCollection(null); setFilters((f) => ({ ...f, platform: "all", favOnly: false })); }}>All</button>
          <button className={filters.favOnly ? "filter-pill active" : "filter-pill"} onClick={() => setFilters((f) => ({ ...f, favOnly: !f.favOnly }))}><Icon.Star size={11} filled={filters.favOnly} /> Favorites</button>
          <div className="filter-sep" />
          {visiblePlatforms.map((p) => (
            <button key={p.id} className={filters.platform === p.id && activeCollection === null ? "filter-pill active" : "filter-pill"} onClick={() => { setActiveCollection(null); setFilters((f) => ({ ...f, platform: p.id, favOnly: false })); }}>
              <span className="pm"><PlatformMark platform={p.id} size={12} /></span>
              {p.label}
              {stats?.byPlatform?.[p.id] ? <span style={{ opacity: 0.6 }}>{stats.byPlatform[p.id]}</span> : null}
            </button>
          ))}
          {collections.length > 0 && (<>
            <div className="filter-sep" />
            {collections.slice(0, 6).map((c) => (
              <button key={c.id} className={activeCollection === c.id ? "filter-pill active" : "filter-pill"} onClick={() => selectCollection(activeCollection === c.id ? null : c.id)} title={c.description ?? c.name}>
                <span style={{ fontSize: 11, display: "inline-flex", alignItems: "center" }}><IconGlyph k={c.icon} size={13} /></span> {c.name}
              </button>
            ))}
          </>)}
        </div>

        {/* Enrichment banner */}
        {patching && patchProgress && (
          <div className="enrich-banner">
            <div className="iw"><Icon.Spinner size={14} /></div>
            <div><div className="t">Enriching library <span className="c">{patchProgress.current}/{patchProgress.total || "…"}</span></div><div className="s">{patchProgress.title}</div></div>
          </div>
        )}

        {/* Library view — Desktop grid (mouse-friendly) OR Console carousel + info-zone */}
        {loading ? (
          uiMode === "desktop" ? (
            <div className="desktop-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="gc">
                  <div className="gc-cover" style={{ position: "relative" }}><div className="shimmer" style={{ position: "absolute", inset: 0 }} /></div>
                  <div className="gc-footer">
                    <div className="shimmer" style={{ height: 12, borderRadius: 4, marginBottom: 6 }} />
                    <div className="shimmer" style={{ height: 10, width: "60%", borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 14, overflow: "hidden", padding: "60px 0 40px", alignItems: "center", justifyContent: "center", flex: 1 }}>
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer" style={{ width: 160, aspectRatio: "3/4", borderRadius: 14, flexShrink: 0 }} />)}
            </div>
          )
        ) : games.length === 0 ? (
          <div className="empty">
            <div className="box"><Icon.Gamepad size={34} /></div>
            <h3>{filters.query ? "No matches found" : "Your library is empty"}</h3>
            <p>{filters.query ? "Try a different search." : "Scan your system to auto-detect installed games. NEXUS fetches cover art automatically."}</p>
            {!filters.query && <div className="empty-actions"><button className="btn btn-primary" onClick={() => setScanOpen(true)}><Icon.Scan size={17} /> Scan System</button><button className="btn btn-ghost" onClick={() => setAddOpen(true)}><Icon.Plus size={16} /> Add Manually</button></div>}
          </div>
        ) : uiMode === "desktop" ? (
          /* ===== v4.0.0 — DESKTOP GRID VIEW (Steam/Epic-style, mouse-friendly) ===== */
          <div className="desktop-grid">
            {games.map((g, i) => {
              const banner = g.coverImage || g.bannerImage;
              const grad = gradientFor(g.title);
              return (
                <div
                  key={g.id}
                  className="gc"
                  style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
                  onClick={() => openPage(g.id)}
                  onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, game: g }); }}
                >
                  <div className="gc-cover">
                    {banner ? (
                      <img src={banner} alt={g.title} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="gc-proc" style={{ background: `radial-gradient(120% 120% at 20% 0%, ${grad.from} 0%, ${grad.to} 70%, #050505 100%)` }}>
                        <span className="mono">{initials(g.title)}</span>
                      </div>
                    )}
                    <div className="gc-overlay" />
                    <div className="gc-chips">
                      <span className="gc-platform"><span className="pm"><PlatformMark platform={g.platform} size={11} /></span>{platformLabel(g.platform)}</span>
                      <button className={g.favorite ? "gc-fav on" : "gc-fav"} onClick={(e) => { e.stopPropagation(); handleToggleFav(g); }} title={g.favorite ? "Remove favorite" : "Add favorite"}>
                        <Icon.Star size={13} filled={g.favorite} />
                      </button>
                    </div>
                    <div className="gc-hover-play">
                      <button className="gc-play-btn" onClick={(e) => { e.stopPropagation(); handleLaunch(g); }} title={`Play ${g.title}`}>
                        <Icon.Play size={20} />
                      </button>
                    </div>
                  </div>
                  <div className="gc-footer">
                    <div className="gc-title" title={g.title}>{g.title}</div>
                    <div className="gc-meta">
                      <span>{g.playtimeSec > 0 ? formatPlaytimeShort(g.playtimeSec) : "New"}</span>
                      {g.lastPlayedAt
                        ? <span className="v">Played {relativeTime(g.lastPlayedAt)}</span>
                        : <span style={{ color: "var(--text-faint)" }}>Never played</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* Carousel with arrow buttons for mouse navigation */}
            <div className="carousel-wrap">
              <button className="carousel-arrow left" onClick={() => { const c = document.querySelector(".carousel") as HTMLElement; if (c) c.scrollBy({ left: -280, behavior: "smooth" }); }}><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.Chevron size={20} /></span></button>
              <button className="carousel-arrow right" onClick={() => { const c = document.querySelector(".carousel") as HTMLElement; if (c) c.scrollBy({ left: 280, behavior: "smooth" }); }}><Icon.Chevron size={20} /></button>
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
                    <span className="pat"><span className="pm"><PlatformMark platform={focusedGame.platform} size={11} /></span>{platformLabel(focusedGame.platform)}</span>
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

        {/* Bottom Dashboard */}
        {stats && !loading && games.length > 0 && (
          <div className="dashboard">
            {/* Left: Library stats */}
            <div className="dash-col" style={{ maxWidth: 220 }}>
              <div className="dash-card">
                <div className="dash-card-title"><Icon.TrendingUp size={13} /> Library</div>
                <div className="dash-stat-row"><span className="name">Games</span><span className="val">{stats.totalGames}</span></div>
                <div className="dash-stat-row"><span className="name">Played</span><span className="val">{formatPlaytimeShort(stats.totalPlaytimeSec)}</span></div>
                <div className="dash-stat-row"><span className="name">Launches</span><span className="val">{stats.totalLaunches}</span></div>
                <div className="dash-stat-row"><span className="name">Disk</span><span className="val">{formatSize(stats.totalSizeBytes)}</span></div>
                <div className="dash-stat-row"><span className="name">Favorites</span><span className="val">{stats.favorites}</span></div>
                {stats.avgRating && <div className="dash-stat-row"><span className="name" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon.Star size={11} /> Avg</span><span className="val">{stats.avgRating.toFixed(1)}</span></div>}
              </div>
            </div>
            {/* Center: Game facts / news / trivia about focused game */}
            <div className="dash-col">
              <div className="dash-card" style={{ flex: 1, overflow: "hidden" }}>
                <div className="dash-card-title"><Icon.Sparkles size={13} /> {focusedGame ? focusedGame.title : "Spotlight"}</div>
                {focusedGame ? (
                  <>
                    {focusedGame.description ? (
                      <p style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>
                        {focusedGame.description.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, "").trim()}
                      </p>
                    ) : <p style={{ fontSize: 11.5, color: "var(--faint)" }}>No description available. Click Patch to fetch from RAWG.</p>}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {focusedGame.genres.slice(0, 4).map((g) => <span key={g} className="genre-tag">{g}</span>)}
                    </div>
                    {focusedGame.developer && <div className="dash-stat-row" style={{ marginTop: 8 }}><span className="name">Developer</span><span className="val">{focusedGame.developer}</span></div>}
                    {focusedGame.releaseDate && <div className="dash-stat-row"><span className="name">Released</span><span className="val">{focusedGame.releaseDate.slice(0, 10)}</span></div>}
                    {focusedGame.rating !== null && <div className="dash-stat-row"><span className="name">RAWG Rating</span><span className="val"><Icon.Star size={10} filled /> {focusedGame.rating.toFixed(1)}</span></div>}
                    {focusedGame.ratingCount !== null && focusedGame.ratingCount > 0 && <div className="dash-stat-row"><span className="name">Votes</span><span className="val">{focusedGame.ratingCount.toLocaleString()}</span></div>}
                    {focusedGame.rawgId && <a href={`https://rawg.io/games/${focusedGame.rawgId}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--accent)", marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon.ExternalLink size={11} /> View on RAWG</a>}
                  </>
                ) : <p style={{ fontSize: 11.5, color: "var(--faint)" }}>Select a game to see details.</p>}
              </div>
            </div>
            {/* Right: Quick actions */}
            <div className="dash-col" style={{ maxWidth: 220 }}>
              <div className="dash-card">
                <div className="dash-card-title"><Icon.Gamepad size={13} /> Quick Actions</div>
                <div className="dash-quick">
                  <button className="dash-quick-btn" onClick={() => setScanOpen(true)}><span className="icon"><Icon.Scan size={16} /></span><span className="label">Scan</span></button>
                  <button className="dash-quick-btn" onClick={() => setAddOpen(true)}><span className="icon"><Icon.Plus size={16} /></span><span className="label">Add</span></button>
                  <button className="dash-quick-btn" onClick={() => setStatsOpen(true)}><span className="icon"><Icon.TrendingUp size={16} /></span><span className="label">Stats</span></button>
                  <button className="dash-quick-btn" onClick={() => setSettingsOpen(true)}><span className="icon"><Icon.Settings size={16} /></span><span className="label">Settings</span></button>
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
      {settingsOpen && settings && <SettingsPage initial={settings} onClose={() => setSettingsOpen(false)} onSave={handleSaveSettings} onCheckUpdates={handleCheckUpdates} />}
      {updateDialogOpen && updateAvailable && <UpdateDialog info={updateAvailable} onClose={() => setUpdateDialogOpen(false)} />}

      {/* Context menu (right-click on tiles) */}
      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={() => setCtxMenu(null)}>
          <button className="ctx-item" onClick={() => { handleLaunch(ctxMenu.game); setCtxMenu(null); }}><Icon.Play size={15} /> Play</button>
          <button className="ctx-item" onClick={() => { openPage(ctxMenu.game.id); setCtxMenu(null); }}><Icon.Info size={15} /> Details</button>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => { handleToggleFav(ctxMenu.game); setCtxMenu(null); }}><Icon.Star size={15} filled={ctxMenu.game.favorite} /> {ctxMenu.game.favorite ? "Unfavorite" : "Favorite"}</button>
          <button className="ctx-item" onClick={() => { setCollPickerGame({ id: ctxMenu.game.id, title: ctxMenu.game.title }); setCtxMenu(null); }}><Icon.Folder size={15} /> Add to Collection</button>
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

      {/* v4.3.0 — Collection dialogs (create/edit + add-to-collection picker) */}
      {createCollOpen && <CreateCollectionDialog onClose={() => setCreateCollOpen(false)} onSave={handleCreateCollection} />}
      {editColl && <CreateCollectionDialog initial={editColl} onClose={() => setEditColl(null)} onSave={(d) => handleUpdateCollection(editColl.id, d)} />}
      {collPickerGame && (
        <CollectionPicker
          gameId={collPickerGame.id}
          gameTitle={collPickerGame.title}
          collections={collections}
          onClose={() => setCollPickerGame(null)}
          onToggle={(cid, add) => handleToggleGameInCollection(cid, collPickerGame.id, add)}
          onCreateNew={() => { setCollPickerGame(null); setCreateCollOpen(true); }}
        />
      )}
      {statsOpen && <StatsDashboard onClose={() => setStatsOpen(false)} onExport={handleExport} onImport={handleImportFile} onCheckMissing={handleCheckMissing} />}

      {controllerConnected && !pageGame && <div className="hints-bar"><span className="hint"><span className="k">↑↓</span> {gpZone === "topbar" ? "Top Bar" : gpZone === "filters" ? "Filters" : gpZone === "carousel" ? "Games" : "Actions"}</span><span className="hint"><span className="k">←→</span> Navigate</span><span className="hint"><span className="k r">A</span> Select</span><span className="hint"><span className="k r">X</span> Play</span><span className="hint"><span className="k r">Y</span> Details</span><span className="hint"><span className="k r">B</span> Back</span><span className="hint"><span className="k"><Icon.Settings size={10} /></span> Settings</span></div>}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        {studioOpen && <ThemeStudio onClose={() => setStudioOpen(false)} />}
        {acquireGame && <AcquisitionPicker gameId={acquireGame.id} gameTitle={acquireGame.title} installed={acquireGame.installed} onClose={() => setAcquireGame(null)} onStarted={() => { setAcquireGame(null); setDownloadsOpen(true); }} />}
        {downloadsOpen && <DownloadsPanel onClose={() => setDownloadsOpen(false)} />}
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
