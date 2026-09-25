// Turns the plan into three.js geometry.
//
// Walls are not boxes with holes cut out (CSG). Each wall is assembled directly from its
// mitred footprint: the two long faces are tiled around the openings, and each opening
// gets its reveals (jambs, head, sill) across the wall thickness. So no matter how the
// plan is edited, the result is watertight at joints and has no stray slivers.

import * as THREE from 'three';
import { Vec2, sub, dot } from '../model/geom';
import { computeFootprints, type Footprint, wallPoint } from '../model/joints';
import { openingsOf } from '../model/openings';
import { detectRooms } from '../model/rooms';
import { ceilingHeight, levelElevation } from '../model/building';
import type { Building, Opening, Plan } from '../model/types';

export interface Materials {
  wall: THREE.Material;
  wallTop: THREE.Material;
  floor: THREE.Material;
  frame: THREE.Material;
  glass: THREE.Material;
  door: THREE.Material;
  ceiling: THREE.Material;
}

export function createMaterials(): Materials {
  return {
    wall: new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 0.9, side: THREE.DoubleSide }),
    wallTop: new THREE.MeshStandardMaterial({ color: 0x55575c, roughness: 0.8, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ color: 0xc8a57c, roughness: 0.7, shadowSide: THREE.DoubleSide }),
    frame: new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xa8cde8,
      roughness: 0.05,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    door: new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.6 }),
    // One-sided: seen from inside the room, invisible when looking down from above.
    ceiling: new THREE.MeshStandardMaterial({ color: 0xfbfaf8, roughness: 0.95, shadowSide: THREE.DoubleSide }),
  };
}

/** Door leaves are shown open by this angle so you can walk through. */
const DOOR_OPEN_DEG = 80;
const FRAME = 0.05;

/** Collects triangles with an explicit outward normal so winding is always right. */
class Mesher {
  pos: number[] = [];

  /** Plan point + height -> world (x, height, y). */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, outward: THREE.Vector3) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-14) return;
    if (n.dot(outward) < 0) [b, c] = [c, b];
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, outward: THREE.Vector3) {
    this.tri(a, b, c, outward);
    this.tri(a, c, d, outward);
  }

  /** Vertical rectangle standing on plan segment p->q between heights z0 and z1. */
  vface(p: Vec2, q: Vec2, z0: number, z1: number, outward: THREE.Vector3) {
    if (z1 - z0 < 1e-6) return;
    this.quad(w3(p, z0), w3(q, z0), w3(q, z1), w3(p, z1), outward);
  }

  /** Horizontal polygon at height z. */
  hpoly(pts: Vec2[], z: number, up: boolean) {
    const contour = pts.map((p) => new THREE.Vector2(p.x, p.y));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const n = new THREE.Vector3(0, up ? 1 : -1, 0);
    for (const [i, j, k] of tris) this.tri(w3(pts[i], z), w3(pts[j], z), w3(pts[k], z), n);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.computeVertexNormals();
    return g;
  }
}

const w3 = (p: Vec2, z: number) => new THREE.Vector3(p.x, z, p.y);
const n3 = (p: Vec2, s = 1) => new THREE.Vector3(p.x * s, 0, p.y * s);

export interface LevelOptions {
  /** Height of the ceiling above this floor, or null for no ceilings. */
  ceiling: number | null;
}

/**
 * The whole building: each level built in its own coordinates and lifted to its elevation.
 * `upTo` hides the levels above it (a doll's-house cutaway) and that level's ceilings.
 */
export function buildBuildingObject(b: Building, mats: Materials, upTo?: string): THREE.Group {
  const group = new THREE.Group();
  const cut = upTo ? b.levels.findIndex((l) => l.id === upTo) : -1;
  b.levels.forEach((level, i) => {
    if (cut >= 0 && i > cut) return;
    const obj = buildPlanObject(level, mats, { ceiling: i === cut ? null : ceilingHeight(b, level) });
    obj.position.y = levelElevation(b, level.id);
    obj.name = `level:${level.id}`;
    group.add(obj);
  });
  return group;
}

export function buildPlanObject(plan: Plan, mats: Materials, opts: LevelOptions = { ceiling: null }): THREE.Group {
  const group = new THREE.Group();
  const fps = computeFootprints(plan);
  const sides = new Mesher();
  const tops = new Mesher();

  // Heights of the other walls at each node, to cap a taller wall above a lower neighbour.
  const heightsAt = new Map<string, number[]>();
  for (const w of Object.values(plan.walls)) {
    for (const n of [w.a, w.b]) {
      if (!heightsAt.has(n)) heightsAt.set(n, []);
      heightsAt.get(n)!.push(w.height);
    }
  }
  const lowestNeighbour = (nodeId: string, own: number, deg: number) => {
    if (deg <= 1) return 0;
    const hs = [...heightsAt.get(nodeId)!];
    hs.splice(hs.indexOf(own), 1);
    return Math.min(...hs);
  };

  for (const w of Object.values(plan.walls)) {
    const fp = fps.get(w.id);
    if (!fp) continue;
    const ops = openingsOf(plan, w.id);
    buildWall(sides, tops, fp, ops);
    const mid = wallPoint(fp, fp.length / 2, 0);
    endCap(sides, fp, 'a', lowestNeighbour(w.a, w.height, fp.degA), mid);
    endCap(sides, fp, 'b', lowestNeighbour(w.b, w.height, fp.degB), mid);
    for (const o of ops) group.add(buildOpeningObject(fp, o, mats));
  }

  const wallMesh = new THREE.Mesh(sides.geometry(), mats.wall);
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  wallMesh.name = 'walls';
  const topMesh = new THREE.Mesh(tops.geometry(), mats.wallTop);
  topMesh.castShadow = true;
  group.add(wallMesh, topMesh);

  const floors = new Mesher();
  const ceilings = new Mesher();
  for (const r of detectRooms(plan)) {
    // Slightly above the level's datum so it never fights with wall tops of the floor below.
    floors.hpoly(r.polygon, 0.005, true);
    if (opts.ceiling !== null) ceilings.hpoly(r.polygon, opts.ceiling - 0.001, false);
  }
  if (opts.ceiling !== null) {
    const ceilingMesh = new THREE.Mesh(ceilings.geometry(), mats.ceiling);
    ceilingMesh.castShadow = true;
    ceilingMesh.name = 'ceilings';
    group.add(ceilingMesh);
  }
  const floorMesh = new THREE.Mesh(floors.geometry(), mats.floor);
  floorMesh.receiveShadow = floorMesh.castShadow = true;
  floorMesh.name = 'floors';
  group.add(floorMesh);
  return group;
}

function buildWall(sides: Mesher, tops: Mesher, fp: Footprint, ops: Opening[]) {
  const H = fp.height;
  const half = fp.thickness / 2;
  const left = n3(fp.n);
  const right = n3(fp.n, -1);

  // Long faces, tiled around the openings.
  for (const [v, u0, u1, out] of [
    [half, fp.uL0, fp.uL1, left],
    [-half, fp.uR0, fp.uR1, right],
  ] as const) {
    let cursor = u0;
    for (const o of ops) {
      const lo = o.offset - o.width / 2;
      const hi = o.offset + o.width / 2;
      sides.vface(wallPoint(fp, cursor, v), wallPoint(fp, lo, v), 0, H, out);
      sides.vface(wallPoint(fp, lo, v), wallPoint(fp, hi, v), 0, o.sill, out);
      sides.vface(wallPoint(fp, lo, v), wallPoint(fp, hi, v), o.sill + o.height, H, out);
      cursor = hi;
    }
    sides.vface(wallPoint(fp, cursor, v), wallPoint(fp, u1, v), 0, H, out);
  }

  // Reveals: the inside surfaces of each opening, across the full wall thickness.
  const along = n3(fp.dir);
  const back = n3(fp.dir, -1);
  for (const o of ops) {
    const lo = o.offset - o.width / 2;
    const hi = o.offset + o.width / 2;
    const top = o.sill + o.height;
    sides.vface(wallPoint(fp, lo, -half), wallPoint(fp, lo, half), o.sill, top, along);
    sides.vface(wallPoint(fp, hi, -half), wallPoint(fp, hi, half), o.sill, top, back);
    const rect = [wallPoint(fp, lo, -half), wallPoint(fp, hi, -half), wallPoint(fp, hi, half), wallPoint(fp, lo, half)];
    if (top < H - 1e-6) sides.hpoly(rect, top, false);
    if (o.sill > 1e-6) sides.hpoly(rect, o.sill, true);
  }

  tops.hpoly(fp.polygon, H, true);
}

/** Close a wall end that is exposed: a free end, or the part above a lower neighbour. */
function endCap(m: Mesher, fp: Footprint, end: 'a' | 'b', from: number, mid: Vec2) {
  if (from >= fp.height - 1e-6) return;
  const pts =
    end === 'a'
      ? [fp.R0, ...(fp.capA ? [fp.capA] : []), fp.L0]
      : [fp.L1, ...(fp.capB ? [fp.capB] : []), fp.R1];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const e = sub(q, p);
    let nrm = { x: -e.y, y: e.x };
    const c = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if (dot(nrm, sub(c, mid)) < 0) nrm = { x: -nrm.x, y: -nrm.y };
    m.vface(p, q, from, fp.height, n3(nrm));
  }
}

/** Frame, glass and door leaf, built in the wall's local frame (u along, y up, v across). */
function buildOpeningObject(fp: Footprint, o: Opening, mats: Materials): THREE.Object3D {
  const g = new THREE.Group();
  g.name = `opening:${o.id}`;
  const basis = new THREE.Matrix4().makeBasis(n3(fp.dir), new THREE.Vector3(0, 1, 0), n3(fp.n));
  basis.setPosition(fp.a.x, 0, fp.a.y);
  g.matrixAutoUpdate = false;
  g.matrix.copy(basis);

  const lo = o.offset - o.width / 2;
  const hi = o.offset + o.width / 2;
  const top = o.sill + o.height;
  const t = fp.thickness;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  if (o.kind === 'window') {
    const depth = Math.min(0.08, t);
    box(FRAME, o.height, depth, lo + FRAME / 2, o.sill + o.height / 2, 0, mats.frame);
    box(FRAME, o.height, depth, hi - FRAME / 2, o.sill + o.height / 2, 0, mats.frame);
    box(o.width, FRAME, depth, o.offset, top - FRAME / 2, 0, mats.frame);
    box(o.width, FRAME, depth, o.offset, o.sill + FRAME / 2, 0, mats.frame);
    if (o.width > 1.0) box(FRAME * 0.8, o.height, depth, o.offset, o.sill + o.height / 2, 0, mats.frame);
    // Window board on the inside and a small sill outside.
    box(o.width + 0.1, 0.03, t / 2 + 0.04, o.offset, o.sill - 0.015, t / 4 + 0.02, mats.frame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(o.width - 2 * FRAME, o.height - 2 * FRAME), mats.glass);
    glass.position.set(o.offset, o.sill + o.height / 2, 0);
    g.add(glass);
  } else {
    // Door lining covers the reveals.
    const depth = t + 0.01;
    box(FRAME / 2, o.height, depth, lo + FRAME / 4, o.height / 2, 0, mats.frame);
    box(FRAME / 2, o.height, depth, hi - FRAME / 4, o.height / 2, 0, mats.frame);
    box(o.width, FRAME / 2, depth, o.offset, top - FRAME / 4, 0, mats.frame);
    const leafW = o.width - FRAME;
    const leafH = o.height - FRAME / 2 - 0.01;
    const leafT = 0.04;
    const hingeSign = o.hingeFlip ? -1 : 1; // +1: hinge at the low-u jamb
    const side = o.swingFlip ? -1 : 1; // +1: opens towards the wall's left (+v) face
    const pivot = new THREE.Group();
    pivot.position.set(o.hingeFlip ? hi - FRAME / 2 : lo + FRAME / 2, 0, side * (t / 2 - leafT / 2));
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, leafT), mats.door);
    leaf.position.set((hingeSign * leafW) / 2, leafH / 2 + 0.005, 0);
    leaf.castShadow = true;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.1), mats.frame);
    handle.position.set(hingeSign * (leafW - 0.08), 1.0, 0);
    pivot.add(leaf, handle);
    pivot.rotation.y = -side * hingeSign * THREE.MathUtils.degToRad(DOOR_OPEN_DEG);
    g.add(pivot);
  }
  return g;
}

export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
}
