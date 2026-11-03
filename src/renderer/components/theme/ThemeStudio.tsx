// v4.4.0 — Theme Studio. A full-screen visual theme editor with 4 areas:
//   1. Top toolbar  — preset/theme picker, undo, redo, reset, import/export, save, apply, cancel
//   2. Layer explorer (left)  — select which component's properties to edit
//   3. Live preview canvas (center)  — a mini launcher reflecting the draft
//   4. Property inspector (right)  — categorized controls bound to the draft
//
// The draft is applied to :root via applyTheme() on every change, so both the
// preview AND the real launcher behind the editor re-theme instantly. On
// "Apply", the draft is committed to the DB (creating a personal theme if the
// active one is a built-in preset). On "Cancel", the last committed active
// theme is re-applied (draft changes are discarded).

import { useEffect, useState } from "react";
import { useThemeStore } from "../../lib/theme-store";
import { DEFAULT_THEME } from "@shared/theme-types";
import { applyTheme } from "../../lib/applyTheme";
import { Icon } from "../Icons";
import { IconGlyph } from "../IconGlyph";
import { LayerExplorer, Inspector } from "./Inspector";
import { PreviewCanvas } from "./PreviewCanvas";

interface Props {
  onClose: () => void;
}

export function ThemeStudio({ onClose }: Props) {
  const themes = useThemeStore((s) => s.themes);
  const activeId = useThemeStore((s) => s.activeId);
  const draft = useThemeStore((s) => s.draft);
  const dirty = useThemeStore((s) => s.dirty);
  const past = useThemeStore((s) => s.past);
  const future = useThemeStore((s) => s.future);
  const load = useThemeStore((s) => s.load);
  const selectTheme = useThemeStore((s) => s.selectTheme);
  const setDraft = useThemeStore((s) => s.setDraft);
  const undo = useThemeStore((s) => s.undo);
  const redo = useThemeStore((s) => s.redo);
  const revert = useThemeStore((s) => s.revert);
  const reset = useThemeStore((s) => s.reset);
  const commit = useThemeStore((s) => s.commit);
  const saveAs = useThemeStore((s) => s.saveAs);
  const deleteTheme = useThemeStore((s) => s.deleteTheme);
  const duplicateTheme = useThemeStore((s) => s.duplicateTheme);

  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");

  // Load the theme list + active theme on mount.
  useEffect(() => { void load(); }, [load]);

  // ESC closes (revert + onClose).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { void handleCancel(); }
      // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z = redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleApply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo]);

  const active = themes.find((t) => t.id === activeId);
  const isBuiltin = active?.builtin ?? false;

  const handleApply = async () => {
    await commit();
    onClose();
  };

  const handleCancel = async () => {
    // Discard the draft; re-apply the last committed active theme.
    await revert();
    onClose();
  };

  const handleReset = () => {
    setDraft((d) => {
      const def = JSON.parse(JSON.stringify(DEFAULT_THEME));
      d.colors = def.colors;
      d.typography = def.typography;
      d.radius = def.radius;
      d.spacing = def.spacing;
      d.shadows = def.shadows;
      d.card = def.card;
      d.sidebar = def.sidebar;
      d.topbar = def.topbar;
      d.background = def.background;
      d.animations = def.animations;
      d.mode = def.mode;
    });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.name.replace(/\s+/g, "-").toLowerCase()}.nexus-theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          // Replace the draft with the imported config (validated by applyTheme).
          useThemeStore.getState().replaceDraft(parsed);
        } catch { /* invalid JSON — ignore */ }
      };
      reader.readAsText(f);
    };
    input.click();
  };

  const handleSaveAs = async () => {
    if (!saveAsName.trim()) return;
    await saveAs(saveAsName.trim());
    setSaveAsOpen(false);
    setSaveAsName("");
  };

  return (
    <div className="ts-studio">
      {/* ===== Top toolbar ===== */}
      <header className="ts-toolbar">
        <div className="ts-toolbar-left">
          <div className="ts-toolbar-brand"><IconGlyph k="palette" size={16} /><span>Theme Studio</span></div>
          <div className="ts-theme-picker">
            <button className="ts-theme-current" onClick={() => setThemeMenuOpen((v) => !v)}>
              <span>{draft.name}</span>{dirty && <span className="ts-dirty-dot" title="Unsaved changes" />}
              <Icon.Chevron size={12} />
            </button>
            {themeMenuOpen && (
              <div className="ts-theme-menu" onClick={() => setThemeMenuOpen(false)}>
                <div className="ts-theme-menu-title">Presets</div>
                {themes.filter((t) => t.builtin).map((t) => (
                  <button key={t.id} className={activeId === t.id ? "ts-theme-item active" : "ts-theme-item"} onClick={() => selectTheme(t.id)}>
                    <span className="ts-theme-swatch" style={{ background: t.config.colors.accent }} />
                    <span className="ts-theme-name">{t.config.name}</span>
                    {t.config.mode === "light" && <span className="ts-theme-tag">light</span>}
                  </button>
                ))}
                {themes.some((t) => !t.builtin) && <div className="ts-theme-menu-title">My Themes</div>}
                {themes.filter((t) => !t.builtin).map((t) => (
                  <div key={t.id} className={activeId === t.id ? "ts-theme-item active" : "ts-theme-item"} onClick={() => selectTheme(t.id)}>
                    <span className="ts-theme-swatch" style={{ background: t.config.colors.accent }} />
                    <span className="ts-theme-name">{t.name}</span>
                    <button className="ts-theme-del" title="Delete" onClick={(e) => { e.stopPropagation(); void deleteTheme(t.id); }}><Icon.Trash size={11} /></button>
                  </div>
                ))}
                <div className="ts-theme-menu-sep" />
                <button className="ts-theme-item" onClick={() => { active && void duplicateTheme(active.id); }}><Icon.Plus size={12} /> Duplicate current</button>
              </div>
            )}
          </div>
        </div>

        <div className="ts-toolbar-center">
          <button className="ts-tool" onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)"><Icon.Refresh size={14} style={{ transform: "scaleX(-1)" }} /></button>
          <button className="ts-tool" onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)"><Icon.Refresh size={14} /></button>
          <span className="ts-tool-sep" />
          <button className="ts-tool" onClick={handleReset} title="Reset to defaults"><Icon.Wand size={14} /> Reset</button>
          <button className="ts-tool" onClick={handleImport} title="Import theme JSON"><Icon.Download size={14} /> Import</button>
          <button className="ts-tool" onClick={handleExport} title="Export current theme"><Icon.ExternalLink size={14} /> Export</button>
        </div>

        <div className="ts-toolbar-right">
          {saveAsOpen ? (
            <div className="ts-saveas">
              <input autoFocus value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)} placeholder="Theme name…" onKeyDown={(e) => { if (e.key === "Enter") void handleSaveAs(); if (e.key === "Escape") setSaveAsOpen(false); }} />
              <button className="ts-btn primary" onClick={handleSaveAs}>Save</button>
              <button className="ts-btn" onClick={() => setSaveAsOpen(false)}>Cancel</button>
            </div>
          ) : (
            <>
              <button className="ts-btn" onClick={() => setSaveAsOpen(true)} title="Save as new theme"><Icon.Plus size={13} /> Save As</button>
              <button className="ts-btn" onClick={handleCancel}>Cancel</button>
              <button className="ts-btn primary" onClick={handleApply} title="Apply & close (Ctrl+S)"><Icon.Check size={13} /> {dirty ? "Apply*" : "Apply"}</button>
            </>
          )}
        </div>
      </header>

      {/* ===== 3-pane body ===== */}
      <div className="ts-body">
        <LayerExplorer />
        <PreviewCanvas />
        <Inspector />
      </div>

      <div className="ts-footer">
        <span>Editing: <strong>{draft.name}</strong>{isBuiltin && dirty && " (will save as a new personal theme on Apply)"}{dirty && !isBuiltin && " (unsaved)"}</span>
        <span className="ts-footer-hint">Live preview reflects the real launcher. Changes apply on Apply.</span>
      </div>
    </div>
  );
}
