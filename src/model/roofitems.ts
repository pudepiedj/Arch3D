// Things on roofs: chimney stacks and solar panel arrays. Both are placed on the plan and
// fitted to whatever roof is there, so they follow when the roof changes.

import { type Vec2, pointInPolygon } from './geom';
import { type Point3, roofRangeOver, roofSurfaceAt } from './roof';
import type { Building, Chimney, Dormer, Level, Rooflight, SolarArray } from './types';

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

export function addDormer(level: Level, p: Vec2): Dormer {
  const d: Dormer = { id: `dm${level.nextId++}`, x: p.x, y: p.y, width: 1.6, height: 1.3, roof: 'gable', pitch: 40 };
  level.dormers ??= {};
  level.dormers[d.id] = d;
  return d;
}

export interface DormerGeometry {
  /** Where it stands on the main roof (cut out of the covering there), on the plan. */
  footprint: Vec2[];
  /** Its roof slopes (or flat top), and its walls (the front first, then the cheeks), in 3D. */
  roof: Point3[][];
  walls: Point3[][];
  /** The window in the front wall: frame outline and glass, in 3D. */
  frame: Point3[];
  glass: Point3[];
  /** Fascia along the front of its roof. */
  eaves: [Point3, Point3][];
  /** The front wall on the plan (for drawing it), and which way it faces. */
  front: [Vec2, Vec2];
  out: Vec2;
}

/** Dormers stand on slopes at least this steep. */
const MIN_DORMER_SLOPE = Math.tan((15 * Math.PI) / 180);
/** Its roof overhangs its front and sides by this much. */
const DORMER_OVERHANG = 0.1;

/**
 * Lay out a dormer on the slope under its point. The front wall stands across the slope
 * there, rising from the roof to the dormer's eaves; the dormer runs back up the slope
 * until its roof (flat, or a gable whose ridge runs back level) meets the main roof.
 * Null if the point isn't on a sloping roof.
 */
export function dormerGeometry(b: Building, level: Level, d: Dormer): DormerGeometry | null {
  const foot = { x: d.x, y: d.y };
  const surf = roofSurfaceAt(b, level, foot);
  if (!surf || surf.tan < MIN_DORMER_SLOPE) return null;
  const up = surf.up;
  const side = { x: -up.y, y: up.x };
  const tan = surf.tan;
  const z0 = surf.z(foot);
  const zf = z0 + d.height;
  const w = d.width / 2;
  const at = (s: number, t: number, z: number): Point3 => ({ x: foot.x + side.x * s + up.x * t, y: foot.y + side.y * s + up.y * t, z });
  // How far back (horizontally, up the slope) the main roof reaches a height.
  const back = (z: number) => (z - z0) / tan;
  const tEave = back(zf);
  const o = DORMER_OVERHANG;
  const walls: Point3[][] = [];
  const roof: Point3[][] = [];
  const eaves: [Point3, Point3][] = [];
  let footprint: Point3[];
  if (d.roof === 'flat') {
    const top = zf + 0.15;
    // Cheeks: triangles from the foot of the front up to the eaves and back to the roof.
    walls.push([at(-w, 0, z0), at(w, 0, z0), at(w, 0, zf), at(-w, 0, zf)]);
    for (const s of [-w, w]) walls.push([at(s, 0, z0), at(s, 0, zf), at(s, tEave, zf)]);
    const tTop = back(top);
    roof.push([at(-w - o, -o, top), at(w + o, -o, top), at(w + o, tTop, top), at(-w - o, tTop, top)]);
    eaves.push([at(-w - o, -o, top), at(w + o, -o, top)]);
    footprint = [at(-w, 0, 0), at(w, 0, 0), at(w, tEave, 0), at(-w, tEave, 0)];
  } else {
    const dt = Math.tan((Math.max(15, Math.min(60, d.pitch)) * Math.PI) / 180);
    const zr = zf + w * dt;
    const tRidge = back(zr);
    // The front: a wall up to the eaves with a gable over it.
    walls.push([at(-w, 0, z0), at(w, 0, z0), at(w, 0, zf), at(0, 0, zr), at(-w, 0, zf)]);
    for (const s of [-w, w]) walls.push([at(s, 0, z0), at(s, 0, zf), at(s, tEave, zf)]);
    // Each slope: from its eave (running back level until it meets the main roof) up to the
    // ridge, with the valley where it meets the main roof. A little overhang at the front
    // and side, in the slope's own plane.
    for (const s of [-1, 1]) {
      const e = s * (w + o);
      const ze = zf - o * dt;
      // The valley runs from the back of the ridge, through where the eave line meets the
      // main roof over the cheek, to where the overhanging eave meets it.
      roof.push([at(e, -o, ze), at(0, -o, zr), at(0, tRidge, zr), at(e, back(ze), ze)]);
      eaves.push([at(e, -o, ze), at(e, back(ze), ze)]);
    }
    footprint = [at(-w, 0, 0), at(w, 0, 0), at(w, tEave, 0), at(0, tRidge, 0), at(-w, tEave, 0)];
  }
  // The window: most of the front wall below the eaves.
  const ww = Math.max(0.3, d.width - 0.3) / 2;
  const sill = z0 + 0.12;
  const head = zf - 0.12;
  const frame = [at(-ww, 0.01, sill), at(ww, 0.01, sill), at(ww, 0.01, head), at(-ww, 0.01, head)];
  const glass = [at(-ww + 0.06, 0.02, sill + 0.06), at(ww - 0.06, 0.02, sill + 0.06), at(ww - 0.06, 0.02, head - 0.06), at(-ww + 0.06, 0.02, head - 0.06)];
  const flat = (p: Point3): Vec2 => ({ x: p.x, y: p.y });
  return {
    footprint: footprint.map(flat),
    roof,
    walls,
    frame,
    glass,
    eaves,
    front: [flat(at(-w, 0, 0)), flat(at(w, 0, 0))],
    out: { x: -up.x, y: -up.y },
  };
}
