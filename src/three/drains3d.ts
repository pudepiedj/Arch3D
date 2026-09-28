// Drains in 3D: pipes at their depths below ground, chambers, gullies and a soakaway, with
// covers and gratings at the surface (always shown) and downpipes up the wall. Everything
// below ground is in the `below` group, shown only in the Underground view.

import * as THREE from 'three';
import type { Drains } from '../model/types';

const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts });

const M = {
  foul: mat(0xb5653a),
  surface: mat(0x3f7fc4),
  concrete: mat(0x9a9892, { transparent: true, opacity: 0.55, depthWrite: false }),
  cover: mat(0x3c3e42, { roughness: 0.5, metalness: 0.5 }),
  downpipe: mat(0x2b2d31, { roughness: 0.5 }),
  soakaway: mat(0x4f8fd0, { transparent: true, opacity: 0.35, depthWrite: false }),
  sewer: mat(0x5a4a3a),
  tank: mat(0x5f7d5a, { transparent: true, opacity: 0.6, depthWrite: false }),
  lid: mat(0x2f4f35, { roughness: 0.6 }),
  kiosk: mat(0x3f5f45, { roughness: 0.6 }),
  headwall: mat(0x9f9c94, { roughness: 0.9 }),
};

export function buildDrains(d: Drains): { below: THREE.Group; surface: THREE.Group } {
  const below = new THREE.Group();
  below.name = 'drains-below';
  const surface = new THREE.Group();
  surface.name = 'drains-surface';
  const add = (g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };

  for (const p of Object.values(d.pipes)) {
    const a = d.nodes[p.a];
    const b = d.nodes[p.b];
    if (!a || !b) continue;
    const r = p.diameter / 2000;
    const pa = new THREE.Vector3(a.x, -a.invert + r, a.y);
    const pb = new THREE.Vector3(b.x, -b.invert + r, b.y);
    const dir = new THREE.Vector3().subVectors(pb, pa);
    const len = dir.length();
    if (len < 1e-6) continue;
    const mesh = add(below, new THREE.CylinderGeometry(r, r, len, 12), p.kind === 'foul' ? M.foul : M.surface, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2, (pa.z + pb.z) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }

  for (const n of Object.values(d.nodes)) {
    const depth = n.invert;
    switch (n.fitting) {
      case 'chamber':
        if (n.round) {
          add(below, new THREE.CylinderGeometry(0.3, 0.3, depth + 0.15, 24), M.concrete, n.x, -(depth + 0.15) / 2, n.y);
          add(surface, new THREE.CylinderGeometry(0.3, 0.3, 0.02, 24), M.cover, n.x, 0.01, n.y);
        } else {
          add(below, new THREE.BoxGeometry(0.6, depth + 0.15, 0.6), M.concrete, n.x, -(depth + 0.15) / 2, n.y);
          add(surface, new THREE.BoxGeometry(0.6, 0.02, 0.6), M.cover, n.x, 0.01, n.y);
        }
        break;
      case 'gully':
        add(below, new THREE.CylinderGeometry(0.15, 0.15, depth, 16), M.concrete, n.x, -depth / 2, n.y);
        add(surface, new THREE.BoxGeometry(0.3, 0.02, 0.3), M.cover, n.x, 0.01, n.y);
        break;
      case 'downpipe':
        add(below, new THREE.CylinderGeometry(0.05, 0.05, depth, 12), M.surface, n.x, -depth / 2, n.y);
        add(surface, new THREE.CylinderGeometry(0.035, 0.035, 2.5, 12), M.downpipe, n.x, 1.25, n.y);
        break;
      case 'soakaway':
        add(below, new THREE.BoxGeometry(1.2, 1.0, 1.2), M.soakaway, n.x, -depth - 0.4, n.y);
        add(surface, new THREE.BoxGeometry(0.45, 0.02, 0.45), M.cover, n.x, 0.01, n.y);
        break;
      case 'sewer':
        add(below, new THREE.SphereGeometry(0.2, 16, 12), M.sewer, n.x, -depth, n.y);
        break;
      case 'outfall':
        // A concrete headwall in the ditch bank, the pipe's open end showing in it.
        add(surface, new THREE.BoxGeometry(0.8, depth + 0.35, 0.25), M.headwall, n.x, -(depth + 0.35) / 2 + 0.05, n.y);
        break;
      case 'treatment': {
        // The tank: its top a little below ground, its inlet at the invert.
        const t = n.tank ?? { shape: 'round', width: 1.3, depth: 1.6 };
        const top = -Math.max(0.25, depth - 0.35);
        const geo =
          t.shape === 'round' ? new THREE.CylinderGeometry(t.width / 2, t.width / 2, t.depth, 32) : new THREE.BoxGeometry(t.width, t.depth, t.width);
        add(below, geo, M.tank, n.x, top - t.depth / 2, n.y);
        // Three access risers and lids in a row across the top (primary, treatment, final).
        const gap = Math.max(0.45, t.width * 0.33);
        for (const k of [-1, 0, 1]) {
          const x = n.x + k * gap;
          add(below, new THREE.CylinderGeometry(0.18, 0.18, -top, 20), M.concrete, x, top / 2, n.y);
          add(surface, new THREE.CylinderGeometry(0.2, 0.2, 0.03, 24), M.lid, x, 0.015, n.y);
        }
        // The air blower's kiosk beside it.
        add(surface, new THREE.BoxGeometry(0.5, 0.6, 0.4), M.kiosk, n.x + t.width / 2 + 0.6, 0.3, n.y);
        break;
      }
      default:
        add(below, new THREE.SphereGeometry(0.06, 12, 8), M.concrete, n.x, -depth + 0.05, n.y);
    }
  }
  below.visible = false;
  return { below, surface };
}
