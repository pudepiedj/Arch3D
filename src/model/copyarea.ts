// Copying part of a floor plan and pasting it somewhere else: into the same floor, another
// floor, or another drawing altogether. Like a screenshot of the plan, but of the drawing
// itself: whatever is in the box is copied, walls that cross its edge are cut off there (with
// the doors and windows that lie wholly on the part inside), and everything is kept relative
// to the box's top left corner so it can be put down anywhere. (clip.ts is something else:
// polygon clipping.)

import type { Vec2 } from './geom';
import type {
  Chimney,
  Furniture,
  Hedge,
  Level,
  Opening,
  Patio,
  Pillar,
  PlanNode,
  Roof,
  RoofAreaSetting,
  RoofSection,
  Rooflight,
  SolarArray,
  Stair,
  Tree,
  Wall,
} from './types';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Clip {
  version: 1;
  /** Size of the box copied (m). */
  w: number;
  h: number;
  nodes: PlanNode[];
  walls: Wall[];
  openings: Opening[];
  stairs: Stair[];
  pillars: Pillar[];
  chimneys: Chimney[];
  solar: SolarArray[];
  rooflights: Rooflight[];
  patios: Patio[];
  trees: Tree[];
  hedges: Hedge[];
  furniture: Furniture[];
  roofSections: RoofSection[];
  roofAreas: RoofAreaSetting[];
  /** The floor's own settings, for pasting into an empty floor. */
  level: { height: number; slab: number; roof?: Roof };
}

const TOL = 0.01;

/** The part of the segment a->b inside the box, as fractions along it (Liang–Barsky). */
function clipSegment(a: Vec2, b: Vec2, box: Box): [number, number] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - (box.x0 - TOL)],
    [dx, box.x1 + TOL - a.x],
    [-dy, a.y - (box.y0 - TOL)],
    [dy, box.y1 + TOL - a.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

const isIn = (p: Vec2, box: Box) => p.x >= box.x0 - TOL && p.x <= box.x1 + TOL && p.y >= box.y0 - TOL && p.y <= box.y1 + TOL;

/** Move a point, returning a copy. */
const shift = <T extends Vec2>(p: T, d: Vec2): T => ({ ...p, x: p.x + d.x, y: p.y + d.y });
const shiftRoof = (r: Roof, d: Vec2): Roof => ({ ...r, edges: r.edges?.map((e) => shift(e, d)) });

/** Everything on a floor within the box, or null if there is nothing there. */
export function copyArea(level: Level, box: Box): Clip | null {
  const o = { x: -box.x0, y: -box.y0 };
  const nodes = new Map<string, PlanNode>();
  const walls: Wall[] = [];
  const openings: Opening[] = [];
  for (const w of Object.values(level.walls)) {
    const a = level.nodes[w.a];
    const b = level.nodes[w.b];
    if (!a || !b) continue;
    const span = clipSegment(a, b, box);
    if (!span) continue;
    const [t0, t1] = span;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if ((t1 - t0) * L < 0.05) continue;
    // Keep the wall's own joints where they are inside (so walls meeting there still meet);
    // a new joint where it is cut off at the edge of the box.
    const end = (t: number, node: PlanNode, tag: string) => {
      if (t <= 1e-9 || t >= 1 - 1e-9) {
        if (!nodes.has(node.id)) nodes.set(node.id, shift({ ...node }, o));
        return node.id;
      }
      const id = `${w.id}:${tag}`;
      nodes.set(id, shift({ id, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, o));
      return id;
    };
    const na = end(t0, a, 'a');
    const nb = end(t1, b, 'b');
    walls.push({ ...w, a: na, b: nb });
    const from = t0 * L;
    const to = t1 * L;
    for (const op of Object.values(level.openings)) {
      if (op.wallId !== w.id) continue;
      if (op.offset - op.width / 2 < from - 1e-6 || op.offset + op.width / 2 > to + 1e-6) continue;
      openings.push({ ...op, offset: op.offset - from });
    }
  }
  const at = <T extends Vec2>(items: Record<string, T> | undefined) => Object.values(items ?? {}).filter((p) => isIn(p, box)).map((p) => shift(p, o));
  const within = <T extends { points: Vec2[] }>(items: Record<string, T> | undefined) =>
    Object.values(items ?? {})
      .filter((s) => s.points.every((p) => isIn(p, box)))
      .map((s) => ({ ...s, points: s.points.map((p) => shift(p, o)) }));
  const clip: Clip = {
    version: 1,
    w: box.x1 - box.x0,
    h: box.y1 - box.y0,
    nodes: [...nodes.values()],
    walls,
    openings,
    stairs: at(level.stairs),
    pillars: at(level.pillars),
    chimneys: at(level.chimneys),
    solar: at(level.solar),
    rooflights: at(level.rooflights),
    trees: at(level.trees),
    furniture: at(level.furniture),
    patios: within(level.patios),
    hedges: within(level.hedges),
    roofSections: within(level.roofSections).map((s) => ({ ...s, roof: shiftRoof(s.roof, o) })),
    roofAreas: (level.roofAreas ?? []).filter((r) => isIn(r, box)).map((r) => ({ ...shift(r, o), roof: shiftRoof(r.roof, o) })),
    level: {
      height: level.height,
      slab: level.slab,
      roof: level.roof ? { ...shiftRoof(level.roof, o), edges: level.roof.edges?.filter((e) => isIn(e, box)).map((e) => shift(e, o)) } : undefined,
    },
  };
  return clipSize(clip) ? clip : null;
}

/** How many things a clip holds. */
export function clipSize(c: Clip): number {
  return (
    c.walls.length +
    c.stairs.length +
    c.pillars.length +
    c.chimneys.length +
    c.solar.length +
    c.rooflights.length +
    c.patios.length +
    c.trees.length +
    c.hedges.length +
    c.furniture.length +
    c.roofSections.length
  );
}

/** What a clip holds, in words: "6 walls, 2 doors or windows and a tree". */
export function describeClip(c: Clip): string {
  const parts: string[] = [];
  const count = (n: number, one: string, many: string) => {
    if (n) parts.push(n === 1 ? one : `${n} ${many}`);
  };
  count(c.walls.length, 'a wall', 'walls');
  count(c.openings.length, 'a door or window', 'doors and windows');
  count(c.stairs.length, 'a stair', 'stairs');
  count(c.pillars.length, 'a pillar', 'pillars');
  count(c.patios.length, 'a patio', 'patios');
  count(c.roofSections.length, 'a roof section', 'roof sections');
  count(c.trees.length, 'a tree', 'trees');
  count(c.hedges.length, 'a hedge', 'hedges');
  count(c.furniture.length, 'a piece of furniture', 'pieces of furniture');
  count(c.chimneys.length + c.solar.length + c.rooflights.length, 'a roof fitting', 'roof fittings');
  if (parts.length < 2) return parts[0] ?? 'nothing';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Put a copy down on a floor with the box's top left corner at `at`. Joints that land on
 * joints already there are joined to them, and a wall already there isn't doubled. Into an
 * empty floor it brings the floor height and roof it was copied with.
 */
export function pasteClip(level: Level, clip: Clip, at: Vec2): void {
  const empty = !Object.keys(level.walls).length;
  const id = (prefix: string) => `${prefix}${level.nextId++}`;
  const nodeIds = new Map<string, string>();
  const existing = Object.values(level.nodes);
  for (const n of clip.nodes) {
    const p = shift(n, at);
    const same = existing.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < TOL);
    if (same) nodeIds.set(n.id, same.id);
    else {
      const nid = id('n');
      level.nodes[nid] = { id: nid, x: p.x, y: p.y };
      nodeIds.set(n.id, nid);
    }
  }
  const wallIds = new Map<string, string>();
  for (const w of clip.walls) {
    const a = nodeIds.get(w.a)!;
    const b = nodeIds.get(w.b)!;
    if (a === b) continue;
    const there = Object.values(level.walls).find((v) => (v.a === a && v.b === b) || (v.a === b && v.b === a));
    if (there) continue;
    const wid = id('w');
    level.walls[wid] = { ...w, id: wid, a, b };
    wallIds.set(w.id, wid);
  }
  for (const op of clip.openings) {
    const wallId = wallIds.get(op.wallId);
    if (!wallId) continue;
    const oid = id('o');
    level.openings[oid] = { ...op, id: oid, wallId };
  }
  const put = <T extends { id: string }>(key: keyof Level, prefix: string, items: T[], move: (t: T) => T) => {
    if (!items.length) return;
    const rec = ((level as unknown as Record<string, Record<string, T> | undefined>)[key as string] ??= {});
    for (const t of items) {
      const nid = id(prefix);
      rec[nid] = { ...move(t), id: nid };
    }
  };
  const pt = <T extends Vec2>(t: T) => shift(t, at);
  const poly = <T extends { points: Vec2[] }>(t: T) => ({ ...t, points: t.points.map((p) => shift(p, at)) });
  put('stairs', 's', clip.stairs, pt);
  put('pillars', 'p', clip.pillars, pt);
  put('chimneys', 'c', clip.chimneys, pt);
  put('solar', 'sa', clip.solar, pt);
  put('rooflights', 'rl', clip.rooflights, pt);
  put('trees', 'tr', clip.trees, pt);
  put('furniture', 'f', clip.furniture, pt);
  put('patios', 'pt', clip.patios, poly);
  put('hedges', 'hg', clip.hedges, poly);
  put('roofSections', 'rs', clip.roofSections, (s) => ({ ...poly(s), roof: shiftRoof(s.roof, at) }));
  if (clip.roofAreas.length) (level.roofAreas ??= []).push(...clip.roofAreas.map((r) => ({ ...shift(r, at), roof: shiftRoof(r.roof, at) })));
  const roof = clip.level.roof ? shiftRoof(clip.level.roof, at) : undefined;
  if (empty) {
    level.height = clip.level.height;
    level.slab = clip.level.slab;
    if (roof) level.roof = roof;
  } else if (roof?.edges?.length && level.roof) {
    level.roof = { ...level.roof, edges: [...(level.roof.edges ?? []), ...roof.edges] };
  }
}
