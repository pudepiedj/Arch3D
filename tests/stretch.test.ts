import { describe, expect, it } from 'vitest';
import { addLevelOnTop, createBuilding } from '../src/model/building';
import { addFurniture } from '../src/model/furniture';
import { computeFootprints, wallPoint } from '../src/model/joints';
import { placeOpening } from '../src/model/openings';
import { addWall, findWallInterior, planBounds } from '../src/model/plan';
import { detectRooms } from '../src/model/rooms';
import { stretch } from '../src/model/stretch';
import type { Level } from '../src/model/types';

function box(level: Level, pts: [number, number][]) {
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    addWall(level, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: level.height });
  });
}

/** Where a door or window is, in plan. */
function at(level: Level, id: string) {
  const o = level.openings[id];
  return wallPoint(computeFootprints(level).get(o.wallId)!, o.offset, 0);
}

function opening(level: Level, x: number, y: number, kind: 'door' | 'window') {
  const hit = findWallInterior(level, { x, y }, 0.01)!;
  return placeOpening(level, hit.wallId, hit.u, kind)!;
}

/** A two-storey 10 x 8 house with a partition at x = 5 on the ground floor. */
function house() {
  const b = createBuilding();
  const g = b.levels[0];
  box(g, [[0, 0], [10, 0], [10, 8], [0, 8]]);
  addWall(g, { x: 5, y: 0 }, { x: 5, y: 8 }, { thickness: 0.12, height: g.height });
  const f = addLevelOnTop(b, false);
  box(f, [[0, 0], [10, 0], [10, 8], [0, 8]]);
  return { b, g, f };
}

describe('stretch', () => {
  it('shortens a house by moving everything right of the cut, on every floor', () => {
    const { b, g, f } = house();
    stretch(b, { x0: 6, y0: -1, x1: 11, y1: 9 }, { x: -1, y: 0 });
    for (const level of [g, f]) {
      const bb = planBounds(level)!;
      expect(bb.min.x).toBeCloseTo(0, 9);
      expect(bb.max.x).toBeCloseTo(9, 9);
    }
    // The partition, left of the box, has not moved; the rooms are 5 and 4 m wide.
    const widths = detectRooms(g).map((r) => Math.max(...r.polygon.map((p) => p.x)) - Math.min(...r.polygon.map((p) => p.x)));
    expect(widths.sort()).toEqual([4, 5].map((w) => expect.closeTo(w, 9)) as unknown as number[]);
  });

  it('keeps doors and windows outside the box where they were, and moves those inside', () => {
    const { b, g } = house();
    const left = opening(g, 3, 0, 'window');
    const right = opening(g, 8, 0, 'window');
    const end = opening(g, 10, 4, 'door');
    stretch(b, { x0: 6, y0: -1, x1: 11, y1: 9 }, { x: -1, y: 0 });
    expect(at(g, left.id).x).toBeCloseTo(3, 6);
    expect(at(g, right.id).x).toBeCloseTo(7, 6);
    const e = at(g, end.id);
    expect(e.x).toBeCloseTo(9, 6);
    expect(e.y).toBeCloseTo(4, 6);
  });

  it('moves furniture inside the box and leaves the rest', () => {
    const { b, g } = house();
    const sofa = addFurniture(g, 'sofa3', { x: 8, y: 4 });
    const piano = addFurniture(g, 'grand', { x: 2.5, y: 4 });
    stretch(b, { x0: 6, y0: -1, x1: 11, y1: 9 }, { x: -1, y: 0 });
    expect(g.furniture![sofa.id].x).toBeCloseTo(7, 9);
    expect(g.furniture![piano.id].x).toBeCloseTo(2.5, 9);
  });

  it('can lengthen as well, and only one floor when asked', () => {
    const { b, g, f } = house();
    stretch(b, { x0: -1, y0: 6, x1: 11, y1: 9 }, { x: 0, y: 1.5 }, g.id);
    expect(planBounds(g)!.max.y).toBeCloseTo(9.5, 9);
    expect(planBounds(f)!.max.y).toBeCloseTo(8, 9);
  });
});

describe('repeating a stretch', () => {
  it('moves exactly the same things again, not what the box edge lands on', () => {
    const { b, g } = house();
    const sofa = addFurniture(g, 'sofa3', { x: 8, y: 4 });
    // Box from x = 6.5: the partition at x = 5 is outside it.
    const first = stretch(b, { x0: 6.5, y0: -1, x1: 11, y1: 9 }, { x: -1.5, y: 0 });
    // The moved box's edge is now at x = 5, right on the partition; repeat with what moved.
    stretch(b, { x0: 5, y0: -1, x1: 9.5, y1: 9 }, { x: -0.5, y: 0 }, undefined, first);
    expect(planBounds(g)!.max.x).toBeCloseTo(8, 9);
    expect(g.furniture![sofa.id].x).toBeCloseTo(6, 9);
    // The partition has stayed at x = 5.
    const partition = Object.values(g.walls).find((w) => w.thickness < 0.2)!;
    expect(g.nodes[partition.a].x).toBeCloseTo(5, 9);
    expect(g.nodes[partition.b].x).toBeCloseTo(5, 9);
  });
});
