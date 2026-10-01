import { describe, expect, it } from 'vitest';
import { addLevelBelow, addLevelOnTop, createBuilding, createLevel, levelAbove, levelBelow, levelElevation, levelsTopDown } from '../src/model/building';
import { addWall } from '../src/model/plan';
import { defaultRoof } from '../src/model/roof';
import type { Building, Level } from '../src/model/types';

function box(l: Level, x0: number, y0: number, x1: number, y1: number) {
  const pts: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % 4];
    addWall(l, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: l.height });
  });
}

/** A garden floor, a small house on a plinth, and a large house half below ground with a floor on top. */
function twoHouses() {
  const b: Building = createBuilding();
  const garden = b.levels[0];
  const small = createLevel(b, 'Small house', 3);
  small.base = 0.6;
  box(small, 0, 0, 6, 5);
  b.levels.push(small);
  const lower = createLevel(b, 'Large house, lower ground', 3);
  lower.base = -1.5;
  box(lower, 12, 0, 22, 8);
  b.levels.push(lower);
  const upper = addLevelOnTop(b, true, lower);
  return { b, garden, small, lower, upper };
}

describe('floors at their own heights', () => {
  it('keeps the old stacking when no floor sets its own level', () => {
    const b = createBuilding();
    const first = addLevelOnTop(b, false);
    expect(levelElevation(b, first.id)).toBeCloseTo(b.levels[0].height);
  });

  it('puts each floor at its own level, and floors on top follow', () => {
    const { b, small, lower, upper } = twoHouses();
    expect(levelElevation(b, small.id)).toBeCloseTo(0.6);
    expect(levelElevation(b, lower.id)).toBeCloseTo(-1.5);
    expect(levelElevation(b, upper.id)).toBeCloseTo(1.5);
  });

  it('finds the floor above and below over the same ground only', () => {
    const { b, small, lower, upper } = twoHouses();
    expect(levelAbove(b, lower.id)?.id).toBe(upper.id);
    expect(levelBelow(b, upper.id)?.id).toBe(lower.id);
    // The small house has nothing above it, though the large house's upper floor is higher.
    expect(levelAbove(b, small.id)).toBeUndefined();
    expect(levelBelow(b, small.id)).toBeUndefined();
    // So both tops get the pitched roof of a top floor.
    expect(defaultRoof(b, small)?.kind).toBe('gable');
    expect(defaultRoof(b, upper)?.kind).toBe('gable');
    expect(defaultRoof(b, lower)?.kind).toBe('flat');
  });

  it('lists the floors from the top down by height', () => {
    const { b, garden, small, lower, upper } = twoHouses();
    expect(levelsTopDown(b).map((l) => l.id)).toEqual([upper.id, small.id, garden.id, lower.id]);
  });

  it('adds a floor below, with the outside walls copied down', () => {
    const { b, small } = twoHouses();
    const cellar = addLevelBelow(b, small);
    expect(levelElevation(b, cellar.id)).toBeCloseTo(0.6 - 3);
    expect(Object.keys(cellar.walls).length).toBe(4);
    expect(levelBelow(b, small.id)?.id).toBe(cellar.id);
  });
});

describe('moving a building onto its own floor', () => {
  it('takes the walls in the box, leaves the rest, and stacks a floor on just that building', async () => {
    const { moveToOwnFloor } = await import('../src/model/separate');
    const b = createBuilding();
    const g = b.levels[0];
    box(g, 0, 0, 6, 5);
    box(g, 12, 0, 22, 8);
    g.patios = { p: { id: 'p', points: [{ x: 7, y: 0 }, { x: 11, y: 0 }, { x: 11, y: 5 }, { x: 7, y: 5 }], surface: 'paving', height: 0.04, angle: 0, module: 0.6 } };
    const small = moveToOwnFloor(b, g, { x0: -1, y0: -1, x1: 7, y1: 6 }, 'Small house')!;
    expect(Object.keys(small.walls).length).toBe(4);
    expect(Object.keys(g.walls).length).toBe(4);
    expect(g.patios.p).toBeDefined();
    expect(levelElevation(b, small.id)).toBeCloseTo(0);
    small.base = 0.6;
    const upstairs = addLevelOnTop(b, true, small);
    expect(Object.keys(upstairs.walls).length).toBe(4);
    expect(levelElevation(b, upstairs.id)).toBeCloseTo(0.6 + small.height);
    expect(levelAbove(b, small.id)?.id).toBe(upstairs.id);
    expect(levelAbove(b, g.id)).toBeUndefined();
  });
});
