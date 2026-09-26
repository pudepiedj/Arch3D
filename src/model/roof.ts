// Roofs.
//
// Every floor is roofed wherever nothing is built above it: the top floor all over, and
// lower floors over any single-storey parts. Each such area is a separate roof that can
// be gabled, hipped or flat, and hand-drawn roof sections (e.g. a cross gable over a bay)
// can be added on top; overlapping roofs meet along natural valleys.
//
// A sloping roof is the "straight skeleton" of its outline: every eave rises at the same
// pitch, and the slopes meet along hips, valleys and ridges. A gable end is an edge that
// doesn't slope at all. We get that by pushing the edge far away before computing the
// skeleton (so it has no influence), then trimming the roof back to the wall line and
// filling the vertical profile left there with the gable wall. Edges that run against the
// wall of a taller storey are treated the same way, without drawing a gable wall.

import { SkeletonBuilder } from 'straight-skeleton';
import { levelAbove } from './building';
import { intersectAll, subtract, unionAll } from './clip';
import {
  Vec2,
  cross,
  dist,
  dot,
  lineIntersect,
  normalize,
  perp,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  projectOnSegment,
  scale,
  segmentIntersect,
  sub,
} from './geom';
import { detectRooms } from './rooms';
import type { Building, Level, Roof, RoofEdgeSetting } from './types';

export const DEFAULT_ROOF: Roof = { kind: 'gable', pitch: 35, overhang: 0.3 };
export const DEFAULT_LOWER_ROOF: Roof = { kind: 'flat', pitch: 35, overhang: 0.15 };
export const FLAT_THICKNESS = 0.25;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface RoofFace {
  pts: Point3[];
  /** 'slope' is roof covering; 'gable' is the vertical wall under a gable end. */
  kind: 'slope' | 'gable' | 'flat';
}

export interface RoofGeometry {
  faces: RoofFace[];
  /** Eave lines (at the bottom of the slopes), for fascia boards. */
  eaves: [Point3, Point3][];
  /** Plan drawing: the eave outline, plus ridges, hips and valleys. */
  outline: Vec2[];
  lines: [Vec2, Vec2][];
}

export type EdgeRole = 'eave' | 'gable' | 'wall';

/** One roof on a floor: an uncovered area of the floor, or a hand-drawn section. */
export interface LevelRoof {
  /** 'area:<n>' or 'section:<id>'. */
  id: string;
  /** Outline along the outside faces of the walls, counter-clockwise. */
  ring: Vec2[];
  /** Edges that run against the wall of a taller storey. */
  walls: boolean[];
  roof: Roof;
  /** What each edge of `ring` became: sloping eave, gable end, or against a wall. */
  roles: EdgeRole[];
  geometry: RoofGeometry | null;
}

/** The default roof for a floor's uncovered parts (null for none). */
export function defaultRoof(b: Building, level: Level): Roof | null {
  const isTop = b.levels[b.levels.length - 1]?.id === level.id;
  const r = level.roof ?? (isTop ? DEFAULT_ROOF : DEFAULT_LOWER_ROOF);
  return r.kind === 'none' ? null : r;
}

/** Loops around the outside faces of a level's outer walls (one per separate block), counter-clockwise. */
export function outerFaces(level: Level): Vec2[][] {
  const rooms = detectRooms(level);
  if (!rooms.length) return [];
  return unionAll(rooms.map((r) => r.polygon)).map((shape) => {
    let ring = simplify(shape[0]);
    if (polygonArea(ring) < 0) ring = ring.reverse();
    return outsetLoop(ring, ring.map((a, i) => wallHalfThickness(level, a, ring[(i + 1) % ring.length])));
  });
}

/** Half the thickness of the thickest wall lying along the line a-b and overlapping it (0 if none). */
function wallHalfThickness(level: Level, a: Vec2, b: Vec2): number {
  const d = normalize(sub(b, a));
  const len = dist(a, b);
  let t = 0;
  for (const w of Object.values(level.walls)) {
    const pa = level.nodes[w.a];
    const pb = level.nodes[w.b];
    if (Math.abs(cross(d, normalize(sub(pb, pa)))) > 1e-3) continue;
    if (Math.abs(cross(d, sub(pa, a))) > 1e-3) continue;
    const u0 = Math.min(dot(sub(pa, a), d), dot(sub(pb, a), d));
    const u1 = Math.max(dot(sub(pa, a), d), dot(sub(pb, a), d));
    if (Math.min(u1, len) - Math.max(u0, 0) > 1e-3) t = Math.max(t, w.thickness);
  }
  return t / 2;
}

/** All the roofs of a floor: its uncovered areas plus any hand-drawn sections. */
export function levelRoofs(b: Building, level: Level): LevelRoof[] {
  const above = levelAbove(b, level.id);
  const aboveFaces = above ? outerFaces(above) : [];
  const onAboveWall = (a: Vec2, c: Vec2) => {
    const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
    return aboveFaces.some((ring) => ring.some((p, i) => projectOnSegment(m, p, ring[(i + 1) % ring.length]).dist < 2e-3));
  };
  const out: LevelRoof[] = [];

  const def = defaultRoof(b, level);
  const own = outerFaces(level);
  uncoveredAreas(own, aboveFaces).forEach((ring, i) => {
    const setting = (level.roofAreas ?? []).find((s) => pointInPolygon(s, ring));
    const roof = setting ? setting.roof : def;
    if (!roof || roof.kind === 'none') return;
    const walls = ring.map((p, k) => onAboveWall(p, ring[(k + 1) % ring.length]));
    out.push(makeRoof(`area:${i}`, ring, walls, roof, level.height));
  });

  for (const s of Object.values(level.roofSections ?? {})) {
    if (s.roof.kind === 'none' || s.points.length < 3) continue;
    let pts = simplify(s.points.map((p) => ({ x: p.x, y: p.y })));
    if (pts.length < 3) continue;
    if (polygonArea(pts) < 0) pts = pts.reverse();
    // An edge drawn along a wall is moved to the wall's outside face: outwards if the
    // section is over the building (a bay), inwards if it is outside it (a canopy).
    const inBuilding = (p: Vec2) => own.some((ring) => pointInPolygon(p, ring));
    // Edges drawn along one of this floor's walls with the building beyond them are
    // attached to the house: they stop at the wall's outside face and never overhang it.
    const attached: boolean[] = [];
    const ring = outsetLoop(
      pts,
      pts.map((a, k) => {
        const b2 = pts[(k + 1) % pts.length];
        const half = wallHalfThickness(level, a, b2);
        attached[k] = false;
        if (!half) return 0;
        const m = { x: (a.x + b2.x) / 2, y: (a.y + b2.y) / 2 };
        const inward = perp(normalize(sub(b2, a)));
        const probe = (d: number) => inBuilding({ x: m.x + inward.x * d, y: m.y + inward.y * d });
        // An edge on a wall with the section outside and the building beyond: the house wall.
        if (!probe(half + 0.05) && probe(-(half + 0.05))) {
          attached[k] = true;
          return -half;
        }
        return probe(0.3) ? half : -half;
      }),
    );
    const walls = ring.map((p, k) => attached[k] || onAboveWall(p, ring[(k + 1) % ring.length]));
    out.push(makeRoof(`section:${s.id}`, ring, walls, s.roof, s.base ?? level.height));
  }
  return out;
}

/** The roof areas of a floor (uncovered parts), with or without a roof set on them. */
export function roofAreaRings(b: Building, level: Level): Vec2[][] {
  const above = levelAbove(b, level.id);
  return uncoveredAreas(outerFaces(level), above ? outerFaces(above) : []);
}

function makeRoof(id: string, ring: Vec2[], walls: boolean[], roof: Roof, height: number): LevelRoof {
  const roles = edgeRoles(ring, walls, roof);
  let geometry: RoofGeometry | null = null;
  try {
    geometry = buildRoof(ring, roles, roof, height);
  } catch {
    // An outline the geometry code can't handle gets no roof rather than breaking the view.
  }
  return { id, ring, walls, roof, roles, geometry };
}

/** The parts of a floor with no floor above: its outline minus the outline of the next floor up. */
function uncoveredAreas(own: Vec2[][], above: Vec2[][]): Vec2[][] {
  let pieces: Vec2[][] = own;
  if (above.length) {
    try {
      pieces = own.flatMap((ring) => subtract(ring, above.map((a) => [a])).map((shape) => shape[0]));
    } catch {
      pieces = [];
    }
  }
  return pieces
    .map((r) => {
      let ring = simplify(r);
      if (polygonArea(ring) < 0) ring = ring.reverse();
      return ring;
    })
    .filter((ring) => {
      // Ignore slivers left where the walls above are a little thinner than those below.
      const area = polygonArea(ring);
      const perimeter = ring.reduce((s, p, i) => s + dist(p, ring[(i + 1) % ring.length]), 0);
      return ring.length >= 3 && area > 0.5 && area / perimeter > 0.2;
    });
}

/** The edge of the ring nearest to a point (within tol), or -1. */
export function findEdge(ring: Vec2[], at: { x: number; y: number }, tol = 0.35): number {
  let best = -1;
  let bestD = tol;
  ring.forEach((a, i) => {
    const d = projectOnSegment(at, a, ring[(i + 1) % ring.length]).dist;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Decide which edges slope (eaves) and which are gable ends or run against a wall. */
export function edgeRoles(ring: Vec2[], walls: boolean[], roof: Roof): EdgeRole[] {
  const n = ring.length;
  const roles: EdgeRole[] = walls.map((w) => (w ? 'wall' : 'eave'));
  if (roof.kind === 'gable') {
    if (walls.some(Boolean)) {
      // A roof built against a taller wall: its ridge runs into the wall, with the gable
      // on the far side, facing away from it.
      ring.forEach((a, i) => {
        if (!walls[i]) return;
        const d = normalize(sub(ring[(i + 1) % n], a));
        let far = -1;
        let farDist = 0;
        ring.forEach((c, j) => {
          if (walls[j]) return;
          const e = normalize(sub(ring[(j + 1) % n], c));
          const gap = Math.abs(cross(d, sub(c, a)));
          if (dot(d, e) < -0.95 && gap > farDist) {
            far = j;
            farDist = gap;
          }
        });
        if (far >= 0) roles[far] = 'gable';
      });
    } else {
      for (const i of autoGables(ring, roof)) roles[i] = 'gable';
    }
  }
  if (roof.kind === 'gable' || roof.kind === 'hip') {
    for (const e of roof.edges ?? []) {
      const i = findEdge(ring, e);
      if (i >= 0 && !walls[i]) roles[i] = e.type;
    }
  }
  return roles;
}

/**
 * The natural gable ends of a free-standing roof: the two ends of the main (highest)
 * ridge, plus any other hip end that comes to a point of its own, such as the end of an
 * L-shaped wing. Hip ends sharing a point (a pyramid) stay hipped.
 */
function autoGables(ring: Vec2[], roof: Roof): number[] {
  const n = ring.length;
  const faces = skeleton(outsetLoop(ring, ring.map(() => roof.overhang)));
  if (!faces) return [];
  const chosen = new Set<number>();

  const apexOf = (f: SkFace) => (f.pts.length === 3 ? f.pts.find((p) => p.d > 1e-9) : undefined);
  const key = (p: { x: number; y: number }) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  const count = new Map<string, number>();
  for (const f of faces) {
    const a = apexOf(f);
    if (a) count.set(key(a), (count.get(key(a)) ?? 0) + 1);
  }
  for (const f of faces) if (apexOf(f) && count.get(key(apexOf(f)!)) === 1) chosen.add(f.edge);

  // The main ridge: skeleton points at the greatest height.
  const all = faces.flatMap((f) => f.pts);
  const maxD = Math.max(...all.map((p) => p.d));
  const ridge = all.filter((p) => maxD - p.d < 1e-6);
  let r0 = ridge[0];
  let r1 = ridge[0];
  for (const p of ridge) for (const q of ridge) if (dist(p, q) > dist(r0, r1)) [r0, r1] = [p, q];
  if (r0 && dist(r0, r1) > 1e-3) {
    const dir = normalize(sub(r1, r0));
    for (const f of faces) {
      const e = normalize(sub(ring[(f.edge + 1) % n], ring[f.edge]));
      const atEnd = f.pts.some((p) => dist(p, r0) < 1e-6 || dist(p, r1) < 1e-6);
      if (atEnd && Math.abs(cross(e, dir)) > 0.95) chosen.add(f.edge);
    }
  }
  return [...chosen];
}

/** Build the 3D roof over `ring` (outside faces of the walls), sitting on wall tops at `height`. */
export function buildRoof(ring: Vec2[], roles: EdgeRole[], roof: Roof, height: number): RoofGeometry | null {
  const n = ring.length;
  const level = (i: number) => roles[i] !== 'eave';
  // Eaves overhang the walls; gable ends and wall edges stay in the wall plane.
  const eave = outsetLoop(ring, roles.map((r) => (r === 'eave' ? roof.overhang : 0)));
  const out: RoofGeometry = { faces: [], eaves: [], outline: eave, lines: [] };

  if (roof.kind === 'flat') {
    const top = height + FLAT_THICKNESS;
    out.faces.push({ pts: eave.map((p) => ({ ...p, z: top })), kind: 'flat' });
    eave.forEach((p, i) => {
      if (roles[i] === 'wall') return;
      const q = eave[(i + 1) % n];
      out.eaves.push([
        { ...p, z: top },
        { ...q, z: top },
      ]);
    });
    return out;
  }

  const tan = Math.tan((Math.max(5, Math.min(70, roof.pitch)) * Math.PI) / 180);
  const zEave = height - roof.overhang * tan;
  // Push the edges that don't slope far away so they don't shape the roof, then trim back.
  const extent = Math.max(1, ...eave.map((p) => dist(p, eave[0])));
  let faces: SkFace[] | null = null;
  if (roles.some((r) => r !== 'eave')) {
    for (const far of [extent * 20, extent * 5, extent * 2]) {
      const pushed = outsetLoop(eave, eave.map((_, i) => (level(i) ? far : 0)));
      if (isSimple(pushed) && polygonArea(pushed) > 0) faces = skeleton(pushed);
      if (faces) break;
    }
  }
  faces ??= skeleton(eave);
  if (!faces) return null;

  const pieces: Point3[][] = [];
  const planes: { plane: (p: Vec2) => number; pts: Point3[] }[] = [];
  for (const f of faces) {
    if (level(f.edge)) continue;
    const plane = planeOf(f.pts.map((p) => ({ x: p.x, y: p.y, z: zEave + p.d * tan })));
    if (!plane) continue;
    for (const shape of intersectAll(f.pts, eave)) {
      const pts = shape[0].map((p) => ({ x: p.x, y: p.y, z: plane(p) }));
      if (Math.abs(polygonArea(pts)) < 1e-6) continue;
      pieces.push(pts);
      planes.push({ plane, pts });
    }
  }
  // The skeleton library occasionally leaves part of a face out, notably where two lined-up
  // edges (a wall either side of a bay) merge. Fill any uncovered part of the outline with
  // the lowest of the neighbouring slopes, which is what the roof there must be.
  for (const hole of subtract(eave, unionAll(pieces))) {
    const ring = hole[0];
    if (Math.abs(polygonArea(ring)) < 1e-4) continue;
    // Heights already fixed around the gap, where it meets the slopes that were built.
    const known: Point3[] = [];
    for (const p of ring) {
      for (const piece of pieces) {
        const q = piece.find((v) => Math.abs(v.x - p.x) < 1e-5 && Math.abs(v.y - p.y) < 1e-5);
        if (q) known.push(q);
      }
    }
    if (known.length < 2) continue;
    // The gap belongs to the slope whose plane passes through those heights.
    const misfit = (plane: (p: Vec2) => number) => Math.max(...known.map((k) => Math.abs(plane(k) - k.z)));
    const best = [...planes].sort((u, v) => misfit(u.plane) - misfit(v.plane))[0];
    if (!best || misfit(best.plane) > 1e-3) continue;
    const pts = ring.map((p) => ({ x: p.x, y: p.y, z: best.plane(p) }));
    pieces.push(pts);
    planes.push({ plane: best.plane, pts });
  }
  for (const pts of pieces) out.faces.push({ pts, kind: 'slope' });

  // Ridges, hips and valleys for the plan: piece edges that aren't on the outline.
  const onBoundary = (p: Vec2) => eave.some((a, i) => projectOnSegment(p, a, eave[(i + 1) % n]).dist < 1e-5);
  for (const piece of pieces) {
    piece.forEach((p, k) => {
      const q = piece[(k + 1) % piece.length];
      if (!onBoundary({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })) out.lines.push([{ x: p.x, y: p.y }, { x: q.x, y: q.y }]);
    });
  }

  eave.forEach((a, i) => {
    const b = eave[(i + 1) % n];
    if (roles[i] === 'eave') {
      out.eaves.push([
        { ...a, z: zEave },
        { ...b, z: zEave },
      ]);
    } else if (roles[i] === 'gable') {
      const g = gableWall(a, b, pieces);
      if (g) out.faces.push({ pts: g, kind: 'gable' });
    }
  });
  return out;
}

/** The vertical wall filling a gable end: the roof's profile along a-b, closed along the bottom. */
function gableWall(a: Vec2, b: Vec2, pieces: Point3[][]): Point3[] | null {
  const along = normalize(sub(b, a));
  const len = dist(a, b);
  const profile: { t: number; p: Point3 }[] = [];
  for (const piece of pieces) {
    for (const p of piece) if (projectOnSegment(p, a, b).dist < 1e-5) profile.push({ t: dot(sub(p, a), along), p });
  }
  if (profile.length < 3) return null;
  profile.sort((u, v) => u.t - v.t);
  const pts: Point3[] = [];
  let lastT = -Infinity;
  for (const q of profile) {
    if (q.t - lastT < 1e-6) {
      const last = pts[pts.length - 1];
      if (q.p.z > last.z) last.z = q.p.z;
      continue;
    }
    pts.push({ ...q.p });
    lastT = q.t;
  }
  if (pts.length < 3 || profile[0].t > 1e-4 || profile[profile.length - 1].t < len - 1e-4) return null;
  return pts;
}

/** z = f(x, y) for the plane through a planar polygon (null if degenerate). */
function planeOf(pts: Point3[]): ((p: Vec2) => number) | null {
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      for (let k = j + 1; k < pts.length; k++) {
        const a = pts[i];
        const u = { x: pts[j].x - a.x, y: pts[j].y - a.y, z: pts[j].z - a.z };
        const v = { x: pts[k].x - a.x, y: pts[k].y - a.y, z: pts[k].z - a.z };
        const nx = u.y * v.z - u.z * v.y;
        const ny = u.z * v.x - u.x * v.z;
        const nz = u.x * v.y - u.y * v.x;
        if (Math.abs(nz) > 1e-9) return (p) => a.z - (nx * (p.x - a.x) + ny * (p.y - a.y)) / nz;
      }
    }
  }
  return null;
}

interface SkFace {
  /** Index of the ring edge (ring[i] -> ring[i+1]) this face rises from. */
  edge: number;
  /** Face outline; d = horizontal distance from that edge. */
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

function isSimple(ring: Vec2[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentIntersect(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Drop repeated and collinear points (the union of rooms leaves joints along straight walls). */
export function simplify(ring: Vec2[]): Vec2[] {
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

/** A point safely inside a polygon (its centroid if that is inside). */
export function pointInside(ring: Vec2[]): Vec2 {
  const c = polygonCentroid(ring);
  if (pointInPolygon(c, ring)) return c;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i - 1 + ring.length) % ring.length];
    const b = ring[i];
    const d = ring[(i + 1) % ring.length];
    const m = { x: (a.x + b.x + d.x) / 3, y: (a.y + b.y + d.y) / 3 };
    if (pointInPolygon(m, ring)) return m;
  }
  return ring[0];
}

/** Switch one edge of a roof between eave and gable end; returns the roof's new edge settings. */
export function toggleEdge(r: LevelRoof, edge: number): RoofEdgeSetting[] {
  const a = r.ring[edge];
  const b = r.ring[(edge + 1) % r.ring.length];
  const kept = (r.roof.edges ?? []).filter((e) => findEdge(r.ring, e) !== edge);
  return [...kept, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, type: r.roles[edge] === 'gable' ? 'eave' : 'gable' }];
}

/** Give one roof area of a floor its own roof (replacing any earlier setting for that area). */
export function setAreaRoof(level: Level, ring: Vec2[], roof: Roof) {
  const others = (level.roofAreas ?? []).filter((s) => !pointInPolygon(s, ring));
  const at = pointInside(ring);
  level.roofAreas = [...others, { x: at.x, y: at.y, roof }];
}

/** Go back to the floor's default roof for this area. */
export function clearAreaRoof(level: Level, ring: Vec2[]) {
  level.roofAreas = (level.roofAreas ?? []).filter((s) => !pointInPolygon(s, ring));
}

/**
 * Height of the underside of the lowest roof over point p on this floor (above the floor),
 * or null if nothing roofs it.
 */
export function roofHeightAt(b: Building, level: Level, p: Vec2): number | null {
  let best: number | null = null;
  for (const r of levelRoofs(b, level)) {
    for (const f of r.geometry?.faces ?? []) {
      if (f.kind === 'gable' || !pointInPolygon(p, f.pts)) continue;
      const z = f.kind === 'flat' ? f.pts[0].z - FLAT_THICKNESS : planeOf(f.pts)?.(p);
      if (z !== undefined && z !== null && (best === null || z < best)) best = z;
    }
  }
  return best;
}
