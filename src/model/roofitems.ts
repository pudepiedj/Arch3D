// Things on roofs: chimney stacks and solar panel arrays. Both are placed on the plan and
// fitted to whatever roof is there, so they follow when the roof changes.

import { type Vec2, pointInPolygon } from './geom';
import { type Point3, roofRangeOver, roofSurfaceAt } from './roof';
import type { Building, Chimney, Level, Rooflight, SolarArray } from './types';

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

/** Frame width around and between rooflight windows. */
const ROOFLIGHT_FRAME = 0.12;
/** Opened windows tilt out at the bottom by this angle. */
const OPEN_ANGLE = (12 * Math.PI) / 180;

export function addRooflight(level: Level, p: Vec2): Rooflight {
  const r: Rooflight = {
    id: `rl${level.nextId++}`,
    x: p.x,
    y: p.y,
    angle: -Math.PI / 2,
    count: 1,
    width: 0.78,
    length: 1.18,
    pitch: 15,
    kerb: 0.15,
    open: false,
    blinds: false,
    solarMotor: true,
  };
  level.rooflights ??= {};
  level.rooflights[r.id] = r;
  return r;
}

export interface RooflightWindow {
  frame: Point3[];
  glass: Point3[];
  motor: Point3[] | null;
  blind: Point3[] | null;
}

export interface RooflightGeometry {
  /** 'kerb': a box on a flat roof; 'slope': windows lying in a sloping roof. */
  kind: 'kerb' | 'slope';
  /** Plan outline (the box, or the whole row of windows). */
  footprint: Vec2[];
  /** Kerb boxes: height of the flat roof's top surface the box stands on. */
  roofZ: number;
  /** Kerb boxes: the four corners of the sloping top. */
  top: Point3[];
  windows: RooflightWindow[];
}

/** Lay out a rooflight on the roof under it: a kerb box on a flat roof, or flush in a slope. */
export function rooflightGeometry(b: Building, level: Level, r: Rooflight): RooflightGeometry | null {
  const centre = { x: r.x, y: r.y };
  const surf = roofSurfaceAt(b, level, centre);
  if (!surf) return null;
  const onFlat = surf.tan < 0.02;
  const up = onFlat ? { x: Math.cos(r.angle), y: Math.sin(r.angle) } : surf.up;
  const across = { x: -up.y, y: up.x };
  const tan = onFlat ? Math.tan((Math.max(3, Math.min(45, r.pitch)) * Math.PI) / 180) : surf.tan;
  const cos = 1 / Math.sqrt(1 + tan * tan);
  const sin = tan * cos;
  const n = Math.max(1, Math.round(r.count));
  const g = ROOFLIGHT_FRAME;
  const totalW = n * r.width + (n + 1) * g;
  const totalL = r.length + 2 * g;
  const roofZ = surf.z(centre);
  // Height of the (box top or roof) plane at the centre of the rooflight.
  const zc = onFlat ? roofZ + r.kerb + (totalL / 2) * sin : roofZ + 0.02 / cos;
  /** A point `s` across and `t` up the plane (t measured along the slope), lifted off it. */
  const at = (s: number, t: number, lift = 0): Point3 => ({
    x: centre.x + across.x * s + up.x * t * cos,
    y: centre.y + across.y * s + up.y * t * cos,
    z: zc + t * sin + lift / cos,
  });
  const rect = (s0: number, s1: number, t0: number, t1: number, lift: number) => [
    at(s0, t0, lift),
    at(s1, t0, lift),
    at(s1, t1, lift),
    at(s0, t1, lift),
  ];
  const top = rect(-totalW / 2, totalW / 2, -totalL / 2, totalL / 2, 0);
  const windows: RooflightWindow[] = [];
  for (let i = 0; i < n; i++) {
    const s0 = -totalW / 2 + g + i * (r.width + g);
    const s1 = s0 + r.width;
    const t0 = -r.length / 2;
    const t1 = r.length / 2;
    const glass = rect(s0 + 0.05, s1 - 0.05, t0 + 0.05, t1 - 0.05, 0.06);
    if (r.open) {
      // Hinged at the top: the bottom edge swings out and up.
      for (const k of [0, 1]) {
        const lever = r.length - 0.1;
        glass[k] = at(k ? s1 - 0.05 : s0 + 0.05, t1 - 0.05 - lever * Math.cos(OPEN_ANGLE), 0.06 + lever * Math.sin(OPEN_ANGLE));
      }
    }
    windows.push({
      frame: rect(s0 - 0.02, s1 + 0.02, t0 - 0.02, t1 + 0.02, 0.04),
      glass,
      motor: r.solarMotor ? rect(s0 + 0.08, s1 - 0.08, t1 + 0.01, t1 + 0.09, 0.07) : null,
      blind: r.blinds ? rect(s0 + 0.04, s1 - 0.04, t0 + 0.04, t1 - 0.04, -0.06) : null,
    });
  }
  return { kind: onFlat ? 'kerb' : 'slope', footprint: top.map((p) => ({ x: p.x, y: p.y })), roofZ, top, windows };
}
