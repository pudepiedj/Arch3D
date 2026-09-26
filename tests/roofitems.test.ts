import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { addWall } from '../src/model/plan';
import { roofSurfaceAt } from '../src/model/roof';
import { addChimney, addSolarArray, chimneyGeometry, solarGeometry } from '../src/model/roofitems';

/** A 10 x 6 single-storey house with the default gable roof (ridge along x at y = 3). */
function house() {
  const b = createBuilding();
  const g = b.levels[0];
  const pts = [
    [0, 0],
    [10, 0],
    [10, 6],
    [0, 6],
  ];
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % 4];
    addWall(g, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: g.height });
  });
  return { b, g };
}
const tan35 = Math.tan((35 * Math.PI) / 180);

describe('chimney stacks', () => {
  it('rise from under the roof to a set height above the highest roof they go through', () => {
    const { b, g } = house();
    const c = addChimney(g, { x: 7, y: 3.1 });
    const geo = chimneyGeometry(b, g, c);
    const ridge = g.height + 3.15 * tan35;
    expect(geo.onRoof).toBe(true);
    // The stack straddles the ridge, so its highest roof point is the ridge.
    expect(geo.top).toBeCloseTo(ridge + 0.6, 6);
    // Moved wholly onto the back slope, it only needs to clear the roof there.
    c.y = 3.6;
    expect(chimneyGeometry(b, g, c).top).toBeCloseTo(ridge - 0.35 * tan35 + 0.6, 6);
    c.y = 3.1;
    expect(geo.base).toBeLessThan(ridge - 0.25 * tan35);
    expect(geo.pots).toHaveLength(2);
    c.pots = 3;
    expect(chimneyGeometry(b, g, c).pots).toHaveLength(3);
  });
});

describe('solar panel arrays', () => {
  it('lie on the slope, a set distance above it, with rows level along the eaves', () => {
    const { b, g } = house();
    const s = addSolarArray(g, { x: 5, y: 1.5 });
    const geo = solarGeometry(b, g, s)!;
    expect(geo.panels).toHaveLength(8);
    expect(geo.overhangs).toBe(false);
    const surf = roofSurfaceAt(b, g, { x: 5, y: 1.5 })!;
    const cos = 1 / Math.sqrt(1 + tan35 * tan35);
    for (const quad of geo.panels) {
      for (const p of quad) expect(p.z - surf.z(p)).toBeCloseTo(0.08 / cos, 6);
      // The bottom edge of each panel is level (parallel to the eaves).
      expect(quad[0].z).toBeCloseTo(quad[1].z, 9);
    }
  });

  it('warn when panels hang off the slope', () => {
    const { b, g } = house();
    const s = addSolarArray(g, { x: 5, y: 1.5 });
    s.rows = 4;
    s.cols = 8;
    expect(solarGeometry(b, g, s)!.overhangs).toBe(true);
  });

  it('lie flat on a flat roof, and need a roof to sit on', () => {
    const { b, g } = house();
    g.roof = { kind: 'flat', pitch: 35, overhang: 0.3 };
    const geo = solarGeometry(b, g, addSolarArray(g, { x: 5, y: 3 }))!;
    const zs = geo.panels.flat().map((p) => p.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(1e-9);
    expect(solarGeometry(b, g, addSolarArray(g, { x: 30, y: 30 }))).toBeNull();
  });
});
