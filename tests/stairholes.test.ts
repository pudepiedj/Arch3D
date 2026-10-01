import { describe, expect, it } from 'vitest';
import { addLevelOnTop, addRoomOnTop, createBuilding, levelElevation } from '../src/model/building';
import { polygonArea } from '../src/model/geom';
import { addWall } from '../src/model/plan';
import { allStairs, exitsAt, holesAt } from '../src/model/stairholes';

describe('stairs through more than one floor', () => {
  it('cut a hole in every floor they pass, and come out at the top', () => {
    const b = createBuilding();
    const g = b.levels[0];
    const pts: [number, number][] = [[0, 0], [8, 0], [8, 6], [0, 6]];
    pts.forEach(([x, y], i) => {
      const [x2, y2] = pts[(i + 1) % 4];
      addWall(g, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: g.height });
    });
    const first = addLevelOnTop(b, true);
    const room = addRoomOnTop(b, first, { x0: 1, y0: 1, x1: 4, y1: 4 });
    // A spiral from the ground floor all the way up into the roof room.
    g.stairs = { s: { id: 's', x: 2.5, y: 2.5, angle: 0, width: 0.8, going: 0.25, shape: 'spiral', turn: 'left', rise: g.height + first.height } };
    const placed = allStairs(b);
    const area = (z: number, l = first) => holesAt(placed, z, l).reduce((s, sh) => s + Math.abs(polygonArea(sh[0])), 0);
    expect(area(levelElevation(b, first.id))).toBeGreaterThan(1);
    expect(area(levelElevation(b, room.id), room)).toBeGreaterThan(1);
    expect(exitsAt(placed, levelElevation(b, first.id), first)).toHaveLength(0);
    expect(exitsAt(placed, levelElevation(b, room.id), room)).toHaveLength(1);
    // Nothing through the room's own roof.
    expect(area(levelElevation(b, room.id) + room.height, room)).toBe(0);
  });
});
