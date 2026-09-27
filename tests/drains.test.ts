import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/model/building';
import { addDrainNode, addDrainPipe, deleteDrainNode, drainNodeAt, drainPipeAt, pipeFall, splitPipe } from '../src/model/drains';
import { stretch } from '../src/model/stretch';

describe('drains', () => {
  it('works out the fall of a pipe and judges it', () => {
    const b = createBuilding();
    const a = addDrainNode(b, { x: 0, y: 0 }, 'gully', 0.5);
    const c = addDrainNode(b, { x: 6, y: 0 }, 'chamber', 0.6);
    const p = addDrainPipe(b, a.id, c.id, 'foul')!;
    // 6 m falling 0.1 m: 1 in 60, fine for a 100 mm drain.
    expect(pipeFall(b.drains!, p).oneIn).toBeCloseTo(60, 6);
    expect(pipeFall(b.drains!, p).verdict).toBe('ok');
    c.invert = 0.52; // 1 in 300: too flat
    expect(pipeFall(b.drains!, p).verdict).toBe('flat');
    c.invert = 0.45; // running uphill
    expect(pipeFall(b.drains!, p).verdict).toBe('backfall');
  });

  it('finds nodes and pipes, splits a pipe for a junction, and deletes a node with its pipes', () => {
    const b = createBuilding();
    const a = addDrainNode(b, { x: 0, y: 0 }, 'chamber', 0.6);
    const c = addDrainNode(b, { x: 10, y: 0 }, 'sewer', 1.1);
    const p = addDrainPipe(b, a.id, c.id, 'foul')!;
    expect(drainNodeAt(b, { x: 0.1, y: 0 }, 0.3)).toBe(a.id);
    expect(drainPipeAt(b, { x: 5, y: 0.1 }, 0.3)).toBe(p.id);
    const j = splitPipe(b, p.id, { x: 4, y: 0.2 })!;
    expect(j.x).toBeCloseTo(4, 9);
    expect(j.invert).toBeCloseTo(0.8, 9); // on the line between the two inverts
    expect(Object.keys(b.drains!.pipes)).toHaveLength(2);
    deleteDrainNode(b, j.id);
    expect(Object.keys(b.drains!.pipes)).toHaveLength(0);
  });

  it('move with the ground floor when part of the house is stretched', () => {
    const b = createBuilding();
    const a = addDrainNode(b, { x: 2, y: 2 }, 'chamber');
    const c = addDrainNode(b, { x: 8, y: 2 }, 'chamber');
    stretch(b, { x0: 5, y0: 0, x1: 12, y1: 4 }, { x: -1, y: 0 });
    expect(b.drains!.nodes[a.id].x).toBe(2);
    expect(b.drains!.nodes[c.id].x).toBe(7);
  });
});

describe('the demo house drains', () => {
  it('all fall the right way, within the usual range', async () => {
    const { demoBuilding } = await import('../src/model/demo');
    const b = demoBuilding();
    const d = b.drains!;
    expect(Object.keys(d.pipes).length).toBeGreaterThan(5);
    for (const p of Object.values(d.pipes)) expect(pipeFall(d, p).verdict).toBe('ok');
  });
});

describe('a sewage treatment plant', () => {
  it('starts as a tank of about 2 m³, and its size can be set', async () => {
    const { tankVolume } = await import('../src/model/drains');
    const b = createBuilding();
    const stp = addDrainNode(b, { x: 20, y: 5 }, 'treatment');
    expect(stp.tank).toBeTruthy();
    expect(tankVolume(stp.tank!)).toBeGreaterThan(1.9);
    expect(tankVolume(stp.tank!)).toBeLessThan(2.4);
    stp.tank = { shape: 'box', width: 1.25, depth: 1.3 };
    expect(tankVolume(stp.tank)).toBeCloseTo(2.03, 2);
  });
});
