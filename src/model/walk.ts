// Walking physics for the walk-through, kept free of any rendering code so it can be tested.
//
// The walker is a circle with a foot height. Every floor (minus its stairwells) and every
// stair tread is a surface; the walker stands on the highest surface under them that is
// no more than a step above their feet. So stairs are climbed simply by walking onto them,
// and walking off the top lands on the next floor. Walls of the storey the walker is on,
// and stair steps too high to step onto, block movement.

import { levelElevation } from './building';
import { Vec2, pointInPolygon } from './geom';
import { computeFootprints, type Footprint } from './joints';
import { openingsOf } from './openings';
import { detectRooms } from './rooms';
import { stairGeometry, stairwells } from './stairs';
import type { Building, Plan } from './types';

export const RADIUS = 0.25;
/** Highest step the walker climbs without noticing (a stair riser is at most 0.19). */
export const STEP_UP = 0.35;
/**
 * Largest drop the walker will step down. Anything deeper (the open side of a stair, the
 * edge of a stairwell) stops them, as a handrail would, instead of letting them fall.
 */
export const STEP_DOWN = 0.4;
const HEAD = 1.8;

/** A wall piece the walker collides with, in wall-local coordinates. */
interface Collider {
  fp: Footprint;
  u0: number;
  u1: number;
}

interface Surface {
  poly: Vec2[];
  holes: Vec2[][];
  z: number;
}

/** Something solid from `bottom` up to `top` (a stair step). */
interface Block {
  poly: Vec2[];
  bottom: number;
  top: number;
}

export class WalkWorld {
  private levels: { id: string; elevation: number; colliders: Collider[] }[] = [];
  private surfaces: Surface[] = [];
  private blocks: Block[] = [];

  constructor(b: Building) {
    b.levels.forEach((level, i) => {
      const elevation = levelElevation(b, level.id);
      this.levels.push({ id: level.id, elevation, colliders: buildColliders(level) });
      const below = b.levels[i - 1];
      const holes = below ? stairwells(below).map((shape) => shape[0]) : [];
      for (const r of detectRooms(level)) this.surfaces.push({ poly: r.polygon, holes, z: elevation + 0.005 });
      for (const s of Object.values(level.stairs ?? {})) {
        for (const t of stairGeometry(s, level.height).treads) {
          this.surfaces.push({ poly: t.poly, holes: [], z: elevation + t.top });
          this.blocks.push({ poly: t.poly, bottom: elevation, top: elevation + t.top });
        }
      }
    });
  }

  /** The height the walker stands at, at p, given their current foot height. */
  groundAt(p: Vec2, foot: number): number {
    let best = 0; // open ground outside the building
    for (const s of this.surfaces) {
      if (s.z > foot + STEP_UP || s.z <= best) continue;
      if (pointInPolygon(p, s.poly) && !s.holes.some((h) => pointInPolygon(p, h))) best = s.z;
    }
    return best;
  }

  /** The storey whose floor is (within a step of) height `foot`, if any. */
  levelStandingOn(foot: number): string | undefined {
    return this.levels.find((l) => Math.abs(foot - l.elevation) < STEP_UP)?.id;
  }

  /** The storey whose walls apply to someone standing at `foot`. */
  levelAt(foot: number): string | undefined {
    let id = this.levels[0]?.id;
    for (const l of this.levels) if (l.elevation <= foot + 0.5) id = l.id;
    return id;
  }

  private blocked(p: Vec2, foot: number): boolean {
    return this.blocks.some(
      (b) => b.top > foot + STEP_UP && b.bottom < foot + HEAD && pointInPolygon(p, b.poly),
    );
  }

  /** Move from p by d, sliding along walls and stair sides; returns the new position and foot height. */
  move(p: Vec2, foot: number, d: Vec2): { p: Vec2; foot: number } {
    const steps = Math.max(1, Math.ceil(Math.hypot(d.x, d.y) / 0.05));
    let cur = { ...p };
    for (let i = 0; i < steps; i++) {
      const sx = d.x / steps;
      const sy = d.y / steps;
      const tries = [
        { x: cur.x + sx, y: cur.y + sy },
        { x: cur.x + sx, y: cur.y },
        { x: cur.x, y: cur.y + sy },
      ];
      const colliders = this.levels.find((l) => l.id === this.levelAt(foot))?.colliders ?? [];
      for (const t of tries) {
        for (let iter = 0; iter < 3; iter++) for (const c of colliders) pushOut(t, c);
        if (this.blocked(t, foot)) continue;
        const ground = this.groundAt(t, foot);
        if (ground < foot - STEP_DOWN) continue;
        cur = t;
        foot = ground;
        break;
      }
    }
    return { p: cur, foot };
  }
}

/** Solid stretches of wall: everything except door openings. */
function buildColliders(plan: Plan): Collider[] {
  const out: Collider[] = [];
  for (const fp of computeFootprints(plan).values()) {
    const u0 = Math.min(fp.uL0, fp.uR0);
    const u1 = Math.max(fp.uL1, fp.uR1);
    let cursor = u0;
    for (const o of openingsOf(plan, fp.wallId)) {
      if (o.kind !== 'door') continue;
      out.push({ fp, u0: cursor, u1: o.offset - o.width / 2 });
      cursor = o.offset + o.width / 2;
    }
    out.push({ fp, u0: cursor, u1 });
  }
  return out.filter((c) => c.u1 > c.u0);
}

/** Push a circle of RADIUS at p out of a wall piece (rectangle in wall-local coordinates). */
function pushOut(p: Vec2, c: Collider) {
  const { fp } = c;
  const rx = p.x - fp.a.x;
  const ry = p.y - fp.a.y;
  const u = rx * fp.dir.x + ry * fp.dir.y;
  const v = rx * fp.n.x + ry * fp.n.y;
  const half = fp.thickness / 2;
  const cu = Math.max(c.u0, Math.min(c.u1, u));
  const cv = Math.max(-half, Math.min(half, v));
  let du = u - cu;
  let dv = v - cv;
  const d = Math.hypot(du, dv);
  if (d >= RADIUS) return;
  if (d > 1e-9) {
    du = (du / d) * (RADIUS - d);
    dv = (dv / d) * (RADIUS - d);
  } else {
    // Centre inside the wall: leave by the nearest face.
    const pen = [
      { du: c.u0 - RADIUS - u, dv: 0 },
      { du: c.u1 + RADIUS - u, dv: 0 },
      { du: 0, dv: -half - RADIUS - v },
      { du: 0, dv: half + RADIUS - v },
    ].sort((a, b) => Math.abs(a.du) + Math.abs(a.dv) - (Math.abs(b.du) + Math.abs(b.dv)))[0];
    du = pen.du;
    dv = pen.dv;
  }
  p.x += du * fp.dir.x + dv * fp.n.x;
  p.y += du * fp.dir.y + dv * fp.n.y;
}
