import { describe, expect, it } from 'vitest';
import { addLevelOnTop, createBuilding } from '../src/model/building';
import { addFurniture } from '../src/model/furniture';
import { gardenLevel, openDrawing } from '../src/model/outdoors';
import { addPatio } from '../src/model/patios';
import { addWall } from '../src/model/plan';
import { levelRoofs } from '../src/model/roof';
import type { Level } from '../src/model/types';

function box(level: Level, pts: [number, number][]) {
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    addWall(level, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: level.height });
  });
}

/** A 10 × 6 house with a 4 m single-storey extension on its east side, and a floor above the house. */
function house() {
  const b = createBuilding();
  const g = b.levels[0];
  box(g, [[0, 0], [14, 0], [14, 6], [0, 6]]);
  addWall(g, { x: 10, y: 0 }, { x: 10, y: 6 }, { thickness: 0.3, height: g.height });
  return { b, g };
}

describe('garden things on the right floor', () => {
  it('a tennis court, vineyard or pond always goes on the ground floor', () => {
    const { b, g } = house();
    const first = addLevelOnTop(b, true, g);
    for (const kind of ['tennis', 'vineyard', 'pond']) {
      expect(gardenLevel(b, first, { x: 40, y: 40 }, kind).id).toBe(g.id);
      expect(gardenLevel(b, first, { x: 5, y: 3 }, kind).id).toBe(g.id);
    }
  });

  it('other garden things and trees go to the ground outside the building, but stay on a balcony', () => {
    const { b, g } = house();
    const first = addLevelOnTop(b, true, g);
    expect(gardenLevel(b, first, { x: 30, y: 30 }, 'bench').id).toBe(g.id);
    expect(gardenLevel(b, first, { x: 30, y: 30 }).id).toBe(g.id); // a tree
    expect(gardenLevel(b, first, { x: 5, y: 3 }, 'bench').id).toBe(first.id); // indoors
    addPatio(first, [{ x: 0, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 8 }, { x: 0, y: 8 }], 'balcony');
    expect(gardenLevel(b, first, { x: 2, y: 7 }, 'bench').id).toBe(first.id);
    // Furniture that isn't for the garden stays where it's put.
    expect(gardenLevel(b, first, { x: 30, y: 30 }, 'sofa3').id).toBe(first.id);
  });

  it('an older drawing with a court up on the first floor has it moved down when opened', () => {
    const { b, g } = house();
    const first = addLevelOnTop(b, true, g);
    addFurniture(first, 'tennis', { x: 40, y: 0 });
    addFurniture(first, 'sofa3', { x: 5, y: 3 });
    const opened = openDrawing(JSON.parse(JSON.stringify(b)));
    const kinds = (l: Level) => Object.values(l.furniture ?? {}).map((f) => f.kind);
    expect(kinds(opened.levels[0])).toContain('tennis');
    expect(kinds(opened.levels[1])).toEqual(['sofa3']);
  });
});

describe('a floor over part of the one below', () => {
  it('copies the outline of just the rooms in the box, so the extension keeps its own roof', () => {
    const { b, g } = house();
    const first = addLevelOnTop(b, true, g, { x0: -1, y0: -1, x1: 10.5, y1: 7 });
    const xs = Object.values(first.nodes).map((n) => n.x);
    expect(Math.max(...xs)).toBeCloseTo(10, 6);
    // The ground floor still has a roof over the extension.
    const roofs = levelRoofs(b, g).filter((r) => r.geometry);
    expect(roofs.length).toBe(1);
    expect(Math.min(...roofs[0].ring.map((p) => p.x))).toBeGreaterThan(9.5);
  });

  it('copies all of it without a box, as before', () => {
    const { b, g } = house();
    const first = addLevelOnTop(b, true, g);
    expect(Math.max(...Object.values(first.nodes).map((n) => n.x))).toBeCloseTo(14, 6);
  });
});
