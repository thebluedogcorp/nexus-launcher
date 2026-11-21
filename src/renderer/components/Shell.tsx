// v10.0.0 — Universal Shell.
//
// ONE chrome for the whole app. The Games core and the Entertainment core no
// longer live in separate modes with their own chrome — they are views inside
// this single shell:
//
//   • Left rail (token-driven, collapsible, respects --sidebar-width and the
//     theme's sidebar position) with universal navigation.
//   • Topbar slot — the App injects context-aware controls (games search/sort
//     vs. media search, badges, plugin widgets…).
//   • Content area hosting the active view.
//   • Forge Mode toggle + the Forge overlay mounted here.
//
// Settings, Account and Data Management are first-class universal views.

import { useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import { NexusMark } from "./Logo";
import { useForgeStore } from "../forge/forge-store";
import { ForgeOverlay } from "../forge/ForgeOverlay";
import { getList } from "../lib/ent-store";

export type ShellView =
  | "home" | "games"
  | "movies" | "tv" | "anime" | "new" | "hindi" | "mylist" | "discover" | "collections"
  | "media"
  | "stats" | "account" | "settings";

export interface ShellProps {
  view: ShellView;
  onNavigate: (v: ShellView) => void;
  /** Context-aware topbar content (App provides games vs. media controls). */
  topbar?: ReactNode;
  /** Extra rail-bottom items (What's New / Notifications / Shortcuts). */
  railExtras?: ReactNode;
  /** The active view's content. */
  children: ReactNode;
}

interface NavDef {
  view: ShellView;
  label: string;
  icon: ReactNode;
  hint?: string;
  badge?: number;
}

const COLLAPSE_KEY = "nx-rail-collapsed";

export function Shell({ view, onNavigate, topbar, railExtras, children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const forgeActive = useForgeStore((s) => s.active);
  const toggleForge = useForgeStore((s) => s.toggle);
  const listCount = getList().length;

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      return !v;
    });
  };

  const nav = (active: boolean, def: NavDef) => (
    <button
      key={def.view}
      className={active ? "nx-nav-item active" : "nx-nav-item"}
      onClick={() => onNavigate(def.view)}
      title={def.hint ? `${def.label}  (${def.hint})` : def.label}
      aria-label={def.label}
      aria-current={active ? "page" : undefined}
    >
      <span className="nx-nav-ico">{def.icon}</span>
      {!collapsed && <span className="nx-nav-label">{def.label}</span>}
      {!collapsed && def.badge ? <span className="nx-nav-badge">{def.badge > 9 ? "9+" : def.badge}</span> : null}
    </button>
  );

  return (
    <div className="nx-shell" data-nx-collapsed={collapsed ? "1" : "0"}>
      {/* ── Universal rail ── */}
      <aside className="nx-rail" aria-label="Primary navigation">
        <div className="nx-rail-brand">
          <button className="nx-rail-logo" onClick={() => onNavigate("home")} title="NEXUS Home">
            <NexusMark size={collapsed ? 22 : 20} />
          </button>
          {!collapsed && (
            <span className="nx-rail-title"><strong>NEXUS</strong><em>Launcher</em></span>
          )}
          <button
            className={collapsed ? "nx-rail-collapse" : "nx-rail-collapse open"}
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon.Chevron size={13} />
          </button>
        </div>

        <nav className="nx-rail-nav">
          {nav(view === "home", { view: "home", label: "Home", icon: <Icon.Home size={16} /> })}
          <div className="nx-rail-sep" />
          {nav(view === "games", { view: "games", label: "Games", icon: <Icon.Gamepad size={16} /> })}
          {/* v9.3.0 (M1) — Local Media Server. Streams ONLY the user's own
              files via the nexus-media:// protocol. No third-party hosts. */}
          {nav(view === "media", { view: "media", label: "Media", icon: <Icon.Film size={16} />, hint: "m" })}
          {nav(view === "movies", { view: "movies", label: "Movies", icon: <Icon.Film size={16} /> })}
          {nav(view === "tv", { view: "tv", label: "TV Shows", icon: <Icon.Tv size={16} /> })}
          {nav(view === "anime", { view: "anime", label: "Anime", icon: <Icon.Sparkles size={16} />, hint: "a" })}
          {nav(view === "new", { view: "new", label: "New & Popular", icon: <Icon.TrendingUp size={16} />, hint: "p" })}
          {nav(view === "hindi", { view: "hindi", label: "Hindi Dub", icon: <Icon.Globe size={16} />, hint: "h" })}
          <div className="nx-rail-sep" />
          {nav(view === "mylist", { view: "mylist", label: "My List", icon: <Icon.Bookmark size={16} />, badge: listCount })}
          {nav(view === "discover", { view: "discover", label: "Discover", icon: <Icon.Wand size={16} /> })}
          {nav(view === "collections", { view: "collections", label: "Collections", icon: <Icon.Library size={16} /> })}
        </nav>

        <div className="nx-rail-spacer" />

        <div className="nx-rail-bottom">
          {nav(view === "stats", { view: "stats", label: "Statistics", icon: <Icon.TrendingUp size={16} /> })}
          {nav(view === "account", { view: "account", label: "Account", icon: <Icon.Users size={16} />, hint: "u" })}
          {nav(view === "settings", { view: "settings", label: "Settings", icon: <Icon.Settings size={16} /> })}
          <div className="nx-rail-sep" />
          {railExtras}
          <button
            className={forgeActive ? "nx-nav-item forge on" : "nx-nav-item forge"}
            onClick={toggleForge}
            title="Forge Mode — customize everything (visual builder)"
            aria-label="Forge Mode"
          >
            <span className="nx-nav-ico"><Icon.Wand size={16} /></span>
            {!collapsed && <span className="nx-nav-label">Forge</span>}
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="nx-main">
        <header className="nx-topbar">{topbar}</header>
        <main className="nx-content" id="nx-content">{children}</main>
      </div>

      {/* ── Forge Mode overlay (whole app) ── */}
      <ForgeOverlay />
    </div>
  );
}
