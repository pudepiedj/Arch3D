// Polygon boolean operations (union / difference), via the polygon-clipping library.

import * as ns from 'polygon-clipping';
import type { MultiPolygon, Polygon, Ring } from 'polygon-clipping';
import type { Vec2 } from './geom';

// The package's types declare named exports, but its ES build only has a default export.
const pc = ((ns as unknown as { default?: typeof ns }).default ?? ns) as typeof ns;

/** A polygon with holes: outer ring first. Rings are open (first point not repeated). */
export type Shape = Vec2[][];

// Snap to a 0.1 micron grid: the library can fail on points that differ only by rounding noise.
const snap = (v: number) => Math.round(v * 1e7) / 1e7;
const toRing = (pts: Vec2[]): Ring => pts.map((p) => [snap(p.x), snap(p.y)] as [number, number]);

function fromMulti(m: MultiPolygon): Shape[] {
  return m.map((poly) =>
    poly.map((ring) => {
      const pts = ring.map(([x, y]) => ({ x, y }));
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (pts.length > 1 && first.x === last.x && first.y === last.y) pts.pop();
      return pts;
    }),
  );
}

/** Union of simple polygons. */
export function unionAll(polys: Vec2[][]): Shape[] {
  if (!polys.length) return [];
  const geoms: Polygon[] = polys.map((p) => [toRing(p)]);
  return fromMulti(pc.union(geoms[0], ...geoms.slice(1)));
}

/** A simple polygon minus a set of shapes (which may stick out past it). */
export function subtract(poly: Vec2[], cut: Shape[]): Shape[] {
  if (!cut.length) return [[poly]];
  const clips: Polygon[] = cut.map((s) => s.map(toRing));
  return fromMulti(pc.difference([toRing(poly)], ...clips));
}

/** Intersection of two simple polygons. */
export function intersectAll(a: Vec2[], b: Vec2[]): Shape[] {
  return fromMulti(pc.intersection([toRing(a)], [toRing(b)]));
}
