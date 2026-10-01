// Trees and bushes growing beside a building: wherever a crown or a branch would pass through
// a wall or a roof, it is pushed back to just outside it, so a tree planted close to the house
// grows flat against it (as one pruned back from it would) instead of through it.

import * as THREE from 'three';
import { type Vec2, polygonArea, projectOnSegment } from '../model/geom';
import { type RoofGeometry, outsetLoop, planeOf } from '../model/roof';

/**
 * A building part a tree mustn't grow into: a prism on `ring` from `bottom` up to `top(p)`
 * (flat for a wall's top, or the roof's surface over p).
 */
export interface TreeBlocker {
  ring: Vec2[];
  bottom: number;
  top: (p: Vec2) => number;
  /** The highest `top` gets, to skip points above it quickly. */
  peak: number;
  /** Above this height, a point can be pushed up over the roof rather than out sideways. */
  eaves: number;
}

/** A wall outline (its outside faces) as a blocker, a little outside them. */
export function wallBlocker(ring: Vec2[], bottom: number, top: number): TreeBlocker {
  return { ring: grow(ring, 0.08), bottom, top: () => top, peak: top, eaves: Infinity };
}

/** A roof, from its geometry (heights above its floor, which stands at `base`). */
export function roofBlocker(g: RoofGeometry, base: number): TreeBlocker | null {
  if (g.outline.length < 3) return null;
  const faces = g.faces
    .filter((f) => f.kind !== 'gable')
    .map((f) => ({ ring: f.pts.map((q) => ({ x: q.x, y: q.y })), z: f.kind === 'flat' ? () => f.pts[0].z : planeOf(f.pts) }))
    .filter((f): f is { ring: Vec2[]; z: (p: Vec2) => number } => !!f.z);
  const zs = g.faces.flatMap((f) => f.pts.map((q) => q.z));
  const low = Math.min(...zs);
  const high = Math.max(...zs) + (g.parapet ? g.parapet.z1 - g.parapet.z0 : 0);
  return {
    ring: grow(g.outline, 0.08),
    bottom: base + low - 0.35,
    top: (p) => {
      let z = low;
      for (const f of faces) if (inside(p, f.ring)) z = Math.max(z, f.z(p));
      return base + z + 0.12;
    },
    peak: base + high + 0.12,
    eaves: base + low,
  };
}

function grow(ring: Vec2[], by: number): Vec2[] {
  const ccw = polygonArea(ring) < 0 ? [...ring].reverse() : ring;
  return outsetLoop(ccw, ccw.map(() => by));
}

function inside(p: Vec2, ring: Vec2[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** The nearest point on the ring's boundary, and how far it is. */
function nearestEdge(p: Vec2, ring: Vec2[]): { point: Vec2; dist: number } {
  let best = { point: ring[0], dist: Infinity };
  ring.forEach((a, k) => {
    const q = projectOnSegment(p, a, ring[(k + 1) % ring.length]);
    if (q.dist < best.dist) best = { point: q.point, dist: q.dist };
  });
  return best;
}

/** Move a point (x = plan x, y = height, z = plan y) out of the blockers. Returns true if it moved. */
function pushOut(v: THREE.Vector3, blockers: TreeBlocker[]): boolean {
  let moved = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of blockers) {
      if (v.y < b.bottom || v.y > b.peak) continue;
      const p = { x: v.x, y: v.z };
      if (!inside(p, b.ring)) continue;
      const top = b.top(p);
      if (v.y > top) continue;
      const edge = nearestEdge(p, b.ring);
      // Out sideways, or (above the eaves) up over the roof, whichever is the shorter way.
      if (v.y > b.eaves && top - v.y < edge.dist) {
        v.y = top + 0.03;
      } else {
        const out = { x: edge.point.x - p.x, y: edge.point.y - p.y };
        const len = Math.hypot(out.x, out.y) || 1;
        v.x = edge.point.x + (out.x / len) * 0.03;
        v.z = edge.point.y + (out.y / len) * 0.03;
      }
      moved = true;
    }
  }
  return moved;
}

/**
 * Keep the tree (a group placed on its floor, built in that floor's coordinates) out of the
 * blockers, given in the same coordinates.
 */
export function fitTree(tree: THREE.Object3D, blockers: TreeBlocker[], reach: number) {
  // Only the buildings within the tree's reach.
  const at = tree.position;
  const near = blockers.filter((b) => {
    const xs = b.ring.map((p) => p.x);
    const ys = b.ring.map((p) => p.y);
    return b.peak > -Infinity && at.x > Math.min(...xs) - reach && at.x < Math.max(...xs) + reach && at.z > Math.min(...ys) - reach && at.z < Math.max(...ys) + reach;
  });
  if (!near.length) return;
  tree.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  tree.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const toLevel = mesh.matrixWorld;
    const back = new THREE.Matrix4().copy(toLevel).invert();
    const geo = mesh.geometry.clone();
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    let changed = false;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toLevel);
      if (!pushOut(v, near)) continue;
      v.applyMatrix4(back);
      pos.setXYZ(i, v.x, v.y, v.z);
      changed = true;
    }
    if (changed) {
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      mesh.geometry = geo;
    } else {
      geo.dispose();
    }
  });
}
