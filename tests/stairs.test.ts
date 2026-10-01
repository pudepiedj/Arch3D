import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { subtract, unionAll } from '../src/model/clip';
import { polygonArea } from '../src/model/geom';
import { addStair, placedStair, riserCount, stairAt, stairBase, stairEnds, stairGeometry, stairRise, stairwells } from '../src/model/stairs';
import { addPatio } from '../src/model/patios';
import type { Stair } from '../src/model/types';

const base: Stair = { id: 's', x: 0, y: 0, angle: 0, width: 1, going: 0.25, shape: 'straight', turn: 'left' };
const area = (polys: { x: number; y: number }[][]) => polys.reduce((s, p) => s + Math.abs(polygonArea(p)), 0);

describe('stair layout', () => {
  it('uses the fewest risers that keep each step under 19 cm', () => {
    expect(riserCount(2.9)).toBe(16);
    expect(riserCount(2.66)).toBe(14);
    expect(2.9 / riserCount(2.9)).toBeLessThanOrEqual(0.19);
  });

  it('a straight stair has one tread fewer than risers and climbs evenly', () => {
    const g = stairGeometry(base, 2.9);
    expect(g.treads).toHaveLength(15);
    expect(g.treads[0].top).toBeCloseTo(2.9 / 16);
    expect(g.treads[14].top).toBeCloseTo((2.9 * 15) / 16);
    expect(area(g.parts)).toBeCloseTo(15 * 0.25 * 1);
  });

  for (const shape of ['L', 'U'] as const) {
    for (const turn of ['left', 'right'] as const) {
      it(`${shape} stair turning ${turn}: every step one riser higher, no overlaps`, () => {
        const g = stairGeometry({ ...base, shape, turn }, 2.9);
        expect(g.treads).toHaveLength(15);
        g.treads.forEach((t, i) => expect(t.top).toBeCloseTo(((i + 1) * 2.9) / 16));
        expect(g.treads.filter((t) => t.landing)).toHaveLength(1);
        // The treads tile the stairwell exactly: no gaps, no overlaps.
        const well = unionAll(g.parts);
        expect(well).toHaveLength(1);
        expect(area(well.map((s) => s[0]))).toBeCloseTo(area(g.treads.map((t) => t.poly)), 6);
      });
    }
  }

  it('turns to the walker\'s left or right (screen y points down)', () => {
    const left = stairGeometry({ ...base, shape: 'L', turn: 'left' }, 2.9);
    const right = stairGeometry({ ...base, shape: 'L', turn: 'right' }, 2.9);
    // Walking towards +x on screen, left is up the screen (negative y).
    expect(left.path[left.path.length - 1].y).toBeLessThan(0);
    expect(right.path[right.path.length - 1].y).toBeGreaterThan(0);
  });

  it('is placed and rotated in the plan', () => {
    const g = stairGeometry({ ...base, x: 5, y: 2, angle: Math.PI / 2 }, 2.9);
    const top = g.path[g.path.length - 1];
    expect(top.x).toBeCloseTo(5);
    expect(top.y).toBeCloseTo(2 + 15 * 0.25);
  });
});

describe('stairwells', () => {
  it('are found on the level and cut out of floors', () => {
    const b = createBuilding();
    const level = b.levels[0];
    addStair(level, 1, 1, 0, 'straight');
    expect(stairAt(level, { x: 2, y: 1 })).not.toBeNull();
    expect(stairAt(level, { x: 2, y: 3 })).toBeNull();
    const wells = stairwells(level);
    expect(wells).toHaveLength(1);
    const room = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 0, y: 4 },
    ];
    const floor = subtract(room, wells);
    const net = floor.reduce((s, shape) => s + Math.abs(polygonArea(shape[0])) - shape.slice(1).reduce((h, r) => h + Math.abs(polygonArea(r)), 0), 0);
    expect(net).toBeCloseTo(24 - 15 * 0.25 * 0.9, 6);
  });
});

describe('spiral stairs', () => {
  it('wind wedge treads round a central column', () => {
    const g = stairGeometry({ ...base, shape: 'spiral', width: 0.8 }, 2.6);
    expect(g.treads).toHaveLength(g.risers - 1);
    expect(g.post).toMatchObject({ x: 0, y: 0 });
    // Every tread runs from the column out to the width, and they climb a riser at a time.
    for (const [i, t] of g.treads.entries()) {
      const r = t.poly.map((p) => Math.hypot(p.x, p.y));
      expect(Math.min(...r)).toBeCloseTo(0.06, 5);
      expect(Math.max(...r)).toBeCloseTo(0.86, 5);
      expect(t.top).toBeCloseTo((i + 1) * g.rise, 5);
    }
    // The stairwell is the circle the treads sweep.
    expect(g.parts).toHaveLength(1);
  });
});

describe('stair ends', () => {
  it('are lines across the stair at the bottom and the top', () => {
    const g = stairGeometry(base, 2.6);
    const [bottom, top] = stairEnds(g, base.width, 2.6);
    expect(bottom.z).toBe(0);
    expect(top.z).toBe(2.6);
    expect(Math.hypot(bottom.b.x - bottom.a.x, bottom.b.y - bottom.a.y)).toBeCloseTo(1);
    // The top runs across the stair (along y) at the end of the last tread.
    expect(top.a.x).toBeCloseTo(g.path[1].x);
    expect(top.b.x).toBeCloseTo(g.path[1].x);
    expect(Math.abs(top.b.y - top.a.y)).toBeCloseTo(1);
  });
});

describe('stairs on a raised patio', () => {
  it('start on its top, not inside it', () => {
    const b = createBuilding();
    const l = b.levels[0];
    addPatio(l, [{ x: -2, y: -2 }, { x: 6, y: -2 }, { x: 6, y: 4 }, { x: -2, y: 4 }], 'paving').height = 0.6;
    // Foot on the plinth, climbing away from its middle.
    const s = addStair(l, 1, 0, 0, 'straight');
    expect(stairBase(s, l)).toBeCloseTo(0.6);
    expect(stairRise(s, l)).toBeCloseTo(l.height - 0.6);
    const g = placedStair(s, l);
    expect(g.treads[0].top).toBeCloseTo(0.6 + g.rise);
    expect(g.treads.at(-1)!.top + g.rise).toBeCloseTo(l.height);
    // Steps up onto the plinth from the ground start on the ground.
    const steps = addStair(l, 1, 6.5, -Math.PI / 2, 'straight');
    expect(stairBase(steps, l)).toBe(0);
  });
});
