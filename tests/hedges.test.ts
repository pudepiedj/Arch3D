import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { HEDGE_DEFAULTS, addHedge, hedgeAt, hedgeClosed, hedgeLength, hedgeRuns, onHedge } from '../src/model/hedges';
import { addFurniture } from '../src/model/furniture';
import { gateLeaves } from '../src/model/gates';
import { stretch } from '../src/model/stretch';
import { WalkWorld } from '../src/model/walk';
import { buildBuildingObject, createMaterials } from '../src/three/build';

describe('hedges and fences', () => {
  it('are drawn as a line with the usual size for their kind', () => {
    const b = createBuilding();
    const l = b.levels[0];
    const h = addHedge(l, [{ x: 0, y: 10 }, { x: 8, y: 10 }, { x: 8, y: 14 }], 'beech');
    expect(h.height).toBe(HEDGE_DEFAULTS.beech.height);
    expect(hedgeLength(h)).toBeCloseTo(12);
    expect(hedgeClosed(h)).toBe(false);
    const f = addHedge(l, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 0 }], 'fence');
    expect(hedgeClosed(f)).toBe(true);
    expect(f.width).toBeLessThan(0.2);
  });

  it('are picked within their thickness', () => {
    const b = createBuilding();
    const l = b.levels[0];
    const h = addHedge(l, [{ x: 0, y: 10 }, { x: 8, y: 10 }]);
    expect(hedgeAt(l, { x: 4, y: 10.25 }, 0.05)).toBe(h.id);
    expect(hedgeAt(l, { x: 4, y: 11 }, 0.05)).toBeUndefined();
  });

  it('cannot be walked through', () => {
    const b = createBuilding();
    addHedge(b.levels[0], [{ x: 5, y: 0 }, { x: 5, y: 10 }], 'privet');
    const r = new WalkWorld(b).move({ x: 3, y: 5 }, 0, { x: 4, y: 0 });
    expect(r.p.x).toBeLessThan(5 - 0.3);
  });

  it('move with the Stretch tool', () => {
    const b = createBuilding();
    const h = addHedge(b.levels[0], [{ x: 0, y: 10 }, { x: 8, y: 10 }]);
    stretch(b, { x0: 6, y0: 9, x1: 9, y1: 11 }, { x: 1, y: 0 });
    expect(h.points[0].x).toBe(0);
    expect(h.points[1].x).toBe(9);
  });

  it('are built in 3D, every kind', () => {
    const b = createBuilding();
    for (const kind of ['privet', 'hawthorn', 'beech', 'fence'] as const) addHedge(b.levels[0], [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }], kind);
    const obj = buildBuildingObject(b, createMaterials(), undefined, { leaf: 0, autumn: false });
    const names: string[] = [];
    obj.traverse((o) => o.name.startsWith('hedge:') && names.push(o.name));
    expect(names.length).toBe(4);
  });
});

describe('gates', () => {
  const setup = (kind = 'gate5') => {
    const b = createBuilding();
    const l = b.levels[0];
    const h = addHedge(l, [{ x: 0, y: 10 }, { x: 10, y: 10 }], 'privet');
    const at = onHedge(l, { x: 5, y: 10.4 }, 0.8)!;
    const g = addFurniture(l, kind, at.at, at.angle);
    return { b, l, h, g };
  };

  it('set on a hedge sit in its line and cut a gap as wide as themselves', () => {
    const { l, h, g } = setup();
    expect(g.y).toBeCloseTo(10);
    expect(Math.abs(Math.sin(g.angle))).toBeLessThan(1e-9);
    const runs = hedgeRuns(h, l);
    expect(runs.length).toBe(2);
    expect(runs[0].b.x).toBeCloseTo(5 - g.width / 2);
    expect(runs[1].a.x).toBeCloseTo(5 + g.width / 2);
    expect(runs[0].openB && runs[1].openA).toBe(true);
    expect(runs[0].openA || runs[1].openB).toBe(false);
  });

  it('are hung as a pair when very wide', () => {
    const { g } = setup();
    expect(gateLeaves(g).length).toBe(1);
    g.width = 4.5;
    expect(gateLeaves(g).length).toBe(2);
    const p = addFurniture(createBuilding().levels[0], 'pathgate', { x: 0, y: 0 });
    p.width = 4.5;
    expect(gateLeaves(p).length).toBe(1);
  });

  it('let the walker through when open, not when shut', () => {
    const { b, g } = setup('pathgate');
    const through = () => new WalkWorld(b).move({ x: 5, y: 9 }, 0, { x: 0, y: 2 }).p.y;
    expect(through()).toBeLessThan(10);
    g.open = true;
    expect(through()).toBeGreaterThan(10.5);
  });

  it('are built in 3D, open and shut, one leaf or two', () => {
    const { b, g } = setup();
    for (const [open, width] of [[false, 3], [true, 3], [true, 4.6]] as const) {
      g.open = open;
      g.width = width;
      const obj = buildBuildingObject(b, createMaterials());
      let found = false;
      obj.traverse((o) => (found ||= o.name === `furniture:${g.id}`));
      expect(found).toBe(true);
    }
  });
});
