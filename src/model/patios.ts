// Patios, decks and gravel: flat areas outside, drawn as polygons. Where one is drawn over
// the house (e.g. up against a wall) the house's outline is cut out of it, so it always
// stops at the outside face of the walls.

import { type Shape, subtract } from './clip';
import { type Vec2, pointInPolygon, polygonArea } from './geom';
import { outerFaces } from './roof';
import type { Level, Patio, PatioSurface } from './types';

export const PATIO_DEFAULTS: Record<PatioSurface, { height: number; module: number }> = {
  // 600 mm slabs, laid a little above the ground.
  paving: { height: 0.04, module: 0.6 },
  // 145 mm boards on a frame: a single step up.
  decking: { height: 0.15, module: 0.145 },
  gravel: { height: 0.02, module: 0 },
};

/** Patios higher than this are raised decks (e.g. on a flat roof) and are not cut by the walls. */
const CUT_BELOW = 1;

export function addPatio(level: Level, points: Vec2[], surface: PatioSurface): Patio {
  const id = `pt${level.nextId++}`;
  let pts = points.map((p) => ({ x: p.x, y: p.y }));
  if (polygonArea(pts) < 0) pts = pts.reverse();
  const patio: Patio = { id, points: pts, surface, angle: 0, ...PATIO_DEFAULTS[surface] };
  level.patios ??= {};
  level.patios[id] = patio;
  return patio;
}

/** Change a patio's surface, taking that surface's usual height and module. */
export function setPatioSurface(patio: Patio, surface: PatioSurface) {
  patio.surface = surface;
  Object.assign(patio, PATIO_DEFAULTS[surface]);
}

/** The patio's actual extent: its outline minus the house (outer ring first, then holes). */
export function patioShapes(level: Level, patio: Patio): Shape[] {
  if (patio.points.length < 3) return [];
  const house = patio.height < CUT_BELOW ? outerFaces(level).map((ring) => [ring]) : [];
  return subtract(patio.points, house).filter((s) => s[0].length >= 3);
}

/** Area covered, in m². */
export function patioArea(level: Level, patio: Patio): number {
  let a = 0;
  for (const shape of patioShapes(level, patio)) {
    shape.forEach((ring, i) => (a += Math.abs(polygonArea(ring)) * (i ? -1 : 1)));
  }
  return a;
}

/** The topmost patio at p, if any. */
export function patioAt(level: Level, p: Vec2): string | undefined {
  const list = Object.values(level.patios ?? {}).filter((pt) => pointInPolygon(p, pt.points));
  list.sort((a, b) => b.height - a.height);
  return list[0]?.id;
}
