// Patios, decks, gravel and rubber floors: flat areas, drawn as polygons. Where one is drawn
// over the house (e.g. up against a wall) the house's outline is cut out of it, so it always
// stops at the outside face of the walls; one drawn inside a room (rubber tiles over a garage
// floor) is a floor covering instead, and stops at the walls round it.

import { type Shape, subtract } from './clip';
import { type Vec2, pointInPolygon, polygonArea } from './geom';
import { computeFootprints } from './joints';
import { outerFaces } from './roof';
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
  if (patio.height >= CUT_BELOW) return subtract(patio.points, []).filter((s) => s[0].length >= 3);
  // Drawn inside the house (rubber over a garage floor, say), it is a floor covering and only
  // the walls cut it; outside, it stops at the house.
  const outer = outerFaces(level);
  const indoors = outer.some((ring) => patio.points.every((p) => pointInPolygon(p, ring)));
  const cut = indoors ? [...computeFootprints(level).values()].map((fp) => [fp.polygon]) : outer.map((ring) => [ring]);
  // A lawn stops at the patios, paths and beds laid in it.
  if (patio.surface === 'lawn') {
    for (const other of Object.values(level.patios ?? {})) {
      if (other.id !== patio.id && other.surface !== 'lawn' && other.height < CUT_BELOW && other.points.length >= 3) cut.push([other.points]);
    }
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

/** The topmost patio at p, if any. */
export function patioAt(level: Level, p: Vec2): string | undefined {
  const list = Object.values(level.patios ?? {}).filter((pt) => pointInPolygon(p, pt.points));
  list.sort((a, b) => b.height - a.height);
  return list[0]?.id;
}
