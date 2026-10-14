// Which floor a garden thing belongs on. The garden is on the ground floor (the first in
// the list), so something put down outside the building while an upper floor is being
// edited goes there instead of floating at that floor's height. Things that are only ever
// in the garden (a tennis court, a vineyard, a pond) always go there.

import { levelBelow, migrate } from './building';
import { catalogueItem } from './furniture';
import { type Vec2, pointInPolygon, projectOnSegment } from './geom';
import { patioAt } from './patios';
import { outerFaces } from './roof';
import type { Building, Level } from './types';

/**
 * Whether p is somewhere on this floor you could stand: inside its rooms, on one of its
 * patios or balconies, or on the roof of the floor below (a roof terrace).
 */
export function standsOn(b: Building, level: Level, p: Vec2): boolean {
  if (outerFaces(level).some((f) => pointInPolygon(p, f))) return true;
  if (patioAt(level, p)) return true;
  const below = levelBelow(b, level.id);
  return !!below && outerFaces(below).some((f) => pointInPolygon(p, f));
}

/**
 * The floor a garden piece of furniture (kind) or a tree (kind undefined) put down at p
 * belongs on, from the floor being edited: that floor, or the ground floor.
 */
export function gardenLevel(b: Building, level: Level, p: Vec2, kind?: string): Level {
  const ground = b.levels[0];
  if (!ground || level.id === ground.id) return level;
  const c = kind ? catalogueItem(kind) : undefined;
  if (c?.groundOnly) return ground;
  if (kind && c?.category !== 'Garden') return level;
  return standsOn(b, level, p) ? level : ground;
}

/** Move things that only belong in the garden down to the ground floor (for older drawings). */
export function groundGardenOnly(b: Building) {
  const ground = b.levels[0];
  if (!ground) return;
  for (const l of b.levels.slice(1)) {
    for (const [id, f] of Object.entries(l.furniture ?? {})) {
      if (!catalogueItem(f.kind)?.groundOnly) continue;
      delete l.furniture![id];
      const nid = `f${ground.nextId++}`;
      ground.furniture ??= {};
      ground.furniture[nid] = { ...f, id: nid };
    }
  }
}

/** An opened drawing, brought up to date: see migrate in building.ts, and the garden above. */
export function openDrawing(data: unknown): Building {
  const b = migrate(data);
  groundGardenOnly(b);
  return b;
}

/** How far clear of the building something must be to count as in the garden. */
const CLEAR = 0.5;

/**
 * Whether a line drawn on an upper floor (a wall, a hedge or fence, the outline of a patio)
 * is out in the garden: every part of it clear of the building, meaning not over any floor
 * of it, not near any wall above the ground floor, and not on one of this floor's patios.
 * A wall or balcony on or against the building stays on the floor it is drawn on.
 */
export function inGarden(b: Building, level: Level, pts: Vec2[], closed = false): boolean {
  const ground = b.levels[0];
  if (!ground || level.id === ground.id || pts.length < 1) return false;
  const faces = b.levels.flatMap((l) => outerFaces(l));
  const walls = b.levels.slice(1).flatMap((l) =>
    Object.values(l.walls).map((w) => ({ a: l.nodes[w.a], b: l.nodes[w.b], r: w.thickness / 2 + CLEAR })),
  );
  const near = (p: Vec2) =>
    faces.some((f) => pointInPolygon(p, f) || f.some((q, i) => projectOnSegment(p, q, f[(i + 1) % f.length]).dist < CLEAR)) ||
    walls.some((w) => w.a && w.b && projectOnSegment(p, w.a, w.b).dist < w.r) ||
    !!patioAt(level, p);
  // Every 25 cm along the line.
  const runs = closed ? pts.map((p, i) => [p, pts[(i + 1) % pts.length]]) : pts.slice(1).map((p, i) => [pts[i], p]);
  if (!runs.length) return !near(pts[0]);
  for (const [a, c] of runs) {
    const n = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / 0.25));
    for (let i = 0; i <= n; i++) if (near({ x: a.x + ((c.x - a.x) * i) / n, y: a.y + ((c.y - a.y) * i) / n })) return false;
  }
  return true;
}
