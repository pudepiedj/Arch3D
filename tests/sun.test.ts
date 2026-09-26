import { describe, expect, it } from 'vitest';
import { leafiness, sunDirection, sunPosition, sunTimes } from '../src/model/sun';

const deg = (r: number) => (r * 180) / Math.PI;

describe('sun position', () => {
  it('London, midsummer, solar noon: about 62 degrees up, due south', () => {
    // Solar noon in London (0.12 W) on 21 June 2026 is about 12:02 UTC.
    const s = sunPosition(new Date(Date.UTC(2026, 5, 21, 12, 2)), 51.5, -0.12);
    expect(deg(s.elevation)).toBeCloseTo(90 - 51.5 + 23.44, 0);
    expect(deg(s.azimuth)).toBeGreaterThan(178);
    expect(deg(s.azimuth)).toBeLessThan(182);
  });

  it('London, midwinter noon: about 15 degrees up', () => {
    const s = sunPosition(new Date(Date.UTC(2026, 11, 21, 12, 0)), 51.5, -0.12);
    expect(deg(s.elevation)).toBeCloseTo(90 - 51.5 - 23.44, 0);
  });

  it('rises in the east and sets in the west at the equinox', () => {
    const morning = sunPosition(new Date(Date.UTC(2026, 2, 20, 7, 0)), 51.5, -0.12);
    const evening = sunPosition(new Date(Date.UTC(2026, 2, 20, 17, 0)), 51.5, -0.12);
    expect(deg(morning.azimuth)).toBeGreaterThan(90);
    expect(deg(morning.azimuth)).toBeLessThan(120);
    expect(deg(evening.azimuth)).toBeGreaterThan(240);
    expect(deg(evening.azimuth)).toBeLessThan(270);
  });

  it('gives a midsummer day about 16.5 hours long in London', () => {
    const { rise, set } = sunTimes(new Date(2026, 5, 21), 51.5, -0.12);
    expect(rise && set).toBeTruthy();
    const hours = (set!.getTime() - rise!.getTime()) / 3600000;
    expect(hours).toBeGreaterThan(16.3);
    expect(hours).toBeLessThan(16.8);
  });

  it('puts a southern sun at the bottom of a plan drawn with north up, and on the left if the plan is turned', () => {
    const south = { azimuth: Math.PI, elevation: 0.5 };
    const d = sunDirection(south, 0);
    expect(d.y).toBeGreaterThan(0.8); // down the screen
    // Top of the plan faces east (north is to the left), so south is to the right.
    const e = sunDirection(south, 90);
    expect(e.x).toBeGreaterThan(0.8);
  });

  it('bare trees in winter, leafy in summer, and the other way round down under', () => {
    expect(leafiness(new Date(2026, 0, 15), 51)).toBe(0);
    expect(leafiness(new Date(2026, 6, 15), 51)).toBe(1);
    expect(leafiness(new Date(2026, 6, 15), -33)).toBe(0);
  });
});
