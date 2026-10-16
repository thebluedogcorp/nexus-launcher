// v4.4.0 — Layer Explorer + Property Inspector for Theme Studio.
//
// LayerExplorer: the left pane. Lists the customizable component "layers"
// (Game Card, Library Grid, Sidebar, Topbar, Background, Typography,
// Buttons, Animations, Layout). Clicking a layer selects it; the inspector
// shows its properties. Layers can be reordered via up/down buttons (the
// order drives layout.sectionsOrder where applicable).
//
// Inspector: the right pane. Renders a categorized set of controls bound
// to the draft via useThemeStore.setDraft. Switches on the selected layer.

import { useThemeStore } from "../../lib/theme-store";
import type { ThemeConfig } from "@shared/theme-types";
import { IconGlyph } from "../IconGlyph";
import { ControlRow, Slider, NumberField, ColorInput, Select, Segmented, Toggle, TextField } from "./controls";

interface LayerDef { id: string; label: string; icon: string; }

export const LAYERS: LayerDef[] = [
  { id: "card", label: "Game Card", icon: "gamepad" },
  { id: "library", label: "Library Grid", icon: "library" },
  { id: "sidebar", label: "Sidebar", icon: "folder" },
  { id: "topbar", label: "Topbar", icon: "settings" },
  { id: "background", label: "Background", icon: "palette" },
  { id: "typography", label: "Typography", icon: "pencil" },
  { id: "colors", label: "Colors & Accent", icon: "palette" },
  { id: "animations", label: "Animations", icon: "zap" },
  { id: "layout", label: "Layout", icon: "bookmark" },
];

export function LayerExplorer() {
  const selected = useThemeStore((s) => s.selectedLayer);
  const setSelected = useThemeStore((s) => s.setSelectedLayer);
  return (
    <div className="ts-layers">
      <div className="ts-pane-title">Layers</div>
      <div className="ts-layer-list">
        {LAYERS.map((l) => (
          <button key={l.id} className={selected === l.id ? "ts-layer active" : "ts-layer"} onClick={() => setSelected(l.id)}>
            <span className="ts-layer-icon"><IconGlyph k={l.icon} size={15} /></span>
            <span className="ts-layer-label">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="ts-section-title"><span className="bar" />{children}</div>;
}

export function Inspector() {
  const draft = useThemeStore((s) => s.draft);
  const setDraft = useThemeStore((s) => s.setDraft);
  const selected = useThemeStore((s) => s.selectedLayer);

  // Bind a nested field updater.
  const bind = <K extends keyof ThemeConfig>(key: K) => (updater: (s: ThemeConfig[K]) => void) =>
    setDraft((d) => { updater(d[key]); });

  return (
    <div className="ts-inspector">
      <div className="ts-pane-title">Properties — {LAYERS.find((l) => l.id === selected)?.label ?? ""}</div>
      <div className="ts-inspector-body">

        {selected === "colors" && (
          <>
            <SectionTitle>Surfaces</SectionTitle>
            <ControlRow label="Background" ><ColorInput value={draft.colors.bg} onChange={(v) => bind("colors")((s) => { s.bg = v; })} /></ControlRow>
            <ControlRow label="Elevated surface" ><ColorInput value={draft.colors.bg2} onChange={(v) => bind("colors")((s) => { s.bg2 = v; })} /></ControlRow>
            <ControlRow label="Input surface" ><ColorInput value={draft.colors.surface} onChange={(v) => bind("colors")((s) => { s.surface = v; })} /></ControlRow>
            <ControlRow label="Active surface" ><ColorInput value={draft.colors.surface2} onChange={(v) => bind("colors")((s) => { s.surface2 = v; })} /></ControlRow>
            <SectionTitle>Borders</SectionTitle>
            <ControlRow label="Border" hint="rgba() supported" ><ColorInput value={draft.colors.border} onChange={(v) => bind("colors")((s) => { s.border = v; })} /></ControlRow>
            <ControlRow label="Border strong" ><ColorInput value={draft.colors.borderStrong} onChange={(v) => bind("colors")((s) => { s.borderStrong = v; })} /></ControlRow>
            <SectionTitle>Text</SectionTitle>
            <ControlRow label="Primary text" ><ColorInput value={draft.colors.text} onChange={(v) => bind("colors")((s) => { s.text = v; })} /></ControlRow>
            <ControlRow label="Dim text" ><ColorInput value={draft.colors.textDim} onChange={(v) => bind("colors")((s) => { s.textDim = v; })} /></ControlRow>
            <ControlRow label="Faint text" ><ColorInput value={draft.colors.textFaint} onChange={(v) => bind("colors")((s) => { s.textFaint = v; })} /></ControlRow>
            <SectionTitle>Accent</SectionTitle>
            <ControlRow label="Accent color" hint="The ONE accent. Drives focus rings, active states, badges." ><ColorInput value={draft.colors.accent} onChange={(v) => bind("colors")((s) => { s.accent = v; })} /></ControlRow>
            <ControlRow label="Danger color" ><ColorInput value={draft.colors.danger} onChange={(v) => bind("colors")((s) => { s.danger = v; })} /></ControlRow>
          </>
        )}

        {selected === "typography" && (
          <>
            <SectionTitle>Font</SectionTitle>
            <ControlRow label="Font family" hint="CSS font-family stack" >
              <TextField value={draft.typography.fontFamily} onChange={(v) => bind("typography")((s) => { s.fontFamily = v; })} />
            </ControlRow>
            <SectionTitle>Sizes</SectionTitle>
            <ControlRow label="Base size" ><Slider value={draft.typography.baseSize} min={11} max={18} step={0.5} suffix="px" onChange={(v) => bind("typography")((s) => { s.baseSize = v; })} /></ControlRow>
            <ControlRow label="Title size" ><Slider value={draft.typography.titleSize} min={16} max={36} step={1} suffix="px" onChange={(v) => bind("typography")((s) => { s.titleSize = v; })} /></ControlRow>
            <ControlRow label="Line height" ><Slider value={draft.typography.lineHeight} min={1} max={2} step={0.05} onChange={(v) => bind("typography")((s) => { s.lineHeight = v; })} /></ControlRow>
            <ControlRow label="Letter spacing" hint="Negative = tighter" ><Slider value={draft.typography.letterSpacing} min={-0.05} max={0.05} step={0.005} suffix="em" onChange={(v) => bind("typography")((s) => { s.letterSpacing = v; })} /></ControlRow>
          </>
        )}

        {selected === "card" && (
          <>
            <SectionTitle>Shape</SectionTitle>
            <ControlRow label="Aspect ratio" >
              <Segmented value={draft.card.aspectRatio} options={[{value:"3/4",label:"3:4"},{value:"2/3",label:"2:3"},{value:"1/1",label:"1:1"},{value:"16/9",label:"16:9"}]} onChange={(v) => bind("card")((s) => { s.aspectRatio = v; })} />
            </ControlRow>
            <ControlRow label="Corner radius" ><Slider value={draft.card.radius} min={0} max={28} step={1} suffix="px" onChange={(v) => bind("card")((s) => { s.radius = v; })} /></ControlRow>
            <ControlRow label="Border opacity" ><Slider value={draft.card.borderOpacity} min={0} max={0.4} step={0.01} onChange={(v) => bind("card")((s) => { s.borderOpacity = v; })} /></ControlRow>
            <SectionTitle>Layout</SectionTitle>
            <ControlRow label="Min card width" ><Slider value={draft.card.minWidth} min={140} max={320} step={10} suffix="px" onChange={(v) => bind("card")((s) => { s.minWidth = v; })} /></ControlRow>
            <ControlRow label="Grid gap" ><Slider value={draft.card.gap} min={6} max={32} step={2} suffix="px" onChange={(v) => bind("card")((s) => { s.gap = v; })} /></ControlRow>
            <ControlRow label="Density" >
              <Segmented value={draft.card.density} options={[{value:"compact",label:"Compact"},{value:"cozy",label:"Cozy"},{value:"comfortable",label:"Comfy"}]} onChange={(v) => bind("card")((s) => { s.density = v; })} />
            </ControlRow>
            <SectionTitle>Effects</SectionTitle>
            <ControlRow label="Shadow" >
              <Select value={draft.card.shadow} options={[{value:"none",label:"None"},{value:"low",label:"Low"},{value:"mid",label:"Mid"},{value:"high",label:"High"}]} onChange={(v) => bind("card")((s) => { s.shadow = v as ThemeConfig["card"]["shadow"]; })} />
            </ControlRow>
            <ControlRow label="Hover lift" ><Slider value={draft.card.hoverLift} min={0} max={12} step={1} suffix="px" onChange={(v) => bind("card")((s) => { s.hoverLift = v; })} /></ControlRow>
            <SectionTitle>Card content</SectionTitle>
            <ControlRow label="Show title" ><Toggle value={draft.card.showTitle} onChange={(v) => bind("card")((s) => { s.showTitle = v; })} /></ControlRow>
            <ControlRow label="Show platform badge" ><Toggle value={draft.card.showPlatform} onChange={(v) => bind("card")((s) => { s.showPlatform = v; })} /></ControlRow>
            <ControlRow label="Show playtime" ><Toggle value={draft.card.showPlaytime} onChange={(v) => bind("card")((s) => { s.showPlaytime = v; })} /></ControlRow>
          </>
        )}

        {selected === "library" && (
          <>
            <SectionTitle>View</SectionTitle>
            <ControlRow label="Library view" >
              <Segmented value={draft.layout.libraryView} options={[{value:"grid",label:"Grid"},{value:"list",label:"List"}]} onChange={(v) => bind("layout")((s) => { s.libraryView = v as "grid"|"list"; })} />
            </ControlRow>
            <SectionTitle>Spacing scale</SectionTitle>
            <ControlRow label="Spacing multiplier" hint="Affects padding + gaps across the app" >
              <Slider value={draft.spacing.scale} min={0.6} max={1.6} step={0.05} suffix="x" onChange={(v) => bind("spacing")((s) => { s.scale = v; })} />
            </ControlRow>
            <SectionTitle>Radius scale</SectionTitle>
            <ControlRow label="Small radius" ><Slider value={draft.radius.sm} min={0} max={16} step={1} suffix="px" onChange={(v) => bind("radius")((s) => { s.sm = v; })} /></ControlRow>
            <ControlRow label="Medium radius" ><Slider value={draft.radius.md} min={0} max={20} step={1} suffix="px" onChange={(v) => bind("radius")((s) => { s.md = v; })} /></ControlRow>
            <ControlRow label="Large radius" ><Slider value={draft.radius.lg} min={0} max={24} step={1} suffix="px" onChange={(v) => bind("radius")((s) => { s.lg = v; })} /></ControlRow>
            <ControlRow label="XL radius" ><Slider value={draft.radius.xl} min={0} max={32} step={1} suffix="px" onChange={(v) => bind("radius")((s) => { s.xl = v; })} /></ControlRow>
          </>
        )}

        {selected === "sidebar" && (
          <>
            <SectionTitle>Dimensions</SectionTitle>
            <ControlRow label="Width" ><Slider value={draft.sidebar.width} min={180} max={320} step={10} suffix="px" onChange={(v) => bind("sidebar")((s) => { s.width = v; })} /></ControlRow>
            <ControlRow label="Position" >
              <Segmented value={draft.sidebar.position} options={[{value:"left",label:"Left"},{value:"right",label:"Right"}]} onChange={(v) => bind("sidebar")((s) => { s.position = v as "left"|"right"; })} />
            </ControlRow>
            <SectionTitle>Background</SectionTitle>
            <ControlRow label="Sidebar background" ><ColorInput value={draft.sidebar.background} onChange={(v) => bind("sidebar")((s) => { s.background = v; })} /></ControlRow>
          </>
        )}

        {selected === "topbar" && (
          <>
            <SectionTitle>Dimensions</SectionTitle>
            <ControlRow label="Height" ><Slider value={draft.topbar.height} min={40} max={72} step={2} suffix="px" onChange={(v) => bind("topbar")((s) => { s.height = v; })} /></ControlRow>
            <SectionTitle>Background</SectionTitle>
            <ControlRow label="Background color" ><ColorInput value={draft.topbar.background} onChange={(v) => bind("topbar")((s) => { s.background = v; })} /></ControlRow>
            <ControlRow label="Transparency" hint="0 = transparent, 1 = opaque" ><Slider value={draft.topbar.transparency} min={0} max={1} step={0.05} onChange={(v) => bind("topbar")((s) => { s.transparency = v; })} /></ControlRow>
            <ControlRow label="Border opacity" ><Slider value={draft.topbar.borderOpacity} min={0} max={0.3} step={0.01} onChange={(v) => bind("topbar")((s) => { s.borderOpacity = v; })} /></ControlRow>
          </>
        )}

        {selected === "background" && (
          <>
            <SectionTitle>Type</SectionTitle>
            <ControlRow label="Background type" >
              <Segmented value={draft.background.type} options={[{value:"solid",label:"Solid"},{value:"gradient",label:"Gradient"},{value:"image",label:"Image"}]} onChange={(v) => bind("background")((s) => { s.type = v as ThemeConfig["background"]["type"]; })} />
            </ControlRow>
            <SectionTitle>Source</SectionTitle>
            <ControlRow label={draft.background.type === "image" ? "Image URL/path" : draft.background.type === "gradient" ? "Gradient CSS" : "Color"} >
              <TextField value={draft.background.value} onChange={(v) => bind("background")((s) => { s.value = v; })} placeholder={draft.background.type === "gradient" ? "linear-gradient(135deg,#1a0040,#0d0024)" : ""} />
            </ControlRow>
            <SectionTitle>Effects</SectionTitle>
            <ControlRow label="Background blur" ><Slider value={draft.background.blur} min={0} max={40} step={1} suffix="px" onChange={(v) => bind("background")((s) => { s.blur = v; })} /></ControlRow>
            <ControlRow label="Overlay opacity" hint="Dark scrim over the background" ><Slider value={draft.background.overlayOpacity} min={0} max={1} step={0.05} onChange={(v) => bind("background")((s) => { s.overlayOpacity = v; })} /></ControlRow>
            <ControlRow label="Parallax zoom" hint="Slow zoom on the background" ><Toggle value={draft.background.parallax} onChange={(v) => bind("background")((s) => { s.parallax = v; })} /></ControlRow>
          </>
        )}

        {selected === "animations" && (
          <>
            <SectionTitle>Speed</SectionTitle>
            <ControlRow label="Speed multiplier" hint="0.5 = half speed, 2 = double speed" >
              <Slider value={draft.animations.speedMultiplier} min={0.3} max={2} step={0.1} suffix="x" onChange={(v) => bind("animations")((s) => { s.speedMultiplier = v; })} />
            </ControlRow>
            <SectionTitle>Effects</SectionTitle>
            <ControlRow label="Hover effects" ><Toggle value={draft.animations.hoverEffects} onChange={(v) => bind("animations")((s) => { s.hoverEffects = v; })} /></ControlRow>
            <ControlRow label="Card entrance animation" ><Toggle value={draft.animations.cardEntrance} onChange={(v) => bind("animations")((s) => { s.cardEntrance = v; })} /></ControlRow>
            <ControlRow label="Reduced motion" hint="Force-disable all animations" ><Toggle value={draft.animations.reducedMotion} onChange={(v) => bind("animations")((s) => { s.reducedMotion = v; })} /></ControlRow>
          </>
        )}

        {selected === "layout" && (
          <>
            <SectionTitle>Mode</SectionTitle>
            <ControlRow label="Color mode" >
              <Segmented value={draft.mode} options={[{value:"dark",label:"Dark"},{value:"light",label:"Light"}]} onChange={(v) => setDraft((d) => { d.mode = v as "dark"|"light"; })} />
            </ControlRow>
            <SectionTitle>Section visibility</SectionTitle>
            <div className="ts-hint">Toggle which sidebar sections appear in the desktop sidebar. (Full drag-reorder is on the roadmap.)</div>
            {draft.layout.sectionsOrder.map((sec) => (
              <ControlRow key={sec} label={sec.charAt(0).toUpperCase() + sec.slice(1)} >
                <Toggle value={!draft.layout.hiddenSections.includes(sec)} onChange={(v) => bind("layout")((s) => { if (v) s.hiddenSections = s.hiddenSections.filter((x) => x !== sec); else if (!s.hiddenSections.includes(sec)) s.hiddenSections.push(sec); })} />
              </ControlRow>
            ))}
          </>
        )}

      </div>
    </div>
  );
}
