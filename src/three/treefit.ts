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
  const boxes = near.map((b) => {
    const xs = b.ring.map((p) => p.x);
    const ys = b.ring.map((p) => p.y);
    const m = 0.3;
    return { x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, y0: Math.min(...ys) - m, y1: Math.max(...ys) + m, z0: b.bottom - m, z1: b.peak + m };
  });
  // Does a triangle (in the floor's coordinates) come near any blocker?
  const touches = (t: number[]) => {
    const xs = [t[0], t[3], t[6]];
    const zs = [t[1], t[4], t[7]];
    const ys = [t[2], t[5], t[8]];
    return boxes.some(
      (b) =>
        Math.max(...xs) > b.x0 && Math.min(...xs) < b.x1 && Math.max(...ys) > b.y0 && Math.min(...ys) < b.y1 && Math.max(...zs) > b.z0 && Math.min(...zs) < b.z1,
    );
  };
  const v = new THREE.Vector3();
  tree.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const toLevel = mesh.matrixWorld;
    const flat = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const src = flat.getAttribute('position') as THREE.BufferAttribute;
    // Every triangle in the floor's coordinates.
    const tris: number[][] = [];
    for (let i = 0; i + 2 < src.count; i += 3) {
      const t: number[] = [];
      for (let j = 0; j < 3; j++) {
        v.fromBufferAttribute(src, i + j).applyMatrix4(toLevel);
        t.push(v.x, v.y, v.z);
      }
      tris.push(t);
    }
    if (flat !== mesh.geometry) flat.dispose();
    if (!tris.some(touches)) return;
    // Near a wall, cut the triangles small first, so that once their corners are pushed out
    // they bend round a corner of the house rather than cutting straight across it.
    const MAX = 0.25;
    const out: number[] = [];
    let changed = false;
    const stack = [...tris];
    let budget = 60000;
    while (stack.length) {
      const t = stack.pop()!;
      if (touches(t) && budget-- > 0) {
        const d = (i: number, j: number) => Math.hypot(t[i * 3] - t[j * 3], t[i * 3 + 1] - t[j * 3 + 1], t[i * 3 + 2] - t[j * 3 + 2]);
        const e = [d(0, 1), d(1, 2), d(2, 0)];
        const k = e.indexOf(Math.max(...e));
        if (e[k] > MAX) {
          // Split the longest side at its middle.
          const a = k;
          const b = (k + 1) % 3;
          const c = (k + 2) % 3;
          const P = (i: number) => t.slice(i * 3, i * 3 + 3);
          const mid = P(a).map((x, i) => (x + P(b)[i]) / 2);
          stack.push([...P(a), ...mid, ...P(c)], [...mid, ...P(b), ...P(c)]);
          continue;
        }
        const moved: number[] = [];
        for (let j = 0; j < 3; j++) {
          v.set(t[j * 3], t[j * 3 + 1], t[j * 3 + 2]);
          if (pushOut(v, near)) changed = true;
          moved.push(v.x, v.y, v.z);
        }
        // A sliver still reaching in across a corner after its corners were pushed out: leave
        // it out (at a corner of the house, too small to miss from outside).
        const mid = new THREE.Vector3((moved[0] + moved[3] + moved[6]) / 3, (moved[1] + moved[4] + moved[7]) / 3, (moved[2] + moved[5] + moved[8]) / 3);
        if (pushOut(mid, near)) {
          changed = true;
          continue;
        }
        out.push(...moved);
      } else {
        out.push(...t);
      }
    }
    if (!changed) return;
    // Back into the mesh's own coordinates.
    const back = new THREE.Matrix4().copy(toLevel).invert();
    for (let i = 0; i < out.length; i += 3) {
      v.set(out[i], out[i + 1], out[i + 2]).applyMatrix4(back);
      out[i] = v.x;
      out[i + 1] = v.y;
      out[i + 2] = v.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    mesh.geometry = geo;
  });
}

