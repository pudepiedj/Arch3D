// A building is a stack of levels. Each level is an independent floor plan (so all the
// wall-joint and opening logic works per floor unchanged) plus its vertical dimensions.

import { intersectAll } from './clip';
import { pointInPolygon, polygonArea } from './geom';
import { addWall, createPlan, healNode, normalize } from './plan';
import { detectRooms, outlineWallIds } from './rooms';
import { DEFAULTS, type Building, type Level, type Plan } from './types';

const LEVEL_NAMES = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Fourth floor'];

export function createLevel(b: Building, name?: string, height: number = DEFAULTS.levelHeight): Level {
  return {
    ...createPlan(),
    id: `L${b.nextId++}`,
    name: name ?? LEVEL_NAMES[b.levels.length] ?? `Floor ${b.levels.length}`,
    height,
    slab: DEFAULTS.slab,
    stairs: {},
  };
}

export function createBuilding(): Building {
  const b: Building = { version: 2, levels: [], nextId: 1 };
  b.levels.push(createLevel(b));
  return b;
}

export function getLevel(b: Building, id: string): Level | undefined {
  return b.levels.find((l) => l.id === id);
}

/**
 * Height of a level's floor above the ground: its own `base` if it has one, else on top of
 * the floor before it in the list. The first floor is at the ground. A floor standing on a
 * plinth (a raised patio drawn on the first floor, under the middle of its walls) sits on
 * top of it, whichever was drawn first.
 */
export function levelElevation(b: Building, id: string): number {
  let z = 0;
  for (const [i, l] of b.levels.entries()) {
    if (i > 0 && l.base !== undefined) z = l.base;
    const plinth = i > 0 ? plinthUnder(b, l) : 0;
    if (plinth > 0) z = Math.max(z, plinth);
    if (l.id === id) return z;
    z += l.height;
  }
  return z;
}

/** Does where `upper` stands depend on `lower`'s height (it is stacked on it in the list)? */
function stackedOn(b: Building, upper: Level, lower: Level): boolean {
  const i = b.levels.indexOf(upper);
  const j = b.levels.indexOf(lower);
  if (j >= i || i < 1 || upper.base !== undefined) return false;
  // Back down the list to the floor that sets the height (the first, or one with a base).
  for (let k = i - 1; k >= 0; k--) {
    if (k === j) return true;
    if (k === 0 || b.levels[k].base !== undefined) return false;
  }
  return false;
}

/**
 * Is this floor part of a building that goes on beside it (the rest of a house a room of
 * which has its own floor)? There is another floor with walls at about its height (within
 * half a storey) whose walls meet or overlap its own.
 */
export function isPartOfBuilding(b: Building, level: Level): boolean {
  const own = wallExtent(level);
  if (!own) return false;
  const z = levelElevation(b, level.id);
  return b.levels.some((l) => {
    if (l === level) return false;
    const e = wallExtent(l);
    if (!e || Math.abs(levelElevation(b, l.id) - z) > 1.45) return false;
    const gap = 0.3;
    return !(e.x0 > own.x1 + gap || own.x0 > e.x1 + gap || e.y0 > own.y1 + gap || own.y0 > e.y1 + gap);
  });
}

/** What changing this floor's level moves (see `Level.levelMoves`). */
export function levelMoves(b: Building, level: Level): 'floor' | 'all' {
  return level.levelMoves ?? (isPartOfBuilding(b, level) ? 'floor' : 'all');
}

/**
 * Set a floor's level. Moving just the floor, its walls (those running its full height)
 * stretch or shrink so the top stays where it was; moving it all, everything goes with it.
 * Then every floor's walls are fitted to the floor above again.
 */
export function setFloorLevel(b: Building, level: Level, z: number) {
  const before = levelElevation(b, level.id);
  const mode = levelMoves(b, level);
  level.base = z;
  const drop = before - levelElevation(b, level.id);
  if (mode === 'floor' && Math.abs(drop) > 1e-6 && level.height + drop >= 1) setLevelHeight(level, level.height + drop);
  fitStoreys(b);
}

/**
 * After a floor's level has changed, make each floor's walls reach the floor above it again
 * (and stop at it): the storey height, and every wall that ran the full storey, become the
 * distance up to the next floor, where that floor doesn't simply sit on top of this one.
 */
export function fitStoreys(b: Building) {
  for (let pass = 0; pass < 2; pass++) {
    for (const level of b.levels) {
      // The nearest floor over the same ground at least a storey up: not a split-level part
      // of the same floor a little higher.
      const z = levelElevation(b, level.id);
      let above: Level | undefined;
      for (const other of b.levels) {
        const oz = levelElevation(b, other.id);
        if (other === level || oz < z + 1.5 || !sameStack(level, other)) continue;
        if (!above || oz < levelElevation(b, above.id)) above = other;
      }
      if (!above || stackedOn(b, above, level)) continue;
      const h = levelElevation(b, above.id) - z;
      if (h < 0.5 || Math.abs(h - level.height) < 0.005) continue;
      setLevelHeight(level, h);
    }
  }
}

/** Raised patios higher than this are plinths: a building on one stands on its top. */
export const PLINTH = 0.25;

/** The top of the plinth under the middle of a floor's walls (0 if there is none). */
function plinthUnder(b: Building, l: Level): number {
  const e = wallExtent(l);
  if (!e) return 0;
  const c = { x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2 };
  let top = 0;
  for (const pt of Object.values(b.levels[0]?.patios ?? {})) {
    if (pt.surface === 'pool' || pt.height <= PLINTH) continue;
    if (pointInPolygon(c, pt.points)) top = Math.max(top, pt.height);
  }
  return top;
}

/** The extent of a floor's walls on plan, or null if it has none yet. */
function wallExtent(l: Level) {
  const ps = Object.values(l.nodes);
  if (!ps.length || !Object.keys(l.walls).length) return null;
  return {
    x0: Math.min(...ps.map((p) => p.x)),
    y0: Math.min(...ps.map((p) => p.y)),
    x1: Math.max(...ps.map((p) => p.x)),
    y1: Math.max(...ps.map((p) => p.y)),
  };
}

/**
 * Do two floors stand over the same ground (their walls' extents overlap)? A floor with no
 * walls overlaps nothing.
 */
export function sameStack(a: Level, c: Level): boolean {
  const p = wallExtent(a);
  const q = wallExtent(c);
  if (!p || !q || q.x0 >= p.x1 - 0.05 || p.x0 >= q.x1 - 0.05 || q.y0 >= p.y1 - 0.05 || p.y0 >= q.y1 - 0.05) return false;
  return roomsOverlap(a, c);
}

/**
 * Do two floors' rooms overlap on plan (by more than a sliver)? A part of a house moved to a
 * floor of its own sits among the rest of the house's rooms, inside its outline, but not on
 * top of any of them. Floors without closed rooms yet count as overlapping (their walls'
 * extents already do).
 */
function roomsOverlap(a: Level, c: Level): boolean {
  const ra = detectRooms(a);
  const rc = detectRooms(c);
  if (!ra.length || !rc.length) return true;
  for (const p of ra) {
    for (const q of rc) {
      const area = intersectAll(p.polygon, q.polygon).reduce((s, sh) => s + Math.abs(polygonArea(sh[0])) - sh.slice(1).reduce((h, r) => h + Math.abs(polygonArea(r)), 0), 0);
      if (area > 0.25) return true;
    }
  }
  return false;
}

/**
 * The floor directly below or above one: the nearest one lower (or higher) standing over the
 * same ground, so two houses side by side at different heights (one on a plinth, one half
 * below ground) are separate stacks. A floor with no walls yet goes by the order of the list.
 * A part of a floor set a little lower (a split level) is beside it, not under it.
 */
function neighbour(b: Building, id: string, dir: 1 | -1): Level | undefined {
  const i = b.levels.findIndex((l) => l.id === id);
  if (i < 0) return undefined;
  const level = b.levels[i];
  const own = wallExtent(level);
  if (!own) return b.levels[i + dir];
  const z = levelElevation(b, id);
  let best: Level | undefined;
  let bestZ = 0;
  for (const other of b.levels) {
    if (other === level) continue;
    const e = wallExtent(other);
    if (!e || e.x0 >= own.x1 - 0.05 || own.x0 >= e.x1 - 0.05 || e.y0 >= own.y1 - 0.05 || own.y0 >= e.y1 - 0.05) continue;
    const oz = levelElevation(b, other.id);
    // A storey up or down, not a split-level part of the same floor a little higher or lower.
    if (dir > 0 ? oz < z + Math.min(1.5, level.height / 2) : oz > z - Math.min(1.5, other.height / 2)) continue;
    // Over the same rooms, not round them (the rest of a house a part of which is set lower).
    if (!roomsOverlap(level, other)) continue;
    if (!best || (dir > 0 ? oz < bestZ : oz > bestZ)) {
      best = other;
      bestZ = oz;
    }
  }
  return best;
}

export function levelBelow(b: Building, id: string): Level | undefined {
  return neighbour(b, id, -1);
}

export function levelAbove(b: Building, id: string): Level | undefined {
  return neighbour(b, id, 1);
}

/** Every floor with this one directly above it: one, or the parts of a split level. */
export function levelsUnder(b: Building, id: string): Level[] {
  const level = getLevel(b, id);
  const below = levelBelow(b, id);
  return b.levels.filter(
    (l) => l === below || (!!level && l !== level && levelAbove(b, l.id) === level && sameStack(l, level)),
  );
}

/** The floors from the top down, as the floor list shows them. */
export function levelsTopDown(b: Building): Level[] {
  return b.levels
    .map((l, i) => ({ l, i, z: levelElevation(b, l.id) }))
    .sort((p, q) => q.z - p.z || q.i - p.i)
    .map((p) => p.l);
}

/** Clear room height of a level: up to the underside of the floor above. */
export function ceilingHeight(b: Building, level: Level): number {
  return level.height - (levelAbove(b, level.id)?.slab ?? DEFAULTS.slab);
}

/**
 * Add a storey on top of the building. With `copyOutline`, the outside walls of the
 * current top floor are copied up so you can start drawing inside them.
 */
export function addLevelOnTop(b: Building, copyOutline: boolean, onto?: Level): Level {
  const last = b.levels[b.levels.length - 1];
  const top = onto ?? last;
  // Named for the floor it goes on: "First floor" on "Ground floor"; on a building's own
  // floor ("Small house"), "Small house, upper floor".
  const i = top ? LEVEL_NAMES.indexOf(top.name) : -1;
  const name = !top || b.levels.length < 2 ? undefined : i >= 0 ? (LEVEL_NAMES[i + 1] ?? `${top.name}, upper floor`) : `${top.name}, upper floor`;
  const level = createLevel(b, name, top?.height ?? DEFAULTS.levelHeight);
  // On top of a floor that isn't the last in the list: say where it goes, so the floors
  // after it keep their places.
  if (top && top !== last) level.base = levelElevation(b, top.id) + top.height;
  if (copyOutline && top) {
    for (const id of outlineWallIds(top)) {
      const w = top.walls[id];
      addWall(level, top.nodes[w.a], top.nodes[w.b], { thickness: w.thickness, height: level.height });
    }
    // Joints left over from junctions downstairs are not needed up here.
    for (const id of Object.keys(level.nodes)) if (level.nodes[id]) healNode(level, id);
    normalize(level);
  }
  b.levels.push(level);
  return level;
}

/**
 * A small floor on top of part of one (a stair-head with a door out onto a roof terrace, a
 * roof room): walls round the box, a flat roof on it, standing on the top of `under`. The
 * roof of `under` is made flat, to walk on, if it wasn't.
 */
export function addRoomOnTop(b: Building, under: Level, box: { x0: number; y0: number; x1: number; y1: number }, height = 2.7): Level {
  const level = createLevel(b, `${under.name}, roof room`, height);
  level.base = levelElevation(b, under.id) + under.height;
  const pts = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ];
  pts.forEach((p, i) => addWall(level, p, pts[(i + 1) % 4], { thickness: 0.2, height }));
  normalize(level);
  level.roof = { kind: 'flat', pitch: 0, overhang: 0 };
  if (under.roof?.kind !== 'flat') under.roof = { ...(under.roof ?? { pitch: 0, overhang: 0 }), kind: 'flat', overhang: 0 };
  b.levels.push(level);
  return level;
}

/**
 * Add a storey below one (a basement, or the lower floor of a house half in the ground),
 * starting with a copy of its outside walls.
 */
export function addLevelBelow(b: Building, under: Level): Level {
  const level = createLevel(b, 'Lower ground floor', under.height);
  level.base = levelElevation(b, under.id) - level.height;
  for (const id of outlineWallIds(under)) {
    const w = under.walls[id];
    addWall(level, under.nodes[w.a], under.nodes[w.b], { thickness: w.thickness, height: level.height });
  }
  for (const id of Object.keys(level.nodes)) if (level.nodes[id]) healNode(level, id);
  normalize(level);
  b.levels.push(level);
  return level;
}

export function deleteLevel(b: Building, id: string): boolean {
  if (b.levels.length <= 1) return false;
  b.levels = b.levels.filter((l) => l.id !== id);
  return true;
}

/** Change a level's floor-to-floor height; walls that ran the full height follow it. */
export function setLevelHeight(level: Level, height: number) {
  for (const w of Object.values(level.walls)) {
    if (Math.abs(w.height - level.height) < 1e-6) w.height = height;
  }
  level.height = height;
  normalize(level);
}

/**
 * Read a saved drawing of any version. Version 1 files (a single plan, from before
 * storeys existed) become a one-storey building. Their full-height walls are raised by
 * one slab thickness so the ceiling stays exactly where it was.
 */
export function migrate(data: unknown): Building {
  const d = data as Partial<Building> & Partial<Plan> & { version?: number };
  if (d && d.version === 2 && Array.isArray(d.levels) && d.levels.length) {
    for (const l of d.levels) {
      l.openings ??= {};
      l.stairs ??= {};
      dropBroken(l);
    }
    return d as Building;
  }
  if (d && d.nodes && d.walls) {
    const b: Building = { version: 2, levels: [], nextId: 1 };
    const walls = Object.values(d.walls);
    const tallest = walls.length ? Math.max(...walls.map((w) => w.height)) : DEFAULTS.levelHeight - DEFAULTS.slab;
    const height = Math.round((tallest + DEFAULTS.slab) * 1000) / 1000;
    for (const w of walls) if (Math.abs(w.height - tallest) < 1e-6) w.height = height;
    b.levels.push({
      nodes: d.nodes,
      walls: d.walls,
      openings: d.openings ?? {},
      nextId: d.nextId ?? 1,
      id: `L${b.nextId++}`,
      name: LEVEL_NAMES[0],
      height,
      slab: DEFAULTS.slab,
      stairs: {},
    });
    return b;
  }
  throw new Error('not an Arch3D plan');
}

const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const okPoint = (p: { x: unknown; y: unknown } | null | undefined) => !!p && ok(p.x) && ok(p.y);

/**
 * Leave out anything whose position or size isn't a proper number (it can't be drawn, and
 * would upset the 3D view): garden things, furniture and roof items. Walls are left alone.
 */
function dropBroken(l: Level) {
  const keep = <T extends object>(rec: Record<string, T> | undefined, good: (t: T) => boolean) => {
    if (!rec) return;
    for (const [k, t] of Object.entries(rec)) if (!t || !good(t)) delete rec[k];
  };
  keep(l.hedges, (h) => Array.isArray(h.points) && h.points.length >= 2 && h.points.every(okPoint) && ok(h.height) && ok(h.width));
  keep(l.patios, (p) => Array.isArray(p.points) && p.points.length >= 3 && p.points.every(okPoint));
  keep(l.trees, (t) => okPoint(t) && ok(t.height) && ok(t.spread));
  keep(l.furniture, (f) => okPoint(f) && ok(f.width) && ok(f.depth) && ok(f.height) && ok(f.angle));
  keep(l.pillars, (q) => okPoint(q) && ok(q.size));
  keep(l.chimneys, okPoint);
  keep(l.rooflights, okPoint);
  keep(l.solar, okPoint);
}
