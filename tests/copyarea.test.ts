import { describe, expect, it } from 'vitest';
import { demoBuilding } from '../src/model/demo';
import { copyArea, pasteClip } from '../src/model/copyarea';
import { computeFootprints } from '../src/model/joints';
import type { Level } from '../src/model/types';

const blank = (): Level => ({ id: 'L9', name: 'Ground floor', height: 2.4, slab: 0.2, stairs: {}, nodes: {}, walls: {}, openings: {}, nextId: 1 });
const lengths = (l: Level) =>
  Object.values(l.walls)
    .map((w) => Math.hypot(l.nodes[w.b].x - l.nodes[w.a].x, l.nodes[w.b].y - l.nodes[w.a].y))
    .sort((a, b) => a - b)
    .map((v) => v.toFixed(3));

describe('copying an area of the plan', () => {
  const ground = demoBuilding().levels[0];

  it('copies a whole floor into an empty one, same walls, openings and joints', () => {
    const clip = copyArea(ground, { x0: -50, y0: -50, x1: 50, y1: 50 })!;
    const to = blank();
    pasteClip(to, clip, { x: -50, y: -50 });
    expect(Object.keys(to.walls).length).toBe(Object.keys(ground.walls).length);
    expect(Object.keys(to.openings).length).toBe(Object.keys(ground.openings).length);
    expect(Object.keys(to.nodes).length).toBe(Object.keys(ground.nodes).length);
    expect(lengths(to)).toEqual(lengths(ground));
    // Brings the floor's height with it, and its trees and patios.
    expect(to.height).toBe(ground.height);
    expect(Object.keys(to.trees ?? {}).length).toBe(Object.keys(ground.trees ?? {}).length);
    expect(Object.keys(to.patios ?? {}).length).toBe(Object.keys(ground.patios ?? {}).length);
    // And the walls still join up properly.
    expect(computeFootprints(to).size).toBe(Object.keys(to.walls).length);
  });

  it('cuts off walls at the edge of the box, dropping openings not wholly inside', () => {
    const box = { x0: 6, y0: 7.7, x1: 10, y1: 11 };
    const clip = copyArea(ground, box)!;
    for (const n of clip.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(-0.011);
      expect(n.x).toBeLessThanOrEqual(4.011);
      expect(n.y).toBeGreaterThanOrEqual(-0.011);
      expect(n.y).toBeLessThanOrEqual(3.311);
    }
    const walls = new Set(clip.walls.map((w) => w.id));
    for (const o of clip.openings) {
      expect(walls.has(o.wallId)).toBe(true);
      const w = clip.walls.find((v) => v.id === o.wallId)!;
      const a = clip.nodes.find((n) => n.id === w.a)!;
      const b = clip.nodes.find((n) => n.id === w.b)!;
      expect(o.offset - o.width / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(o.offset + o.width / 2).toBeLessThanOrEqual(Math.hypot(b.x - a.x, b.y - a.y) + 1e-6);
    }
  });

  it('pasting twice in the same place does not double the walls', () => {
    const clip = copyArea(ground, { x0: 6, y0: 7.7, x1: 10, y1: 11 })!;
    const to = blank();
    pasteClip(to, clip, { x: 0, y: 0 });
    const walls = Object.keys(to.walls).length;
    const nodes = Object.keys(to.nodes).length;
    pasteClip(to, clip, { x: 0, y: 0 });
    expect(Object.keys(to.walls).length).toBe(walls);
    expect(Object.keys(to.nodes).length).toBe(nodes);
  });

  it('finds nothing in an empty corner', () => {
    expect(copyArea(ground, { x0: 100, y0: 100, x1: 101, y1: 101 })).toBeNull();
  });
});
