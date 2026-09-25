import { describe, expect, it } from 'vitest';
import { addLevelOnTop, createBuilding } from '../src/model/building';
import { addWall } from '../src/model/plan';
import { DEFAULT_ROOF, effectiveRoof, roofGeometry, wallOutline } from '../src/model/roof';
import type { Level } from '../src/model/types';

function box(level: Level, pts: [number, number][], thickness = 0.3) {
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    addWall(level, { x, y }, { x: x2, y: y2 }, { thickness, height: level.height });
  });
}
const rect: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 6],
  [0, 6],
];
const tan35 = Math.tan((35 * Math.PI) / 180);

describe('roof outline', () => {
  it('runs round the outside face of the outer walls, ignoring inner walls', () => {
    const b = createBuilding();
    const g = b.levels[0];
    box(g, rect);
    addWall(g, { x: 4, y: 0 }, { x: 4, y: 6 }, { thickness: 0.12, height: g.height });
    const [block] = wallOutline(g);
    expect(block.pts).toHaveLength(4);
    expect(block.halfThickness.every((t) => Math.abs(t - 0.15) < 1e-9)).toBe(true);
  });
});

describe('gable roof', () => {
  const b = createBuilding();
  const g = b.levels[0];
  box(g, rect);
  const roof = roofGeometry(g, DEFAULT_ROOF)!;
  const gables = roof.faces.filter((f) => f.kind === 'gable');
  const slopes = roof.faces.filter((f) => f.kind === 'slope');

  it('has two gable walls and two slopes', () => {
    expect(gables).toHaveLength(2);
    expect(slopes).toHaveLength(2);
  });

  it('gable walls stand flush with the outside face of the end walls', () => {
    for (const f of gables) {
      const xs = f.pts.map((p) => p.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6);
      expect([-0.15, 10.15].some((x) => Math.abs(xs[0] - x) < 1e-6)).toBe(true);
    }
  });

  it('ridge runs the full length at the right height', () => {
    const top = Math.max(...roof.faces.flatMap((f) => f.pts.map((p) => p.z)));
    // Half the outside width (6.3 / 2) at 35 degrees, above the wall tops.
    expect(top).toBeCloseTo(g.height + 3.15 * tan35, 6);
    const ridge = slopes[0].pts.filter((p) => Math.abs(p.z - top) < 1e-6).map((p) => p.x);
    expect(Math.min(...ridge)).toBeCloseTo(-0.15, 6);
    expect(Math.max(...ridge)).toBeCloseTo(10.15, 6);
  });

  it('eaves overhang the side walls and sit below the wall top', () => {
    const eaveZ = g.height - 0.3 * tan35;
    for (const [a] of roof.eaves) expect(a.z).toBeCloseTo(eaveZ, 6);
    const ys = roof.outline[0].map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-0.45, 6);
  });
});

describe('other roofs', () => {
  it('hip roof: four slopes and a ridge shorter by the width', () => {
    const b = createBuilding();
    box(b.levels[0], rect);
    const roof = roofGeometry(b.levels[0], { kind: 'hip', pitch: 35, overhang: 0.3 })!;
    expect(roof.faces.filter((f) => f.kind === 'slope')).toHaveLength(4);
    const top = Math.max(...roof.faces.flatMap((f) => f.pts.map((p) => p.z)));
    const ridge = roof.faces.flatMap((f) => f.pts).filter((p) => Math.abs(p.z - top) < 1e-6).map((p) => p.x);
    expect(Math.max(...ridge) - Math.min(...ridge)).toBeCloseTo(10.9 - 6.9, 6);
  });

  it('L-shaped house: two gable ends and a valley', () => {
    const b = createBuilding();
    box(b.levels[0], [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 9],
      [0, 9],
    ]);
    const roof = roofGeometry(b.levels[0], DEFAULT_ROOF)!;
    expect(roof.faces.filter((f) => f.kind === 'gable')).toHaveLength(2);
    expect(roof.faces.filter((f) => f.kind === 'slope')).toHaveLength(4);
  });

  it('a square plan gets a pyramid rather than a broken gable', () => {
    const b = createBuilding();
    box(b.levels[0], [
      [0, 0],
      [6, 0],
      [6, 6],
      [0, 6],
    ]);
    const roof = roofGeometry(b.levels[0], DEFAULT_ROOF)!;
    expect(roof.faces.filter((f) => f.kind === 'gable')).toHaveLength(0);
    expect(roof.faces.filter((f) => f.kind === 'slope')).toHaveLength(4);
  });

  it('flat roof is a slab over the outline', () => {
    const b = createBuilding();
    box(b.levels[0], rect);
    const roof = roofGeometry(b.levels[0], { kind: 'flat', pitch: 35, overhang: 0.3 })!;
    expect(roof.faces).toHaveLength(1);
    expect(roof.faces[0].kind).toBe('flat');
  });

  it('by default only the top floor has a roof', () => {
    const b = createBuilding();
    box(b.levels[0], rect);
    expect(effectiveRoof(b, b.levels[0])).not.toBeNull();
    const up = addLevelOnTop(b, true);
    expect(effectiveRoof(b, b.levels[0])).toBeNull();
    expect(effectiveRoof(b, up)).not.toBeNull();
    up.roof = { ...DEFAULT_ROOF, kind: 'none' };
    expect(effectiveRoof(b, up)).toBeNull();
  });
});
