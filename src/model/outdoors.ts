// Which floor a garden thing belongs on. The garden is on the ground floor (the first in
// the list), so something put down outside the building while an upper floor is being
// edited goes there instead of floating at that floor's height. Things that are only ever
// in the garden (a tennis court, a vineyard, a pond) always go there.

import { levelBelow, migrate } from './building';
import { catalogueItem } from './furniture';
import { type Vec2, pointInPolygon } from './geom';
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
