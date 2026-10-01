// Where stairs pass through floors. A stair may climb more than one storey (a spiral up
// through two floors to a roof room, or an outside stair to an upper door), so the hole each
// floor and ceiling needs comes from every stair that passes its height, on whatever floor.

import { levelElevation } from './building';
import { type Shape, unionAll } from './clip';
import { type Vec2, pointInPolygon } from './geom';
import { outerFaces } from './roof';
import { type StairGeometry, placedStair, stairRise } from './stairs';
import type { Building, Level, Stair } from './types';

export interface PlacedStair {
  level: Level;
  stair: Stair;
  g: StairGeometry;
  /** Heights of its foot and its top, above the ground. */
  z0: number;
  z1: number;
}

export function allStairs(b: Building): PlacedStair[] {
  return b.levels.flatMap((level) => {
    const e = levelElevation(b, level.id);
    return Object.values(level.stairs ?? {}).map((stair) => {
      const g = placedStair(stair, level);
      return { level, stair, g, z0: e + g.base, z1: e + g.base + stairRise(stair, level) };
    });
  });
}

/** Stairs whose top end is inside the floor's outline (not out in the garden beside it). */
function within(stairs: PlacedStair[], level: Level): PlacedStair[] {
  const rings = outerFaces(level);
  return stairs.filter((s) => {
    const p = s.g.path.at(-1)!;
    return rings.some((r) => pointInPolygon(p, r));
  });
}

/**
 * The holes the floor (or ceiling) of `level` at height z needs: every stair inside its
 * outline that climbs from below it to it or past it.
 */
export function holesAt(stairs: PlacedStair[], z: number, level: Level): Shape[] {
  return unionAll(within(stairs, level).filter((s) => s.z0 < z - 0.05 && s.z1 >= z - 0.05).flatMap((s) => s.g.parts));
}

/** Where stairs come out onto the floor of `level` at height z (the gap in the balustrade round the hole). */
export function exitsAt(stairs: PlacedStair[], z: number, level: Level): Vec2[] {
  return within(stairs, level).filter((s) => s.z0 < z - 0.05 && Math.abs(s.z1 - z) < 0.1).map((s) => s.g.path.at(-1)!);
}
