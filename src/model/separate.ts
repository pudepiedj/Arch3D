// Giving one building its own floor. When two houses (and the courtyard between them) are
// drawn on one floor, they share its height and anything added on top of it; moving one
// house onto a floor of its own lets it have its own floor level (a plinth, half below
// ground) and its own floors on top; moving part of a house (a room or two) lets that part be
// set lower or higher (a split level). What moves is what is inside a box: every wall whose
// middle is inside it (walls are already divided where others meet them, so a box drawn a
// little loosely round a room still takes exactly that room's walls, including the wall it
// shares with the next room), with their doors and windows, and the stairs, pillars,
// furniture, roof sections and roof items within it. The garden (patios, trees, hedges,
// drains) stays.

import { createLevel, levelElevation } from './building';
import type { Box } from './copyarea';
import { type Vec2, pointInPolygon } from './geom';
import { normalize } from './plan';
import { detectRooms } from './rooms';
import type { Building, Level } from './types';

const isIn = (p: Vec2, box: Box) => p.x >= box.x0 - 0.01 && p.x <= box.x1 + 0.01 && p.y >= box.y0 - 0.01 && p.y <= box.y1 + 0.01;

/** The walls of `source` that a move with this box would take: those whose middle is inside it. */
export function wallsToMove(source: Level, box: Box): string[] {
  return Object.values(source.walls)
    .filter((w) => {
      const a = source.nodes[w.a];
      const b = source.nodes[w.b];
      return !!a && !!b && isIn({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, box);
    })
    .map((w) => w.id);
}

/**
 * Move the building inside `box` on `source` to a new floor called `name`, at the same
 * height as `source` to start with, placed just after it in the list. Returns the new floor,
 * or null if there were no walls in the box.
 */
export function moveToOwnFloor(b: Building, source: Level, box: Box, name: string): Level | null {
  const walls = wallsToMove(source, box).map((id) => source.walls[id]);
  if (!walls.length) return null;
  // The walls between the part moving and the rooms staying (a room on each side, one
  // inside the box and one not): the rest keeps a party copy of each, to close its rooms.
  const rooms = detectRooms(source);
  const roomAt = (p: Vec2) => rooms.find((r) => pointInPolygon(p, r.polygon));
  const party = walls.filter((w) => {
    const a = source.nodes[w.a];
    const c = source.nodes[w.b];
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const off = w.thickness / 2 + 0.05;
    const n = { x: (-(c.y - a.y) / len) * off, y: ((c.x - a.x) / len) * off };
    const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
    const sides = [roomAt({ x: m.x + n.x, y: m.y + n.y }), roomAt({ x: m.x - n.x, y: m.y - n.y })];
    if (!sides[0] || !sides[1] || sides[0] === sides[1]) return false;
    const [inA, inB] = sides.map((r) => isIn(r!.centroid, box));
    return inA !== inB;
  });
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
  for (const w of party) {
    const { faces: _faces, ...rest } = w;
    source.walls[w.id] = { ...rest, party: level.id };
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
