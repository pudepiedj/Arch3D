import { describe, expect, it } from 'vitest';
import { addLevelOnTop, createBuilding } from '../src/model/building';
import { addWall } from '../src/model/plan';
import { addStair } from '../src/model/stairs';
import { WalkWorld } from '../src/model/walk';

/** A 10 x 6 box on two floors with a straight stair along the bottom wall. */
function house() {
  const b = createBuilding();
  const g = b.levels[0];
  const box = (level: typeof g) => {
    const pts = [
      [0, 0],
      [10, 0],
      [10, 6],
      [0, 6],
    ];
    pts.forEach(([x, y], i) => {
      const [x2, y2] = pts[(i + 1) % 4];
      addWall(level, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: level.height });
    });
  };
  box(g);
  addLevelOnTop(b, true);
  // Straight stair starting at (2, 1) going +x: 15 treads of 0.25 m, so it ends at x = 5.75.
  addStair(g, 2, 1, 0, 'straight');
  return b;
}

function walk(world: WalkWorld, from: { x: number; y: number }, foot: number, to: { x: number; y: number }) {
  let p = from;
  const n = 400;
  for (let i = 0; i < n; i++) {
    const res = world.move(p, foot, { x: (to.x - from.x) / n, y: (to.y - from.y) / n });
    p = res.p;
    foot = res.foot;
  }
  return { p, foot };
}

describe('walking', () => {
  it('climbs the stair onto the floor above and comes back down', () => {
    const b = house();
    const world = new WalkWorld(b);
    const up = walk(world, { x: 1, y: 1 }, 0, { x: 8, y: 1 });
    expect(up.foot).toBeCloseTo(2.9 + 0.005, 3);
    expect(world.levelAt(up.foot)).toBe(b.levels[1].id);
    const down = walk(world, up.p, up.foot, { x: 1, y: 1 });
    expect(down.foot).toBeCloseTo(0.005, 3);
  });

  it('cannot walk into the side of the stair from the floor below', () => {
    const world = new WalkWorld(house());
    // Walk up towards the stair side from beneath, halfway along it.
    const res = walk(world, { x: 5, y: 4 }, 0, { x: 5, y: 0.8 });
    expect(res.p.y).toBeGreaterThan(1.4);
    expect(res.foot).toBeLessThan(0.1);
  });

  it('is stopped by walls', () => {
    const world = new WalkWorld(house());
    const res = walk(world, { x: 8, y: 3 }, 0, { x: 12, y: 3 });
    expect(res.p.x).toBeLessThan(10 - 0.15 - 0.2);
  });
});
