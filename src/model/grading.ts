// How the house meets the ground round it: banks sloping down to a sunken area, and ramps or
// steps from a door down to ground that has been lowered in front of it (a garage onto
// gravel set lower than its floor, a back door onto a sunken patio).

import { levelElevation } from './building';
import { type Vec2, add, pointInPolygon, polygonArea, scale } from './geom';
import { alongHouse, banked, bankWidth, opensOnto, patioShapes } from './patios';
import { outerFaces, outsetLoop } from './roof';
import { computeFootprints, wallPoint } from './joints';
import { faceSides } from './materials';
import type { Building, Level, Patio } from './types';

/** A way down from a door to lower ground in front of it. */
/**
 * A banked sunken area's banks: for each piece of it, its outline, which sides are banked
 * (not those along a wall of any floor), and the outline grown out by the banks' width on
 * those sides. The 3D banks and the hole dug in the ground both come from this.
 */
export function bankRings(b: Building, level: Level, pt: Patio): { inner: Vec2[]; outer: Vec2[]; bank: boolean[] }[] {
  const ground = -levelElevation(b, level.id);
  if (!banked(pt, ground)) return [];
  const w = bankWidth(ground - pt.height);
  const house = b.levels.flatMap((l) => outerFaces(l));
  return patioShapes(level, pt).map((shape) => {
    const inner = polygonArea(shape[0]) < 0 ? [...shape[0]].reverse() : shape[0];
    const others = Object.values(level.patios ?? {});
    const bank = inner.map((p, k) => {
      const q = inner[(k + 1) % inner.length];
      // Outward of a counter-clockwise ring: to the right of p->q.
      return !alongHouse(house, p, q, 0.2) && !opensOnto(others, pt, p, q, { x: q.y - p.y, y: p.x - q.x });
    });
    return { inner, outer: outsetLoop(inner, bank.map((on) => (on ? w : 0))), bank };
  });
}

export interface Approach {
  /** Middle of the doorway on the wall's outside face, and the way out from it. */
  at: Vec2;
  out: Vec2;
  along: Vec2;
  width: number;
  /** How far the ground outside is below the threshold, and how far out the ramp or steps go. */
  drop: number;
  length: number;
  /** The threshold's height above its floor. */
  sill: number;
  kind: 'ramp' | 'steps';
  /** Steps: how many risers. */
  risers: number;
}

/** Steps no higher than this; one going this deep. */
const RISE = 0.18;
const GOING = 0.3;

/**
 * The ramps (in front of garage doors) and steps (in front of other doors, at the floor) a
 * floor needs where the ground outside is lower than the threshold: the garden's patios,
 * lawns and gravel, or the plain ground.
 */
export function approaches(b: Building, level: Level): Approach[] {
  const garden = b.levels[0];
  const ge = levelElevation(b, garden.id);
  const e = levelElevation(b, level.id);
  // The top of whatever is outside at p: the highest patio there, else the ground.
  const groundAt = (p: Vec2) => {
    let top: number | null = null;
    for (const [l, z] of [[garden, ge], [level, e]] as const) {
      for (const pt of Object.values(l.patios ?? {})) {
        if (pt.points.length >= 3 && pointInPolygon(p, pt.points) && (top === null || z + pt.height > top)) top = z + pt.height;
      }
    }
    return top ?? 0;
  };
  const fps = computeFootprints(level);
  const sides = faceSides(level);
  const out: Approach[] = [];
  for (const o of Object.values(level.openings)) {
    if (o.sill > 0.05 || !['garage', 'door', 'glazed', 'open'].includes(o.kind)) continue;
    const fp = fps.get(o.wallId);
    const side = fp && sides.get(fp.wallId);
    if (!fp || !side) continue;
    // Only doors in outside walls: the side that faces outside.
    const s = side.left === 'outside' && side.right !== 'outside' ? 1 : side.right === 'outside' && side.left !== 'outside' ? -1 : 0;
    if (!s) continue;
    const dir = scale(fp.n, s);
    const at = wallPoint(fp, o.offset, (s * fp.thickness) / 2);
    const drop = e + o.sill - groundAt(add(at, scale(dir, 0.4)));
    if (drop < 0.04 || drop > 3) continue;
    const ramp = o.kind === 'garage';
    const risers = Math.max(1, Math.ceil(drop / RISE - 1e-9));
    // A single step down (no higher than a riser) is just the threshold.
    if (!ramp && risers < 2) continue;
    out.push({
      at,
      out: dir,
      along: fp.dir,
      width: o.width + (ramp ? 0.4 : 0.3),
      drop,
      // A ramp at about 1 in 6, at least a metre; steps one going each.
      length: ramp ? Math.max(1, drop * 6) : (risers - 1) * GOING,
      sill: o.sill,
      kind: ramp ? 'ramp' : 'steps',
      risers,
    });
  }
  return out;
}
