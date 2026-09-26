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

describe('rooflights', () => {
  it('on a flat roof: a kerb box with a sloping top holding a row of windows', async () => {
    const { addRooflight, rooflightGeometry } = await import('../src/model/roofitems');
    const { b, g } = house();
    g.roof = { kind: 'flat', pitch: 35, overhang: 0.3 };
    const r = addRooflight(g, { x: 5, y: 3 });
    r.count = 3;
    const geo = rooflightGeometry(b, g, r)!;
    expect(geo.kind).toBe('kerb');
    expect(geo.windows).toHaveLength(3);
    const roofTop = g.height + 0.25;
    expect(geo.roofZ).toBeCloseTo(roofTop, 6);
    // Box: 3 windows of 0.78 with 0.12 frames = 2.82 m across.
    const [p0, p1, p2] = geo.top;
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeCloseTo(2.82, 6);
    // Low side stands on a 15 cm kerb; the top rises at 15 degrees.
    expect(Math.min(...geo.top.map((p) => p.z))).toBeCloseTo(roofTop + 0.15, 6);
    const run = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    expect((p2.z - p1.z) / run).toBeCloseTo(Math.tan((15 * Math.PI) / 180), 6);
    // Solar motor strips by default, no blinds.
    expect(geo.windows.every((w) => w.motor && !w.blind)).toBe(true);
  });

  it('opening a window lifts the bottom of its glass; blinds sit below the glass', async () => {
    const { addRooflight, rooflightGeometry } = await import('../src/model/roofitems');
    const { b, g } = house();
    g.roof = { kind: 'flat', pitch: 35, overhang: 0.3 };
    const r = addRooflight(g, { x: 5, y: 3 });
    const shut = rooflightGeometry(b, g, r)!.windows[0];
    r.open = true;
    r.blinds = true;
    const open = rooflightGeometry(b, g, r)!.windows[0];
    expect(open.glass[0].z).toBeGreaterThan(shut.glass[0].z + 0.1);
    expect(open.glass[3].z).toBeCloseTo(shut.glass[3].z, 9); // hinge edge stays put
    expect(Math.max(...open.blind!.map((p) => p.z))).toBeLessThan(Math.min(...shut.glass.map((p) => p.z)) + 0.2);
  });

  it('on a sloping roof: windows lie in the slope', async () => {
    const { addRooflight, rooflightGeometry } = await import('../src/model/roofitems');
    const { b, g } = house();
    const geo = rooflightGeometry(b, g, addRooflight(g, { x: 5, y: 1.5 }))!;
    expect(geo.kind).toBe('slope');
    const surf = roofSurfaceAt(b, g, { x: 5, y: 1.5 })!;
    for (const p of geo.windows[0].frame) expect(p.z).toBeGreaterThan(surf.z(p));
    for (const p of geo.windows[0].frame) expect(p.z - surf.z(p)).toBeLessThan(0.15);
  });
});
