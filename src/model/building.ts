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

/** Height of a level's floor above the ground floor. */
export function levelElevation(b: Building, id: string): number {
  let z = 0;
  for (const l of b.levels) {
    if (l.id === id) return z;
    z += l.height;
  }
  return z;
}

export function levelBelow(b: Building, id: string): Level | undefined {
  const i = b.levels.findIndex((l) => l.id === id);
  return i > 0 ? b.levels[i - 1] : undefined;
}

export function levelAbove(b: Building, id: string): Level | undefined {
  const i = b.levels.findIndex((l) => l.id === id);
  return i >= 0 ? b.levels[i + 1] : undefined;
}

/** Clear room height of a level: up to the underside of the floor above. */
export function ceilingHeight(b: Building, level: Level): number {
  return level.height - (levelAbove(b, level.id)?.slab ?? DEFAULTS.slab);
}

/**
 * Add a storey on top of the building. With `copyOutline`, the outside walls of the
 * current top floor are copied up so you can start drawing inside them.
 */
export function addLevelOnTop(b: Building, copyOutline: boolean): Level {
  const top = b.levels[b.levels.length - 1];
  const level = createLevel(b, undefined, top?.height ?? DEFAULTS.levelHeight);
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
