import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { addWall } from '../src/model/plan';
import { detectRooms } from '../src/model/rooms';
import { clearFloorFinish, faceFinish, faceSides, floorFinishAt, paintRoomWalls, setFloorFinish } from '../src/model/materials';

/** A 6 x 4 m box split into two rooms by a partition, and a garden wall off one corner. */
function house() {
  const b = createBuilding();
  const l = b.levels[0];
  const pts: [number, number][] = [[0, 0], [6, 0], [6, 4], [0, 4]];
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % 4];
    addWall(l, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: l.height });
  });
  addWall(l, { x: 3, y: 0 }, { x: 3, y: 4 }, { thickness: 0.12, height: l.height });
  addWall(l, { x: 6, y: 4 }, { x: 10, y: 4 }, { thickness: 0.3, height: 2 });
  return { b, l };
}

const wallAt = (l: ReturnType<typeof house>['l'], x: number, y: number) =>
  Object.values(l.walls).find((w) => {
    const a = l.nodes[w.a];
    const c = l.nodes[w.b];
    return Math.abs((a.x + c.x) / 2 - x) < 0.01 && Math.abs((a.y + c.y) / 2 - y) < 0.01;
  })!;

describe('materials', () => {
  it('tells the outside faces of walls from the inside ones', () => {
    const { l } = house();
    const sides = faceSides(l);
    const outer = sides.get(wallAt(l, 1.5, 0).id)!;
    expect([outer.left, outer.right].sort()).toEqual(['inside', 'outside']);
    const partition = sides.get(wallAt(l, 3, 2).id)!;
    expect(partition).toEqual({ left: 'inside', right: 'inside' });
    const garden = sides.get(wallAt(l, 8, 4).id)!;
    expect(garden).toEqual({ left: 'outside', right: 'outside' });
  });

  it('uses the defaults, and a painted face over them', () => {
    const { b, l } = house();
    b.materials = { outside: 'stone', inside: 'plaster' };
    const w = wallAt(l, 8, 4);
    expect(faceFinish(b, w, 'left', 'outside')).toBe('stone');
    w.faces = { left: 'brick' };
    expect(faceFinish(b, w, 'left', 'outside')).toBe('brick');
    expect(faceFinish(b, w, 'right', 'outside')).toBe('stone');
  });

  it('paints every wall face round a room, and only those', () => {
    const { l } = house();
    const room = detectRooms(l).find((r) => r.centroid.x < 3)!;
    paintRoomWalls(l, room.polygon, 'stone');
    const painted = Object.values(l.walls).filter((w) => w.faces);
    // The three outer walls of the left room (the long ones run along both rooms) and the partition.
    expect(painted.length).toBeGreaterThanOrEqual(4);
    const partition = wallAt(l, 3, 2).faces!;
    expect(Object.values(partition).filter(Boolean)).toEqual(['stone']);
    expect(wallAt(l, 6, 2).faces).toBeUndefined();
  });

  it('sets a room floor, and takes it back to the default', () => {
    const { b, l } = house();
    const [left, right] = detectRooms(l).sort((p, q) => p.centroid.x - q.centroid.x);
    setFloorFinish(l, left.polygon, left.centroid, 'terracotta');
    expect(floorFinishAt(b, l, left.polygon)).toBe('terracotta');
    expect(floorFinishAt(b, l, right.polygon)).toBe('oak');
    setFloorFinish(l, left.polygon, left.centroid, 'stone');
    expect(l.floorFinishes).toHaveLength(1);
    clearFloorFinish(l, left.polygon);
    expect(floorFinishAt(b, l, left.polygon)).toBe('oak');
  });
});
