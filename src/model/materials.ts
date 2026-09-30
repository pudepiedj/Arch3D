// What the house is made of, as it looks: the finish of each face of each wall, each room's
// floor and each roof's covering. The drawing has defaults (outside walls, inside walls,
// floors); any wall face or room floor can be painted differently with the Paint tool.
//
// A wall face is "outside" when there is no room on that side of it (so a garden wall is
// outside on both faces, and a partition inside on both).

import { computeFootprints, wallPoint } from './joints';
import { pointInPolygon, type Vec2 } from './geom';
import { detectRooms } from './rooms';
import type { Building, FloorFinish, Level, RoofCovering, Wall, WallFinish } from './types';

export interface FinishInfo {
  name: string;
  /** For the plan and the swatches in the menus. */
  colour: string;
}

export const WALL_FINISHES: Record<WallFinish, FinishInfo> = {
  plaster: { name: 'Plaster, white', colour: '#f1ede6' },
  render: { name: 'Render, white', colour: '#f3efe8' },
  'render-cream': { name: 'Render, cream', colour: '#eadcbf' },
  'render-ochre': { name: 'Render, ochre', colour: '#d9a860' },
  'render-pink': { name: 'Render, terracotta pink', colour: '#dca38e' },
  'paint-sage': { name: 'Paint, sage green', colour: '#b9c4ad' },
  'paint-blue': { name: 'Paint, blue-grey', colour: '#b8c7d3' },
  stone: { name: 'Stone, dressed (ashlar)', colour: '#d8c6a0' },
  rubble: { name: 'Stone, rubble', colour: '#b9a88a' },
  brick: { name: 'Brick, red', colour: '#a5583f' },
};

export const FLOOR_FINISHES: Record<FloorFinish, FinishInfo> = {
  oak: { name: 'Oak boards', colour: '#f1e8d8' },
  terracotta: { name: 'Terracotta tiles', colour: '#ecc7ab' },
  stone: { name: 'Stone flags', colour: '#e9e1cd' },
  tiles: { name: 'Porcelain tiles, pale grey', colour: '#ececea' },
  carpet: { name: 'Carpet, grey', colour: '#dedee2' },
  concrete: { name: 'Polished concrete', colour: '#dcdad6' },
};

export const ROOF_COVERINGS: Record<RoofCovering, FinishInfo> = {
  tiles: { name: 'Concrete tiles', colour: '#8f4b3a' },
  roman: { name: 'Terracotta, Roman (barrel)', colour: '#c0643e' },
  plain: { name: 'Clay plain tiles', colour: '#9c5a41' },
  slate: { name: 'Slate', colour: '#4f555c' },
};

export const DEFAULT_MATERIALS = { outside: 'render' as WallFinish, inside: 'plaster' as WallFinish, floor: 'oak' as FloorFinish };

export function materialsOf(b: Building) {
  return { ...DEFAULT_MATERIALS, ...b.materials };
}

/** The two faces of a wall: +n (left of a->b) and -n. */
export type Side = 'left' | 'right';

/**
 * For each wall of a floor, whether each face looks into a room ("inside") or not
 * ("outside"): sampled a little off the face at a few points along it.
 */
export function faceSides(level: Level): Map<string, Record<Side, 'inside' | 'outside'>> {
  const rooms = detectRooms(level).map((r) => r.polygon);
  const out = new Map<string, Record<Side, 'inside' | 'outside'>>();
  for (const fp of computeFootprints(level).values()) {
    const side = (s: number) => {
      const off = s * (fp.thickness / 2 + 0.05);
      const hit = [0.25, 0.5, 0.75].some((t) => rooms.some((r) => pointInPolygon(wallPoint(fp, fp.length * t, off), r)));
      return hit ? ('inside' as const) : ('outside' as const);
    };
    out.set(fp.wallId, { left: side(1), right: side(-1) });
  }
  return out;
}

/** The finish of one face of a wall: painted, or the drawing's default for that side. */
export function faceFinish(b: Building, wall: Wall, side: Side, where: 'inside' | 'outside'): WallFinish {
  return wall.faces?.[side] ?? materialsOf(b)[where];
}

/** The floor finish of the room around p. */
export function floorFinishAt(b: Building, level: Level, room: Vec2[]): FloorFinish {
  const set = (level.floorFinishes ?? []).filter((f) => pointInPolygon(f, room));
  return set.at(-1)?.finish ?? materialsOf(b).floor;
}

/** Put the floor of the room `room` back to the drawing's default. */
export function clearFloorFinish(level: Level, room: Vec2[]) {
  level.floorFinishes = (level.floorFinishes ?? []).filter((f) => !pointInPolygon(f, room));
  if (!level.floorFinishes.length) delete level.floorFinishes;
}

/** Set the floor of the room `room` (its outline), keyed by a point inside it. */
export function setFloorFinish(level: Level, room: Vec2[], at: Vec2, finish: FloorFinish) {
  level.floorFinishes = (level.floorFinishes ?? []).filter((f) => !pointInPolygon(f, room));
  level.floorFinishes.push({ x: at.x, y: at.y, finish });
}

/**
 * Paint every wall face that looks into the room with outline `room`. A long wall bordering
 * more than one room is painted along its whole length on that side.
 */
export function paintRoomWalls(level: Level, room: Vec2[], finish: WallFinish | undefined) {
  for (const fp of computeFootprints(level).values()) {
    for (const [side, s] of [['left', 1], ['right', -1]] as const) {
      const off = s * (fp.thickness / 2 + 0.05);
      const faces = [0.1, 0.3, 0.5, 0.7, 0.9].some((t) => pointInPolygon(wallPoint(fp, fp.length * t, off), room));
      if (!faces) continue;
      const w = level.walls[fp.wallId];
      w.faces = { ...w.faces, [side]: finish };
      if (!w.faces.left && !w.faces.right) delete w.faces;
    }
  }
}
