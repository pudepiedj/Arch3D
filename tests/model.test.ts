import { describe, expect, it } from 'vitest';
import {
  addWall,
  createPlan,
  deleteWall,
  finishNodeMove,
  findWallInterior,
  moveNode,
  splitWallAt,
} from '../src/model/plan';
import { computeFootprints } from '../src/model/joints';
import { moveOpening, placeOpening, OPENING_GAP } from '../src/model/openings';
import { detectRooms } from '../src/model/rooms';
import { demoPlan } from '../src/model/demo';
import type { Plan } from '../src/model/types';

const T = { thickness: 0.2, height: 2.5 };
const close = (a: { x: number; y: number }, x: number, y: number) => {
  expect(a.x).toBeCloseTo(x, 6);
  expect(a.y).toBeCloseTo(y, 6);
};
const count = (p: Plan) => ({
  nodes: Object.keys(p.nodes).length,
  walls: Object.keys(p.walls).length,
  openings: Object.keys(p.openings).length,
});

describe('joints', () => {
  it('mitres an L corner exactly', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 4, y: 0 }, T);
    addWall(p, { x: 4, y: 0 }, { x: 4, y: 3 }, T);
    const fps = [...computeFootprints(p).values()];
    const pts = fps.flatMap((f) => [f.L0, f.L1, f.R0, f.R1]);
    // Both walls share the outer corner (4.1,-0.1) and the inner corner (3.9,0.1).
    expect(pts.filter((q) => Math.abs(q.x - 4.1) < 1e-9 && Math.abs(q.y + 0.1) < 1e-9)).toHaveLength(2);
    expect(pts.filter((q) => Math.abs(q.x - 3.9) < 1e-9 && Math.abs(q.y - 0.1) < 1e-9)).toHaveLength(2);
  });

  it('squares off free ends', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 2, y: 0 }, T);
    const f = [...computeFootprints(p).values()][0];
    close(f.L0, 0, 0.1);
    close(f.R0, 0, -0.1);
    expect(f.uMin).toBeCloseTo(0);
    expect(f.uMax).toBeCloseTo(2);
  });

  it('joins walls of different thickness at a T', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 4, y: 0 }, { thickness: 0.3, height: 2.5 });
    addWall(p, { x: 2, y: 0 }, { x: 2, y: 3 }, { thickness: 0.1, height: 2.5 });
    expect(count(p).walls).toBe(3);
    const fps = computeFootprints(p);
    const stem = [...fps.values()].find((f) => Math.abs(f.dir.y) > 0.9)!;
    // The stem starts at the face of the thick wall, not at its centre line.
    expect(Math.min(stem.uL0, stem.uR0)).toBeCloseTo(0.15, 6);
  });
});

describe('editing the graph', () => {
  it('splits a wall when a new wall ends on it (T-junction)', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 6, y: 0 }, T);
    addWall(p, { x: 3, y: 0 }, { x: 3, y: 4 }, T);
    expect(count(p)).toMatchObject({ nodes: 4, walls: 3 });
  });

  it('splits both walls where they cross', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 4, y: 0 }, T);
    addWall(p, { x: 2, y: -2 }, { x: 2, y: 2 }, T);
    expect(count(p)).toMatchObject({ nodes: 5, walls: 4 });
  });

  it('merges overlapping collinear walls', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 4, y: 0 }, T);
    addWall(p, { x: 2, y: 0 }, { x: 6, y: 0 }, T);
    // 0-2, 2-4, 4-6 with no duplicates.
    expect(count(p)).toMatchObject({ nodes: 4, walls: 3 });
  });

  it('heals the bar of a T when its stem is deleted, keeping openings in place', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 6, y: 0 }, T);
    const win = placeOpening(p, Object.keys(p.walls)[0], 4.5, 'window')!;
    addWall(p, { x: 3, y: 0 }, { x: 3, y: 4 }, T);
    // The window moved onto the second half of the split wall.
    expect(p.openings[win.id].offset).toBeCloseTo(1.5);
    const stem = Object.values(p.walls).find((w) => {
      const a = p.nodes[w.a];
      const b = p.nodes[w.b];
      return Math.abs(a.x - b.x) < 1e-9;
    })!;
    deleteWall(p, stem.id);
    expect(count(p)).toMatchObject({ nodes: 2, walls: 1, openings: 1 });
    const o = p.openings[win.id];
    const w = p.walls[o.wallId];
    const start = p.nodes[w.a];
    // Same absolute position as before: centre at x = 4.5.
    const x = start.x === 0 ? o.offset : 6 - o.offset;
    expect(x).toBeCloseTo(4.5);
  });

  it('dropping a node onto another joins them', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 4, y: 0 }, T);
    addWall(p, { x: 0, y: 3 }, { x: 4, y: 3.5 }, T);
    const end = Object.values(p.nodes).find((n) => n.x === 4 && n.y === 3.5)!;
    moveNode(p, end.id, { x: 4, y: 0 });
    finishNodeMove(p, end.id);
    expect(count(p)).toMatchObject({ nodes: 3, walls: 2 });
  });

  it('dropping a node onto a wall creates a T-junction', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 4, y: 0 }, T);
    addWall(p, { x: 2, y: 3 }, { x: 2, y: 1 }, T);
    const end = Object.values(p.nodes).find((n) => n.x === 2 && n.y === 1)!;
    moveNode(p, end.id, { x: 2, y: 0 });
    finishNodeMove(p, end.id);
    expect(count(p)).toMatchObject({ nodes: 4, walls: 3 });
  });

  it('splitting a wall through a window moves the window to the half holding its centre', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 6, y: 0 }, T);
    const wid = Object.keys(p.walls)[0];
    const win = placeOpening(p, wid, 3.2, 'window')!;
    splitWallAt(p, wid, 3);
    const o = p.openings[win.id];
    expect(o).toBeDefined();
    const fp = computeFootprints(p).get(o.wallId)!;
    expect(o.offset - o.width / 2).toBeGreaterThanOrEqual(fp.uMin + OPENING_GAP - 1e-9);
  });
});

describe('openings', () => {
  it('stay clear of mitred corners', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 3, y: 0 }, T);
    addWall(p, { x: 3, y: 0 }, { x: 3, y: 3 }, T);
    const w = findWallInterior(p, { x: 1.5, y: 0 })!;
    const o = placeOpening(p, w.wallId, 2.9, 'window')!;
    // Inner corner is at u = 2.9, so the window must end before 2.9 - gap.
    expect(o.offset + o.width / 2).toBeLessThanOrEqual(2.9 - OPENING_GAP + 1e-9);
  });

  it('cannot be dragged through each other', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 8, y: 0 }, T);
    const wid = Object.keys(p.walls)[0];
    const a = placeOpening(p, wid, 2, 'window')!;
    const b = placeOpening(p, wid, 5, 'door')!;
    moveOpening(p, a.id, wid, 4.8);
    expect(a.offset + a.width / 2).toBeLessThanOrEqual(b.offset - b.width / 2 - OPENING_GAP + 1e-9);
  });

  it('are shrunk or removed when a wall gets too short', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 4, y: 0 }, T);
    const wid = Object.keys(p.walls)[0];
    placeOpening(p, wid, 1, 'window');
    placeOpening(p, wid, 3, 'window');
    const end = Object.values(p.nodes).find((n) => n.x === 4)!;
    moveNode(p, end.id, { x: 1.5, y: 0 });
    finishNodeMove(p, end.id);
    const os = Object.values(p.openings);
    expect(os).toHaveLength(1);
    expect(os[0].width).toBeLessThanOrEqual(1.4);
  });
});

describe('rooms', () => {
  it('finds the four rooms of the demo house', () => {
    const rooms = detectRooms(demoPlan());
    expect(rooms).toHaveLength(4);
    const total = rooms.reduce((s, r) => s + r.area, 0);
    expect(total).toBeCloseTo(80, 6);
    // Living room: 6 x 4.2 between centre lines, minus half a 30 cm and half a 12 cm wall each way.
    const living = rooms.find((r) => Math.abs(r.area - 25.2) < 1e-6)!;
    expect(living.netArea).toBeCloseTo((6 - 0.15 - 0.06) * (4.2 - 0.15 - 0.06), 6);
  });

  it('ignores dangling walls', () => {
    const p = createPlan();
    addWall(p, { x: 0, y: 0 }, { x: 4, y: 0 }, T);
    addWall(p, { x: 4, y: 0 }, { x: 4, y: 4 }, T);
    addWall(p, { x: 4, y: 4 }, { x: 0, y: 4 }, T);
    addWall(p, { x: 0, y: 4 }, { x: 0, y: 0 }, T);
    addWall(p, { x: 2, y: 0 }, { x: 2, y: 2 }, T);
    const rooms = detectRooms(p);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(16);
  });

  it('demo house has all its openings', () => {
    expect(Object.keys(demoPlan().openings)).toHaveLength(11);
  });
});
