import { describe, expect, it } from 'vitest';
import { addLevelBelow, addLevelOnTop, addRoomOnTop, createBuilding, fitStoreys, createLevel, levelAbove, levelBelow, levelElevation, levelsTopDown, levelsUnder } from '../src/model/building';
import { addWall } from '../src/model/plan';
import { detectRooms } from '../src/model/rooms';
import { defaultRoof, levelRoofs } from '../src/model/roof';
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

describe('a building on a plinth', () => {
  it('stands on top of it, whichever was drawn first, and floors on top follow', async () => {
    const { moveToOwnFloor } = await import('../src/model/separate');
    const { addPatio } = await import('../src/model/patios');
    const b = createBuilding();
    const g = b.levels[0];
    box(g, 0, 0, 6, 5);
    const house = moveToOwnFloor(b, g, { x0: -1, y0: -1, x1: 7, y1: 6 }, 'House')!;
    expect(levelElevation(b, house.id)).toBeCloseTo(0);
    // The plinth drawn afterwards, under the house.
    addPatio(g, [{ x: -0.8, y: -0.8 }, { x: 6.8, y: -0.8 }, { x: 6.8, y: 5.8 }, { x: -0.8, y: 5.8 }], 'paving').height = 0.6;
    expect(levelElevation(b, house.id)).toBeCloseTo(0.6);
    const upstairs = addLevelOnTop(b, true, house);
    expect(levelElevation(b, upstairs.id)).toBeCloseTo(0.6 + house.height);
    // Set by hand to the same height: not doubled.
    house.base = 0.6;
    expect(levelElevation(b, house.id)).toBeCloseTo(0.6);
  });
});

describe('walls following floor levels', () => {
  it('stretch a lowered part of a floor up to the floor above it, and leave stacked floors alone', () => {
    const { b, lower, upper } = twoHouses();
    // Part of the large house sunk a further 0.3 m, on a floor of its own after the upper floor.
    const deep = createLevel(b, 'Deep part', 3);
    deep.base = -1.8;
    box(deep, 16, 0, 22, 8);
    b.levels.push(deep);
    fitStoreys(b);
    expect(levelElevation(b, upper.id)).toBeCloseTo(1.5);
    expect(deep.height).toBeCloseTo(3.3);
    expect(Object.values(deep.walls).every((w) => Math.abs(w.height - 3.3) < 1e-6)).toBe(true);
    // The upper floor sits on the lower one, so lowering that moves it too: nothing to stretch.
    lower.base = -2;
    fitStoreys(b);
    expect(lower.height).toBeCloseTo(3);
    expect(levelElevation(b, upper.id)).toBeCloseTo(1);
    expect(deep.height).toBeCloseTo(2.8);
  });
});

describe('a room on top', () => {
  it('stands on the floor it is drawn on, walled round the box, and flattens that roof', () => {
    const { b, upper } = twoHouses();
    upper.roof = { kind: 'hip', pitch: 22, overhang: 0.4 };
    const room = addRoomOnTop(b, upper, { x0: 18, y0: 2, x1: 21, y1: 5 });
    expect(levelElevation(b, room.id)).toBeCloseTo(levelElevation(b, upper.id) + upper.height);
    expect(Object.keys(room.walls)).toHaveLength(4);
    expect(room.roof?.kind).toBe('flat');
    expect(upper.roof?.kind).toBe('flat');
    expect(levelAbove(b, upper.id)).toBe(room);
  });
});

describe('split levels', () => {
  it('treat a part set a little lower as beside the floor, not under it', () => {
    const b = createBuilding();
    const a = createLevel(b, 'Dropped 0.8', 3);
    a.base = -0.8;
    box(a, 0, 0, 10, 8);
    b.levels.push(a);
    const c = createLevel(b, 'Dropped 1.1', 3);
    c.base = -1.1;
    box(c, 5, 2, 9, 6);
    b.levels.push(c);
    const first = createLevel(b, 'First floor', 2.9);
    first.base = 2.2;
    box(first, 0, 0, 10, 8);
    b.levels.push(first);
    fitStoreys(b);
    expect(levelAbove(b, c.id)).toBe(first);
    expect(levelBelow(b, c.id)).toBeUndefined();
    expect(c.height).toBeCloseTo(3.3);
    // Covered by the first floor: no roof (and no parapet) in the middle of it.
    expect(levelRoofs(b, c)).toHaveLength(0);
    expect(levelRoofs(b, a)).toHaveLength(0);
  });
});

describe('stairs from a split level', () => {
  it('come up through the floor above both parts', () => {
    const b = createBuilding();
    const a = createLevel(b, 'Dropped 0.8', 3);
    a.base = -0.8;
    box(a, 0, 0, 10, 8);
    b.levels.push(a);
    const c = createLevel(b, 'Dropped 1.1', 3.3);
    c.base = -1.1;
    box(c, 12, 0, 16, 8);
    b.levels.push(c);
    const first = createLevel(b, 'First floor', 2.9);
    first.base = 2.2;
    box(first, 0, 0, 16, 8);
    b.levels.push(first);
    expect(levelsUnder(b, first.id).map((l) => l.id).sort()).toEqual([a.id, c.id].sort());
  });
});

describe('moving part of a house to its own floor', () => {
  it('takes exactly the walls of the room boxed, even with the box drawn loosely', async () => {
    const { moveToOwnFloor, wallsToMove } = await import('../src/model/separate');
    const b = createBuilding();
    const g = b.levels[0];
    box(g, 0, 0, 10, 6);
    // A partition at x = 6: the long outside walls are divided where it meets them.
    addWall(g, { x: 6, y: 0 }, { x: 6, y: 6 }, { thickness: 0.12, height: g.height });
    const loose = { x0: 5.7, y0: -0.4, x1: 10.4, y1: 6.3 };
    expect(wallsToMove(g, loose)).toHaveLength(4);
    const room = moveToOwnFloor(b, g, loose, 'Room')!;
    expect(Object.keys(room.walls)).toHaveLength(4);
    // The rest of the house keeps its three outside walls, and a party copy of the wall it
    // shared with the room (owned by the room's floor), so its room is still closed.
    expect(Object.keys(g.walls)).toHaveLength(4);
    const party = Object.values(g.walls).filter((w) => w.party);
    expect(party).toHaveLength(1);
    expect(party[0].party).toBe(room.id);
    expect(room.walls[party[0].id]).toBeDefined();
    expect(detectRooms(g)).toHaveLength(1);
    const xs = Object.values(room.nodes).map((n) => n.x);
    expect(Math.min(...xs)).toBeCloseTo(6);
    expect(Math.max(...xs)).toBeCloseTo(10);
  });
});

describe('changing a floor level', () => {
  it('moves just the floor of a part of a house, keeping its top, and all of a house on its own', async () => {
    const { moveToOwnFloor } = await import('../src/model/separate');
    const { setFloorLevel, levelMoves } = await import('../src/model/building');
    const b = createBuilding();
    const g = b.levels[0];
    box(g, 0, 0, 10, 6);
    addWall(g, { x: 6, y: 0 }, { x: 6, y: 6 }, { thickness: 0.12, height: g.height });
    box(g, 20, 0, 26, 5);
    const room = moveToOwnFloor(b, g, { x0: 5.7, y0: -0.4, x1: 10.4, y1: 6.3 }, 'Room')!;
    const house = moveToOwnFloor(b, g, { x0: 19, y0: -1, x1: 27, y1: 6 }, 'House')!;
    expect(levelMoves(b, room)).toBe('floor');
    expect(levelMoves(b, house)).toBe('all');
    const top = levelElevation(b, room.id) + room.height;
    setFloorLevel(b, room, -0.3);
    expect(levelElevation(b, room.id)).toBeCloseTo(-0.3);
    expect(levelElevation(b, room.id) + room.height).toBeCloseTo(top);
    expect(Object.values(room.walls).every((w) => Math.abs(w.height - room.height) < 1e-6)).toBe(true);
    // The rest of the house is untouched.
    expect(levelElevation(b, g.id)).toBe(0);
    expect(g.height).toBeCloseTo(2.9);
    // The house on its own goes up whole.
    const h = house.height;
    setFloorLevel(b, house, 0.6);
    expect(house.height).toBeCloseTo(h);
    // Told to, the room moves whole too.
    room.levelMoves = 'all';
    const rh = room.height;
    setFloorLevel(b, room, -0.5);
    expect(room.height).toBeCloseTo(rh);
  });
});
