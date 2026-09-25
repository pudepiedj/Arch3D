import { describe, expect, it } from 'vitest';
import {
  addLevelOnTop,
  ceilingHeight,
  createBuilding,
  deleteLevel,
  levelElevation,
  migrate,
  setLevelHeight,
} from '../src/model/building';
import { demoBuilding } from '../src/model/demo';
import { addWall, createPlan } from '../src/model/plan';
import { placeOpening } from '../src/model/openings';
import { detectRooms, outlineWallIds } from '../src/model/rooms';

describe('levels', () => {
  it('stacks levels by floor-to-floor height', () => {
    const b = createBuilding();
    const first = addLevelOnTop(b, false);
    const second = addLevelOnTop(b, false);
    expect(levelElevation(b, b.levels[0].id)).toBe(0);
    expect(levelElevation(b, first.id)).toBeCloseTo(2.9);
    expect(levelElevation(b, second.id)).toBeCloseTo(5.8);
    expect(b.levels.map((l) => l.name)).toEqual(['Ground floor', 'First floor', 'Second floor']);
  });

  it('ceiling height is floor-to-floor minus the floor above', () => {
    const b = createBuilding();
    const ground = b.levels[0];
    expect(ceilingHeight(b, ground)).toBeCloseTo(2.6);
    const first = addLevelOnTop(b, false);
    first.slab = 0.4;
    expect(ceilingHeight(b, ground)).toBeCloseTo(2.5);
  });

  it('full-height walls follow a change of floor-to-floor height', () => {
    const b = createBuilding();
    const g = b.levels[0];
    addWall(g, { x: 0, y: 0 }, { x: 4, y: 0 }, { thickness: 0.3, height: g.height });
    addWall(g, { x: 0, y: 2 }, { x: 4, y: 2 }, { thickness: 0.1, height: 1.1 });
    setLevelHeight(g, 3.2);
    expect(Object.values(g.walls).map((w) => w.height).sort()).toEqual([1.1, 3.2]);
  });

  it('never deletes the last level', () => {
    const b = createBuilding();
    expect(deleteLevel(b, b.levels[0].id)).toBe(false);
    const up = addLevelOnTop(b, false);
    expect(deleteLevel(b, up.id)).toBe(true);
    expect(b.levels).toHaveLength(1);
  });
});

/** A 10 x 8 ground floor with three partitions making four rooms (T-junctions on the outline). */
function fourRooms() {
  const b = createBuilding();
  const g = b.levels[0];
  const t = { thickness: 0.3, height: g.height };
  const pts = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ];
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % 4];
    addWall(g, { x, y }, { x: x2, y: y2 }, t);
  });
  const p = { thickness: 0.12, height: g.height };
  addWall(g, { x: 6, y: 0 }, { x: 6, y: 8 }, p);
  addWall(g, { x: 0, y: 4.2 }, { x: 6, y: 4.2 }, p);
  addWall(g, { x: 6, y: 5 }, { x: 10, y: 5 }, p);
  return b;
}

describe('copying the outline up', () => {
  it('finds only the outside walls', () => {
    const ground = fourRooms().levels[0];
    const ids = outlineWallIds(ground);
    // The 10 x 8 outline is split at the four T-junctions into 8 walls.
    expect(ids).toHaveLength(8);
    expect(ids.every((id) => ground.walls[id].thickness === 0.3)).toBe(true);
  });

  it('copies outside walls as whole, clean walls without the downstairs joints', () => {
    const b = fourRooms();
    const up = addLevelOnTop(b, true);
    // The outline below is split by the partitions' T-junctions; up here it heals into 4 whole walls.
    const lengths = Object.values(up.walls).map((w) => {
      const a = up.nodes[w.a];
      const c = up.nodes[w.b];
      return Math.hypot(a.x - c.x, a.y - c.y);
    });
    expect(lengths.sort()).toEqual([10, 10, 8, 8]);
    expect(Object.keys(up.openings)).toHaveLength(0);
    expect(detectRooms(up)).toHaveLength(1);
  });
});

describe('loading older drawings', () => {
  it('turns a single-plan save into a one-storey building keeping the ceiling height', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 5, y: 0 }, { thickness: 0.3, height: 2.6 });
    addWall(p, { x: 0, y: 1 }, { x: 5, y: 1 }, { thickness: 0.1, height: 1.0 });
    const wid = Object.values(p.walls).find((w) => w.height === 2.6)!.id;
    placeOpening(p, wid, 2.5, 'window');
    const b = migrate(JSON.parse(JSON.stringify({ version: 1, ...p })));
    expect(b.version).toBe(2);
    expect(b.levels).toHaveLength(1);
    const g = b.levels[0];
    expect(g.height).toBeCloseTo(2.9);
    expect(ceilingHeight(b, g)).toBeCloseTo(2.6);
    expect(Object.values(g.walls).map((w) => w.height).sort()).toEqual([1.0, 2.9]);
    expect(Object.keys(g.openings)).toHaveLength(1);
  });

  it('passes current files through and rejects junk', () => {
    const b = demoBuilding();
    expect(migrate(JSON.parse(JSON.stringify(b)))).toEqual(b);
    expect(() => migrate({ hello: 1 })).toThrow();
  });
});
