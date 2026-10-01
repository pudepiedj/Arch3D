// A building is a stack of levels. Each level is an independent floor plan (so all the
// wall-joint and opening logic works per floor unchanged) plus its vertical dimensions.

import { addWall, createPlan, healNode, normalize } from './plan';
import { outlineWallIds } from './rooms';
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
 * the floor before it in the list. The first floor is at the ground.
 */
export function levelElevation(b: Building, id: string): number {
  let z = 0;
  for (const [i, l] of b.levels.entries()) {
    if (i > 0 && l.base !== undefined) z = l.base;
    if (l.id === id) return z;
    z += l.height;
  }
  return z;
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
 * The floor directly below or above one: the nearest one lower (or higher) standing over the
 * same ground, so two houses side by side at different heights (one on a plinth, one half
 * below ground) are separate stacks. A floor with no walls yet goes by the order of the list.
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
    if (dir > 0 ? oz <= z + 1e-6 : oz >= z - 1e-6) continue;
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
