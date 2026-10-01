import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBuilding } from '../src/model/building';
import { pointInPolygon } from '../src/model/geom';
import { addWall } from '../src/model/plan';
import { outerFaces, roofSurfaceAt } from '../src/model/roof';
import { buildBuildingObject, createMaterials } from '../src/three/build';

describe('trees beside the house', () => {
  it('grow round the walls and roof, not through them', () => {
    const b = createBuilding();
    const g = b.levels[0];
    const pts: [number, number][] = [[0, 0], [8, 0], [8, 6], [0, 6]];
    pts.forEach(([x, y], i) => {
      const [x2, y2] = pts[(i + 1) % 4];
      addWall(g, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: g.height });
    });
    g.roof = { kind: 'gable', pitch: 35, overhang: 0.3 };
    g.trees = {
      oak: { id: 'oak', x: 9.6, y: 3, kind: 'oak', height: 9, spread: 7 },
      bush: { id: 'bush', x: 3, y: 6.9, kind: 'bush', height: 1.8, spread: 2.2 },
      fir: { id: 'fir', x: -1.5, y: 1, kind: 'conifer', height: 8, spread: 4 },
    };
    const obj = buildBuildingObject(b, createMaterials());
    obj.updateMatrixWorld(true);
    const house = outerFaces(g)[0];
    const v = new THREE.Vector3();
    let checked = 0;
    for (const id of Object.keys(g.trees)) {
      obj.getObjectByName(`tree:${id}`)!.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const pos = m.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          const p = { x: v.x, y: v.z };
          checked++;
          // Not inside the walls...
          if (v.y > 0 && v.y < g.height) expect(pointInPolygon(p, house)).toBe(false);
          // ...nor in the roof (leaves may hang under the eaves).
          const roof = roofSurfaceAt(b, g, p);
          if (roof && v.y >= g.height) expect(v.y).toBeGreaterThan(roof.z(p));
        }
      });
    }
    expect(checked).toBeGreaterThan(100);
  }, 30000);
});
