// Hedges and fences: drawn as a line of points on a floor's plan (normally the ground floor).

import { type Vec2, dist, projectOnSegment } from './geom';
import { isGate } from './gates';
import type { Hedge, HedgeKind, Level } from './types';

export const HEDGE_DEFAULTS: Record<HedgeKind, { height: number; width: number }> = {
  privet: { height: 1.5, width: 0.6 },
  hawthorn: { height: 1.5, width: 0.7 },
  beech: { height: 1.8, width: 0.6 },
  fence: { height: 1.8, width: 0.1 },
  ditch: { height: 0.9, width: 1.8 },
};

export const HEDGE_NAMES: Record<HedgeKind, string> = {
  privet: 'Privet hedge',
  hawthorn: 'Hawthorn hedge',
  beech: 'Beech hedge',
  fence: 'Close-board fence',
  ditch: 'Drainage ditch',
};

/** Fence posts are no further apart than this. */
export const FENCE_BAY = 1.8;

export function addHedge(level: Level, points: Vec2[], kind: HedgeKind = 'privet'): Hedge {
  const id = `hg${level.nextId++}`;
  const hedge: Hedge = { id, points: points.map((p) => ({ x: p.x, y: p.y })), kind, ...HEDGE_DEFAULTS[kind] };
  level.hedges ??= {};
  level.hedges[id] = hedge;
  return hedge;
}

/** The straight runs of a hedge. */
export function hedgeSegments(h: Hedge): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  for (let i = 0; i + 1 < h.points.length; i++) if (dist(h.points[i], h.points[i + 1]) > 1e-6) out.push([h.points[i], h.points[i + 1]]);
  return out;
}

export function hedgeLength(h: Hedge): number {
  return hedgeSegments(h).reduce((s, [a, b]) => s + dist(a, b), 0);
}

/** Is the hedge a closed loop (its last point on its first)? */
export function hedgeClosed(h: Hedge): boolean {
  return h.points.length > 2 && dist(h.points[0], h.points[h.points.length - 1]) < 1e-6;
}

/** The hedge within `tol` of p (beyond half its thickness), nearest first. */
export function hedgeAt(level: Level, p: Vec2, tol: number): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const h of Object.values(level.hedges ?? {})) {
    for (const [a, b] of hedgeSegments(h)) {
      const d = projectOnSegment(p, a, b).dist - h.width / 2;
      if (d <= tol && d < bestD) {
        bestD = d;
        best = h.id;
      }
    }
  }
  return best;
}

/**
 * A straight stretch of hedge between corners or gates. At a corner it runs on by half its
 * thickness to fill the corner; where it stops at a gate (`openA`, `openB`) it stops square.
 */
export interface HedgeRun {
  a: Vec2;
  b: Vec2;
  openA: boolean;
  openB: boolean;
}

/** The runs of a hedge, less the gaps where gates stand in its line. */
export function hedgeRuns(h: Hedge, level: Level): HedgeRun[] {
  // Gates stand in hedges and fences, not ditches.
  const gates = h.kind === 'ditch' ? [] : Object.values(level.furniture ?? {}).filter((f) => isGate(f.kind));
  const runs: HedgeRun[] = [];
  for (const [a, b] of hedgeSegments(h)) {
    const L = dist(a, b);
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    const at = (s: number) => ({ x: a.x + ux * s, y: a.y + uy * s });
    // The stretches of this run that gates take up, along it.
    const gaps: [number, number][] = [];
    for (const f of gates) {
      const u = (f.x - a.x) * ux + (f.y - a.y) * uy;
      const off = Math.abs(-(f.x - a.x) * uy + (f.y - a.y) * ux);
      const square = Math.abs(Math.sin(f.angle - Math.atan2(uy, ux))) < 0.15;
      if (!square || off > h.width / 2 + 0.2 || u < -f.width / 2 || u > L + f.width / 2) continue;
      gaps.push([u - f.width / 2, u + f.width / 2]);
    }
    gaps.sort((p, q) => p[0] - q[0]);
    let s0 = 0;
    let open0 = false;
    for (const [g0, g1] of gaps) {
      if (g0 > s0 + 0.02) runs.push({ a: at(s0), b: at(Math.min(g0, L)), openA: open0, openB: true });
      if (g1 > s0) {
        s0 = g1;
        open0 = true;
      }
    }
    if (s0 < L - 0.02) runs.push({ a: at(s0), b: b, openA: open0, openB: false });
  }
  return runs;
}

/** A run's rectangle: run on past a corner by half the thickness, square at a gate. */
export function runFootprint(r: HedgeRun, width: number): Vec2[] {
  const L = dist(r.a, r.b);
  const ux = (r.b.x - r.a.x) / L;
  const uy = (r.b.y - r.a.y) / L;
  const hw = width / 2;
  const e0 = r.openA ? 0 : hw;
  const e1 = r.openB ? 0 : hw;
  const p = (s: number, t: number) => ({ x: r.a.x + ux * s - uy * t, y: r.a.y + uy * s + ux * t });
  return [p(-e0, -hw), p(L + e1, -hw), p(L + e1, hw), p(-e0, hw)];
}

/** A hedge's footprint, one rectangle per run, overlapping at the corners, open at gates. */
export function hedgeFootprints(h: Hedge, level: Level): Vec2[][] {
  return hedgeRuns(h, level).map((r) => runFootprint(r, h.width));
}

/**
 * Where a gate goes if set on the hedge or fence nearest p (within reach): on its line,
 * turned to run along it. Null if none is near.
 */
export function onHedge(level: Level, p: Vec2, reach: number): { at: Vec2; angle: number } | null {
  let best: { at: Vec2; angle: number; d: number } | null = null;
  for (const h of Object.values(level.hedges ?? {})) {
    for (const [a, b] of hedgeSegments(h)) {
      const pr = projectOnSegment(p, a, b);
      const d = pr.dist - h.width / 2;
      if (d > reach || (best && d >= best.d)) continue;
      best = { at: pr.point, angle: Math.atan2(b.y - a.y, b.x - a.x), d };
    }
  }
  return best && { at: best.at, angle: best.angle };
}

/**
 * A line of points moved sideways by d (to its left, as it runs), mitred at the corners
 * (within reason) so the two sides of a ditch stay parallel.
 */
export function offsetLine(pts: Vec2[], d: number): Vec2[] {
  const n = pts.length;
  const left = (a: Vec2, b: Vec2) => {
    const L = dist(a, b) || 1;
    return { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
  };
  return pts.map((p, i) => {
    const nPrev = i > 0 ? left(pts[i - 1], p) : null;
    const nNext = i < n - 1 ? left(p, pts[i + 1]) : null;
    const a = nPrev ?? nNext!;
    const b = nNext ?? nPrev!;
    const m = { x: a.x + b.x, y: a.y + b.y };
    const ml = Math.hypot(m.x, m.y) || 1;
    // Mitre length: 1 / cos(half the turn), capped so a hairpin doesn't shoot off.
    const cos = (m.x / ml) * a.x + (m.y / ml) * a.y;
    const k = d / Math.max(0.35, cos);
    return { x: p.x + (m.x / ml) * k, y: p.y + (m.y / ml) * k };
  });
}

/** The ditch's outline at the top of its banks, to cut out of the ground. */
export function ditchOutline(h: Hedge): Vec2[] {
  const pts = dedupe(h.points);
  const l = offsetLine(pts, h.width / 2);
  const r = offsetLine(pts, -h.width / 2);
  return [...l, ...r.reverse()];
}

function dedupe(pts: Vec2[]): Vec2[] {
  return pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 1e-6);
}
