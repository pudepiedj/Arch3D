// Things on roofs: chimney stacks and solar panel arrays. Both are placed on the plan and
// fitted to whatever roof is there, so they follow when the roof changes.

import { type Vec2, pointInPolygon } from './geom';
import { type Point3, roofRangeOver, roofSurfaceAt } from './roof';
import type { Building, Chimney, Level, SolarArray } from './types';

export const PANEL_LONG = 1.72;
export const PANEL_SHORT = 1.13;
const PANEL_GAP = 0.02;
/** How far panels sit above the roof covering. */
const PANEL_STANDOFF = 0.08;

export function addChimney(level: Level, p: Vec2): Chimney {
  const c: Chimney = { id: `c${level.nextId++}`, x: p.x, y: p.y, width: 0.9, depth: 0.5, angle: 0, pots: 2, above: 0.6 };
  level.chimneys ??= {};
  level.chimneys[c.id] = c;
  return c;
}

export function addSolarArray(level: Level, p: Vec2): SolarArray {
  const s: SolarArray = { id: `sa${level.nextId++}`, x: p.x, y: p.y, rows: 2, cols: 4, portrait: true };
  level.solar ??= {};
  level.solar[s.id] = s;
  return s;
}

export function chimneyFootprint(c: Chimney): Vec2[] {
  const cos = Math.cos(c.angle);
  const sin = Math.sin(c.angle);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => {
    const a = (u * c.width) / 2;
    const d = (v * c.depth) / 2;
    return { x: c.x + a * cos - d * sin, y: c.y + a * sin + d * cos };
  });
}

export interface ChimneyGeometry {
  footprint: Vec2[];
  /** Bottom of the stack (just under the roof) and top of the brickwork, above the floor. */
  base: number;
  top: number;
  pots: Vec2[];
  /** False if no roof was found under it (it then stands on the wall-top height). */
  onRoof: boolean;
}

/** A chimney stack: from just under the roof to `above` over the highest roof it goes through. */
export function chimneyGeometry(b: Building, level: Level, c: Chimney): ChimneyGeometry {
  const footprint = chimneyFootprint(c);
  const range = roofRangeOver(b, level, footprint);
  const onRoof = range !== null;
  const low = range?.low ?? level.height;
  const high = range?.high ?? level.height;
  // Pots in a row along the longer side.
  const along = c.width >= c.depth ? { x: Math.cos(c.angle), y: Math.sin(c.angle) } : { x: -Math.sin(c.angle), y: Math.cos(c.angle) };
  const len = Math.max(c.width, c.depth);
  const pots = Array.from({ length: c.pots }, (_, i) => {
    const t = ((i + 0.5) / c.pots - 0.5) * len;
    return { x: c.x + along.x * t, y: c.y + along.y * t };
  });
  return { footprint, base: low - 0.3, top: high + c.above, pots, onRoof };
}

export interface SolarGeometry {
  /** Each panel's four corners in 3D (x, y plan; z height above the floor). */
  panels: Point3[][];
  /** Plan outline of the whole array. */
  outline: Vec2[];
  /** True if some panels hang off the roof slope they are on. */
  overhangs: boolean;
}

/** Lay out a solar array on the roof slope under its centre, lined up with the slope. */
export function solarGeometry(b: Building, level: Level, s: SolarArray): SolarGeometry | null {
  const centre = { x: s.x, y: s.y };
  const surf = roofSurfaceAt(b, level, centre);
  if (!surf) return null;
  const alongSlope = s.portrait ? PANEL_LONG : PANEL_SHORT;
  const across = s.portrait ? PANEL_SHORT : PANEL_LONG;
  const cos = 1 / Math.sqrt(1 + surf.tan * surf.tan);
  const sin = surf.tan * cos;
  const side = { x: -surf.up.y, y: surf.up.x };
  const totalA = s.cols * across + (s.cols - 1) * PANEL_GAP;
  const totalS = s.rows * alongSlope + (s.rows - 1) * PANEL_GAP;
  const z0 = surf.z(centre) + PANEL_STANDOFF / cos;
  // A point on the slope, `a` across it and `d` up it (measured along the slope).
  const at = (a: number, d: number): Point3 => ({
    x: centre.x + side.x * a + surf.up.x * d * cos,
    y: centre.y + side.y * a + surf.up.y * d * cos,
    z: z0 + d * sin,
  });
  const panels: Point3[][] = [];
  let overhangs = false;
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      const a0 = -totalA / 2 + c * (across + PANEL_GAP);
      const d0 = -totalS / 2 + r * (alongSlope + PANEL_GAP);
      const quad = [at(a0, d0), at(a0 + across, d0), at(a0 + across, d0 + alongSlope), at(a0, d0 + alongSlope)];
      if (quad.some((p) => !pointInPolygon(p, surf.face.pts))) overhangs = true;
      panels.push(quad);
    }
  }
  const outline = [at(-totalA / 2, -totalS / 2), at(totalA / 2, -totalS / 2), at(totalA / 2, totalS / 2), at(-totalA / 2, totalS / 2)].map(
    (p) => ({ x: p.x, y: p.y }),
  );
  return { panels, outline, overhangs };
}
