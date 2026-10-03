import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { approaches, bankRings } from '../src/model/grading';
import { addPatio } from '../src/model/patios';
import { addWall } from '../src/model/plan';
import { placeOpening } from '../src/model/openings';
import { computeFootprints } from '../src/model/joints';
import { polygonArea } from '../src/model/geom';

function garage() {
  const b = createBuilding();
  const g = b.levels[0];
  const pts: [number, number][] = [[0, 0], [6, 0], [6, 6], [0, 6]];
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % 4];
    addWall(g, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: g.height });
  });
  return { b, g };
}

describe('ground round the house', () => {
  it('gives a garage door onto lowered gravel a ramp, and a door onto a lowered patio steps', () => {
    const { b, g } = garage();
    const fps = computeFootprints(g);
    const front = [...fps.values()].find((f) => Math.abs(f.a.y) < 0.01 && Math.abs(f.b.y) < 0.01)!;
    placeOpening(g, front.wallId, 2, { kind: 'garage', width: 2.4, height: 2.1, sill: 0 }, fps);
    const back = [...fps.values()].find((f) => Math.abs(f.a.y - 6) < 0.01 && Math.abs(f.b.y - 6) < 0.01)!;
    placeOpening(g, back.wallId, 3, { kind: 'door', width: 0.9, height: 2.1, sill: 0 }, fps);
    addPatio(g, [{ x: -2, y: -6 }, { x: 8, y: -6 }, { x: 8, y: -0.15 }, { x: -2, y: -0.15 }], 'gravel').height = -0.36;
    addPatio(g, [{ x: -2, y: 6.15 }, { x: 8, y: 6.15 }, { x: 8, y: 10 }, { x: -2, y: 10 }], 'paving').height = -0.36;
    const list = approaches(b, g);
    const ramp = list.find((a) => a.kind === 'ramp')!;
    expect(ramp.drop).toBeCloseTo(0.36);
    expect(ramp.out.y).toBeLessThan(0);
    expect(ramp.length).toBeGreaterThan(2);
    const steps = list.find((a) => a.kind === 'steps')!;
    expect(steps.risers).toBe(2);
    expect(steps.out.y).toBeGreaterThan(0);
  });

  it('banks a sunken area on its open sides only, not along the house or onto another sunken area', () => {
    const { b, g } = garage();
    const pt = addPatio(g, [{ x: 0, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 10 }, { x: 0, y: 10 }], 'paving');
    pt.height = -0.4;
    pt.edge = 'bank';
    // Sunken gravel at the same level, along its east side.
    addPatio(g, [{ x: 6, y: 6 }, { x: 10, y: 6 }, { x: 10, y: 10 }, { x: 6, y: 10 }], 'gravel').height = -0.4;
    const [r] = bankRings(b, g, pt);
    expect(r.bank.filter(Boolean)).toHaveLength(2);
    // Grown 1.2 m (1 in 3 for 0.4 m) on the two banked sides.
    expect(Math.abs(polygonArea(r.outer)) - Math.abs(polygonArea(r.inner))).toBeCloseTo(6 * 1.2 + (3.85 + 1.2) * 1.2, 0);
  });
});
