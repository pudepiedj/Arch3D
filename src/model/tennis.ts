// A tennis court: a regulation doubles court with its singles sidelines, the net on its
// posts, and the run-off round it, all inside a chain-link fence with a gate in one side.
// Placed like a piece of garden furniture: its width and depth are the fenced enclosure
// (18.29 × 36.58 m, the usual 60 × 120 ft), with the court in the middle and its long axis
// along the piece's depth. Everything here is in the piece's own frame (centred, x across,
// y along); see furniture.ts.

import type { Vec2 } from './geom';
import type { Furniture } from './types';

/** ITF dimensions (m): lines are inside these. */
export const COURT = {
  length: 23.77,
  width: 10.97,
  singles: 8.23,
  /** From the net to the far side of each service line. */
  service: 6.4,
  /** Centres of the net posts, 0.914 m outside the doubles sidelines. */
  posts: 12.8,
  /** Height of the net at the posts and in the middle. */
  netPost: 1.07,
  netCentre: 0.914,
};

/** The usual enclosure, with the recommended run-off: 6.40 m behind each baseline, 3.66 m at the sides. */
export const COURT_ENCLOSURE = { width: 18.29, length: 36.58 };
export const TENNIS_SURFACES = ['tarmac', 'clay', 'grass'];
/** Clear width of the gate in the side fence. */
export const COURT_GATE = 1.0;
/** Fences lower than this are left off. */
export const MIN_FENCE = 0.3;

export const isTennis = (f: Furniture) => f.kind === 'tennis';

/** A painted line: a strip from (x0, y0) to (x1, y1). */
export interface Strip {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The court's markings: baselines 10 cm wide, the other lines 5 cm, each measured to the
 * outside of the line, and the centre marks 10 cm long inside each baseline.
 */
export function courtLines(): Strip[] {
  const L = COURT.length / 2;
  const W = COURT.width / 2;
  const S = COURT.singles / 2;
  const sv = COURT.service;
  const t = 0.05;
  const out: Strip[] = [];
  for (const s of [-1, 1]) {
    out.push({ x0: -W, y0: s * L - (s > 0 ? 2 * t : 0), x1: W, y1: s * L + (s < 0 ? 2 * t : 0) }); // baseline
    out.push({ x0: s > 0 ? W - t : -W, y0: -L, x1: s > 0 ? W : -W + t, y1: L }); // doubles sideline
    out.push({ x0: s > 0 ? S - t : -S, y0: -L, x1: s > 0 ? S : -S + t, y1: L }); // singles sideline
    out.push({ x0: -S, y0: s > 0 ? sv - t : -sv, x1: S, y1: s > 0 ? sv : -sv + t }); // service line
    out.push({ x0: -t / 2, y0: s > 0 ? L - 4 * t : -L + 2 * t, x1: t / 2, y1: s > 0 ? L - 2 * t : -L + 4 * t }); // centre mark
  }
  out.push({ x0: -t / 2, y0: -sv, x1: t / 2, y1: sv }); // centre service line
  return out;
}

/** Height of the top of the net across the court (x from the middle), sagging from the posts. */
export function netTop(x: number): number {
  const u = Math.min(1, Math.abs(x) / (COURT.posts / 2));
  return COURT.netCentre + (COURT.netPost - COURT.netCentre) * u * u;
}

export const hasFence = (f: Furniture) => f.height >= MIN_FENCE;

/** Where the gate is: the gap in the +x side fence, centred on the net line. */
export function courtGate(f: Furniture): { hinge: Vec2; latch: Vec2 } {
  return { hinge: { x: f.width / 2, y: -COURT_GATE / 2 }, latch: { x: f.width / 2, y: COURT_GATE / 2 } };
}

/** The fence round the enclosure, as straight runs, leaving the gap for the gate. */
export function fenceRuns(f: Furniture): [Vec2, Vec2][] {
  if (!hasFence(f)) return [];
  const w = f.width / 2;
  const d = f.depth / 2;
  const g = courtGate(f);
  return [
    [{ x: -w, y: -d }, { x: w, y: -d }],
    [g.latch, { x: w, y: d }],
    [{ x: w, y: d }, { x: -w, y: d }],
    [{ x: -w, y: d }, { x: -w, y: -d }],
    [{ x: w, y: -d }, g.hinge],
  ];
}

/** A point of the piece's frame on the plan. */
export function toPlan(f: Furniture, p: Vec2): Vec2 {
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  return { x: f.x + p.x * c - p.y * s, y: f.y + p.x * s + p.y * c };
}

/** A strip of the given thickness along a-b, on the plan. */
function band(a: Vec2, b: Vec2, thick: number): Vec2[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: (-(b.y - a.y) / len) * (thick / 2), y: ((b.x - a.x) / len) * (thick / 2) };
  return [
    { x: a.x + n.x, y: a.y + n.y },
    { x: b.x + n.x, y: b.y + n.y },
    { x: b.x - n.x, y: b.y - n.y },
    { x: a.x - n.x, y: a.y - n.y },
  ];
}

/**
 * What stops you walking: the fence runs (to the fence's height) and the net between its
 * posts (to the height at the posts), as outlines on the plan.
 */
export function courtBarriers(f: Furniture): { poly: Vec2[]; top: number }[] {
  const out = fenceRuns(f).map(([a, b]) => ({ poly: band(toPlan(f, a), toPlan(f, b), 0.1), top: f.height }));
  const p = COURT.posts / 2;
  out.push({ poly: band(toPlan(f, { x: -p, y: 0 }), toPlan(f, { x: p, y: 0 }), 0.1), top: COURT.netPost });
  return out;
}

/** Where to put the fence posts along a run: both ends, and no more than 3 m apart. */
export function fencePosts(a: Vec2, b: Vec2): Vec2[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / 3));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}
