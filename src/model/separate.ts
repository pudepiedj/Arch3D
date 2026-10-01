// Giving one building its own floor. When two houses (and the courtyard between them) are
// drawn on one floor, they share its height and anything added on top of it; moving one
// house onto a floor of its own lets it have its own floor level (a plinth, half below
// ground) and its own floors on top. What moves is the building inside a box: walls wholly
// inside it, with their doors and windows, and the stairs, pillars, furniture, roof
// sections and roof items within it. The garden (patios, trees, hedges, drains) stays.

import { createLevel, levelElevation } from './building';
import type { Box } from './copyarea';
import type { Vec2 } from './geom';
import { normalize } from './plan';
import type { Building, Level } from './types';

const isIn = (p: Vec2, box: Box) => p.x >= box.x0 - 0.01 && p.x <= box.x1 + 0.01 && p.y >= box.y0 - 0.01 && p.y <= box.y1 + 0.01;

/**
 * Move the building inside `box` on `source` to a new floor called `name`, at the same
 * height as `source` to start with, placed just after it in the list. Returns the new floor,
 * or null if there were no walls in the box.
 */
export function moveToOwnFloor(b: Building, source: Level, box: Box, name: string): Level | null {
  const walls = Object.values(source.walls).filter((w) => isIn(source.nodes[w.a], box) && isIn(source.nodes[w.b], box));
  if (!walls.length) return null;
  const level = createLevel(b, name, source.height);
  level.slab = source.slab;
  level.base = levelElevation(b, source.id);
  // Keep the ids as they are, and carry on numbering from where the source had got to, so
  // nothing moved clashes with anything added later.
  level.nextId = source.nextId;
  if (source.roof) level.roof = structuredClone(source.roof);

  const moved = new Set(walls.map((w) => w.id));
  for (const w of walls) {
    level.walls[w.id] = w;
    for (const id of [w.a, w.b]) level.nodes[id] = { ...source.nodes[id] };
    delete source.walls[w.id];
  }
  // Joints still used by the walls left behind stay there too (a copy goes with the building).
  const used = new Set(Object.values(source.walls).flatMap((w) => [w.a, w.b]));
  for (const id of Object.keys(level.nodes)) if (!used.has(id)) delete source.nodes[id];
  for (const o of Object.values(source.openings)) {
    if (!moved.has(o.wallId)) continue;
    level.openings[o.id] = o;
    delete source.openings[o.id];
  }

  type Placed = Vec2 & { id: string };
  const take = (key: 'stairs' | 'pillars' | 'chimneys' | 'solar' | 'rooflights' | 'furniture') => {
    const src = source as unknown as Record<string, Record<string, Placed> | undefined>;
    const dst = level as unknown as Record<string, Record<string, Placed> | undefined>;
    for (const item of Object.values(src[key] ?? {})) {
      if (!isIn(item, box)) continue;
      (dst[key] ??= {})[item.id] = item;
      delete src[key]![item.id];
    }
  };
  take('stairs');
  take('pillars');
  take('chimneys');
  take('solar');
  take('rooflights');
  take('furniture');
  for (const s of Object.values(source.roofSections ?? {})) {
    if (!s.points.every((p) => isIn(p, box))) continue;
    (level.roofSections ??= {})[s.id] = s;
    delete source.roofSections![s.id];
  }
  const inBox = <T extends Vec2>(list: T[] | undefined) => (list ?? []).filter((p) => isIn(p, box));
  const outBox = <T extends Vec2>(list: T[] | undefined) => (list ?? []).filter((p) => !isIn(p, box));
  if (source.roofAreas?.length) {
    level.roofAreas = inBox(source.roofAreas);
    source.roofAreas = outBox(source.roofAreas);
  }
  if (source.floorFinishes?.length) {
    level.floorFinishes = inBox(source.floorFinishes);
    source.floorFinishes = outBox(source.floorFinishes);
  }

  normalize(source);
  normalize(level);
  b.levels.splice(b.levels.indexOf(source) + 1, 0, level);
  // Floors that stacked on top of the source still do, not on the new one.
  const next = b.levels[b.levels.indexOf(level) + 1];
  if (next && next.base === undefined) next.base = levelElevation(b, source.id) + source.height;
  return level;
}
