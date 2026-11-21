// v10.0.0 — NexusForge snap engine (pure, framework-free).
//
// During a drag or resize we compute, for each axis, the best snap candidate
// from three families of targets:
//   1. the snap grid (configurable: 4/8/16/32 px)
//   2. sibling panel edges + centers (alignment guides)
//   3. canvas edges + center
// If a candidate is within `threshold` px of the moving edge, we snap and emit
// a guide line so the user sees WHAT they snapped to. Classic builder behavior.

export interface Rect { x: number; y: number; w: number; h: number }

export interface SnapConfig {
  enabled: boolean;
  grid: number;
  threshold: number; // px — snap distance
}

export interface SnapGuides {
  x: number[]; // vertical guide lines (canvas-relative x positions)
  y: number[]; // horizontal guide lines (canvas-relative y positions)
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuides;
}

export const DEFAULT_SNAP: SnapConfig = { enabled: true, grid: 16, threshold: 6 };

interface Candidate { pos: number; guide: number }

/** All x-axis snap candidates for the moving rect's left edge / center / right edge. */
function xCandidates(moving: Rect, others: Rect[], canvas: { w: number }): Candidate[] {
  const c: Candidate[] = [];
  const push = (edge: number, guide: number) => c.push({ pos: edge, guide });
  // canvas edges + center
  push(0, 0);
  push(canvas.w - moving.w, canvas.w);
  push(Math.round((canvas.w - moving.w) / 2), Math.round(canvas.w / 2));
  // siblings: align left/center/right
  for (const o of others) {
    push(o.x, o.x);
    push(o.x + Math.round((o.w - moving.w) / 2), o.x + Math.round(o.w / 2));
    push(o.x + o.w - moving.w, o.x + o.w);
  }
  return c;
}

function yCandidates(moving: Rect, others: Rect[], canvas: { h: number }): Candidate[] {
  const c: Candidate[] = [];
  const push = (edge: number, guide: number) => c.push({ pos: edge, guide });
  push(0, 0);
  push(canvas.h - moving.h, canvas.h);
  push(Math.round((canvas.h - moving.h) / 2), Math.round(canvas.h / 2));
  for (const o of others) {
    push(o.y, o.y);
    push(o.y + Math.round((o.h - moving.h) / 2), o.y + Math.round(o.h / 2));
    push(o.y + o.h - moving.h, o.y + o.h);
  }
  return c;
}

/** Snap a dragged rect. Returns the adjusted x/y + active guide lines. */
export function snapDrag(raw: Rect, others: Rect[], canvas: { w: number; h: number }, cfg: SnapConfig): SnapResult {
  if (!cfg.enabled) return { x: raw.x, y: raw.y, guides: { x: [], y: [] } };
  const guides: SnapGuides = { x: [], y: [] };
  let x = raw.x;
  let y = raw.y;

  // Grid snap first (weakest — only if no element snap applies).
  const gx = Math.round(raw.x / cfg.grid) * cfg.grid;
  const gy = Math.round(raw.y / cfg.grid) * cfg.grid;

  // Element/canvas snaps override grid when within threshold.
  let bestX: { delta: number; pos: number; guide: number } | null = null;
  for (const c of xCandidates(raw, others, canvas)) {
    const d = Math.abs(c.pos - raw.x);
    if (d <= cfg.threshold && (!bestX || d < bestX.delta)) bestX = { delta: d, pos: c.pos, guide: c.guide };
  }
  if (bestX) { x = bestX.pos; guides.x.push(bestX.guide); }
  else if (gx !== raw.x && Math.abs(gx - raw.x) <= cfg.threshold) x = gx;

  let bestY: { delta: number; pos: number; guide: number } | null = null;
  for (const c of yCandidates(raw, others, canvas)) {
    const d = Math.abs(c.pos - raw.y);
    if (d <= cfg.threshold && (!bestY || d < bestY.delta)) bestY = { delta: d, pos: c.pos, guide: c.guide };
  }
  if (bestY) { y = bestY.pos; guides.y.push(bestY.guide); }
  else if (gy !== raw.y && Math.abs(gy - raw.y) <= cfg.threshold) y = gy;

  // Clamp to canvas.
  x = Math.max(-40, Math.min(x, canvas.w - 40));
  y = Math.max(-40, Math.min(y, canvas.h - 40));
  return { x, y, guides };
}

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Snap a resized rect: the moving edge snaps to grid + sibling edges. */
export function snapResize(
  edge: ResizeEdge,
  raw: Rect,
  min: { w: number; h: number },
  others: Rect[],
  canvas: { w: number; h: number },
  cfg: SnapConfig,
): { rect: Rect; guides: SnapGuides } {
  const guides: SnapGuides = { x: [], y: [] };
  const r: Rect = { ...raw };

  const snapValue = (v: number, candidates: number[]): { v: number; guide: number | null } => {
    // grid
    const g = Math.round(v / cfg.grid) * cfg.grid;
    let best: { d: number; v: number; guide: number } | null = cfg.enabled && Math.abs(g - v) <= cfg.threshold ? { d: Math.abs(g - v), v: g, guide: g } : null;
    if (cfg.enabled) {
      for (const c of candidates) {
        const d = Math.abs(c - v);
        if (d <= cfg.threshold && (!best || d < best.d)) best = { d, v: c, guide: c };
      }
    }
    return best ? { v: best.v, guide: best.guide } : { v, guide: null };
  };

  if (edge.includes("e")) {
    const targets = [canvas.w, ...others.flatMap((o) => [o.x, o.x + o.w])];
    const s = snapValue(r.x + r.w, targets);
    r.w = Math.max(min.w, s.v - r.x);
    if (s.guide !== null) guides.x.push(s.guide);
  }
  if (edge.includes("s")) {
    const targets = [canvas.h, ...others.flatMap((o) => [o.y, o.y + o.h])];
    const s = snapValue(r.y + r.h, targets);
    r.h = Math.max(min.h, s.v - r.y);
    if (s.guide !== null) guides.y.push(s.guide);
  }
  if (edge.includes("w")) {
    const targets = [0, ...others.flatMap((o) => [o.x, o.x + o.w])];
    const s = snapValue(r.x, targets);
    const newW = r.x + r.w - s.v;
    if (newW >= min.w) { r.x = s.v; r.w = newW; if (s.guide !== null) guides.x.push(s.guide); }
  }
  if (edge.includes("n")) {
    const targets = [0, ...others.flatMap((o) => [o.y, o.y + o.h])];
    const s = snapValue(r.y, targets);
    const newH = r.y + r.h - s.v;
    if (newH >= min.h) { r.y = s.v; r.h = newH; if (s.guide !== null) guides.y.push(s.guide); }
  }
  return { rect: r, guides };
}

/** Round a value to the nearest grid step (used by nudging + inspector). */
export function toGrid(v: number, grid: number): number {
  return Math.round(v / grid) * grid;
}
