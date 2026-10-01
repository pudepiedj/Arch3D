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

let ironMat: THREE.Material | null = null;
let steelMat: THREE.Material | null = null;

/**
 * Build rails. Each line gets a handrail; segments along a wall get only the handrail,
 * open segments get balusters and a newel post at each end. In timber (the materials
 * given); wrought iron (slim black balusters with a lower rail, and a ring between every
 * other pair); or glass panels under a slim steel rail.
 */
export function buildRails(
  lines: RailLine[],
  walls: Footprint[],
  railMat: THREE.Material,
  postMat: THREE.Material,
  style: 'timber' | 'iron' | 'glass' = 'timber',
  glassMat?: THREE.Material,
): THREE.Group {
  if (style === 'iron') {
    railMat = postMat = ironMat ??= new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.45, metalness: 0.7 });
  } else if (style === 'glass') {
    railMat = postMat = steelMat ??= new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.3, metalness: 0.8 });
  }
  const iron = style === 'iron';
  const glass = style === 'glass';
  const rails: THREE.BufferGeometry[] = [];
  const posts: THREE.BufferGeometry[] = [];
  const panes: THREE.BufferGeometry[] = [];
  /** A sloping bar from (a, za) to (b, zb). */
  const bar = (a: Vec2, za: number, b: Vec2, zb: number, w: number, h: number, extra = 0) => {
    const from = new THREE.Vector3(a.x, za, a.y);
    const to = new THREE.Vector3(b.x, zb, b.y);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
    box(len + extra, h, w, new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), rails);
  };
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
      // Handrail: a slim bar from one end to the other, following the pitch.
      bar(a.p, a.z + RAIL_HEIGHT, b.p, b.z + RAIL_HEIGHT, iron ? 0.03 : glass ? 0.04 : 0.055, iron ? 0.035 : glass ? 0.04 : 0.045, wallSide ? 0 : 0.04);
      if (wallSide) continue;
      if (glass) {
        // A pane of glass under the rail, from just above the steps to just below the rail.
        const g = new THREE.BufferGeometry();
        const lo = 0.06;
        const hi = RAIL_HEIGHT - 0.03;
        const v = [
          [a.p.x, a.z + lo, a.p.y],
          [b.p.x, b.z + lo, b.p.y],
          [b.p.x, b.z + hi, b.p.y],
          [a.p.x, a.z + hi, a.p.y],
        ];
        g.setAttribute('position', new THREE.Float32BufferAttribute([...v[0], ...v[1], ...v[2], ...v[0], ...v[2], ...v[3]], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
        g.computeVertexNormals();
        panes.push(g);
        continue;
      }
      const spacing = iron ? 0.12 : BALUSTER_SPACING;
      const n = Math.max(1, Math.round(dist(a.p, b.p) / spacing));
      const along = { x: (b.p.x - a.p.x) / dist(a.p, b.p), y: (b.p.y - a.p.y) / dist(a.p, b.p) };
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const p = lerp(a.p, b.p, t);
        const railZ = a.z + (b.z - a.z) * t + RAIL_HEIGHT;
        upright(p, line.baseAt(p, railZ - RAIL_HEIGHT), railZ, iron ? 0.016 : 0.025);
        if (iron && k % 2 === 1 && k + 1 < n) {
          // A ring between this baluster and the next, in the plane of the balustrade.
          const mid = lerp(a.p, b.p, (k + 0.5) / n);
          const z = a.z + (b.z - a.z) * ((k + 0.5) / n) + RAIL_HEIGHT * 0.55;
          const r = Math.min(0.05, (dist(a.p, b.p) / n) * 0.45);
          const ring = new THREE.TorusGeometry(r, 0.006, 6, 18);
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-along.y, 0, along.x));
          ring.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(mid.x, z, mid.y), q, new THREE.Vector3(1, 1, 1)));
          posts.push(ring);
        }
      }
      if (iron) bar(a.p, a.z + 0.12, b.p, b.z + 0.12, 0.02, 0.02);
      upright(a.p, line.baseAt(a.p, a.z), a.z + RAIL_HEIGHT + 0.06, iron ? 0.035 : 0.07);
      upright(b.p, line.baseAt(b.p, b.z), b.z + RAIL_HEIGHT + 0.06, iron ? 0.035 : 0.07);
    }
  }

  const group = new THREE.Group();
  group.name = 'rails';
  for (const [geoms, mat] of [
    [rails, railMat],
    [posts, postMat],
    [panes, glassMat ?? railMat],
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
