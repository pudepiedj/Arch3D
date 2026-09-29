import { describe, expect, it } from 'vitest';
import { demoBuilding } from '../src/model/demo';
import { DEFAULT_PRICES, estimate, rafterSize, roofLines, sizeBeam, totalOf, veluxCode } from '../src/model/estimate';

describe('structural first guesses', () => {
  it('sizes a steel beam for bending and deflection', () => {
    // 4 m over bi-folds carrying 2 m of tiled roof each side's worth: a middling UB.
    const { beam, M } = sizeBeam(4, 3, 1.5);
    expect(M).toBeCloseTo(((1.35 * 3 + 1.5 * 1.5) * 16) / 8, 5);
    expect(beam).not.toBeNull();
    expect(beam!.name).toMatch(/UB/);
    // A longer, heavier span needs a deeper beam.
    const big = sizeBeam(6, 8, 4).beam!;
    expect(big.mass).toBeGreaterThan(beam!.mass);
    // A point load in the middle (a ridge beam landing on it) needs more still.
    expect(sizeBeam(4, 3, 1.5, { g: 10, q: 5 }).beam!.mass).toBeGreaterThan(beam!.mass);
  });

  it('picks rafters from the span tables and Velux codes from sizes', () => {
    expect(rafterSize(2.0)).toBe('47×100');
    expect(rafterSize(3.5)).toBe('47×150');
    expect(veluxCode(0.78, 1.18)).toBe('MK06');
    expect(veluxCode(0.55, 0.98)).toBe('CK04');
  });
});

describe('the estimate', () => {
  it('lists the demo house, with steel over its glass doors', () => {
    const lines = estimate(demoBuilding(), null);
    const beams = lines.filter((l) => l.id.startsWith('beam:'));
    expect(beams.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.id.startsWith('glazed:'))).toBe(true);
    expect(lines.some((l) => l.group === 'Roof')).toBe(true);
    expect(totalOf(lines, DEFAULT_PRICES)).toBeGreaterThan(10000);
  });

  it('can be limited to an area', () => {
    const b = demoBuilding();
    const all = estimate(b, null);
    const part = estimate(b, { x0: 6, y0: 7.7, x1: 10, y1: 11 });
    expect(part.length).toBeLessThan(all.length);
    expect(totalOf(part, DEFAULT_PRICES)).toBeLessThan(totalOf(all, DEFAULT_PRICES));
  });
});

describe('roofLines', () => {
  // A 6 × 4 m hipped roof, 1 m high at the ridge: a 2 m ridge and four hips.
  const P = (x: number, y: number, z = 0) => ({ x, y, z });
  const ridgeA = P(2, 2, 1);
  const ridgeB = P(4, 2, 1);
  const g = {
    outline: [P(0, 0), P(6, 0), P(6, 4), P(0, 4)],
    faces: [{ pts: [P(0, 0), P(6, 0), ridgeB, ridgeA] }, { pts: [P(6, 4), P(0, 4), ridgeA, ridgeB] }],
    lines: [
      [ridgeA, ridgeB],
      [ridgeB, ridgeA],
      [P(0, 0), ridgeA],
      [P(0, 4), ridgeA],
      [P(6, 0), ridgeB],
      [P(6, 4), ridgeB],
    ] as [{ x: number; y: number }, { x: number; y: number }][],
  };
  it('counts each line once and tells ridges from hips', () => {
    const r = roofLines(g, () => true);
    expect(r.ridge).toBeCloseTo(2);
    expect(r.hips).toBeCloseTo(4 * Math.hypot(Math.hypot(2, 2), 1));
    expect(r.valleys).toBe(0);
  });
});

describe('beams between posts', () => {
  it('puts a steel beam along each roof edge the demo porch posts hold up', () => {
    const lines = estimate(demoBuilding(), null);
    const beams = lines.filter((l) => l.id.startsWith('postbeam:'));
    expect(beams.length).toBeGreaterThan(0);
    for (const l of beams) {
      expect(l.unit).toBe('kg');
      expect(l.detail).toMatch(/UB/);
    }
  });
});
