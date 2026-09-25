// Roofs, generated from the outline of a storey's outside walls.
//
// A hip roof is the "straight skeleton" of the outline: every eave rises at the same
// pitch, and the slopes meet along hips, valleys and ridges. A gable roof starts from the
// same skeleton; each triangular hip end is turned into a vertical gable wall by moving
// its apex out onto the wall line, which stretches the ridge to meet it.

import { SkeletonBuilder } from 'straight-skeleton';
import { unionAll } from './clip';
import { Vec2, cross, dist, lineIntersect, normalize, perp, polygonArea, projectOnSegment, scale, sub } from './geom';
import { detectRooms } from './rooms';
import type { Building, Level, Roof } from './types';

export const DEFAULT_ROOF: Roof = { kind: 'gable', pitch: 35, overhang: 0.3 };
const FLAT_THICKNESS = 0.25;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface RoofFace {
  pts: Point3[];
  /** 'slope' is roof covering; 'gable' is the vertical triangle of wall under a gable. */
  kind: 'slope' | 'gable' | 'flat';
}

export interface RoofGeometry {
  faces: RoofFace[];
  /** Eave lines (at the bottom of the slopes), for fascia boards. */
  eaves: [Point3, Point3][];
  /** Plan lines for the drawing: eave outline, plus ridges, hips and valleys. */
  outline: Vec2[][];
  lines: [Vec2, Vec2][];
}

/** The roof a level actually has: its own setting, or by default a roof on the top floor. */
export function effectiveRoof(b: Building, level: Level): Roof | null {
  const r = level.roof ?? (b.levels[b.levels.length - 1]?.id === level.id ? DEFAULT_ROOF : null);
  return r && r.kind !== 'none' ? r : null;
}

/**
 * Loops around the outside faces of a level's outer walls (one per separate block),
 * counter-clockwise, each with the wall thickness along every edge.
 */
export function wallOutline(level: Level): { pts: Vec2[]; halfThickness: number[] }[] {
  const rooms = detectRooms(level);
  if (!rooms.length) return [];
  const walls = Object.values(level.walls);
  return unionAll(rooms.map((r) => r.polygon)).map((shape) => {
    let ring = simplify(shape[0]);
    if (polygonArea(ring) < 0) ring = ring.reverse();
    const halfThickness = ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let t = 0;
      for (const w of walls) {
        if (projectOnSegment(m, level.nodes[w.a], level.nodes[w.b]).dist < 1e-3) t = Math.max(t, w.thickness);
      }
      return (t || 0.3) / 2;
    });
    return { pts: ring, halfThickness };
  });
}

/** Offset every edge of a counter-clockwise loop outwards by its own distance. */
export function outsetLoop(pts: Vec2[], by: number[]): Vec2[] {
  const k = pts.length;
  return pts.map((p, i) => {
    const prev = (i - 1 + k) % k;
    const dPrev = normalize(sub(p, pts[prev]));
    const dCur = normalize(sub(pts[(i + 1) % k], p));
    const a = sub(pts[prev], scale(perp(dPrev), by[prev]));
    const c = sub(p, scale(perp(dCur), by[i]));
    return lineIntersect(a, dPrev, c, dCur) ?? c;
  });
}

/** Build the roof over a level, sitting on its wall tops (heights relative to the level's floor). */
export function roofGeometry(level: Level, roof: Roof): RoofGeometry | null {
  const blocks = wallOutline(level);
  if (!blocks.length) return null;
  const H = level.height;
  const tan = Math.tan((Math.max(5, Math.min(70, roof.pitch)) * Math.PI) / 180);
  const out: RoofGeometry = { faces: [], eaves: [], outline: [], lines: [] };

  for (const block of blocks) {
    const n = block.pts.length;
    const eave = outsetLoop(block.pts, block.halfThickness.map((t) => t + roof.overhang));
    out.outline.push(eave);

    if (roof.kind === 'flat') {
      const top = eave.map((p) => ({ ...p, z: H + FLAT_THICKNESS }));
      out.faces.push({ pts: top, kind: 'flat' });
      eave.forEach((p, i) => {
        const q = eave[(i + 1) % n];
        out.eaves.push([
          { ...p, z: H + FLAT_THICKNESS },
          { ...q, z: H + FLAT_THICKNESS },
        ]);
      });
      continue;
    }

    // First pass: which ends become gables (triangular hip ends not sharing an apex).
    let gables = new Set<number>();
    if (roof.kind === 'gable') {
      const first = skeleton(eave);
      if (!first) return null;
      gables = pickGables(eave, first);
    }
    // Gable walls stand in the plane of the wall below, so those edges get no overhang.
    const ring = outsetLoop(
      block.pts,
      block.halfThickness.map((t, i) => (gables.has(i) ? t : t + roof.overhang)),
    );
    const sk = skeleton(ring);
    if (!sk) return null;
    const base = H - roof.overhang * tan;
    const z = (d: number) => base + d * tan;
    const faces = sk.map((f) => ({ edge: f.edge, pts: f.pts.map((p) => ({ x: p.x, y: p.y, z: z(p.d) })) }));

    // Pull each gable apex out onto its wall line, in every face that uses it.
    for (const i of gables) {
      const face = faces.find((f) => f.edge === i);
      if (!face || face.pts.length !== 3) continue;
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const found = face.pts.find((p) => dist(p, a) > 1e-6 && dist(p, b) > 1e-6);
      if (!found) continue;
      // Copy it: the loop below moves this very point, and must keep matching the others.
      const apex = { x: found.x, y: found.y };
      const onWall = projectOnSegment(apex, a, b).point;
      for (const f of faces) {
        for (const p of f.pts) {
          if (Math.abs(p.x - apex.x) < 1e-6 && Math.abs(p.y - apex.y) < 1e-6) {
            p.x = onWall.x;
            p.y = onWall.y;
          }
        }
      }
    }
    for (const f of faces) {
      const isGable = gables.has(f.edge);
      out.faces.push({ pts: f.pts, kind: isGable ? 'gable' : 'slope' });
      if (!isGable) {
        const a = ring[f.edge];
        const b = ring[(f.edge + 1) % n];
        out.eaves.push([
          { ...a, z: base },
          { ...b, z: base },
        ]);
      }
      // Ridge, hip and valley lines: face edges that aren't on the outline.
      f.pts.forEach((p, k) => {
        const q = f.pts[(k + 1) % f.pts.length];
        if (p.z > base + 1e-6 || q.z > base + 1e-6) out.lines.push([{ x: p.x, y: p.y }, { x: q.x, y: q.y }]);
      });
    }
  }
  return out;
}

interface SkFace {
  /** Index of the outline edge (ring[i] -> ring[i+1]) this face rises from. */
  edge: number;
  /** Face outline; d = horizontal distance from the eaves (so height = d * tan pitch). */
  pts: { x: number; y: number; d: number }[];
}

function skeleton(ring: Vec2[]): SkFace[] | null {
  try {
    const sk = SkeletonBuilder.BuildFromGeoJSON([[ring.map((p) => [p.x, p.y])]]);
    const faces: SkFace[] = [];
    for (const e of sk.Edges) {
      const bx = e.Edge.Begin.X;
      const by = e.Edge.Begin.Y;
      const edge = ring.findIndex((p) => Math.abs(p.x - bx) < 1e-6 && Math.abs(p.y - by) < 1e-6);
      if (edge < 0) return null;
      faces.push({ edge, pts: e.Polygon.map((p) => ({ x: p.X, y: p.Y, d: sk.Distances.get(p) ?? 0 })) });
    }
    return faces.length === ring.length ? faces : null;
  } catch {
    return null;
  }
}

/** The hip ends to turn into gables: triangular ends whose apex is theirs alone. */
function pickGables(ring: Vec2[], faces: SkFace[]): Set<number> {
  const n = ring.length;
  const apexOf = (f: SkFace) => {
    const a = ring[f.edge];
    const b = ring[(f.edge + 1) % n];
    return f.pts.length === 3 ? f.pts.find((p) => dist(p, a) > 1e-6 && dist(p, b) > 1e-6) : undefined;
  };
  const tris = faces.filter((f) => apexOf(f));
  const key = (p: { x: number; y: number }) => `${p.x.toFixed(5)},${p.y.toFixed(5)}`;
  const count = new Map<string, number>();
  for (const f of tris) count.set(key(apexOf(f)!), (count.get(key(apexOf(f)!)) ?? 0) + 1);
  const chosen = new Set<number>();
  // An apex shared by several hip ends is a pyramid peak: leave those hipped.
  for (const f of tris) if (count.get(key(apexOf(f)!)) === 1) chosen.add(f.edge);
  return chosen;
}

/** Drop repeated and collinear points (the union of rooms leaves joints along straight walls). */
function simplify(ring: Vec2[]): Vec2[] {
  let pts = ring.filter((p, i) => dist(p, ring[(i + 1) % ring.length]) > 1e-6);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if (Math.abs(cross(sub(b, a), sub(c, b))) < 1e-9 * Math.max(1, dist(a, c))) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

