import { describe, expect, it } from 'vitest';
import { addLevelOnTop, createBuilding } from '../src/model/building';
import { intersectAll } from '../src/model/clip';
import { polygonArea } from '../src/model/geom';
import { addWall } from '../src/model/plan';
import { levelRoofs, outerFaces, outsetLoop, toggleParapet } from '../src/model/roof';
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
    section(g, [[2, 5], [6, 5], [6, 8.5], [2, 8.5]], { ...FLAT, parapet: 0 });
    const r = levelRoofs(b, g).find((x) => x.id === 'section:s')!;
    const out = r.geometry!.outline;
    // Its inner edge (y = 5) and sides inside the house stay where they were drawn...
    expect(Math.min(...out.map((p) => p.y))).toBeGreaterThan(5 - 1e-6);
    expect(Math.min(...out.map((p) => p.x))).toBeGreaterThan(2 - 1e-6);
    // ...while the free edge outside the house still overhangs.
    expect(Math.max(...out.map((p) => p.y))).toBeGreaterThan(8.5 + 0.2);
  });

  it('flat roofs have a 25 cm parapet round their open edges, flush with the walls', () => {
    const { b, g } = bungalow();
    section(g, [[2, 5], [6, 5], [6, 8.5], [2, 8.5]]);
    const r = levelRoofs(b, g).find((x) => x.id === 'section:s')!;
    const p = r.geometry!.parapet!;
    expect(p.z1 - p.roof).toBeCloseTo(0.25);
    // No overhang: the parapet's outside face is the edge of the roof.
    expect(Math.max(...r.geometry!.outline.map((q) => q.y))).toBeLessThan(8.5 + 1e-6);
    // The free edges (outside the house) have one; none stands inside the house.
    expect(p.runs.length).toBeGreaterThan(0);
    for (const run of p.runs) expect(Math.max(run.a.y, run.b.y)).toBeGreaterThan(8.15 - 1e-6);
    // Its inside face is 20 cm in from the outside.
    const { a, b: c, ia: q } = p.runs[0];
    const d = Math.abs((c.x - a.x) * (q.y - a.y) - (c.y - a.y) * (q.x - a.x)) / Math.hypot(c.x - a.x, c.y - a.y);
    expect(d).toBeCloseTo(0.2);
  });

  it('where a flat roof is carried on by a section, the parapet stops at the join', () => {
    const { b, g } = bungalow();
    // A veranda over pillars along part of the south side, joining the house's own flat roof.
    g.roof = { ...FLAT };
    section(g, [[2, 8.15], [6, 8.15], [6, 10.5], [2, 10.5]], { ...FLAT, parapet: undefined });
    const roofs = levelRoofs(b, g);
    const house = roofs.find((x) => x.id.startsWith('area:'))!.geometry!.parapet!;
    const veranda = roofs.find((x) => x.id === 'section:s')!.geometry!.parapet!;
    const onSouth = (run: { a: { y: number }; b: { y: number } }) => Math.abs(run.a.y - 8.15) < 1e-3 && Math.abs(run.b.y - 8.15) < 1e-3;
    // The house's south parapet stops where the veranda joins it (x 2 to 6) and carries on either side.
    const south = house.runs.filter(onSouth);
    expect(south.length).toBe(2);
    for (const run of south) for (const x of [run.a.x, run.b.x]) expect(x <= 2 + 0.01 || x >= 6 - 0.01).toBe(true);
    // The veranda has none along the house, only round its three free sides.
    expect(veranda.runs.some(onSouth)).toBe(false);
    expect(veranda.runs.length).toBe(3);
  });

  it('an edge can have its parapet taken off by hand, and put back', () => {
    const { b, g } = bungalow();
    g.roof = { ...FLAT };
    const area = () => levelRoofs(b, g).find((x) => x.id.startsWith('area:'))!;
    const runs = () => area().geometry!.parapet!.runs.length;
    expect(runs()).toBe(4);
    const east = area().ring.findIndex((p, i, r) => Math.abs(p.x - 10.15) < 1e-3 && Math.abs(r[(i + 1) % r.length].x - 10.15) < 1e-3);
    g.roof.edges = toggleParapet(area(), east);
    expect(runs()).toBe(3);
    expect(area().geometry!.parapet!.runs.some((r) => Math.abs(r.a.x - 10.15) < 1e-3 && Math.abs(r.b.x - 10.15) < 1e-3)).toBe(false);
    g.roof.edges = toggleParapet(area(), east);
    expect(runs()).toBe(4);
  });

  it('a pitched roof, or a parapet of 0, has none', () => {
    const { b, g } = bungalow();
    section(g, [[2, 5], [6, 5], [6, 8.5], [2, 8.5]], { ...FLAT, parapet: 0 });
    expect(levelRoofs(b, g).find((x) => x.id === 'section:s')!.geometry!.parapet).toBeUndefined();
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

describe('roof areas next to a floor above that does not quite line up', () => {
  /**
   * A two-storey 10 x 8 house whose first-floor back wall is not exactly over the ground-floor
   * one (a slight slant, 3 cm at one end), and a single-storey garage on the side.
   */
  function slanted(): { b: Building; g: Level } {
    const b = createBuilding();
    const g = b.levels[0];
    box(g, [[0, 0], [10, 0], [16, 0], [16, 8], [10, 8], [0, 8]]);
    addWall(g, { x: 10, y: 0 }, { x: 10, y: 8 }, { thickness: 0.3, height: g.height });
    const f = addLevelOnTop(b, false);
    box(f, [[0, 0], [10, 0], [10, 7.97], [0, 8]]);
    return { b, g };
  }

  it('leaves no sliver of roof along the wall below', () => {
    const { b, g } = slanted();
    g.roofAreas = [{ x: 13, y: 4, roof: FLAT }];
    const roofs = levelRoofs(b, g);
    expect(roofs).toHaveLength(1);
    const out = roofs[0].geometry!.outline;
    // The garage roof stays over the garage: nothing reaches back along the house.
    expect(Math.min(...out.map((p) => p.x))).toBeGreaterThan(9.5);
    expect(Math.max(...out.map((p) => p.x))).toBeLessThan(16.5);
    expect(Math.max(...out.map((p) => p.y))).toBeLessThan(8.5);
  });

  it('keeps the garage roof reaching right up to the house wall above', () => {
    const { b, g } = slanted();
    g.roofAreas = [{ x: 13, y: 4, roof: FLAT }];
    const out = levelRoofs(b, g)[0].geometry!.outline;
    // The first floor's side wall has its outside face at x = 10.15.
    expect(Math.min(...out.map((p) => p.x))).toBeLessThan(10.15 + 1e-3);
  });
});
