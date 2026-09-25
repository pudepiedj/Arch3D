// Handrails, balusters and newel posts for stairs and stairwell guards.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Vec2, dist, lerp, pointInPolygon, projectOnSegment } from '../model/geom';
import type { Footprint } from '../model/joints';
import type { RailPoint } from '../model/stairs';

/** Handrail height above the pitch line (on stairs) or the floor (around a stairwell). */
export const RAIL_HEIGHT = 0.9;
const BALUSTER_SPACING = 0.11;

export interface RailLine {
  points: RailPoint[];
  /** Height of whatever the balusters stand on, at a point under the rail. */
  baseAt: (p: Vec2, railZ: number) => number;
}

/** True if the line from a to b runs along the face of a wall (so needs no balusters). */
export function againstWall(a: Vec2, b: Vec2, walls: Footprint[]): boolean {
  const d = dist(a, b);
  if (d < 1e-6) return false;
  const nx = -(b.y - a.y) / d;
  const ny = (b.x - a.x) / d;
  for (const t of [0.25, 0.5, 0.75]) {
    const m = lerp(a, b, t);
    const probes = [
      { x: m.x + nx * 0.1, y: m.y + ny * 0.1 },
      { x: m.x - nx * 0.1, y: m.y - ny * 0.1 },
    ];
    if (!probes.some((q) => walls.some((w) => pointInPolygon(q, w.polygon)))) return false;
  }
  return true;
}

/** True if p lies on the segment a-b (within tol). */
export function onSegment(p: Vec2, a: Vec2, b: Vec2, tol = 0.1): boolean {
  return projectOnSegment(p, a, b).dist < tol;
}

/**
 * Build rails. Each line gets a handrail; segments along a wall get only the handrail,
 * open segments get balusters and a newel post at each end.
 */
export function buildRails(lines: RailLine[], walls: Footprint[], railMat: THREE.Material, postMat: THREE.Material): THREE.Group {
  const rails: THREE.BufferGeometry[] = [];
  const posts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, m: THREE.Matrix4, into: THREE.BufferGeometry[]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(m);
    into.push(g);
  };
  const upright = (p: Vec2, z0: number, z1: number, size: number) => {
    if (z1 - z0 < 0.05) return;
    box(size, z1 - z0, size, new THREE.Matrix4().makeTranslation(p.x, (z0 + z1) / 2, p.y), posts);
  };

  for (const line of lines) {
    const pts = line.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (dist(a.p, b.p) < 1e-6) continue;
      const wallSide = againstWall(a.p, b.p, walls);
      // Handrail: a slim box from one end to the other, following the pitch.
      const from = new THREE.Vector3(a.p.x, a.z + RAIL_HEIGHT, a.p.y);
      const to = new THREE.Vector3(b.p.x, b.z + RAIL_HEIGHT, b.p.y);
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
      const m = new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
      box(len + (wallSide ? 0 : 0.04), 0.045, 0.055, m, rails);
      if (wallSide) continue;
      const n = Math.max(1, Math.round(dist(a.p, b.p) / BALUSTER_SPACING));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const p = lerp(a.p, b.p, t);
        const railZ = a.z + (b.z - a.z) * t + RAIL_HEIGHT;
        upright(p, line.baseAt(p, railZ - RAIL_HEIGHT), railZ, 0.025);
      }
      upright(a.p, line.baseAt(a.p, a.z), a.z + RAIL_HEIGHT + 0.06, 0.07);
      upright(b.p, line.baseAt(b.p, b.z), b.z + RAIL_HEIGHT + 0.06, 0.07);
    }
  }

  const group = new THREE.Group();
  group.name = 'rails';
  for (const [geoms, mat] of [
    [rails, railMat],
    [posts, postMat],
  ] as const) {
    if (!geoms.length) continue;
    const merged = mergeGeometries(geoms);
    geoms.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}
