import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { demoBuilding } from '../src/model/demo';
import { detectRooms } from '../src/model/rooms';
import { addPatio, guardLength, patioArea, patioAt, patioShapes, setPatioSurface } from '../src/model/patios';
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

describe('a floor covering inside a room', () => {
  it('stops at the walls round it rather than vanishing under the house', () => {
    const level = demoBuilding().levels[0];
    const room = detectRooms(level).sort((a, b) => b.netArea - a.netArea)[0];
    // Drawn along the wall centre lines, as a patio would be.
    const pt = addPatio(level, room.polygon, 'rubber');
    expect(pt.module).toBe(0.5);
    expect(patioArea(level, pt)).toBeCloseTo(room.netArea, 0);
  });
});

describe('a lawn', () => {
  it('stops at the patios laid in it', () => {
    const b = createBuilding();
    const l = b.levels[0];
    const lawn = addPatio(l, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'lawn');
    expect(patioArea(l, lawn)).toBeCloseTo(100);
    addPatio(l, [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 5 }, { x: 2, y: 5 }], 'paving');
    expect(patioArea(l, lawn)).toBeCloseTo(94);
  });
});

describe('balconies', () => {
  it('get an iron railing round their open edges, not along the house', () => {
    const b = house();
    const l = b.levels[0];
    const pt = addPatio(l, [{ x: 1, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 5.5 }, { x: 1, y: 5.5 }], 'balcony');
    expect(pt.guard).toBe('iron');
    expect(pt.height).toBe(0);
    // The wall's outer face is at y = 4.15: two 1.35 m ends and the 3 m front.
    expect(guardLength(l, pt)).toBeCloseTo(3 + 2 * 1.35, 5);
    const p2 = addPatio(l, [{ x: 1, y: 8 }, { x: 2, y: 8 }, { x: 2, y: 9 }], 'paving');
    setPatioSurface(p2, 'balcony');
    expect(p2.guard).toBe('iron');
  });
});
