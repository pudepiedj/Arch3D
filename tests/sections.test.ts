import { describe, expect, it } from 'vitest';
import { addLevelOnTop, createBuilding } from '../src/model/building';
import { intersectAll } from '../src/model/clip';
import { polygonArea } from '../src/model/geom';
import { addWall } from '../src/model/plan';
import { levelRoofs, outerFaces, outsetLoop } from '../src/model/roof';
import type { Building, Level, Roof } from '../src/model/types';

function box(level: Level, pts: [number, number][]) {
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    addWall(level, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: level.height });
  });
}

/** A two-storey 10 x 8 house. */
function house(): { b: Building; g: Level } {
  const b = createBuilding();
  const g = b.levels[0];
  box(g, [[0, 0], [10, 0], [10, 8], [0, 8]]);
  const f = addLevelOnTop(b, false);
  box(f, [[0, 0], [10, 0], [10, 8], [0, 8]]);
  return { b, g };
}

const FLAT: Roof = { kind: 'flat', pitch: 35, overhang: 0.3 };

/** How much of a section's roof lies over the house (m², beyond the outside face of its walls). */
function bleed(b: Building, g: Level, id: string): number {
  const r = levelRoofs(b, g).find((x) => x.id === `section:${id}`)!;
  expect(r.geometry).toBeTruthy();
  let a = 0;
  for (const ring of outerFaces(g)) {
    for (const shape of intersectAll(r.geometry!.outline, ring)) a += Math.abs(polygonArea(shape[0]));
  }
  return a;
}

function section(g: Level, pts: [number, number][], roof: Roof = FLAT) {
  g.roofSections = { s: { id: 's', points: pts.map(([x, y]) => ({ x, y })), roof } };
}

describe('roof sections against the house', () => {
  it('a canopy drawn along the wall centre line stops at the outside face', () => {
    const { b, g } = house();
    section(g, [[2, 8], [6, 8], [6, 10.5], [2, 10.5]]);
    expect(bleed(b, g, 's')).toBeLessThan(1e-3);
  });

  it('a canopy drawn along the outside face of the wall does not overhang into the house', () => {
    const { b, g } = house();
    section(g, [[2, 8.15], [6, 8.15], [6, 10.5], [2, 10.5]]);
    expect(bleed(b, g, 's')).toBeLessThan(1e-3);
  });

  it('a canopy drawn a little inside the wall line is cut back to the outside face', () => {
    const { b, g } = house();
    section(g, [[2, 7.95], [6, 7.95], [6, 10.5], [2, 10.5]]);
    expect(bleed(b, g, 's')).toBeLessThan(1e-3);
  });

  it('a canopy running past the corner of the house does not bleed into it', () => {
    const { b, g } = house();
    section(g, [[8, 8], [12, 8], [12, 10.5], [8, 10.5]]);
    expect(bleed(b, g, 's')).toBeLessThan(1e-3);
  });

  it('a lean-to wrapping round a corner of the house does not bleed into it', () => {
    const { b, g } = house();
    // An L-shaped canopy along the back and down the side, drawn along the wall lines.
    section(g, [[6, 8], [10, 8], [10, 5], [12, 5], [12, 10.5], [6, 10.5]]);
    expect(bleed(b, g, 's')).toBeLessThan(1e-3);
  });
});

/** A single-storey 10 x 8 house with a 4 x 3 extension on the back, sharing the house's back wall. */
function bungalow(): { b: Building; g: Level } {
  const b = createBuilding();
  const g = b.levels[0];
  box(g, [[0, 0], [10, 0], [10, 8], [0, 8]]);
  return { b, g };
}

describe('roof sections on a single-storey house', () => {
  it('a canopy drawn along the outside face does not overhang into the house', () => {
    const { b, g } = bungalow();
    section(g, [[2, 8.15], [6, 8.15], [6, 10.5], [2, 10.5]]);
    expect(bleed(b, g, 's')).toBeLessThan(1e-3);
  });

  it('a canopy drawn along the wall centre line stops at the outside face', () => {
    const { b, g } = bungalow();
    section(g, [[2, 8], [6, 8], [6, 10.5], [2, 10.5]]);
    expect(bleed(b, g, 's')).toBeLessThan(1e-3);
  });

  it('a roof drawn over an extension stops at the house wall it shares', () => {
    const { b, g } = bungalow();
    // The extension's three walls; the house's back wall closes it.
    addWall(g, { x: 3, y: 8 }, { x: 3, y: 11 }, { thickness: 0.3, height: g.height });
    addWall(g, { x: 3, y: 11 }, { x: 7, y: 11 }, { thickness: 0.3, height: g.height });
    addWall(g, { x: 7, y: 11 }, { x: 7, y: 8 }, { thickness: 0.3, height: g.height });
    section(g, [[3, 8], [7, 8], [7, 11], [3, 11]]);
    const r = levelRoofs(b, g).find((x) => x.id === 'section:s')!;
    // Nothing of it reaches into the house proper (y < 8 - 0.15, the house side of the shared wall).
    const ys = r.geometry!.outline.map((p) => p.y);
    expect(Math.min(...ys)).toBeGreaterThan(8 - 0.15 - 1e-6);
  });
});

describe('flat roof sections drawn over part of the house', () => {
  it('one drawn partly over the house is cut back to its outside face', () => {
    const { b, g } = bungalow();
    section(g, [[2, 6], [6, 6], [6, 10.5], [2, 10.5]]);
    expect(bleed(b, g, 's')).toBeLessThan(1e-3);
  });

  it('one drawn mostly over the house does not overhang its edges inside the house', () => {
    const { b, g } = bungalow();
    section(g, [[2, 5], [6, 5], [6, 8.5], [2, 8.5]]);
    const r = levelRoofs(b, g).find((x) => x.id === 'section:s')!;
    const out = r.geometry!.outline;
    // Its inner edge (y = 5) and sides inside the house stay where they were drawn...
    expect(Math.min(...out.map((p) => p.y))).toBeGreaterThan(5 - 1e-6);
    expect(Math.min(...out.map((p) => p.x))).toBeGreaterThan(2 - 1e-6);
    // ...while the free edge outside the house still overhangs.
    expect(Math.max(...out.map((p) => p.y))).toBeGreaterThan(8.5 + 0.2);
  });

  it('pitched sections keep their edges inside the house for gables', () => {
    const { b, g } = bungalow();
    section(g, [[2, 5], [6, 5], [6, 8.5], [2, 8.5]], { kind: 'gable', pitch: 35, overhang: 0.3 });
    const r = levelRoofs(b, g).find((x) => x.id === 'section:s')!;
    expect(r.roles.some((role) => role !== 'wall')).toBe(true);
  });
});

describe('outlines with nearly lined-up edges', () => {
  it('never throws a corner far out when two almost-straight edges are pushed out by different amounts', () => {
    // An edge resting on the house (not pushed) running on, 3 cm out of line, into an eave (pushed 0.3).
    const ring = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 0.03 },
      { x: 8, y: 3 },
      { x: 0, y: 3 },
    ];
    const out = outsetLoop(ring, [0, 0.3, 0.3, 0.3, 0.3]);
    for (let i = 0; i < ring.length; i++) {
      expect(Math.hypot(out[i].x - ring[i].x, out[i].y - ring[i].y)).toBeLessThan(0.8);
    }
  });

  it('a flat section with such a joint has no spike', () => {
    const b = createBuilding();
    const g = b.levels[0];
    box(g, [[0, 0], [10, 0], [10, 8], [0, 8]]);
    // A canopy along the back wall, with a corner 3 cm out of line where it runs past the house.
    section(g, [[4, 8], [10, 8.03], [14, 8], [14, 10.5], [4, 10.5]]);
    const r = levelRoofs(b, g).find((x) => x.id === 'section:s')!;
    const out = r.geometry!.outline;
    expect(Math.max(...out.map((p) => p.x))).toBeLessThan(14.5);
    expect(Math.min(...out.map((p) => p.x))).toBeGreaterThan(3.5);
    expect(Math.min(...out.map((p) => p.y))).toBeGreaterThan(7.5);
    expect(bleed(b, g, 's')).toBeLessThan(1e-3);
  });
});
