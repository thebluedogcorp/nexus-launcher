// v10.0.0 — NexusForge Workspace + ForgePanel.
//
// Every view in the app renders inside a <Workspace>; every major section of
// a view renders inside a <ForgePanel>.
//
//   AUTHORED mode (default): panels render as `display: contents` wrappers —
//   literally zero impact on the view's natural layout.
//
//   FREE mode (after the user unlocks the workspace in Forge Mode): the
//   workspace becomes an absolute canvas; each panel is positioned from its
//   measured geometry and becomes draggable + resizable with snapping, all
//   from raw pointer events (no third-party libraries).
//
// Geometry lives in the active theme draft (`forge.workspaces[id]`), so
// layouts undo/redo and save/export with the theme.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { PanelInstance } from "@shared/theme-types";
import { useThemeStore } from "../lib/theme-store";
import { useForgeStore, getPanelTokens } from "./forge-store";
import { snapDrag, snapResize, type Rect, type ResizeEdge } from "./snap";

// ── Module registry: lets the Forge toolbar measure authored panels ─────────

const measurers = new Map<string, () => PanelInstance[]>();

/** Measure every panel of an (authored) workspace from the live DOM. */
export function measureWorkspacePanels(wsId: string): PanelInstance[] {
  return measurers.get(wsId)?.() ?? [];
}

// ── Context ─────────────────────────────────────────────────────────────────

interface WorkspaceCtx {
  wsId: string;
  free: boolean;
  forgeActive: boolean;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  register: (type: string, el: HTMLDivElement | null) => void;
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

// ── Workspace ───────────────────────────────────────────────────────────────

export function Workspace({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const layout = useThemeStore((s) => s.draft.forge?.workspaces?.[id] ?? null);
  const forgeActive = useForgeStore((s) => s.active);
  const showGrid = useForgeStore((s) => s.showGrid);
  const grid = useForgeStore((s) => s.grid);
  const setWorkspace = useForgeStore((s) => s.setWorkspace);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panelEls = useRef(new Map<string, HTMLDivElement>());

  const free = layout !== null;
  const gridStyle = forgeActive && showGrid ? ({ ["--nx-grid" as string]: `${grid}px` } as CSSProperties) : undefined;

  // Tell the forge store which workspace is on screen (for the toolbar).
  useEffect(() => {
    if (forgeActive) setWorkspace(id);
  }, [forgeActive, id, setWorkspace]);

  // Register the measurer for this workspace (used when unlocking).
  useEffect(() => {
    measurers.set(id, () => {
      const canvas = canvasRef.current;
      if (!canvas) return [];
      const cRect = canvas.getBoundingClientRect();
      const maxZ = 1;
      const panels: PanelInstance[] = [];
      for (const [type, el] of panelEls.current) {
        const child = (el.firstElementChild as HTMLElement | null) ?? el;
        const r = child.getBoundingClientRect();
        panels.push({
          id: `${id}__${type}`,
          type,
          x: Math.round(r.left - cRect.left),
          y: Math.round(r.top - cRect.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
          z: panels.length + 1,
        });
      }
      void maxZ;
      return panels;
    });
    return () => { measurers.delete(id); };
  }, [id]);

  const register = (type: string, el: HTMLDivElement | null) => {
    if (el) panelEls.current.set(type, el);
    else panelEls.current.delete(type);
  };

  if (free) {
    return (
      <WorkspaceContext.Provider value={{ wsId: id, free: true, forgeActive, canvasRef, register }}>
        <div
          ref={canvasRef}
          className={`nx-ws nx-ws--free ${className ?? ""}`}
          data-nx-ws={id}
          data-nx-free="1"
            style={gridStyle}
        >
          {children}
        </div>
      </WorkspaceContext.Provider>
    );
  }

  return (
    <WorkspaceContext.Provider value={{ wsId: id, free: false, forgeActive, canvasRef, register }}>
      <div
        className={`nx-ws nx-ws--authored ${forgeActive ? "nx-ws--forge" : ""} ${className ?? ""}`}
        data-nx-ws={id}
        ref={canvasRef}
        style={gridStyle}
      >
        {children}
      </div>
    </WorkspaceContext.Provider>
  );
}

// ── ForgePanel ──────────────────────────────────────────────────────────────

export interface ForgePanelProps {
  type: string;            // unique within the workspace
  title: string;           // shown in the inspector + panel chrome
  minW?: number;
  minH?: number;
  children: ReactNode;     // should be a SINGLE root element (fills the panel in free mode)
}

export function ForgePanel({ type, title, minW = 160, minH = 96, children }: ForgePanelProps) {
  const ctx = useContext(WorkspaceContext);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Hooks must run unconditionally — derive safe values when there's no ctx.
  const wsId = ctx?.wsId ?? "";
  const free = ctx?.free ?? false;
  const forgeActive = ctx?.forgeActive ?? false;
  const canvasRef = ctx?.canvasRef ?? { current: null };
  const register = ctx?.register ?? (() => {});

  const panelId = wsId ? `${wsId}__${type}` : "";
  const layout = useThemeStore((s) => (wsId ? s.draft.forge?.workspaces?.[wsId] ?? null : null));
  const instance = layout?.panels.find((p) => p.id === panelId) ?? null;
  const tokens = useThemeStore((s) => (panelId ? s.draft.forge?.panelTokens?.[panelId] ?? null : null));
  const selection = useForgeStore((s) => s.selection);
  const snapEnabled = useForgeStore((s) => s.snapEnabled);
  const grid = useForgeStore((s) => s.grid);
  const select = useForgeStore((s) => s.select);
  const bringToFront = useForgeStore((s) => s.bringToFront);
  const setGuides = useForgeStore((s) => s.setGuides);
  const selected = panelId !== "" && selection === panelId;

  // Register the DOM node for measurement (authored → free conversion).
  useEffect(() => {
    register(type, wrapRef.current);
    return () => register(type, null);
  }, [type, register, free]);

  // Free mode with no stored instance (panel added after the layout was
  // saved): auto-create one with sane fallback geometry.
  useEffect(() => {
    if (!free || instance || !wsId) return;
    const canvas = canvasRef.current;
    const w = canvas ? Math.max(minW, Math.round(canvas.clientWidth * 0.55)) : 640;
    const h = canvas ? Math.max(minH, Math.round(canvas.clientHeight * 0.55)) : 400;
    const count = layout?.panels.length ?? 0;
    useThemeStore.getState().setDraft((d) => {
      if (!d.forge) d.forge = { workspaces: {}, elementOverrides: [], panelTokens: {} };
      if (!d.forge.workspaces[wsId]) d.forge.workspaces[wsId] = { mode: "free", grid: 16, panels: [] };
      const ws = d.forge.workspaces[wsId];
      if (ws.panels.some((p) => p.id === panelId)) return; // raced
      const maxZ = Math.max(0, ...ws.panels.map((p) => p.z));
      ws.panels.push({ id: panelId, type, x: 24 + (count * 28) % 140, y: 24 + (count * 28) % 140, w, h, z: maxZ + 1 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [free, instance, panelId, wsId, type]);

  if (!ctx) {
    // Defensive: a ForgePanel outside a Workspace renders its children as-is.
    return <>{children}</>;
  }

  if (!free) {
    return (
      <div ref={wrapRef} className="nx-panel nx-panel--authored" data-nx-panel={type} data-nx-title={title}>
        {children}
      </div>
    );
  }

  if (!instance) {
    // Free mode but geometry not committed yet (this render frame) — keep the
    // natural flow so nothing flashes.
    return (
      <div ref={wrapRef} className="nx-panel nx-panel--authored" data-nx-panel={type} data-nx-title={title}>
        {children}
      </div>
    );
  }

  const hidden = !!instance.hidden && !forgeActive;
  if (hidden) return null;

  const style: CSSProperties = {
    left: instance.x,
    top: instance.y,
    width: instance.w,
    height: instance.h,
    zIndex: instance.z,
    ...(tokens ?? {}),
  };

  // ── Interaction: drag (move) ────────────────────────────────────────────
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!forgeActive || instance.locked) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, label, .nx-resize-handle, [data-nx-no-drag]")) return;
    e.preventDefault();
    select(panelId);
    bringToFront(wsId, panelId);

    const el = wrapRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const others: Rect[] = (layout?.panels ?? [])
      .filter((p) => p.id !== panelId && !p.hidden)
      .map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
    const canvasSize = { w: canvasRect.width, h: canvasRect.height };
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = instance.x;
    const origY = instance.y;
    let lastX = origX;
    let lastY = origY;
    let raf = 0;

    const onMove = (ev: PointerEvent) => {
      const raw: Rect = { x: origX + (ev.clientX - startX), y: origY + (ev.clientY - startY), w: instance.w, h: instance.h };
      const s = snapDrag(raw, others, canvasSize, { enabled: snapEnabled, grid, threshold: 6 });
      lastX = s.x; lastY = s.y;
      // Fast path — write styles directly, no React render per frame.
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.left = `${lastX}px`;
          el.style.top = `${lastY}px`;
          setGuides(s.guides);
        });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      setGuides({ x: [], y: [] });
      useForgeStore.getState().setPanel(wsId, panelId, { x: lastX, y: lastY });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  // ── Interaction: resize (8 handles) ─────────────────────────────────────
  const onResizeStart = (edge: ResizeEdge) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!forgeActive || instance.locked) return;
    e.preventDefault();
    e.stopPropagation();
    select(panelId);

    const el = wrapRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const others: Rect[] = (layout?.panels ?? [])
      .filter((p) => p.id !== panelId && !p.hidden)
      .map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
    const canvasSize = { w: canvasRect.width, h: canvasRect.height };
    const startX = e.clientX;
    const startY = e.clientY;
    const orig: Rect = { x: instance.x, y: instance.y, w: instance.w, h: instance.h };
    let cur: Rect = { ...orig };
    let raf = 0;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const raw: Rect = { ...orig };
      if (edge.includes("e")) raw.w = orig.w + dx;
      if (edge.includes("s")) raw.h = orig.h + dy;
      if (edge.includes("w")) { raw.w = orig.w - dx; raw.x = orig.x + dx; }
      if (edge.includes("n")) { raw.h = orig.h - dy; raw.y = orig.y + dy; }
      const s = snapResize(edge, raw, { w: minW, h: minH }, others, canvasSize, { enabled: snapEnabled, grid, threshold: 6 });
      cur = s.rect;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.left = `${cur.x}px`;
          el.style.top = `${cur.y}px`;
          el.style.width = `${cur.w}px`;
          el.style.height = `${cur.h}px`;
          setGuides(s.guides);
        });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      setGuides({ x: [], y: [] });
      useForgeStore.getState().setPanel(wsId, panelId, { x: cur.x, y: cur.y, w: cur.w, h: cur.h });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const handles: Array<{ edge: ResizeEdge; cls: string }> = [
    { edge: "n", cls: "n" }, { edge: "s", cls: "s" }, { edge: "e", cls: "e" }, { edge: "w", cls: "w" },
    { edge: "ne", cls: "ne" }, { edge: "nw", cls: "nw" }, { edge: "se", cls: "se" }, { edge: "sw", cls: "sw" },
  ];

  return (
    <div
      ref={wrapRef}
      className={[
        "nx-panel",
        "nx-panel--free",
        forgeActive ? "nx-panel--forge" : "",
        selected ? "nx-panel--selected" : "",
        instance.hidden ? "nx-panel--ghost" : "",
        instance.locked ? "nx-panel--locked" : "",
      ].join(" ")}
      data-nx-panel={type}
      data-nx-title={title}
      style={style}
      onPointerDown={onDragStart}
    >
      {children}
      {forgeActive && selected && !instance.locked && handles.map((h) => (
        <div key={h.edge} className={`nx-resize-handle ${h.cls}`} onPointerDown={onResizeStart(h.edge)} />
      ))}
    </div>
  );
}
