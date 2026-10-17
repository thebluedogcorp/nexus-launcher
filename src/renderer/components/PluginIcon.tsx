// v4.9.0 — Plugin Icon Registry. Maps a Lucide icon name (string) to the
// actual Lucide component, so plugins + first-party plugin manifests can
// reference icons by NAME ("music", "rocket", "palette"...) instead of
// embedding emoji or raw SVG. Plugins also get an `api.ui.icon(name, size)`
// helper that returns the same SVG string for use inside innerHTML templates.

import * as Lucide from "lucide-react";
import type { ComponentType } from "react";

// Lucide icons are ForwardRefExoticComponent; type loosely to avoid ref
// incompatibilities between @types/react versions in the monorepo.
type LucideIcon = ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties; color?: string }>;

// Whitelisted icon names that plugins are allowed to reference. We restrict
// the set so a malicious plugin cannot pull in arbitrary Lucide exports.
// Adding more is a one-line change here.
const ALLOWED: Record<string, LucideIcon> = {
  music: Lucide.Music,
  rocket: Lucide.Rocket,
  palette: Lucide.Palette,
  barChart: Lucide.BarChart3,
  house: Lucide.House,
  command: Lucide.Command,
  listChecks: Lucide.ListChecks,
  timer: Lucide.Timer,
  hardDrive: Lucide.HardDrive,
  info: Lucide.Info,
  zap: Lucide.Zap,
  package: Lucide.Package,
  puzzle: Lucide.Puzzle,
  settings: Lucide.Settings2,
  sliders: Lucide.SlidersHorizontal,
  terminal: Lucide.Terminal,
  code: Lucide.Code2,
  layers: Lucide.Layers,
  activity: Lucide.Activity,
  bookmark: Lucide.Bookmark,
  play: Lucide.Play,
  playCircle: Lucide.PlayCircle,
  star: Lucide.Star,
  clock: Lucide.Clock,
  calendar: Lucide.Calendar,
  heart: Lucide.Heart,
  search: Lucide.Search,
  plus: Lucide.Plus,
  check: Lucide.Check,
  checkCircle: Lucide.CheckCircle2,
  close: Lucide.X,
  trash: Lucide.Trash2,
  refresh: Lucide.RefreshCw,
  download: Lucide.Download,
  downloadCloud: Lucide.DownloadCloud,
  upload: Lucide.Upload,
  folder: Lucide.Folder,
  folderOpen: Lucide.FolderOpen,
  file: Lucide.File,
  fileCog: Lucide.FileCog,
  tag: Lucide.Tag,
  sparkles: Lucide.Sparkles,
  wand: Lucide.Wand2,
  image: Lucide.Image,
  eye: Lucide.Eye,
  shield: Lucide.Shield,
  key: Lucide.Key,
  cpu: Lucide.Cpu,
  power: Lucide.Power,
  toggle: Lucide.ToggleRight,
  externalLink: Lucide.ExternalLink,
  building: Lucide.Building2,
  store: Lucide.Store,
  database: Lucide.Database,
  gauge: Lucide.Gauge,
  trending: Lucide.TrendingUp,
  trophy: Lucide.Trophy,
  target: Lucide.Target,
  flag: Lucide.Flag,
  fire: Lucide.Flame,
  bolt: Lucide.Zap,
  gamepad: Lucide.Gamepad2,
  joystick: Lucide.Gamepad2,
  library: Lucide.Library,
  grid: Lucide.LayoutGrid,
  list: Lucide.List,
  chevron: Lucide.ChevronRight,
  arrowRight: Lucide.ArrowRight,
  arrowUp: Lucide.ArrowUp,
  arrowDown: Lucide.ArrowDown,
  volume: Lucide.Volume2,
  volumeMute: Lucide.VolumeX,
  skipForward: Lucide.SkipForward,
  skipBack: Lucide.SkipBack,
  pause: Lucide.Pause,
  repeat: Lucide.Repeat,
  shuffle: Lucide.Shuffle,
  headphones: Lucide.Headphones,
  radio: Lucide.Radio,
  microphone: Lucide.Mic2,
  camera: Lucide.Camera,
  video: Lucide.Video,
  film: Lucide.Film,
  playCircle2: Lucide.CirclePlay,
  bookmark2: Lucide.BookmarkCheck,
  award: Lucide.Award,
  medal: Lucide.Medal,
  bell: Lucide.Bell,
  moon: Lucide.Moon,
  sun: Lucide.Sun,
  monitor: Lucide.Monitor,
  laptop: Lucide.Laptop,
  smartphone: Lucide.Smartphone,
  tablet: Lucide.Tablet,
  wifi: Lucide.Wifi,
  bluetooth: Lucide.Bluetooth,
  usb: Lucide.Usb,
  battery: Lucide.BatteryFull,
  filter: Lucide.Filter,
  sort: Lucide.SortDesc,
  more: Lucide.MoreHorizontal,
  dots: Lucide.MoreVertical,
  menu: Lucide.Menu,
  user: Lucide.User,
  users: Lucide.Users,
  inbox: Lucide.Inbox,
  archive: Lucide.Archive,
  trash2: Lucide.Trash,
  edit: Lucide.Edit3,
  copy: Lucide.Copy,
  cut: Lucide.Scissors,
  paste: Lucide.ClipboardPaste,
  save: Lucide.Save,
  folderPlus: Lucide.FolderPlus,
  folderSearch: Lucide.FolderSearch,
  filePlus: Lucide.FilePlus2,
  settings2: Lucide.Settings,
  terminalSquare: Lucide.TerminalSquare,
  gitBranch: Lucide.GitBranch,
  gitCommit: Lucide.GitCommitHorizontal,
  cloud: Lucide.Cloud,
  cloudUpload: Lucide.CloudUpload,
  cloudDownload: Lucide.CloudDownload,
  globe: Lucide.Globe,
  link: Lucide.Link,
  unlink: Lucide.Unlink,
  map: Lucide.Map,
  mapPin: Lucide.MapPin,
  navigation: Lucide.Navigation,
  compass: Lucide.Compass,
  anchor: Lucide.Anchor,
  mountain: Lucide.Mountain,
  tree: Lucide.TreePine,
  leaf: Lucide.Leaf,
  droplet: Lucide.Droplet,
  wind: Lucide.Wind,
  sun2: Lucide.SunMedium,
  sunrise: Lucide.Sunrise,
  sunset: Lucide.Sunset,
  moonStar: Lucide.MoonStar,
  brush: Lucide.Brush,
  pen: Lucide.PenTool,
  type: Lucide.Type,
  paintBucket: Lucide.PaintBucket,
  pipette: Lucide.Pipette,
  scissors: Lucide.Scissors,
  ruler: Lucide.Ruler,
  square: Lucide.Square,
  circle: Lucide.Circle,
  triangle: Lucide.Triangle,
  diamond: Lucide.Diamond,
  hexagon: Lucide.Hexagon,
  octagon: Lucide.Octagon,
  star2: Lucide.Star,
};

const DEFAULT_ICON: LucideIcon = Lucide.Puzzle;

export interface PluginIconProps {
  /** Lucide icon name (kebab/camel/snake all OK — we normalize). */
  name?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** Normalize "music-player" / "musicPlayer" / "music_player" → "musicplayer". */
function norm(s: string): string {
  return s.replace(/[-_\s]/g, "").toLowerCase();
}

// Build a normalized lookup so manifests can use "music-player" or "music".
const NORMALIZED: Record<string, LucideIcon> = {};
for (const [k, v] of Object.entries(ALLOWED)) NORMALIZED[norm(k)] = v;

/** Resolve a name → Lucide component (falls back to Puzzle). */
export function resolvePluginIcon(name?: string): LucideIcon {
  if (!name) return DEFAULT_ICON;
  // If it's a URL, leave that for the caller to handle (PluginIcon supports URL).
  if (/^https?:\/\//i.test(name) || name.startsWith("data:")) return DEFAULT_ICON;
  return NORMALIZED[norm(name)] ?? DEFAULT_ICON;
}

/** React component used by the host UI (Settings gallery, topbar, etc.). */
export function PluginIcon({ name, size = 18, className, style }: PluginIconProps) {
  // If name is a URL/data-URI, render an <img>. Otherwise render the Lucide component.
  if (name && (/^https?:\/\//i.test(name) || name.startsWith("data:"))) {
    return (
      <img
        src={name}
        width={size}
        height={size}
        alt=""
        className={className}
        style={{ display: "block", borderRadius: 4, ...style }}
      />
    );
  }
  const Cmp = resolvePluginIcon(name);
  return <Cmp size={size} className={className} style={style} />;
}

/**
 * Return the inline SVG string for a Lucide icon — for plugins that compose
 * HTML via innerHTML. This is the renderer-side implementation of
 * `api.ui.icon(name, size)` defined in plugin-runtime.ts.
 *
 * We import the raw <svg> path data from lucide-react's internal node map
 * (each icon exposes `.node` as an array of children with `tag` + `attrs`).
 */
export function renderPluginIconSVG(name: string, size = 18): string {
  const Cmp = resolvePluginIcon(name) as unknown as { lucide?: { iconNode?: Array<[string, Record<string, string>]> } } | LucideIcon;
  // lucide-react exposes the raw icon node on the component under `.lucide`.
  // If we can find it, render the inner nodes; otherwise fall back to a wrapper
  // with the same component name (empty svg).
  const node = (Cmp as { lucide?: { iconNode?: Array<[string, Record<string, string>]> } })?.lucide?.iconNode;
  if (!node || node.length === 0) {
    // Fallback — empty SVG; rarely hit because every allowed icon has a node.
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg>`;
  }
  const inner = node.map(([tag, attrs]) => {
    const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${v.replace(/"/g, "&quot;")}"`).join("");
    return `<${tag}${a} />`;
  }).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
