import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { addTree, treeAt, trunkRadius } from '../src/model/trees';
import { WalkWorld } from '../src/model/walk';

describe('trees', () => {
  it('are picked by the trunk first, then by the crown', () => {
    const b = createBuilding();
    const l = b.levels[0];
    const t = addTree(l, { x: 5, y: 5 });
    expect(treeAt(l, { x: 5.05, y: 5 }, 0.05, false)).toBe(t.id);
    expect(treeAt(l, { x: 7, y: 5 }, 0.05, false)).toBeUndefined();
    expect(treeAt(l, { x: 7, y: 5 }, 0.05)).toBe(t.id);
    expect(treeAt(l, { x: 9, y: 5 }, 0.05)).toBeUndefined();
  });

  it('have a trunk you cannot walk through', () => {
    const b = createBuilding();
    const l = b.levels[0];
    const t = addTree(l, { x: 5, y: 5 });
    const world = new WalkWorld(b);
    const r = world.move({ x: 3, y: 5 }, 0, { x: 4, y: 0 });
    expect(r.p.x).toBeLessThan(5 - trunkRadius(t));
  });
});
