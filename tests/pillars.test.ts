import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { placeOpening } from '../src/model/openings';
import { addPillar, pillarHeight, pillarsForSection } from '../src/model/pillars';
import { addWall, findWallInterior } from '../src/model/plan';
import { DEFAULT_ROOF, roofHeightAt } from '../src/model/roof';
import { WalkWorld } from '../src/model/walk';
import type { Level } from '../src/model/types';

function house() {
  const b = createBuilding();
  const g = b.levels[0];
  const pts = [
    [0, 0],
    [10, 0],
    [10, 6],
    [0, 6],
  ];
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % 4];
    addWall(g, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: g.height });
  });
  return { b, g };
}

/** A 3 m deep veranda along the whole front of the house, with a flat roof at 2.6 m. */
function veranda(g: Level, width = 10) {
  g.roofSections = {
    v: {
      id: 'v',
      points: [
        { x: 0, y: -3 },
        { x: width, y: -3 },
        { x: width, y: 0 },
        { x: 0, y: 0 },
      ],
      roof: { ...DEFAULT_ROOF, kind: 'flat' },
      base: 2.6,
    },
  };
}

describe('pillars under a veranda roof', () => {
  it('go at the open corners and along long open edges, not along the house wall', () => {
    const { g } = house();
    veranda(g);
    const spots = pillarsForSection(g, 'v');
    // Two front corners, plus pillars so no span along the 10 m front exceeds 3.5 m.
    const front = spots.filter((p) => p.y < -2.5);
    expect(front.length).toBe(spots.length);
    expect(front.length).toBe(2 + 2);
    // Outer faces flush with the roof outline (0.25 m pillars sit 0.125 m inside it).
    expect(Math.min(...front.map((p) => p.x))).toBeCloseTo(0.125, 6);
    expect(front[0].y).toBeCloseTo(-3 + 0.125, 6);
  });

  it('rise to the underside of the roof above them', () => {
    const { b, g } = house();
    veranda(g);
    const p = addPillar(g, { x: 1, y: -2 });
    expect(roofHeightAt(b, g, p)).toBeCloseTo(2.6, 6);
    expect(pillarHeight(b, g, p)).toBeCloseTo(2.6, 6);
    // With no roof above, a pillar is as tall as the walls.
    const lone = addPillar(g, { x: 20, y: 20 });
    expect(pillarHeight(b, g, lone)).toBeCloseTo(g.height, 6);
  });

  it('can be walked around but not through', () => {
    const { b, g } = house();
    addPillar(g, { x: 5, y: -2 });
    const world = new WalkWorld(b);
    let p = { x: 3, y: -2 };
    let foot = 0;
    for (let i = 0; i < 200; i++) ({ p, foot } = world.move(p, foot, { x: 0.02, y: 0 }));
    expect(p.x).toBeLessThan(5 - 0.125);
  });
});

describe('garage roller doors', () => {
  it('default to 2.5 m wide and can be much wider', () => {
    const { g } = house();
    const hit = findWallInterior(g, { x: 5, y: 0 })!;
    const o = placeOpening(g, hit.wallId, hit.u, 'garage')!;
    expect(o.width).toBeCloseTo(2.5);
    expect(o.sill).toBe(0);
    const wide = placeOpening(g, hit.wallId, 8.5, { kind: 'garage', width: 0.8, height: 2.1, sill: 0 });
    expect(wide).not.toBeNull();
  });

  it('block the way when shut and let you through when open', () => {
    const { b, g } = house();
    const hit = findWallInterior(g, { x: 5, y: 0 })!;
    const o = placeOpening(g, hit.wallId, hit.u, { kind: 'garage', width: 5, height: 2.1, sill: 0 })!;
    const walkIn = () => {
      const world = new WalkWorld(b);
      let p = { x: 5, y: -2 };
      let foot = 0;
      for (let i = 0; i < 200; i++) ({ p, foot } = world.move(p, foot, { x: 0, y: 0.02 }));
      return p.y;
    };
    expect(walkIn()).toBeLessThan(0);
    o.open = true;
    expect(walkIn()).toBeGreaterThan(1);
  });
});
