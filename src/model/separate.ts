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
import { newId, normalize, planarize } from './plan';
import { detectRooms } from './rooms';
import type { Building, Level, Wall } from './types';

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
  // Before anything moves: the rooms, and the points just either side of each wall moving.
  const rooms = detectRooms(source);
  const inRoom = (p: Vec2) => rooms.some((r) => pointInPolygon(p, r.polygon));
  const sidesOf = (w: Wall) => {
    const a = source.nodes[w.a];
    const c = source.nodes[w.b];
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const off = w.thickness / 2 + 0.05;
    const n = { x: (-(c.y - a.y) / len) * off, y: ((c.x - a.x) / len) * off };
    const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
    return [{ x: m.x + n.x, y: m.y + n.y }, { x: m.x - n.x, y: m.y - n.y }];
  };
  const sides = new Map(walls.map((w) => [w.id, sidesOf(w)]));
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
  // An archway left open where the part met the rest (a gap in a line of walls): an open side
  // across it, so the part's rooms close.
  closeGaps(level, new Set(walls.flatMap((w) => [w.a, w.b])));
  // The walls the rest still needs, to close its own rooms: those with one of the old rooms
  // on a side that isn't inside the part now. The rest keeps a party copy of each (and an
  // open side across any archway between them).
  const partRooms = detectRooms(level);
  const inPart = (p: Vec2) => partRooms.some((r) => pointInPolygon(p, r.polygon));
  const party = walls.filter((w) => sides.get(w.id)!.some((p) => inRoom(p) && !inPart(p)));
  for (const w of party) {
    const { faces: _faces, ...rest } = w;
    source.walls[w.id] = { ...rest, party: level.id };
  }
  if (party.length) closeGaps(source, new Set(party.flatMap((w) => [w.a, w.b])), level.id);
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

/**
 * Close gaps in lines of walls (an archway, where a moved part met the rest of the house) with
 * open sides: between two loose wall ends among `among` that face each other along one line,
 * up to 8 m apart. On the floor a part was moved from, they are party to that part's floor.
 */
function closeGaps(level: Level, among: Set<string>, party?: string) {
  const ends = new Map<string, { wall: Wall; other: string }[]>();
  for (const w of Object.values(level.walls)) {
    (ends.get(w.a) ?? ends.set(w.a, []).get(w.a)!).push({ wall: w, other: w.b });
    (ends.get(w.b) ?? ends.set(w.b, []).get(w.b)!).push({ wall: w, other: w.a });
  }
  const loose = [...among].filter((id) => ends.get(id)?.length === 1 && level.nodes[id]);
  const outward = (id: string) => {
    const p = level.nodes[id];
    const q = level.nodes[ends.get(id)![0].other];
    const len = Math.hypot(p.x - q.x, p.y - q.y) || 1;
    return { x: (p.x - q.x) / len, y: (p.y - q.y) / len };
  };
  const done = new Set<string>();
  for (const id of loose) {
    if (done.has(id)) continue;
    const p = level.nodes[id];
    const d = outward(id);
    let best: { id: string; len: number } | null = null;
    for (const other of loose) {
      if (other === id || done.has(other)) continue;
      const q = level.nodes[other];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < 0.2 || len > 8) continue;
      const u = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
      const e = outward(other);
      // Straight on from this end, and that end pointing back at it.
      if (u.x * d.x + u.y * d.y < 0.995 || e.x * d.x + e.y * d.y > -0.995) continue;
      if (!best || len < best.len) best = { id: other, len };
    }
    if (!best) continue;
    const w1 = ends.get(id)![0].wall;
    const w2 = ends.get(best.id)![0].wall;
    const wall: Wall = { id: newId(level, 'w'), a: id, b: best.id, thickness: Math.min(w1.thickness, w2.thickness), height: w1.height, virtual: true };
    if (party) wall.party = party;
    level.walls[wall.id] = wall;
    done.add(id).add(best.id);
  }
}

/**
 * The floor a part of the house was moved from, to put it back into: the one holding party
 * walls owned by it, else another floor at about its height whose walls meet its own.
 */
export function putBackTarget(b: Building, part: Level): Level | undefined {
  const byParty = b.levels.find((l) => l !== part && Object.values(l.walls).some((w) => w.party === part.id));
  if (byParty) return byParty;
  const z = levelElevation(b, part.id);
  const own = extent(part);
  if (!own) return undefined;
  let best: Level | undefined;
  let bestDz = Infinity;
  for (const l of b.levels) {
    const e = l === part ? null : extent(l);
    if (!e) continue;
    const dz = Math.abs(levelElevation(b, l.id) - z);
    const gap = 0.3;
    if (dz > 1.45 || e.x0 > own.x1 + gap || own.x0 > e.x1 + gap || e.y0 > own.y1 + gap || own.y0 > e.y1 + gap) continue;
    if (dz < bestDz) {
      best = l;
      bestDz = dz;
    }
  }
  return best;
}

function extent(l: Level) {
  const ps = Object.values(l.nodes);
  if (!ps.length || !Object.keys(l.walls).length) return null;
  return { x0: Math.min(...ps.map((p) => p.x)), y0: Math.min(...ps.map((p) => p.y)), x1: Math.max(...ps.map((p) => p.x)), y1: Math.max(...ps.map((p) => p.y)) };
}

/**
 * Put a part of the house back into the floor it was moved from (undoing Move to its own
 * floor, whenever it was done): its walls, doors and windows, stairs, furniture and the rest
 * go back, joining up with the walls they met; the party walls and open sides drawn for the
 * split go, and so does the part's own floor. Walls that ran its full height take the height
 * of the floor they go back into.
 */
export function putBack(b: Building, part: Level, into: Level): boolean {
  if (part === into || b.levels[0] === part) return false;
  // The party walls and open sides on either side of the split.
  for (const w of Object.values(into.walls)) if (w.party === part.id) delete into.walls[w.id];
  for (const w of Object.values(part.walls)) if (w.virtual) delete part.walls[w.id];
  const fresh = <T extends { id: string }>(table: Record<string, T>, item: T, prefix: string) =>
    table[item.id] ? { ...item, id: newId(into, prefix) } : item;
  // Joints: the same point as one already there is that joint.
  const nodeMap = new Map<string, string>();
  for (const n of Object.values(part.nodes)) {
    const at = Object.values(into.nodes).find((m) => Math.hypot(m.x - n.x, m.y - n.y) < 0.01);
    if (at) nodeMap.set(n.id, at.id);
    else {
      const id = into.nodes[n.id] ? newId(into, 'n') : n.id;
      into.nodes[id] = { ...n, id };
      nodeMap.set(n.id, id);
    }
  }
  const wallMap = new Map<string, string>();
  for (const w of Object.values(part.walls)) {
    const { party: _party, ...rest } = w;
    const copy = fresh(into.walls, { ...rest, a: nodeMap.get(w.a)!, b: nodeMap.get(w.b)! }, 'w');
    if (Math.abs(copy.height - part.height) < 0.01) copy.height = into.height;
    into.walls[copy.id] = copy;
    wallMap.set(w.id, copy.id);
  }
  for (const o of Object.values(part.openings)) {
    const copy = fresh(into.openings, { ...o, wallId: wallMap.get(o.wallId) ?? o.wallId }, 'o');
    into.openings[copy.id] = copy;
  }
  type Placed = { id: string };
  for (const key of ['stairs', 'pillars', 'chimneys', 'solar', 'rooflights', 'furniture', 'roofSections'] as const) {
    const src = (part as unknown as Record<string, Record<string, Placed> | undefined>)[key];
    if (!src) continue;
    const dst = ((into as unknown as Record<string, Record<string, Placed> | undefined>)[key] ??= {});
    for (const item of Object.values(src)) {
      const copy = fresh(dst, item, key.slice(0, 2));
      dst[copy.id] = copy;
    }
  }
  if (part.roofAreas?.length) into.roofAreas = [...(into.roofAreas ?? []), ...part.roofAreas];
  if (part.floorFinishes?.length) into.floorFinishes = [...(into.floorFinishes ?? []), ...part.floorFinishes];
  into.nextId = Math.max(into.nextId, part.nextId);
  planarize(into);
  normalize(into);
  b.levels = b.levels.filter((l) => l !== part);
  return true;
}
