import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { addFurniture, againstWall, footprint, furnitureAt, grandOutline, standingHeight } from '../src/model/furniture';
import { computeFootprints } from '../src/model/joints';
import { addPatio } from '../src/model/patios';
import { addWall } from '../src/model/plan';
import { WalkWorld } from '../src/model/walk';

function room() {
  const b = createBuilding();
  const l = b.levels[0];
  const pts: [number, number][] = [[0, 0], [6, 0], [6, 4], [0, 4]];
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % 4];
    addWall(l, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: l.height });
  });
  return { b, l };
}

describe('furniture', () => {
  it('backs onto the nearest wall, facing into the room', () => {
    const { l } = room();
    const fps = computeFootprints(l).values();
    // Near the west wall (inside face at x = 0.15): a 0.9 m deep sofa.
    const w = againstWall(fps, { x: 0.6, y: 2 }, 0.9)!;
    expect(w.at.x).toBeCloseTo(0.15 + 0.45, 6);
    expect(w.at.y).toBeCloseTo(2, 6);
    // Its front (+y in its own frame) points east, into the room.
    expect(-Math.sin(w.angle)).toBeCloseTo(1, 6);
    expect(Math.cos(w.angle)).toBeCloseTo(0, 6);
  });

  it('is not pulled to a wall that is out of reach', () => {
    const { l } = room();
    expect(againstWall(computeFootprints(l).values(), { x: 3, y: 2 }, 0.6)).toBeNull();
  });

  it('turns with its angle, and the smaller of two overlapping pieces is picked', () => {
    const { l } = room();
    const rug = addFurniture(l, 'rug', { x: 3, y: 2 });
    const table = addFurniture(l, 'coffee', { x: 3, y: 2 }, Math.PI / 2);
    const fp = footprint(table);
    const xs = fp.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.6, 6); // turned: its depth runs across
    expect(furnitureAt(l, { x: 3, y: 2 })).toBe(table.id);
    expect(furnitureAt(l, { x: 3.9, y: 2 })).toBe(rug.id);
  });

  it('stands on a deck, and blocks the way unless it is a rug', () => {
    const { b, l } = room();
    addPatio(l, [{ x: 7, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 7, y: 3 }], 'decking');
    const lounger = addFurniture(l, 'lounger', { x: 8.5, y: 1.5 });
    expect(standingHeight(l, lounger)).toBeCloseTo(0.15);
    addFurniture(l, 'coffee', { x: 3, y: 2 });
    const world = new WalkWorld(b);
    const r = world.move({ x: 1, y: 2 }, 0, { x: 3, y: 0 });
    expect(r.p.x).toBeLessThan(2.45);
  });

  it('gives the grand piano a straight bass side, a keyboard front and a curved tail', () => {
    const pts = grandOutline(1.5, 1.91);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-0.75, 6);
    expect(Math.max(...xs)).toBeCloseTo(0.75, 6);
    expect(Math.max(...ys)).toBeCloseTo(0.955, 6);
    expect(Math.min(...ys)).toBeCloseTo(-0.955, 2);
    // Towards the tail the treble side has curved in well past the middle.
    const nearTail = pts.filter((p) => p.y < -0.6);
    expect(Math.max(...nearTail.map((p) => p.x))).toBeLessThan(0);
  });
});
