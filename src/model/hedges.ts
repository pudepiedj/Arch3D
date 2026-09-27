// Hedges and fences: drawn as a line of points on a floor's plan (normally the ground floor).

import { type Vec2, dist, projectOnSegment } from './geom';
import type { Hedge, HedgeKind, Level } from './types';

export const HEDGE_DEFAULTS: Record<HedgeKind, { height: number; width: number }> = {
  privet: { height: 1.5, width: 0.6 },
  hawthorn: { height: 1.5, width: 0.7 },
  beech: { height: 1.8, width: 0.6 },
  fence: { height: 1.8, width: 0.1 },
};

export const HEDGE_NAMES: Record<HedgeKind, string> = {
  privet: 'Privet hedge',
  hawthorn: 'Hawthorn hedge',
  beech: 'Beech hedge',
  fence: 'Close-board fence',
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

/** A hedge's footprint, one rectangle per run, overlapping at the corners. */
export function hedgeFootprints(h: Hedge): Vec2[][] {
  return hedgeSegments(h).map(([a, b]) => {
    const L = dist(a, b);
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    const hw = h.width / 2;
    const e = hw; // run on past the ends by half the thickness, to fill the corners
    const p = (s: number, t: number) => ({ x: a.x + ux * s - uy * t, y: a.y + uy * s + ux * t });
    return [p(-e, -hw), p(L + e, -hw), p(L + e, hw), p(-e, hw)];
  });
}
