import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { addFurniture, tankLitres } from '../src/model/furniture';
import { addHedge, ditchOutline, offsetLine } from '../src/model/hedges';
import { SPECIES, TREE_ORDER, addTree, crownBase, crownCentre, solidRadius, trunkRadius } from '../src/model/trees';
import { WalkWorld } from '../src/model/walk';
import { buildBuildingObject, createMaterials } from '../src/three/build';
import { buildDrains } from '../src/three/drains3d';
import { addDrainNode } from '../src/model/drains';

const meshes = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((c) => ((c as THREE.Mesh).isMesh ? n++ : 0));
  return n;
};

describe('tree species and bushes', () => {
  it('every kind builds, in leaf and bare', () => {
    for (const kind of TREE_ORDER) {
      for (const leaf of [1, 0]) {
        const b = createBuilding();
        addTree(b.levels[0], { x: 0, y: 0 }, kind);
        const obj = buildBuildingObject(b, createMaterials(), undefined, { leaf, autumn: false });
        expect(meshes(obj), `${kind} leaf ${leaf}`).toBeGreaterThan(0);
      }
    }
  });

  it('have their own sizes and shapes', () => {
    const b = createBuilding();
    const l = b.levels[0];
    const oak = addTree(l, { x: 0, y: 0 }, 'oak');
    const pine = addTree(l, { x: 20, y: 0 }, 'pine');
    const bush = addTree(l, { x: 40, y: 0 }, 'bush');
    expect(oak.spread).toBeGreaterThan(SPECIES.birch.spread);
    expect(crownBase(pine)).toBeGreaterThan(pine.height * 0.5);
    expect(crownBase(bush)).toBe(0);
    expect(trunkRadius(oak)).toBeGreaterThan(trunkRadius(addTree(l, { x: 60, y: 0 }, 'birch')));
    // A bush is solid right across; you walk into its leaves, not just a trunk.
    expect(solidRadius(bush)).toBeGreaterThan(0.5);
    const r = new WalkWorld(b).move({ x: 37, y: 0 }, 0, { x: 3, y: 0 });
    expect(r.p.x).toBeLessThan(40 - 0.5);
  });

  it('a rowan has berries in autumn', () => {
    const b = createBuilding();
    addTree(b.levels[0], { x: 0, y: 0 }, 'rowan');
    const summer = meshes(buildBuildingObject(b, createMaterials(), undefined, { leaf: 1, autumn: false }));
    const autumn = meshes(buildBuildingObject(b, createMaterials(), undefined, { leaf: 0.8, autumn: true }));
    expect(autumn).toBeGreaterThan(summer);
  });
});

describe('oil tank and rotary dryer', () => {
  it('hold what a tank that size holds', () => {
    expect(tankLitres(2, 1.2)).toBeCloseTo(2262, 0);
  });

  it('build, the dryer open, folded and with washing', () => {
    const b = createBuilding();
    const tank = addFurniture(b.levels[0], 'oiltank', { x: 0, y: 0 });
    const dryer = addFurniture(b.levels[0], 'rotary', { x: 5, y: 0 });
    expect(tank.width).toBeGreaterThan(tank.depth);
    expect(dryer.open).toBe(true);
    const count = () => meshes(buildBuildingObject(b, createMaterials()));
    const open = count();
    dryer.finish = 'washing';
    expect(count()).toBeGreaterThan(open);
    dryer.open = false;
    expect(count()).toBeLessThan(open);
  });
});

describe('ditches', () => {
  it('have parallel banks, mitred at corners', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const left = offsetLine(pts, 1);
    expect(left[0]).toEqual({ x: 0, y: 1 });
    expect(left[1].x).toBeCloseTo(9);
    expect(left[1].y).toBeCloseTo(1);
    const b = createBuilding();
    const h = addHedge(b.levels[0], pts, 'ditch');
    expect(ditchOutline(h).length).toBe(6);
  });

  it('are dug into the ground in 3D, and you do not walk into them', () => {
    const b = createBuilding();
    addHedge(b.levels[0], [{ x: 0, y: 5 }, { x: 20, y: 5 }], 'ditch');
    const obj = buildBuildingObject(b, createMaterials());
    const box = new THREE.Box3().setFromObject(obj);
    expect(box.min.y).toBeLessThan(-0.5);
    const r = new WalkWorld(b).move({ x: 10, y: 3 }, 0, { x: 0, y: 3 });
    expect(r.p.y).toBeLessThan(5 - 0.5);
  });

  it('take the drains through an outfall', () => {
    const b = createBuilding();
    addDrainNode(b, { x: 0, y: 5 }, 'outfall');
    const { surface } = buildDrains(b.drains!);
    expect(surface.children.length).toBe(1);
  });
});

describe('poplars and leaning trees', () => {
  it('a Lombardy poplar is tall and narrow', () => {
    const b = createBuilding();
    const t = addTree(b.levels[0], { x: 0, y: 0 }, 'poplar');
    expect(t.height / t.spread).toBeGreaterThan(4);
    const box = new THREE.Box3().setFromObject(buildBuildingObject(b, createMaterials()));
    expect(box.max.y).toBeGreaterThan(t.height * 0.9);
    expect(box.max.x - box.min.x).toBeLessThan(t.spread * 1.6);
  });

  it('a leaning tree hangs its crown the way it leans, on the plan and in 3D', () => {
    const b = createBuilding();
    const t = addTree(b.levels[0], { x: 0, y: 0 }, 'oak');
    t.lean = 15;
    t.leanTo = 90; // towards the east: +x on a plan with north up
    const c = crownCentre(t, 0);
    expect(c.x).toBeGreaterThan(1);
    expect(Math.abs(c.y)).toBeLessThan(1e-9);
    const box = new THREE.Box3().setFromObject(buildBuildingObject(b, createMaterials()));
    expect(box.max.x).toBeGreaterThan(-box.min.x + 1);
    // With the top of the plan facing east, "east" is up the plan (-y).
    expect(crownCentre(t, 90).y).toBeLessThan(-1);
  });
});
