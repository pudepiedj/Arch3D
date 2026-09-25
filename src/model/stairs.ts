// Stairs are stored as a few numbers (start point, direction, width, shape). The steps,
// the landing, the walking line and the hole it needs in the floor above are all
// computed from those and the floor-to-floor height, so editing the storey height or the
// stair's shape always gives a buildable, consistent stair.

import { type Shape, unionAll } from './clip';
import { Vec2, add, perp, pointInPolygon, scale, vec } from './geom';
import type { Level, Stair, StairShape } from './types';

/** Building-regulation-style limits: no step higher than this. */
export const MAX_RISER = 0.19;
export const DEFAULT_GOING = 0.25;
export const DEFAULT_STAIR_WIDTH = 0.9;

export interface Tread {
  /** Plan outline of the step (a landing is one big step). */
  poly: Vec2[];
  /** Height of its top above the stair's own floor. */
  top: number;
  landing?: boolean;
}

export interface StairGeometry {
  risers: number;
  /** Height of each step. */
  rise: number;
  treads: Tread[];
  /** Flights and landings as rectangles (their union is the stairwell). */
  parts: Vec2[][];
  /** Walking line from bottom to top, for the arrow on the plan. */
  path: Vec2[];
}

export function riserCount(floorToFloor: number): number {
  return Math.max(2, Math.ceil(floorToFloor / MAX_RISER - 1e-9));
}

/**
 * Lay out a stair rising `height`. In the stair's local frame u runs up the first flight
 * and v across it; everything is then placed at (x, y) turned by `angle`.
 */
export function stairGeometry(s: Stair, height: number): StairGeometry {
  const n = riserCount(height);
  const r = height / n;
  const g = s.going;
  const w = s.width;
  // The last riser steps onto the floor above, so there is one tread fewer than risers.
  const treads: Tread[] = [];
  const parts: Vec2[][] = [];
  const path: Vec2[] = [];
  const rect = (u0: number, u1: number, v0: number, v1: number) => [vec(u0, v0), vec(u1, v0), vec(u1, v1), vec(u0, v1)];
  // Screen y points down, so "left" as you walk up is the -v side.
  const side = s.turn === 'right' ? 1 : -1;

  if (s.shape === 'straight') {
    const k = n - 1;
    for (let i = 0; i < k; i++) treads.push({ poly: rect(i * g, (i + 1) * g, -w / 2, w / 2), top: (i + 1) * r });
    parts.push(rect(0, k * g, -w / 2, w / 2));
    path.push(vec(0, 0), vec(k * g, 0));
  } else {
    // Two flights around one landing; the landing counts as a tread.
    const k1 = Math.floor((n - 2) / 2);
    const k2 = n - 2 - k1;
    for (let i = 0; i < k1; i++) treads.push({ poly: rect(i * g, (i + 1) * g, -w / 2, w / 2), top: (i + 1) * r });
    parts.push(rect(0, k1 * g, -w / 2, w / 2));
    const lu = k1 * g;
    const landTop = (k1 + 1) * r;
    if (s.shape === 'L') {
      // Square landing, then the second flight turns 90 degrees.
      const land = rect(lu, lu + w, -w / 2, w / 2);
      treads.push({ poly: land, top: landTop, landing: true });
      parts.push(land);
      const v0 = (side * w) / 2;
      for (let j = 0; j < k2; j++) {
        const a = v0 + side * j * g;
        const b = v0 + side * (j + 1) * g;
        treads.push({ poly: rect(lu, lu + w, Math.min(a, b), Math.max(a, b)), top: landTop + (j + 1) * r });
      }
      const end = v0 + side * k2 * g;
      parts.push(rect(lu, lu + w, Math.min(v0, end), Math.max(v0, end)));
      path.push(vec(0, 0), vec(lu + w / 2, 0), vec(lu + w / 2, end));
    } else {
      // U: a landing across both flights, then the second flight comes back alongside.
      const vOuter = side * (w / 2 + w);
      const land = rect(lu, lu + w, Math.min(-side * (w / 2), vOuter), Math.max(-side * (w / 2), vOuter));
      treads.push({ poly: land, top: landTop, landing: true });
      parts.push(land);
      const vc = side * w; // centre of the return flight
      for (let j = 0; j < k2; j++) {
        treads.push({
          poly: rect(lu - (j + 1) * g, lu - j * g, vc - w / 2, vc + w / 2),
          top: landTop + (j + 1) * r,
        });
      }
      parts.push(rect(lu - k2 * g, lu, vc - w / 2, vc + w / 2));
      path.push(vec(0, 0), vec(lu + w / 2, 0), vec(lu + w / 2, vc), vec(lu - k2 * g, vc));
    }
  }

  const d = vec(Math.cos(s.angle), Math.sin(s.angle));
  const nrm = perp(d);
  const origin = vec(s.x, s.y);
  const place = (p: Vec2) => add(origin, add(scale(d, p.x), scale(nrm, p.y)));
  return {
    risers: n,
    rise: r,
    treads: treads.map((t) => ({ ...t, poly: t.poly.map(place) })),
    parts: parts.map((p) => p.map(place)),
    path: path.map(place),
  };
}

/** The holes the stairs of `level` need in the floor of the level above. */
export function stairwells(level: Level): Shape[] {
  const parts = Object.values(level.stairs ?? {}).flatMap((s) => stairGeometry(s, level.height).parts);
  return unionAll(parts);
}

export function stairAt(level: Level, p: Vec2): string | null {
  for (const s of Object.values(level.stairs ?? {})) {
    if (stairGeometry(s, level.height).parts.some((poly) => pointInPolygon(p, poly))) return s.id;
  }
  return null;
}

export function addStair(level: Level, x: number, y: number, angle: number, shape: StairShape): Stair {
  const s: Stair = {
    id: `s${level.nextId++}`,
    x,
    y,
    angle,
    width: DEFAULT_STAIR_WIDTH,
    going: DEFAULT_GOING,
    shape,
    turn: 'left',
  };
  level.stairs ??= {};
  level.stairs[s.id] = s;
  return s;
}
