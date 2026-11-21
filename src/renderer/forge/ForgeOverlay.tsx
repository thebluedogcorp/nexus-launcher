// v10.0.0 — NexusForge Mode overlay.
//
// When active, this component "takes over" the whole app:
//   • Floating toolbar: unlock/reset the current workspace layout, snap
//     settings, undo/redo, save/save-as, .nxtheme import/export, exit.
//   • Panels become draggable + resizable (handled in ForgePanel) with live
//     snap guide lines rendered here.
//   • The element picker (crosshair) lets the user click ANY element in the
//     app and override its CSS custom properties.
//   • The sidebar + topbar of the universal shell get edge-drag handles that
//     live-write --sidebar-width / --topbar-height tokens.
//
// The overlay itself is pointer-events: none; its interactive children opt
// back in, so the app stays fully usable while Forge Mode is on.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useThemeStore } from "../lib/theme-store";
import { useForgeStore, type PickedElement } from "./forge-store";
import { measureWorkspacePanels } from "./Workspace";
import { exportNxThemeFile, importNxThemeFile } from "./nxtheme";
import { ForgeInspector } from "./ForgeInspector";
import { Icon } from "../components/Icons";
import { pushToast } from "../components/entertainment/EntToaster";

// ── Element picker helpers ──────────────────────────────────────────────────

function classHint(el: HTMLElement): string {
  const cls = Array.from(el.classList)
    .filter((c) => !c.startsWith("nx-") && !/^(active|on|focused|gp-focus|selected|ent-view-active|ent-view-hidden)$/.test(c))
    .slice(0, 2);
  return el.tagName.toLowerCase() + (cls.length ? `.${cls.join(".")}` : "");
}

function buildSelector(el: HTMLElement): { selector: string; label: string } {
  const label = classHint(el);
  if (el.id) return { selector: `#${CSS.escape(el.id)}`, label };
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  let depth = 0;
  let usedId = false;
  while (cur && cur !== document.body && depth < 5) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) { parts.unshift(`#${CSS.escape(cur.id)}`); usedId = true; break; }
    const parent: HTMLElement | null = cur.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
    }
    const cls = Array.from(cur.classList)
      .filter((c) => !c.startsWith("nx-") && !/^(active|on|focused|gp-focus|selected)$/.test(c))
      .slice(0, 2);
    if (cls.length) part += `.${cls.map((c) => CSS.escape(c)).join(".")}`;
    parts.unshift(part);
    cur = parent;
    depth++;
  }
  return { selector: (usedId ? parts.join(" > ") : `${parts.join(" > ")}`), label };
}

function computedVars(el: HTMLElement): Array<{ name: string; value: string }> {
  const cs = getComputedStyle(el);
  const out: Array<{ name: string; value: string }> = [];
  for (let i = 0; i < cs.length; i++) {
    const name = cs.item(i);
    if (name.startsWith("--")) {
      const value = cs.getPropertyValue(name).trim();
      if (value) out.push({ name, value });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Component ───────────────────────────────────────────────────────────────

export function ForgeOverlay() {
  const active = useForgeStore((s) => s.active);
  const workspace = useForgeStore((s) => s.workspace);
  const layout = useThemeStore((s) => (workspace ? s.draft.forge?.workspaces?.[workspace] ?? null : null));
  const guides = useForgeStore((s) => s.guides);
  const snapEnabled = useForgeStore((s) => s.snapEnabled);
  const grid = useForgeStore((s) => s.grid);
  const showGrid = useForgeStore((s) => s.showGrid);
  const pickMode = useForgeStore((s) => s.pickMode);
  const selection = useForgeStore((s) => s.selection);
  const past = useThemeStore((s) => s.past.length);
  const future = useThemeStore((s) => s.future.length);
  const dirty = useThemeStore((s) => s.dirty);

  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [hoverRect, setHoverRect] = useState<{ x: number; y: number; w: number; h: number; label: string } | null>(null);
  const [shellRects, setShellRects] = useState<{ rail: DOMRect | null; topbar: DOMRect | null }>({ rail: null, topbar: null });
  const [busy, setBusy] = useState(false);

  const measureShell = useCallback(() => {
    const rail = document.querySelector(".nx-rail") as HTMLElement | null;
    const topbar = document.querySelector(".nx-topbar") as HTMLElement | null;
    setShellRects({ rail: rail?.getBoundingClientRect() ?? null, topbar: topbar?.getBoundingClientRect() ?? null });
  }, []);

  // Track the shell chrome rects while forge is active.
  useEffect(() => {
    if (!active) return;
    measureShell();
    const ro = new ResizeObserver(measureShell);
    const rail = document.querySelector(".nx-rail");
    const topbar = document.querySelector(".nx-topbar");
    if (rail) ro.observe(rail);
    if (topbar) ro.observe(topbar);
    window.addEventListener("resize", measureShell);
    return () => { ro.disconnect(); window.removeEventListener("resize", measureShell); };
  }, [active, measureShell]);

  // ── Toolbar actions ─────────────────────────────────────────────────────
  const unlock = () => {
    const wsId = useForgeStore.getState().workspace;
    if (!wsId) return;
    const panels = measureWorkspacePanels(wsId);
    if (panels.length === 0) { pushToast("No panels found in this view.", "info"); return; }
    useForgeStore.getState().unlockWorkspace(wsId, panels);
    pushToast(`Layout unlocked — drag, resize, and snap ${panels.length} panel${panels.length === 1 ? "" : "s"}.`, "success");
  };

  const resetLayout = () => {
    const wsId = useForgeStore.getState().workspace;
    if (!wsId) return;
    useForgeStore.getState().resetWorkspace(wsId);
    pushToast("Layout reset to the authored design.", "info");
  };

  const saveAs = async () => {
    const name = saveAsName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await useThemeStore.getState().saveAs(name);
      pushToast(`Theme "${name}" saved to your library.`, "success");
      setSaveAsOpen(false);
      setSaveAsName("");
    } catch (e) {
      pushToast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally { setBusy(false); }
  };

  const commit = async () => {
    setBusy(true);
    try {
      await useThemeStore.getState().commit();
      pushToast("Theme changes saved.", "success");
    } catch (e) {
      pushToast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally { setBusy(false); }
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const res = await exportNxThemeFile(useThemeStore.getState().draft);
      if (res.ok) pushToast(`Theme exported${res.path && res.path !== "(download)" ? ` to ${res.path}` : "."}`, "success");
      else pushToast(`Export failed: ${res.error}`, "error");
    } finally { setBusy(false); }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const res = await importNxThemeFile();
      if (!res.ok) { pushToast(`Import failed: ${res.error}`, "error"); return; }
      const theme = res.theme!;
      useThemeStore.getState().replaceDraft(theme);
      await useThemeStore.getState().saveAs(theme.name);
      pushToast(`Theme "${theme.name}" imported${res.checksumVerified === false ? " (checksum not verified in this context)" : ""}.`, "success");
    } finally { setBusy(false); }
  };

  // ── Element picker: hover outline + click-to-pick ───────────────────────
  useEffect(() => {
    if (!active || !pickMode) return;
    const onMove = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el || typeof el.closest !== "function") return;
      if (el.closest("[data-forge-ui]")) { setHoverRect(null); return; }
      const r = el.getBoundingClientRect();
      setHoverRect({ x: r.left, y: r.top, w: r.width, h: r.height, label: classHint(el) });
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.target as HTMLElement;
      if (!el || typeof el.closest !== "function") return;
      if (el.closest("[data-forge-ui]")) return;
      const { selector, label } = buildSelector(el);
      const picked: PickedElement = { selector, label, tag: el.tagName.toLowerCase(), vars: computedVars(el) };
      useForgeStore.getState().setPicked(picked);
      useForgeStore.getState().setPickMode(false);
      setHoverRect(null);
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [active, pickMode]);

  // ── Global keyboard: Esc / Delete / arrows / undo-redo ──────────────────
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      const forge = useForgeStore.getState();

      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) useThemeStore.getState().redo();
        else useThemeStore.getState().undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        useThemeStore.getState().redo();
        return;
      }
      if (typing) return;

      if (e.key === "Escape") {
        if (forge.pickMode) forge.setPickMode(false);
        else if (forge.selection) forge.select(null);
        else forge.exit();
        return;
      }
      if ((e.key === "p" || e.key === "P") && !e.ctrlKey && !e.metaKey) {
        forge.setPickMode(!forge.pickMode);
        return;
      }
      if (!forge.selection || !forge.workspace) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        forge.hidePanel(forge.workspace, forge.selection, true);
        return;
      }
      const step = e.shiftKey ? forge.grid * 4 : forge.grid;
      const ws = useThemeStore.getState().draft.forge?.workspaces?.[forge.workspace];
      const panel = ws?.panels.find((p) => p.id === forge.selection);
      if (!panel) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); forge.setPanel(forge.workspace, panel.id, { x: panel.x - step }); }
      else if (e.key === "ArrowRight") { e.preventDefault(); forge.setPanel(forge.workspace, panel.id, { x: panel.x + step }); }
      else if (e.key === "ArrowUp") { e.preventDefault(); forge.setPanel(forge.workspace, panel.id, { y: panel.y - step }); }
      else if (e.key === "ArrowDown") { e.preventDefault(); forge.setPanel(forge.workspace, panel.id, { y: panel.y + step }); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  // ── Shell edge drag (sidebar width / topbar height) ─────────────────────
  const startShellDrag = (kind: "sidebar" | "topbar") => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const startPos = kind === "sidebar"
      ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width")) || 240
      : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-height")) || 56;
    const onMove = (ev: PointerEvent) => {
      let v = kind === "sidebar" ? startPos + (ev.clientX - start.x) : startPos + (ev.clientY - start.y);
      v = Math.round(Math.max(kind === "sidebar" ? 48 : 36, Math.min(kind === "sidebar" ? 400 : 96, v)));
      document.documentElement.style.setProperty(kind === "sidebar" ? "--sidebar-width" : "--topbar-height", `${v}px`);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      let v = kind === "sidebar" ? startPos + (ev.clientX - start.x) : startPos + (ev.clientY - start.y);
      v = Math.round(Math.max(kind === "sidebar" ? 48 : 36, Math.min(kind === "sidebar" ? 400 : 96, v)));
      useThemeStore.getState().setDraft((d) => {
        if (kind === "sidebar") d.sidebar.width = v;
        else d.topbar.height = v;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  if (!active) return null;

  // Active workspace canvas rect (for guide positioning).
  const canvas = workspace ? document.querySelector(`[data-nx-ws="${workspace}"]`) as HTMLElement | null : null;
  const canvasRect = canvas?.getBoundingClientRect() ?? null;

  return (
    <div className="nx-forge-root" data-forge-ui="1">
      {/* ── Toolbar ── */}
      <div className="nx-forge-toolbar">
        <span className="nx-forge-badge"><Icon.Wand size={13} /> FORGE</span>
        <span className="nx-forge-ws">
          {workspace ?? "—"}
          {layout ? <em>free layout</em> : <em>authored</em>}
        </span>

        <div className="nx-forge-sep" />
        {layout ? (
          <button className="nx-ftb" onClick={resetLayout} title="Reset this view to its authored layout">↺ Reset layout</button>
        ) : (
          <button className="nx-ftb accent" onClick={unlock} title="Unlock this view's panels — then drag, resize & snap them">✥ Unlock layout</button>
        )}

        <div className="nx-forge-sep" />
        <button
          className={snapEnabled ? "nx-ftb on" : "nx-ftb"}
          onClick={() => useForgeStore.getState().setSnapEnabled(!snapEnabled)}
          title="Toggle snapping"
        >⌗ Snap {snapEnabled ? "on" : "off"}</button>
        <select
          className="nx-ftb-select"
          value={grid}
          onChange={(e) => useForgeStore.getState().setGrid(Number(e.target.value))}
          title="Snap grid size"
          aria-label="Snap grid size"
        >
          {[4, 8, 16, 32].map((g) => <option key={g} value={g}>{g}px</option>)}
        </select>
        <button
          className={showGrid ? "nx-ftb on" : "nx-ftb"}
          onClick={() => useForgeStore.getState().setShowGrid(!showGrid)}
          title="Show grid overlay"
        >▦ Grid</button>

        <div className="nx-forge-sep" />
        <button
          className={pickMode ? "nx-ftb accent on" : "nx-ftb"}
          onClick={() => useForgeStore.getState().setPickMode(!pickMode)}
          title="Element picker — click any element to override its colors/sizes (P)"
        >⊙ Pick element</button>

        <div className="nx-forge-sep" />
        <button className="nx-ftb" disabled={past === 0} onClick={() => useThemeStore.getState().undo()} title="Undo (Ctrl+Z)">↶</button>
        <button className="nx-ftb" disabled={future === 0} onClick={() => useThemeStore.getState().redo()} title="Redo (Ctrl+Shift+Z)">↷</button>

        <div className="nx-forge-sep" />
        {saveAsOpen ? (
          <span className="nx-ftb-saveas">
            <input
              autoFocus
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void saveAs(); if (e.key === "Escape") setSaveAsOpen(false); }}
              placeholder="Theme name…"
              aria-label="Theme name"
            />
            <button className="nx-ftb accent" disabled={busy || !saveAsName.trim()} onClick={() => void saveAs()}>Save</button>
            <button className="nx-ftb" onClick={() => setSaveAsOpen(false)}>✕</button>
          </span>
        ) : (
          <>
            <button className="nx-ftb" disabled={busy} onClick={() => setSaveAsOpen(true)} title="Save as a new theme in your library">Save as…</button>
            {dirty && <button className="nx-ftb accent" disabled={busy} onClick={() => void commit()} title="Save changes to the active theme">Save</button>}
          </>
        )}
        <button className="nx-ftb" disabled={busy} onClick={() => void doExport()} title="Export the current theme as a .nxtheme file">↑ Export</button>
        <button className="nx-ftb" disabled={busy} onClick={() => void doImport()} title="Import a .nxtheme file">↓ Import</button>

        <div className="nx-forge-spacer" />
        <button className="nx-ftb danger" onClick={() => useForgeStore.getState().exit()} title="Exit Forge Mode (Esc)">✕ Exit</button>
      </div>

      {/* ── Snap guide lines ── */}
      {canvasRect && (guides.x.length > 0 || guides.y.length > 0) && (
        <div className="nx-forge-guides">
          {guides.x.map((gx, i) => (
            <div key={`gx${i}`} className="nx-guide-v" style={{ left: canvasRect.left + gx }} />
          ))}
          {guides.y.map((gy, i) => (
            <div key={`gy${i}`} className="nx-guide-h" style={{ top: canvasRect.top + gy }} />
          ))}
        </div>
      )}

      {/* ── Element picker hover outline ── */}
      {pickMode && hoverRect && (
        <div className="nx-forge-pick-outline" style={{ left: hoverRect.x, top: hoverRect.y, width: hoverRect.w, height: hoverRect.h }}>
          <span className="nx-forge-pick-label">{hoverRect.label}</span>
        </div>
      )}
      {pickMode && !hoverRect && (
        <div className="nx-forge-pick-hint">Element picker — hover any element, click to inspect. Esc to cancel.</div>
      )}

      {/* ── Shell edge drag handles ── */}
      {shellRects.rail && (
        <div
          className="nx-forge-edge nx-forge-edge--sidebar"
          style={{ left: shellRects.rail.right - 4, top: shellRects.rail.top, height: shellRects.rail.height }}
          onPointerDown={startShellDrag("sidebar")}
          title="Drag to resize the sidebar (--sidebar-width)"
        />
      )}
      {shellRects.topbar && (
        <div
          className="nx-forge-edge nx-forge-edge--topbar"
          style={{ left: shellRects.topbar.left, top: shellRects.topbar.bottom - 4, width: shellRects.topbar.width }}
          onPointerDown={startShellDrag("topbar")}
          title="Drag to resize the topbar (--topbar-height)"
        />
      )}

      {/* ── Inspector dock ── */}
      <ForgeInspector />

      {/* Selection pill (when a panel is selected but inspector shows tokens) */}
      {selection && (
        <div className="nx-forge-selection-pill" data-forge-ui="1">
          <Icon.Grid size={12} /> {selection.split("__").slice(1).join("__") || selection}
        </div>
      )}
    </div>
  );
}

// Re-export CSSProperties so consumers don't need a separate import.
export type { CSSProperties as ForgeCssProps };
