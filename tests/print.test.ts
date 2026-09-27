import { describe, expect, it } from 'vitest';
import { demoBuilding } from '../src/model/demo';
import { fitScale, fitsAt, planExtent, scaleBarLength, sheetLayout, sideDirection } from '../src/model/print';

describe('printing', () => {
  it('lays out A4 landscape with a drawing area inside the frame and above the title block', () => {
    const s = sheetLayout('A4', 'landscape');
    expect(s.w).toBe(297);
    expect(s.h).toBe(210);
    expect(s.area.x).toBeGreaterThanOrEqual(10);
    expect(s.area.y + s.area.h).toBeLessThan(210 - 10 - 18 + 1e-9);
    expect(sheetLayout('A3', 'portrait').h).toBe(420);
  });

  it('picks the largest standard scale that fits', () => {
    const area = sheetLayout('A4', 'landscape').area;
    // 12 m x 9 m: too tall at 1:50 (180 mm + borders), fits at 1:100.
    expect(fitScale([{ w: 12, h: 9, bx: 14, by: 14 }], area)).toBe(100);
    expect(fitScale([{ w: 4, h: 3, bx: 10, by: 10 }], area)).toBe(25);
    expect(fitsAt({ w: 12, h: 9, bx: 14, by: 14 }, area, 100)).toBe(true);
    expect(fitsAt({ w: 30, h: 9, bx: 14, by: 14 }, area, 100)).toBe(false);
  });

  it('frames the demo house, larger with the patios, and fits it at 1:100 on A4', () => {
    const b = demoBuilding();
    const house = planExtent(b.levels, false)!;
    const garden = planExtent(b.levels, true)!;
    const area = sheetLayout('A4', 'landscape').area;
    expect(fitScale([{ w: garden.x1 - garden.x0, h: garden.y1 - garden.y0, bx: 12, by: 12 }], area)).toBe(100);
    expect(house.x1 - house.x0).toBeGreaterThan(5);
    expect(garden.x1 - garden.x0).toBeGreaterThanOrEqual(house.x1 - house.x0);
  });

  it('knows which way each side faces', () => {
    const s = sideDirection('S', 0);
    expect(s.x).toBeCloseTo(0);
    expect(s.y).toBeCloseTo(1); // south is down the plan when north is up
    const e = sideDirection('E', 90); // top of the plan faces east: east is up
    expect(e.y).toBeCloseTo(-1);
  });

  it('draws a round scale bar that fits', () => {
    expect(scaleBarLength(100)).toBe(5);
    expect(scaleBarLength(50)).toBe(2);
  });
});
