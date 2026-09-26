import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { addPatio, patioArea, patioAt, patioShapes, setPatioSurface } from '../src/model/patios';
import { addWall } from '../src/model/plan';
import { WalkWorld } from '../src/model/walk';

function house() {
  const b = createBuilding();
  const l = b.levels[0];
  const pts: [number, number][] = [[0, 0], [6, 0], [6, 4], [0, 4]];
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % 4];
    addWall(l, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: l.height });
  });
  return b;
}

describe('patios', () => {
  it('stops at the outside face of the walls', () => {
    const b = house();
    const l = b.levels[0];
    // Drawn from the wall centre line out to y = 7: 6 x 3.15 m remain beyond the wall's outer face.
    const pt = addPatio(l, [{ x: 0, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 7 }, { x: 0, y: 7 }], 'paving');
    expect(patioShapes(l, pt)).toHaveLength(1);
    expect(patioArea(l, pt)).toBeCloseTo(6 * 2.85, 5);
  });

  it('is found by a point on it and takes each surface its usual height', () => {
    const b = house();
    const l = b.levels[0];
    const pt = addPatio(l, [{ x: 7, y: 0 }, { x: 7, y: 3 }, { x: 10, y: 3 }, { x: 10, y: 0 }], 'decking');
    expect(patioAt(l, { x: 8, y: 1 })).toBe(pt.id);
    expect(patioAt(l, { x: 11, y: 1 })).toBeUndefined();
    expect(pt.height).toBeCloseTo(0.15);
    setPatioSurface(pt, 'paving');
    expect(pt.height).toBeCloseTo(0.04);
    expect(pt.module).toBeCloseTo(0.6);
  });

  it('can be walked onto: a deck is one step up', () => {
    const b = house();
    const l = b.levels[0];
    addPatio(l, [{ x: 7, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 7, y: 3 }], 'decking');
    const world = new WalkWorld(b);
    expect(world.groundAt({ x: 8, y: 1 }, 0)).toBeCloseTo(0.15);
    const r = world.move({ x: 12, y: 1 }, 0, { x: -3, y: 0 });
    expect(r.foot).toBeCloseTo(0.15);
  });

  it('a raised deck is too high to step onto', () => {
    const b = house();
    const l = b.levels[0];
    const pt = addPatio(l, [{ x: 7, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 7, y: 3 }], 'decking');
    pt.height = 0.8;
    const world = new WalkWorld(b);
    expect(world.groundAt({ x: 8, y: 1 }, 0)).toBe(0);
    const r = world.move({ x: 12, y: 1 }, 0, { x: -3, y: 0 });
    expect(r.p.x).toBeGreaterThan(10);
  });
});
