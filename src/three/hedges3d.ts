// Hedges and fences in 3D. A hedge is a clipped block along each run, its faces gently
// lumpy so it reads as foliage, coloured for the kind and the season. A fence is
// close-board: posts, a gravel board and overlapping featheredge boards.

import * as THREE from 'three';
import { FENCE_BAY, type HedgeRun } from '../model/hedges';
import type { Hedge } from '../model/types';
import type { Season } from './build';

/** One material per colour, shared by every hedge. */
const materials = new Map<number, THREE.MeshStandardMaterial>();
const material = (color: number, flat = true) => {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: flat });
    materials.set(color, m);
  }
  return m;
};

const TIMBER = 0x8a6a4a;
const POST = 0x6e5238;
const GRAVEL_BOARD = 0x8e8a82;

/** The hedge's colour: privet always green, hawthorn bare in winter, beech keeps brown leaves. */
function hedgeColour(h: Hedge, s: Season): number {
  const c = new THREE.Color();
  switch (h.kind) {
    case 'privet':
      return 0x3f6b35;
    case 'hawthorn':
      // From twiggy grey-brown when bare to green in leaf; orange-red as it turns.
      c.set(0x6d6252).lerp(new THREE.Color(s.autumn ? 0x9a6a2c : 0x5b8a3c), s.leaf);
      return c.getHex();
    case 'beech':
      if (s.leaf >= 0.95 && !s.autumn) return 0x6f8f3a;
      // Copper in autumn; the dead leaves stay on, russet-brown, through the winter.
      return s.autumn ? 0xa8632a : 0x8a5a33;
    default:
      return 0x3f6b35;
  }
}

/** A small, repeatable wobble for a point, so the hedge's faces are lumpy but joined up. */
function wobble(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

export function buildHedge(h: Hedge, runs: HedgeRun[], season: Season): THREE.Group {
  const g = new THREE.Group();
  g.name = `hedge:${h.id}`;
  if (h.kind === 'fence') buildFence(g, h, runs);
  else {
    const mat = material(hedgeColour(h, season));
    for (const { a, b, openA, openB } of runs) {
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      // On past a corner by half the thickness, to fill it; square where it meets a gate.
      const e0 = openA ? 0 : h.width / 2;
      const e1 = openB ? 0 : h.width / 2;
      const len = L + e0 + e1;
      // Lumpy enough to read as foliage, but never more detail than the graphics can take.
      const along = Math.min(240, Math.max(2, Math.round(len / 0.25)));
      const up = Math.min(12, Math.max(2, Math.round(h.height / 0.25)));
      const geo = new THREE.BoxGeometry(len, h.height, h.width, along, up, 3);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const mid = (e1 - e0) / 2 / (L || 1);
      const cx = (a.x + b.x) / 2 + (b.x - a.x) * mid;
      const cy = (a.y + b.y) / 2 + (b.y - a.y) * mid;
      // Lumpy faces, a slightly rounded top, and a narrower foot, from world positions so
      // that runs meeting at a corner match.
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const wx = cx + v.x * cos - v.z * sin;
        const wz = cy + v.x * sin + v.z * cos;
        const up = (v.y + h.height / 2) / h.height; // 0 at the foot, 1 at the top
        const n = wobble(wx, v.y, wz) * 0.09;
        const side = Math.sign(v.z) || 1;
        if (up > 0.01) {
          v.z += side * n * 0.6;
          v.x += (Math.sign(v.x) || 1) * n * 0.3;
          v.y += up > 0.99 ? Math.abs(n) * 0.5 - (Math.abs(v.z) / h.width) * 0.12 : 0;
        }
        // Clipped to be a little narrower at the top than the bottom, as good hedges are.
        v.z *= 1 - up * 0.12;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx, h.height / 2, cy);
      m.rotation.y = -angle;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
  }
  return g;
}

function buildFence(g: THREE.Group, h: Hedge, runs: HedgeRun[]) {
  const H = h.height;
  const boardW = 0.1;
  const boards: THREE.Matrix4[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, angle: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = -angle;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  for (const { a, b } of runs) {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    const n = Math.min(400, Math.max(1, Math.ceil(L / FENCE_BAY)));
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * L;
      add(new THREE.BoxGeometry(0.1, H + 0.05, 0.1), material(POST, false), a.x + ux * t, (H + 0.05) / 2, a.y + uy * t, angle);
    }
    // Gravel board along the bottom, rails behind the boards.
    add(new THREE.BoxGeometry(L, 0.15, 0.025), material(GRAVEL_BOARD, false), (a.x + b.x) / 2, 0.075, (a.y + b.y) / 2, angle);
    for (const y of [0.35, H - 0.3]) {
      add(new THREE.BoxGeometry(L, 0.08, 0.04), material(POST, false), (a.x + b.x) / 2 - uy * 0.05, y, (a.y + b.y) / 2 + ux * 0.05, angle);
    }
    // Featheredge boards, each overlapping the next, slightly staggered in and out.
    // A board every 8 cm, but (for a very long fence) no more than 3000 of them: wider boards.
    const count = Math.min(3000, Math.max(1, Math.floor(L / (boardW * 0.8))));
    const step = L / count;
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) * step;
      const off = (k % 2 ? 0.008 : -0.008) - 0.015;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(a.x + ux * t - uy * off, 0.15 + (H - 0.15) / 2, a.y + uy * t + ux * off),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle),
        new THREE.Vector3(1, 1, 1),
      );
      boards.push(m);
    }
  }
  if (boards.length) {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(boardW, H - 0.15, 0.018), material(TIMBER, false), boards.length);
    boards.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = inst.receiveShadow = true;
    g.add(inst);
  }
}
