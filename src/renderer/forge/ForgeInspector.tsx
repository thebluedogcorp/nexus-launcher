// v10.0.0 — NexusForge Inspector dock.
//
// The right-hand dock with three tabs:
//   • Panel   — geometry (x/y/w/h/z), lock/hide, per-panel scoped tokens
//   • Tokens  — the full token catalog (every themeable parameter, searchable)
//   • Element — the picked element's CSS custom properties + all saved
//               element overrides (add / edit / remove)
//
// Everything writes through useThemeStore.setDraft → live apply + undo/redo.

import { useEffect, useMemo, useState } from "react";
import type { ThemeConfig } from "@shared/theme-types";
import { useThemeStore } from "../lib/theme-store";
import { useForgeStore } from "./forge-store";
import { TOKEN_CATALOG, TOKEN_GROUPS, PANEL_QUICK_TOKENS, readToken, type TokenDef } from "./tokens";
import { Icon } from "../components/Icons";

type Tab = "panel" | "tokens" | "element";

function setTokenByPath(draft: ThemeConfig, path: string, value: unknown): void {
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = draft;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

// ── Small controls ──────────────────────────────────────────────────────────

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
  return (
    <span className="nx-ins-color">
      {isHex && (
        <input
          type="color"
          value={value.trim()}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Color picker"
        />
      )}
      <input
        className="nx-ins-text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        aria-label="Color value"
      />
    </span>
  );
}

function NumberField({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <span className="nx-ins-num">
      <input
        type="range"
        min={min ?? 0}
        max={max ?? 100}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Range"
      />
      <input
        className="nx-ins-text nx-ins-text--num"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Value"
      />
    </span>
  );
}

function TokenControl({ def, theme }: { def: TokenDef; theme: ThemeConfig }) {
  const value = readToken(theme, def.path);
  const set = (v: unknown) => useThemeStore.getState().setDraft((d) => setTokenByPath(d, def.path, v));

  let control: React.ReactNode;
  switch (def.type) {
    case "color":
      control = <ColorField value={typeof value === "string" ? value : ""} onChange={set} />;
      break;
    case "px":
    case "number":
      control = typeof value === "number"
        ? <NumberField value={value} onChange={set} min={def.min} max={def.max} step={def.step} />
        : <span className="nx-ins-empty">—</span>;
      break;
    case "enum":
      control = (
        <select className="nx-ins-select" value={String(value)} onChange={(e) => {
          const opt = def.options?.find((o) => String(o.value) === e.target.value);
          set(opt ? opt.value : e.target.value);
        }}>
          {def.options?.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </select>
      );
      break;
    case "bool":
      control = (
        <button className={value ? "nx-ins-toggle on" : "nx-ins-toggle"} onClick={() => set(!value)} role="switch" aria-checked={!!value}>
          <span />
        </button>
      );
      break;
    default:
      control = <input className="nx-ins-text" value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value)} spellCheck={false} />;
  }
  return (
    <label className="nx-ins-row">
      <span className="nx-ins-label" title={def.cssVar ? `${def.path} → ${def.cssVar}` : def.path}>
        {def.label}
        {def.cssVar && <code>{def.cssVar}</code>}
      </span>
      {control}
    </label>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────

function PanelTab() {
  const workspace = useForgeStore((s) => s.workspace);
  const selection = useForgeStore((s) => s.selection);
  const layout = useThemeStore((s) => (workspace ? s.draft.forge?.workspaces?.[workspace] ?? null : null));
  const panel = layout?.panels.find((p) => p.id === selection) ?? null;
  const tokens = useThemeStore((s) => (selection ? s.draft.forge?.panelTokens?.[selection] ?? null : null));
  const forge = useForgeStore();

  if (!workspace) return <div className="nx-ins-hint">No workspace on screen.</div>;

  if (!layout) {
    return (
      <div className="nx-ins-hint">
        <p><strong>{workspace}</strong> is in its authored layout.</p>
        <p>Use <em>Unlock layout</em> in the toolbar to set this view free — then drag, resize and snap its panels.</p>
      </div>
    );
  }

  if (!panel) {
    return (
      <div className="nx-ins-hint">
        <p><strong>{workspace}</strong> · free layout · {layout.panels.length} panel{layout.panels.length === 1 ? "" : "s"}</p>
        <p>Click a panel to select it.</p>
        <div className="nx-ins-panel-list">
          {layout.panels.map((p) => (
            <button key={p.id} className={p.id === selection ? "nx-ins-panel-item on" : "nx-ins-panel-item"} onClick={() => forge.select(p.id)}>
              <span>{p.type}</span>
              {p.hidden && <em>hidden</em>}
              {p.locked && <Icon.Lock size={11} />}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const num = (label: string, key: "x" | "y" | "w" | "h" | "z") => (
    <label className="nx-ins-geo">
      <span>{label}</span>
      <input
        type="number"
        value={panel[key]}
        onChange={(e) => forge.setPanel(workspace, panel.id, { [key]: Math.round(Number(e.target.value)) || 0 })}
      />
    </label>
  );

  return (
    <div className="nx-ins-body">
      <div className="nx-ins-head">
        <strong>{panel.type}</strong>
        <span className="nx-ins-head-actions">
          <button className={panel.locked ? "nx-ftb on" : "nx-ftb"} onClick={() => forge.setPanel(workspace, panel.id, { locked: !panel.locked })} title="Lock (no drag/resize)">
            <Icon.Lock size={12} />
          </button>
          <button className={panel.hidden ? "nx-ftb on" : "nx-ftb"} onClick={() => forge.hidePanel(workspace, panel.id, !panel.hidden)} title={panel.hidden ? "Show panel" : "Hide panel"}>
            {panel.hidden ? <Icon.EyeOff size={12} /> : <Icon.Eye size={12} />}
          </button>
        </span>
      </div>

      <div className="nx-ins-geo-grid">
        {num("X", "x")}{num("Y", "y")}{num("W", "w")}{num("H", "h")}{num("Z", "z")}
      </div>

      <div className="nx-ins-section-title">Panel-scoped tokens <span>override the global theme for just this panel</span></div>
      {PANEL_QUICK_TOKENS.map((t) => {
        const current = tokens?.[t.prop] ?? "";
        return (
          <label key={t.prop} className="nx-ins-row">
            <span className="nx-ins-label">{t.label}<code>{t.prop}</code></span>
            {t.type === "color" ? (
              <span className="nx-ins-color">
                <input type="color" value={current || "#000000"} onChange={(e) => forge.setPanelToken(panel.id, t.prop, e.target.value)} aria-label={t.label} />
                <input className="nx-ins-text" placeholder="(theme default)" value={current} onChange={(e) => forge.setPanelToken(panel.id, t.prop, e.target.value)} spellCheck={false} />
              </span>
            ) : (
              <input className="nx-ins-text" placeholder="(theme default)" value={current} onChange={(e) => forge.setPanelToken(panel.id, t.prop, e.target.value)} spellCheck={false} />
            )}
          </label>
        );
      })}

      <button className="nx-ftb" onClick={() => { forge.resetWorkspace(workspace); }} title="Reset this whole workspace to its authored layout">↺ Reset workspace layout</button>
    </div>
  );
}

function TokensTab() {
  const [query, setQuery] = useState("");
  const draft = useThemeStore((s) => s.draft);
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    return TOKEN_GROUPS
      .map((g) => ({
        group: g,
        tokens: TOKEN_CATALOG.filter((t) => t.group === g && (!q || t.label.toLowerCase().includes(q) || (t.cssVar ?? "").toLowerCase().includes(q) || t.path.toLowerCase().includes(q))),
      }))
      .filter((g) => g.tokens.length > 0);
  }, [q]);

  return (
    <div className="nx-ins-body">
      <input
        className="nx-ins-search"
        placeholder={`Search ${TOKEN_CATALOG.length} tokens…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search tokens"
      />
      {groups.map((g) => (
        <div key={g.group} className="nx-ins-group">
          <div className="nx-ins-group-title">{g.group}</div>
          {g.tokens.map((t) => <TokenControl key={t.path} def={t} theme={draft} />)}
        </div>
      ))}
      {groups.length === 0 && <div className="nx-ins-hint">No tokens match “{query}”.</div>}
    </div>
  );
}

function ElementTab() {
  const picked = useForgeStore((s) => s.picked);
  const setPickMode = useForgeStore((s) => s.setPickMode);
  const overrides = useThemeStore((s) => s.draft.forge?.elementOverrides ?? []);
  const forge = useForgeStore();
  const [varQuery, setVarQuery] = useState("");
  const [newProp, setNewProp] = useState("");
  const [newVal, setNewVal] = useState("");

  const activeOverride = overrides.find((o) => picked && o.selector === picked.selector) ?? null;
  const vars = picked?.vars ?? [];
  const q = varQuery.trim().toLowerCase();
  const shownVars = q ? vars.filter((v) => v.name.includes(q) || v.value.toLowerCase().includes(q)) : vars;

  return (
    <div className="nx-ins-body">
      {!picked && overrides.length === 0 && (
        <div className="nx-ins-hint">
          <p>Pick any element to change its exact colors, sizes and radii.</p>
          <button className="nx-ftb accent" onClick={() => setPickMode(true)}><Icon.Search size={11} /> Pick element (P)</button>
        </div>
      )}

      {picked && (
        <>
          <div className="nx-ins-head">
            <strong>&lt;{picked.tag}&gt;</strong>
            <button className="nx-ftb" onClick={() => forge.setPicked(null)} title="Clear selection">✕</button>
          </div>
          <div className="nx-ins-selector"><code>{picked.selector}</code></div>

          {activeOverride ? (
            <div className="nx-ins-override-editor">
              <div className="nx-ins-section-title">Active overrides <span>applied as <code>{activeOverride.selector} {"{ … }"}</code></span></div>
              {Object.entries(activeOverride.props).map(([prop, val]) => (
                <label key={prop} className="nx-ins-row">
                  <span className="nx-ins-label"><code>{prop}</code></span>
                  <span className="nx-ins-color">
                    <input className="nx-ins-text" value={val} onChange={(e) => forge.setOverrideProp(activeOverride.id, prop, e.target.value)} spellCheck={false} />
                    <button className="nx-ftb danger" onClick={() => forge.setOverrideProp(activeOverride.id, prop, null)} title="Remove this property">✕</button>
                  </span>
                </label>
              ))}
              <div className="nx-ins-add-prop">
                <input className="nx-ins-text" placeholder="--custom-prop" value={newProp} onChange={(e) => setNewProp(e.target.value)} spellCheck={false} />
                <input className="nx-ins-text" placeholder="value" value={newVal} onChange={(e) => setNewVal(e.target.value)} spellCheck={false} />
                <button
                  className="nx-ftb accent"
                  disabled={!newProp.startsWith("--") || !newVal}
                  onClick={() => { forge.addElementOverride(picked.selector, picked.label, newProp.trim(), newVal); setNewProp(""); setNewVal(""); }}
                >Add</button>
              </div>
            </div>
          ) : (
            <div className="nx-ins-section-title">Computed custom properties <span>click ✓ to override one</span></div>
          )}

          <input className="nx-ins-search" placeholder="Filter properties…" value={varQuery} onChange={(e) => setVarQuery(e.target.value)} aria-label="Filter properties" />
          <div className="nx-ins-vars">
            {shownVars.map((v) => {
              const overridden = activeOverride?.props[v.name];
              return (
                <div key={v.name} className={overridden ? "nx-ins-var overridden" : "nx-ins-var"}>
                  <code>{v.name}</code>
                  <span>{overridden ?? v.value}</span>
                  {!activeOverride && (
                    <button className="nx-ftb" title="Override this property" onClick={() => forge.addElementOverride(picked.selector, picked.label, v.name, v.value)}>✓</button>
                  )}
                </div>
              );
            })}
            {shownVars.length === 0 && <div className="nx-ins-hint">No matching properties.</div>}
          </div>
        </>
      )}

      {overrides.length > 0 && (
        <div className="nx-ins-override-list">
          <div className="nx-ins-section-title">All element overrides ({overrides.length})</div>
          {overrides.map((o) => (
            <div key={o.id} className="nx-ins-override-item">
              <button className="nx-ins-override-label" onClick={() => forge.setPicked({ selector: o.selector, label: o.label, tag: o.label.split(/[.#]/)[0] || "element", vars: [] })} title="Edit">
                <code>{o.label}</code>
                <em>{Object.keys(o.props).join(", ")}</em>
              </button>
              <button className="nx-ftb danger" onClick={() => forge.removeElementOverride(o.id)} title="Delete override"><Icon.Trash size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dock ────────────────────────────────────────────────────────────────────

export function ForgeInspector() {
  const [tab, setTab] = useState<Tab>("tokens");
  const picked = useForgeStore((s) => s.picked);
  const selection = useForgeStore((s) => s.selection);

  // Auto-switch tabs for the flow: picking an element jumps to Element,
  // selecting a panel jumps to Panel.
  useEffect(() => {
    if (picked) setTab("element");
  }, [picked]);
  useEffect(() => {
    if (selection) setTab("panel");
  }, [selection]);

  return (
    <div className="nx-inspector" data-forge-ui="1">
      <div className="nx-ins-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "panel"} className={tab === "panel" ? "on" : ""} onClick={() => setTab("panel")}>Panel</button>
        <button role="tab" aria-selected={tab === "tokens"} className={tab === "tokens" ? "on" : ""} onClick={() => setTab("tokens")}>Tokens</button>
        <button role="tab" aria-selected={tab === "element"} className={tab === "element" ? "on" : ""} onClick={() => setTab("element")}>Element</button>
      </div>
      {tab === "panel" && <PanelTab />}
      {tab === "tokens" && <TokensTab />}
      {tab === "element" && <ElementTab />}
    </div>
  );
}
