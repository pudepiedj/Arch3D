import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { estimate } from '../src/model/estimate';
import { CATALOGUE, addFurniture } from '../src/model/furniture';
import { addHedge } from '../src/model/hedges';
import { addWall } from '../src/model/plan';
import { addDormer, dormerGeometry } from '../src/model/roofitems';
import { roofSurfaceAt } from '../src/model/roof';
import type { Level } from '../src/model/types';
import { WalkWorld } from '../src/model/walk';
import { buildFurniture } from '../src/three/furniture3d';
import { buildBuildingObject, createMaterials } from '../src/three/build';
import { buildHedge } from '../src/three/hedges3d';
import { hedgeRuns } from '../src/model/hedges';

function house() {
  const b = createBuilding();
  const g = b.levels[0];
  const pts: [number, number][] = [[0, 0], [10, 0], [10, 6], [0, 6]];
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % 4];
    addWall(g, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: g.height });
  });
  g.roof = { kind: 'gable', pitch: 40, overhang: 0.3 };
  return { b, g };
}

describe('dormers', () => {
  it('stand out of a slope, their roof running back to meet it', () => {
    const { b, g } = house();
    const d = addDormer(g, { x: 5, y: 5 });
    const geo = dormerGeometry(b, g, d)!;
    expect(geo).not.toBeNull();
    const surf = roofSurfaceAt(b, g, { x: 5, y: 5 })!;
    // Every corner of its roof that isn't at the front lies on the main roof (no gap, no poke-through).
    for (const face of geo.roof) {
      const back = face.filter((p) => Math.hypot(p.x - 5, p.y - 5) > 0.3);
      expect(back.length).toBeGreaterThan(0);
    }
    const valley = geo.roof[0][3];
    expect(valley.z).toBeCloseTo(surf.z(valley), 6);
    // The front wall stands from the slope up to the eaves, as tall as asked.
    const front = geo.walls[0];
    const zs = front.map((p) => p.z);
    expect(Math.min(...zs)).toBeCloseTo(surf.z({ x: 5, y: 5 }), 6);
    expect(Math.max(...zs)).toBeGreaterThan(Math.min(...zs) + d.height);
  });

  it('flat-roofed: a box whose top meets the slope behind', () => {
    const { b, g } = house();
    const d = addDormer(g, { x: 5, y: 5 });
    d.roof = 'flat';
    const geo = dormerGeometry(b, g, d)!;
    expect(geo.roof).toHaveLength(1);
    const surf = roofSurfaceAt(b, g, { x: 5, y: 5 })!;
    const top = geo.roof[0];
    expect(top[2].z).toBeCloseTo(surf.z(top[2]), 6);
  });

  it('only on a sloping roof, and they cut the roof and are costed', () => {
    const { b, g } = house();
    g.roof = { kind: 'flat', pitch: 0, overhang: 0.3 };
    expect(dormerGeometry(b, g, addDormer(g, { x: 5, y: 5 }))).toBeNull();
    g.roof = { kind: 'gable', pitch: 40, overhang: 0.3 };
    const obj = buildBuildingObject(b, createMaterials());
    expect(obj.getObjectByName('dormers')).toBeTruthy();
    expect(estimate(b, null).some((l) => l.price === 'dormer' && l.qty === 1)).toBe(true);
  });
});

describe('the new furniture', () => {
  it('every new piece builds', () => {
    const lvl = createBuilding().levels[0];
    for (const kind of ['aga', 'larder', 'wallunit', 'downlight', 'downlightrow', 'pagoda', 'jetty', 'flagpole']) {
      expect(CATALOGUE.some((c) => c.kind === kind), kind).toBe(true);
      const f = addFurniture(lvl, kind, { x: 0, y: 0 });
      const box = new THREE.Box3().setFromObject(buildFurniture(f));
      expect(box.isEmpty(), kind).toBe(false);
    }
  });

  it('a wall cupboard hangs above the floor, with lights under it', () => {
    const f = addFurniture(createBuilding().levels[0], 'wallunit', { x: 0, y: 0 });
    expect(f.lift).toBeCloseTo(1.45, 6);
    const box = new THREE.Box3().setFromObject(buildFurniture(f));
    expect(box.min.y).toBeGreaterThan(1.4);
    expect(f.open).toBe(true);
  });

  it('a flag flies from the top of its pole', () => {
    const f = addFurniture(createBuilding().levels[0], 'flagpole', { x: 0, y: 0 });
    const box = new THREE.Box3().setFromObject(buildFurniture(f));
    expect(box.max.y).toBeGreaterThan(f.height);
    expect(box.max.x).toBeGreaterThan(1);
  });

  it('you can walk out along a jetty over a pond', () => {
    const b = createBuilding();
    const l: Level = b.levels[0];
    addFurniture(l, 'pond', { x: 0, y: 0 });
    // A jetty from the bank (y = 3) out to the middle.
    addFurniture(l, 'jetty', { x: 0, y: 1.5 });
    const w = new WalkWorld(b);
    const r = w.move({ x: 0, y: 4 }, 0, { x: 0, y: -3 });
    expect(r.p.y).toBeLessThan(1.5);
    // Away from the jetty the water still stops you at its edge.
    expect(w.move({ x: 3, y: -0.9 }, 0, { x: -3, y: 0 }).p.x).toBeGreaterThan(1);
  });
});

describe('palisade fence', () => {
  it('is a fence of spaced pointed pales', () => {
    const l = createBuilding().levels[0];
    const h = addHedge(l, [{ x: 0, y: 0 }, { x: 6, y: 0 }], 'palisade');
    const g = buildHedge(h, hedgeRuns(h, l), { leaf: 1, autumn: false });
    let pales = 0;
    g.traverse((o) => ((o as THREE.InstancedMesh).isInstancedMesh ? (pales = Math.max(pales, (o as THREE.InstancedMesh).count)) : 0));
    expect(pales).toBeGreaterThan(40);
  });
});

describe('flags, hot tub, sauna and porch', () => {
  it('every flag, the hot tub (cover on and off), the sauna and the porch build', () => {
    const lvl = createBuilding().levels[0];
    for (const flag of ['union', 'stgeorge', 'scotland', 'wales', 'norfolk', 'white', 'none']) {
      const f = addFurniture(lvl, 'flagpole', { x: 0, y: 0 });
      f.finish = flag;
      expect(new THREE.Box3().setFromObject(buildFurniture(f)).isEmpty()).toBe(false);
    }
    for (const kind of ['hottub', 'sauna', 'porch']) {
      const f = addFurniture(lvl, kind, { x: 0, y: 0 });
      for (const open of [false, true]) {
        f.open = open;
        expect(new THREE.Box3().setFromObject(buildFurniture(f)).isEmpty(), kind).toBe(false);
      }
    }
  });

  it('the porch roof rises to a ridge over its walls', () => {
    const f = addFurniture(createBuilding().levels[0], 'porch', { x: 0, y: 0 });
    const box = new THREE.Box3().setFromObject(buildFurniture(f));
    expect(box.max.y).toBeGreaterThan(f.height + (f.width / 2) * Math.tan((40 * Math.PI) / 180) - 0.01);
  });

  it('you walk into the porch through its open door, but not through its walls', () => {
    const b = createBuilding();
    const f = addFurniture(b.levels[0], 'porch', { x: 0, y: 0 });
    const into = () => new WalkWorld(b).move({ x: 0, y: 2 }, 0, { x: 0, y: -2 }).p.y;
    expect(into()).toBeGreaterThan(0.6); // the door is shut
    f.open = true;
    expect(into()).toBeLessThan(0.3);
    // Through a side wall: no.
    expect(new WalkWorld(b).move({ x: 2, y: 0 }, 0, { x: -2, y: 0 }).p.x).toBeGreaterThan(1);
  });
});
