import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { estimate } from '../src/model/estimate';
import { addFurniture } from '../src/model/furniture';
import { COURT, COURT_ENCLOSURE, courtLines, fenceRuns, netTop } from '../src/model/tennis';
import { WalkWorld } from '../src/model/walk';
import { buildFurniture } from '../src/three/furniture3d';

function court(finish?: string) {
  const b = createBuilding();
  const f = addFurniture(b.levels[0], 'tennis', { x: 0, y: 30 });
  if (finish) f.finish = finish;
  return { b, f };
}

describe('tennis court', () => {
  it('is placed at regulation size in its usual enclosure', () => {
    const { f } = court();
    expect(f.width).toBeCloseTo(COURT_ENCLOSURE.width, 6);
    expect(f.depth).toBeCloseTo(COURT_ENCLOSURE.length, 6);
    expect(f.finish).toBe('tarmac');
  });

  it('has its lines where the rules put them', () => {
    const lines = courtLines();
    const xs = lines.flatMap((l) => [l.x0, l.x1]);
    const ys = lines.flatMap((l) => [l.y0, l.y1]);
    // Measured to the outside of the lines.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(COURT.width, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(COURT.length, 6);
    // Service lines 6.40 m from the net, between the singles sidelines.
    const service = lines.filter((l) => Math.abs(l.x1 - l.x0 - COURT.singles) < 1e-6);
    expect(service).toHaveLength(2);
    for (const l of service) expect(Math.max(Math.abs(l.y0), Math.abs(l.y1))).toBeCloseTo(COURT.service, 6);
  });

  it('has a net 1.07 m at the posts and 0.914 m in the middle', () => {
    expect(netTop(0)).toBeCloseTo(0.914, 6);
    expect(netTop(COURT.posts / 2)).toBeCloseTo(1.07, 6);
  });

  it('is fenced all round except the gate, or not at all', () => {
    const { f } = court();
    const length = fenceRuns(f).reduce((s, [a, b]) => s + Math.hypot(b.x - a.x, b.y - a.y), 0);
    expect(length).toBeCloseTo(2 * (f.width + f.depth) - 1, 6);
    f.height = 0;
    expect(fenceRuns(f)).toHaveLength(0);
  });

  it('lets the walker in through the gate, but not through the fence or the net', () => {
    const { b, f } = court();
    const w = new WalkWorld(b);
    const side = f.x + f.width / 2;
    // Through the gate (beside the net, in the +x side) from outside.
    expect(w.move({ x: side + 1, y: f.y }, 0, { x: -2, y: 0 }).p.x).toBeLessThan(side - 0.5);
    // Into the fence a few metres along.
    expect(w.move({ x: side + 1, y: f.y + 8 }, 0, { x: -2, y: 0 }).p.x).toBeGreaterThan(side);
    // Across the net.
    expect(w.move({ x: f.x, y: f.y - 1 }, 0, { x: 0, y: 2 }).p.y).toBeLessThan(f.y);
  });

  it('is costed by its surface, with its fence and net', () => {
    for (const finish of ['tarmac', 'clay', 'grass']) {
      const { b } = court(finish);
      const lines = estimate(b, null);
      const surface = lines.find((l) => l.price === `court-${finish}`);
      expect(surface?.qty).toBeCloseTo(COURT_ENCLOSURE.width * COURT_ENCLOSURE.length, 1);
      expect(lines.some((l) => l.price === 'court-fence')).toBe(true);
      expect(lines.some((l) => l.price === 'court-net')).toBe(true);
    }
  });

  it('builds in 3D with each surface, with and without its fence', () => {
    for (const finish of ['tarmac', 'clay', 'grass']) {
      const { f } = court(finish);
      expect(buildFurniture(f).children.length).toBeGreaterThan(40);
      f.height = 0;
      expect(buildFurniture(f).children.length).toBeGreaterThan(20);
    }
  });
});
