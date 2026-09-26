import { describe, expect, it } from 'vitest';
import { addLevelOnTop, createBuilding } from '../src/model/building';
import { addWall } from '../src/model/plan';
import { DEFAULT_ROOF, type LevelRoof, levelRoofs, outerFaces, toggleEdge } from '../src/model/roof';
import type { Building, Level, Roof } from '../src/model/types';

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
const faces = (r: LevelRoof, kind: string) => r.geometry!.faces.filter((f) => f.kind === kind);
const top = (r: LevelRoof) => Math.max(...r.geometry!.faces.flatMap((f) => f.pts.map((p) => p.z)));

function house(roof?: Roof): { b: Building; g: Level } {
  const b = createBuilding();
  const g = b.levels[0];
  box(g, rect);
  if (roof) g.roof = roof;
  return { b, g };
}

describe('roof outline', () => {
  it('runs round the outside face of the outer walls, ignoring inner walls', () => {
    const { g } = house();
    addWall(g, { x: 4, y: 0 }, { x: 4, y: 6 }, { thickness: 0.12, height: g.height });
    const [ring] = outerFaces(g);
    expect(ring).toHaveLength(4);
    const xs = ring.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(-0.15, 9);
    expect(Math.max(...xs)).toBeCloseTo(10.15, 9);
  });
});

describe('gable roof', () => {
  const { b, g } = house();
  const [roof] = levelRoofs(b, g);

  it('has two gable walls and two slopes', () => {
    expect(faces(roof, 'gable')).toHaveLength(2);
    expect(faces(roof, 'slope')).toHaveLength(2);
  });

  it('gable walls stand flush with the outside face of the end walls', () => {
    for (const f of faces(roof, 'gable')) {
      const xs = f.pts.map((p) => p.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6);
      expect([-0.15, 10.15].some((x) => Math.abs(xs[0] - x) < 1e-6)).toBe(true);
    }
  });

  it('ridge runs the full length at the right height', () => {
    const z = top(roof);
    expect(z).toBeCloseTo(g.height + 3.15 * tan35, 6);
    const ridge = faces(roof, 'slope')[0].pts.filter((p) => Math.abs(p.z - z) < 1e-6).map((p) => p.x);
    expect(Math.min(...ridge)).toBeCloseTo(-0.15, 6);
    expect(Math.max(...ridge)).toBeCloseTo(10.15, 6);
  });

  it('eaves overhang the side walls and sit below the wall top', () => {
    for (const [a] of roof.geometry!.eaves) expect(a.z).toBeCloseTo(g.height - 0.3 * tan35, 6);
    expect(Math.min(...roof.geometry!.outline.map((p) => p.y))).toBeCloseTo(-0.45, 6);
  });
});

describe('roof shapes', () => {
  it('hip roof: four slopes and a ridge shorter by the width', () => {
    const { b, g } = house({ kind: 'hip', pitch: 35, overhang: 0.3 });
    const [roof] = levelRoofs(b, g);
    expect(faces(roof, 'slope')).toHaveLength(4);
    const z = top(roof);
    const ridge = roof.geometry!.faces.flatMap((f) => f.pts).filter((p) => Math.abs(p.z - z) < 1e-6).map((p) => p.x);
    expect(Math.max(...ridge) - Math.min(...ridge)).toBeCloseTo(10.9 - 6.9, 6);
  });

  it('L-shaped house: two gable ends, a hip and a valley', () => {
    const b = createBuilding();
    box(b.levels[0], [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 9],
      [0, 9],
    ]);
    const [roof] = levelRoofs(b, b.levels[0]);
    expect(faces(roof, 'gable')).toHaveLength(2);
    expect(faces(roof, 'slope').length).toBeGreaterThanOrEqual(4);
  });

  it('a square plan gets a pyramid, and gabling two opposite edges gives a ridge', () => {
    const b = createBuilding();
    const g = b.levels[0];
    box(g, [
      [0, 0],
      [6, 0],
      [6, 6],
      [0, 6],
    ]);
    let [roof] = levelRoofs(b, g);
    expect(faces(roof, 'gable')).toHaveLength(0);
    expect(faces(roof, 'slope')).toHaveLength(4);
    // Click the east and west edges to make them gables.
    const east = roof.ring.findIndex((p, i) => Math.abs(p.x - 6.15) < 1e-6 && Math.abs(roof.ring[(i + 1) % 4].x - 6.15) < 1e-6);
    g.roof = { ...DEFAULT_ROOF, edges: toggleEdge(roof, east) };
    [roof] = levelRoofs(b, g);
    const west = roof.ring.findIndex((p, i) => Math.abs(p.x + 0.15) < 1e-6 && Math.abs(roof.ring[(i + 1) % 4].x + 0.15) < 1e-6);
    g.roof = { ...g.roof, edges: toggleEdge(roof, west) };
    [roof] = levelRoofs(b, g);
    expect(faces(roof, 'gable')).toHaveLength(2);
    expect(faces(roof, 'slope')).toHaveLength(2);
  });

  it('gable ends can go on the long sides of a building (ridge across it)', () => {
    const { b, g } = house();
    let [roof] = levelRoofs(b, g);
    // Swap: long sides become gables, short ends become eaves.
    let edges = roof.roof.edges ?? [];
    roof.ring.forEach((_, i) => {
      roof = { ...roof, roof: { ...roof.roof, edges } };
      edges = toggleEdge(roof, i);
    });
    g.roof = { ...DEFAULT_ROOF, edges };
    [roof] = levelRoofs(b, g);
    expect(faces(roof, 'gable')).toHaveLength(2);
    // Ridge height now comes from half the length (10.3 / 2), not half the width.
    expect(top(roof)).toBeCloseTo(g.height + 5.15 * tan35, 6);
  });

  it('flat roof is a slab over the outline', () => {
    const { b, g } = house({ kind: 'flat', pitch: 35, overhang: 0.3 });
    const [roof] = levelRoofs(b, g);
    expect(roof.geometry!.faces).toHaveLength(1);
    expect(roof.geometry!.faces[0].kind).toBe('flat');
  });
});

describe('houses with a projecting bay (lined-up wall edges either side of it)', () => {
  /** 10 x 8 with a 2.4 x 1 bay on the front wall. */
  function bayHouse(roof: Roof) {
    const b = createBuilding();
    const g = b.levels[0];
    box(g, [
      [0, 0],
      [1.2, 0],
      [1.2, -1],
      [3.6, -1],
      [3.6, 0],
      [10, 0],
      [10, 8],
      [0, 8],
    ]);
    g.roof = roof;
    return levelRoofs(b, g)[0];
  }
  const coverage = (r: LevelRoof) =>
    faces(r, 'slope').reduce((s, f) => s + Math.abs(f.pts.reduce((a, p, i) => {
      const q = f.pts[(i + 1) % f.pts.length];
      return a + p.x * q.y - q.x * p.y;
    }, 0)) / 2, 0);
  const planArea = (r: LevelRoof) => {
    const o = r.geometry!.outline;
    return Math.abs(o.reduce((a, p, i) => a + p.x * o[(i + 1) % o.length].y - o[(i + 1) % o.length].x * p.y, 0)) / 2;
  };

  for (const kind of ['hip', 'gable'] as const) {
    it(`${kind} roof covers the whole outline, with a continuous main ridge`, () => {
      const edges = kind === 'gable' ? [{ x: 2.4, y: -1.15, type: 'gable' as const }] : [];
      const r = bayHouse({ kind, pitch: 35, overhang: 0.3, edges });
      expect(coverage(r)).toBeCloseTo(planArea(r), 4);
      // Every point of the roof lies between the eaves and the ridge...
      const zEave = 2.9 - 0.3 * tan35;
      const pts = faces(r, 'slope').flatMap((f) => f.pts);
      for (const p of pts) {
        expect(p.z).toBeGreaterThan(zEave - 1e-6);
        expect(p.z).toBeLessThan(top(r) + 1e-6);
      }
      // ...and slopes that meet agree on the height where they meet (no steps or tears).
      for (const p of pts) {
        for (const q of pts) {
          if (Math.hypot(p.x - q.x, p.y - q.y) < 1e-6) expect(Math.abs(p.z - q.z)).toBeLessThan(1e-6);
        }
      }
      // The main ridge is unbroken: 2 m long for the hip (10.9 - 8.9), the full 10.3 m for the gable.
      const z = top(r);
      const ridge = faces(r, 'slope').flatMap((f) => f.pts).filter((p) => Math.abs(p.z - z) < 1e-6).map((p) => p.x);
      expect(Math.max(...ridge) - Math.min(...ridge)).toBeCloseTo(kind === 'gable' ? 10.3 : 2.0, 6);
    });
  }
});

describe('roofs on a house with extensions', () => {
  /** Two storeys 10 x 6, with single-storey extensions at the back and the east end. */
  function extended() {
    const b = createBuilding();
    const g = b.levels[0];
    box(g, rect);
    box(g, [
      [3, 6],
      [3, 9],
      [7, 9],
      [7, 6],
    ]);
    box(g, [
      [10, 1],
      [13, 1],
      [13, 5],
      [10, 5],
    ]);
    const up = addLevelOnTop(b, false);
    box(up, rect);
    return { b, g, up };
  }

  it('the top floor gets the main roof; single-storey parts get flat roofs of their own', () => {
    const { b, g, up } = extended();
    expect(levelRoofs(b, up)).toHaveLength(1);
    const lower = levelRoofs(b, g);
    expect(lower).toHaveLength(2);
    expect(lower.every((r) => r.roof.kind === 'flat')).toBe(true);
    // Each extension's edge against the house is recognised as abutting a wall.
    for (const r of lower) expect(r.walls.filter(Boolean)).toHaveLength(1);
  });

  it('a gabled extension runs its ridge into the house wall, with the gable at the far end', () => {
    const { b, g } = extended();
    const back = levelRoofs(b, g).find((r) => r.ring.some((p) => p.y > 8))!;
    g.roofAreas = [{ x: 5, y: 7.5, roof: { ...DEFAULT_ROOF } }];
    const roof = levelRoofs(b, g).find((r) => r.id === back.id)!;
    expect(roof.roof.kind).toBe('gable');
    const gables = faces(roof, 'gable');
    expect(gables).toHaveLength(1);
    // The gable is on the far (south) side, and the ridge runs north-south.
    expect(gables[0].pts.every((p) => Math.abs(p.y - 9.15) < 1e-6)).toBe(true);
    const z = top(roof);
    expect(z).toBeCloseTo(g.height + 2.15 * tan35, 6);
  });

  it('a hand-drawn section over a bay gets its own gable facing out', () => {
    const { b, up } = extended();
    up.roofSections = {
      s1: {
        id: 's1',
        points: [
          { x: 3, y: -1 },
          { x: 5, y: -1 },
          { x: 5, y: 2 },
          { x: 3, y: 2 },
        ],
        roof: { ...DEFAULT_ROOF, edges: [{ x: 4, y: 2, type: 'gable' }, { x: 4, y: -1, type: 'gable' }] },
      },
    };
    const roofs = levelRoofs(b, up);
    expect(roofs).toHaveLength(2);
    const section = roofs.find((r) => r.id === 'section:s1')!;
    expect(faces(section, 'gable')).toHaveLength(2);
    // Its ridge is lower than the main one, so it tucks into the main roof.
    expect(top(section)).toBeLessThan(top(roofs.find((r) => r.id !== 'section:s1')!));
  });

  it('a canopy drawn against the outside of a wall meets the wall face', () => {
    const { b, g } = extended();
    g.roofSections = {
      c: {
        id: 'c',
        points: [
          { x: 7.2, y: -1 },
          { x: 8.8, y: -1 },
          { x: 8.8, y: 0 },
          { x: 7.2, y: 0 },
        ],
        roof: { ...DEFAULT_ROOF },
      },
    };
    // Put a first floor over the whole house so the canopy edge is against a taller wall.
    const canopy = levelRoofs(b, g).find((r) => r.id === 'section:c')!;
    const ys = canopy.ring.map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(-0.15, 6);
    expect(canopy.walls.filter(Boolean)).toHaveLength(1);
    // Ridge runs out from the wall, with the gable at the front.
    expect(faces(canopy, 'gable')).toHaveLength(1);
  });

  it('setting a floor or area to no roof removes it', () => {
    const { b, g, up } = extended();
    g.roofAreas = [{ x: 11.5, y: 3, roof: { ...DEFAULT_ROOF, kind: 'none' } }];
    expect(levelRoofs(b, g)).toHaveLength(1);
    up.roof = { ...DEFAULT_ROOF, kind: 'none' };
    expect(levelRoofs(b, up)).toHaveLength(0);
  });
});

describe('the demo house', () => {
  it('has a whole main roof, a gabled and a flat extension, and nothing below the eaves', async () => {
    const { demoBuilding } = await import('../src/model/demo');
    const b = demoBuilding();
    const [main] = levelRoofs(b, b.levels[1]);
    const zEave = b.levels[1].height - 0.3 * tan35;
    for (const f of faces(main, 'slope')) for (const p of f.pts) expect(p.z).toBeGreaterThan(zEave - 1e-6);
    // Gables at both ends and over the bay.
    expect(faces(main, 'gable')).toHaveLength(3);
    const lower = levelRoofs(b, b.levels[0]);
    // Garage (flat), garden room (gable) and the terrace roof section (flat).
    expect(lower.map((r) => r.roof.kind).sort()).toEqual(['flat', 'flat', 'gable']);
  });
});

describe('roof sections attached to the house', () => {
  const rect: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 6],
    [0, 6],
  ];
  const veranda = (level: Level, kind: Roof['kind']) => {
    level.roofSections = {
      v: {
        id: 'v',
        points: [
          { x: 0, y: 6 },
          { x: 10, y: 6 },
          { x: 10, y: 9 },
          { x: 0, y: 9 },
        ],
        roof: { ...DEFAULT_ROOF, kind },
      },
    };
  };
  const intrusions = (r: LevelRoof) =>
    r.geometry!.faces.flatMap((f) => f.pts).filter((p) => p.x > -0.14 && p.x < 10.14 && p.y < 6.149);

  for (const kind of ['flat', 'gable', 'hip'] as const) {
    it(`${kind}: never reaches into the house, whatever is above`, () => {
      // Thinner walls upstairs, so the faces above don't line up with the wall below.
      const b = createBuilding();
      const g = b.levels[0];
      box(g, rect, 0.3);
      box(addLevelOnTop(b, false), rect, 0.2);
      veranda(g, kind);
      let r = levelRoofs(b, g).find((x) => x.id === 'section:v')!;
      expect(r.walls.filter(Boolean)).toHaveLength(1);
      expect(intrusions(r)).toHaveLength(0);
      // A single-storey house: nothing above at all.
      const b2 = createBuilding();
      box(b2.levels[0], rect, 0.3);
      veranda(b2.levels[0], kind);
      r = levelRoofs(b2, b2.levels[0]).find((x) => x.id === 'section:v')!;
      expect(r.walls.filter(Boolean)).toHaveLength(1);
      expect(intrusions(r)).toHaveLength(0);
    });
  }
});
