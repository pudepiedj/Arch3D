import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { estimate } from '../src/model/estimate';
import { addFurniture } from '../src/model/furniture';
import { vineCount, vineRows, vinesAlong } from '../src/model/vineyard';
import { WalkWorld } from '../src/model/walk';
import { buildFurniture } from '../src/three/furniture3d';

function vineyard() {
  const b = createBuilding();
  const f = addFurniture(b.levels[0], 'vineyard', { x: 0, y: 0 });
  return { b, f };
}

const instanced = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((c) => ((c as THREE.InstancedMesh).isInstancedMesh ? (n += (c as THREE.InstancedMesh).count) : 0));
  return n;
};

describe('vineyard', () => {
  it('plants rows 1 m apart with vines 1 m apart, half a gap in from the edges', () => {
    const { f } = vineyard();
    const rows = vineRows(f);
    expect(rows).toHaveLength(10);
    expect(rows[1] - rows[0]).toBeCloseTo(1, 9);
    expect(rows[0]).toBeCloseTo(-4.5, 9);
    expect(vinesAlong(f)).toHaveLength(20);
    expect(vineCount(f).vines).toBe(200);
    f.rowGap = 2.5;
    expect(vineRows(f)).toHaveLength(4);
  });

  it('builds through the year: leaves and grapes in summer and autumn, bare canes in winter', () => {
    const { f } = vineyard();
    const summer = buildFurniture(f, { leaf: 1, autumn: false });
    const winter = buildFurniture(f, { leaf: 0, autumn: false });
    expect(instanced(summer)).toBeGreaterThan(200 + 400); // trunks, leaves, grapes
    expect(instanced(winter)).toBeGreaterThan(200 + 600); // trunks and canes
    // Taller trellis, taller vines.
    const top = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).max.y;
    f.height = 2.6;
    expect(top(buildFurniture(f))).toBeGreaterThan(2.5);
  });

  it('lets the walker down between the rows but not across them', () => {
    const { b } = vineyard();
    const w = new WalkWorld(b);
    // Between rows at x = 0 (rows at -0.5 and 0.5): walk the length of the row.
    expect(w.move({ x: 0, y: -12 }, 0, { x: 0, y: 6 }).p.y).toBeGreaterThan(-6.5);
    // Across the rows.
    expect(w.move({ x: 0, y: 0 }, 0, { x: 2, y: 0 }).p.x).toBeLessThan(0.5);
  });

  it('is costed by the vine and by the metre of trellis', () => {
    const { b } = vineyard();
    const lines = estimate(b, null);
    expect(lines.find((l) => l.price === 'vine')?.qty).toBe(200);
    expect(lines.find((l) => l.price === 'vine-trellis')?.qty).toBeCloseTo(200, 6);
  });
});
