// Patios, decks, gravel and rubber floors: flat areas, drawn as polygons. Where one is drawn
// over the house (e.g. up against a wall) the house's outline is cut out of it, so it always
// stops at the outside face of the walls; one drawn inside a room (rubber tiles over a garage
// floor) is a floor covering instead, and stops at the walls round it.

import { type Shape, subtract } from './clip';
import { type Vec2, dist, pointInPolygon, polygonArea, projectOnSegment } from './geom';
import { computeFootprints } from './joints';
import { outerFaces, outsetLoop } from './roof';
import type { Level, Patio, PatioSurface } from './types';

export const PATIO_DEFAULTS: Record<PatioSurface, { height: number; module: number }> = {
  // 600 mm slabs, laid a little above the ground.
  paving: { height: 0.04, module: 0.6 },
  // 145 mm boards on a frame: a single step up.
  decking: { height: 0.15, module: 0.145 },
  gravel: { height: 0.02, module: 0 },
  // Interlocking rubber tiles (garage, gym or play area), 500 mm square, 20 mm thick.
  rubber: { height: 0.02, module: 0.5 },
  // Mown grass, level with the ground: the module is the width of the mowing stripes.
  lawn: { height: 0.01, module: 0.8 },
  // A swimming pool: its floor this far below the ground (the water a little below the edge).
  pool: { height: -1.5, module: 0 },
  // A stone balcony slab, cantilevered from the wall at the level of the floor it is drawn on.
  balcony: { height: 0, module: 0.6 },
  // A landing indoors (a gallery over a double-height space, or at the head of a stair):
  // boarded, at this floor's level, with a balustrade round its open edges.
  landing: { height: 0.02, module: 0.145 },
};

/** How thick a balcony's slab is. */
export const BALCONY_SLAB = 0.15;

/** The stone coping round a pool's edge, and how far the water lies below it. */
export const POOL_COPING = 0.3;
export const POOL_WATER = 0.15;

/** Patios higher than this are raised decks (e.g. on a flat roof) and are not cut by the walls. */
const CUT_BELOW = 1;

export function addPatio(level: Level, points: Vec2[], surface: PatioSurface): Patio {
  const id = `pt${level.nextId++}`;
  let pts = points.map((p) => ({ x: p.x, y: p.y }));
  if (polygonArea(pts) < 0) pts = pts.reverse();
  const patio: Patio = { id, points: pts, surface, angle: 0, ...PATIO_DEFAULTS[surface] };
  level.patios ??= {};
  level.patios[id] = patio;
  // A balcony comes with a wrought-iron railing.
  if (surface === 'balcony' || surface === 'landing') patio.guard = 'iron';
  return patio;
}

/** Change a patio's surface, taking that surface's usual height and module. */
export function setPatioSurface(patio: Patio, surface: PatioSurface) {
  patio.surface = surface;
  Object.assign(patio, PATIO_DEFAULTS[surface]);
  if ((surface === 'balcony' || surface === 'landing') && !patio.guard) patio.guard = 'iron';
}

/** How wide a grass bank down to a sunken area is: a 1 in 3 slope, at least half a metre. */
export function bankWidth(depth: number): number {
  return Math.max(0.5, depth * 3);
}

/** Is this patio a sunken area with banks (on a floor at the ground, `ground` its height there)? */
export function banked(pt: Patio, ground = 0): boolean {
  return pt.edge === 'bank' && pt.surface !== 'pool' && pt.height < ground - 0.005;
}

/** The outline of a banked sunken area with its banks: its drawn outline grown by their width. */
export function bankOutline(pt: Patio, ground = 0): Vec2[] {
  const w = bankWidth(ground - pt.height);
  const ccw = polygonArea(pt.points) < 0 ? [...pt.points].reverse() : pt.points;
  return outsetLoop(ccw, ccw.map(() => w));
}

/**
 * Does the side p-q of a sunken area open straight onto another at about the same level (a
 * sunken patio meeting sunken gravel)? Then it needs neither a retaining wall nor a bank.
 * `others` are the floor's patios; the side's outward direction is found from `inside`, a
 * point of the area itself.
 */
export function opensOnto(others: Patio[], self: Patio, p: Vec2, q: Vec2, outward: Vec2): boolean {
  const len = Math.hypot(outward.x, outward.y) || 1;
  const probe = { x: (p.x + q.x) / 2 + (outward.x / len) * 0.1, y: (p.y + q.y) / 2 + (outward.y / len) * 0.1 };
  return others.some(
    (o) => o !== self && o.surface !== 'pool' && o.surface !== 'lawn' && o.points.length >= 3 && Math.abs(o.height - self.height) < 0.05 && pointInPolygon(probe, o.points),
  );
}

/** The patio's actual extent: its outline minus the house (outer ring first, then holes). */
/**
 * `banks`: the outlines of sunken areas' banks on this floor, exactly (from `bankRings`), for
 * a lawn to stop at; without them, a lawn stops at an outline near enough for the plan.
 */
export function patioShapes(level: Level, patio: Patio, banks?: Vec2[][]): Shape[] {
  if (patio.points.length < 3) return [];
  if (patio.height >= CUT_BELOW) return subtract(patio.points, []).filter((s) => s[0].length >= 3);
  // Drawn inside the house (rubber over a garage floor, say), it is a floor covering and only
  // the walls cut it; outside, it stops at the house.
  const outer = outerFaces(level);
  const indoors = outer.some((ring) => patio.points.every((p) => pointInPolygon(p, ring)));
  const cut = indoors ? [...computeFootprints(level).values()].map((fp) => [fp.polygon]) : outer.map((ring) => [ring]);
  // A lawn stops at the patios, paths and beds laid in it.
  if (patio.surface === 'lawn') {
    for (const other of Object.values(level.patios ?? {})) {
      if (other.id !== patio.id && other.surface !== 'lawn' && other.height < CUT_BELOW && other.points.length >= 3) {
        // A sunken area with banks takes its banks out of the lawn too.
        cut.push([banked(other) && !banks ? bankOutline(other) : other.points]);
      }
    }
    for (const ring of banks ?? []) cut.push([ring]);
  }
  return subtract(patio.points, cut).filter((s) => s[0].length >= 3);
}

/** Area covered, in m². */
export function patioArea(level: Level, patio: Patio): number {
  let a = 0;
  for (const shape of patioShapes(level, patio)) {
    shape.forEach((ring, i) => (a += Math.abs(polygonArea(ring)) * (i ? -1 : 1)));
  }
  return a;
}

/** Is the edge a–b against the house (where a railing isn't needed)? */
export function alongHouse(house: Vec2[][], a: Vec2, b: Vec2, tol = 0.05): boolean {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return house.some((h) =>
    h.some((p, k) => {
      const q = h[(k + 1) % h.length];
      if (projectOnSegment(m, p, q).dist >= tol) return false;
      // Further off than touching, it must at least run alongside the wall.
      const wl = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return tol <= 0.05 || Math.abs(((b.x - a.x) * (q.y - p.y) - (b.y - a.y) * (q.x - p.x)) / (len * wl)) < 0.1;
    }),
  );
}

/**
 * The railing setting for the stretch a-b of the patio's outline: that of the drawn side it
 * lies on ('on' or 'off'), or undefined to decide automatically.
 */
export function railSideOf(patio: Patio, a: Vec2, b: Vec2): 'on' | 'off' | undefined {
  const sides = patio.railSides;
  if (!sides?.length) return undefined;
  const n = patio.points.length;
  for (let k = 0; k < n; k++) {
    const s = sides[k];
    if (s !== 'on' && s !== 'off') continue;
    const p = patio.points[k];
    const q = patio.points[(k + 1) % n];
    // On that side, or cut back from it a little by the wall it was drawn on, running the same way.
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const run = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const sin = Math.abs(((q.x - p.x) * (b.y - a.y) - (q.y - p.y) * (b.x - a.x)) / (len * run));
    if (sin < 0.05 && projectOnSegment(a, p, q).dist < 0.3 && projectOnSegment(b, p, q).dist < 0.3) return s;
  }
  return undefined;
}

/** Length of the patio's railing: round its open edges, not along the house (unless set otherwise). */
export function guardLength(level: Level, patio: Patio): number {
  const house = outerFaces(level);
  let len = 0;
  for (const shape of patioShapes(level, patio)) {
    const ring = shape[0];
    ring.forEach((p, k) => {
      const q = ring[(k + 1) % ring.length];
      const set = railSideOf(patio, p, q);
      if (set === 'on' || (set !== 'off' && !alongHouse(house, p, q))) len += dist(p, q);
    });
  }
  return len;
}

/** The topmost patio at p, if any. */
export function patioAt(level: Level, p: Vec2): string | undefined {
  const list = Object.values(level.patios ?? {}).filter((pt) => pointInPolygon(p, pt.points));
  list.sort((a, b) => b.height - a.height);
  return list[0]?.id;
}
