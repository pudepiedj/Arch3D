// Drains below ground: pipe runs between fittings (inspection chambers, gullies, rainwater
// downpipes, a soakaway, the sewer connection) or plain bends and junctions. Each node has
// the depth of the pipe's invert; the fall of each pipe follows from its two ends.

import { type Vec2, dist, projectOnSegment } from './geom';
import type { Building, DrainFitting, DrainKind, DrainNode, DrainPipe, Drains } from './types';

/** Usual depth to the invert for a new fitting (m). */
export const DEFAULT_INVERT: Record<DrainFitting, number> = {
  junction: 0.6,
  chamber: 0.6,
  gully: 0.45,
  downpipe: 0.45,
  soakaway: 1.2,
  sewer: 1.5,
};

export const FITTING_NAMES: Record<DrainFitting, string> = {
  junction: 'Bend or junction',
  chamber: 'Inspection chamber',
  gully: 'Gully',
  downpipe: 'Rainwater downpipe',
  soakaway: 'Soakaway',
  sewer: 'Sewer connection',
};

export function drainsOf(b: Building): Drains {
  b.drains ??= { nodes: {}, pipes: {} };
  return b.drains;
}

export function addDrainNode(b: Building, p: Vec2, fitting: DrainFitting = 'junction', invert?: number): DrainNode {
  const d = drainsOf(b);
  const id = `dn${b.nextId++}`;
  const n: DrainNode = { id, x: p.x, y: p.y, fitting, invert: invert ?? DEFAULT_INVERT[fitting] };
  d.nodes[id] = n;
  return n;
}

export function addDrainPipe(b: Building, a: string, c: string, kind: DrainKind, diameter = 100): DrainPipe | null {
  const d = drainsOf(b);
  if (a === c || !d.nodes[a] || !d.nodes[c]) return null;
  const existing = Object.values(d.pipes).find((p) => (p.a === a && p.b === c) || (p.a === c && p.b === a));
  if (existing) return existing;
  const id = `dp${b.nextId++}`;
  const pipe: DrainPipe = { id, a, b: c, diameter, kind };
  d.pipes[id] = pipe;
  return pipe;
}

/** Remove a node and every pipe to it. */
export function deleteDrainNode(b: Building, id: string) {
  const d = drainsOf(b);
  delete d.nodes[id];
  for (const p of Object.values(d.pipes)) if (p.a === id || p.b === id) delete d.pipes[p.id];
}

export function pipeLength(d: Drains, p: DrainPipe): number {
  return dist(d.nodes[p.a], d.nodes[p.b]);
}

/**
 * The fall of a pipe as "1 in N" (N = length / drop), with a verdict against the usual
 * guidance for house drains: 100 mm between 1 in 40 and 1 in 80 (1 in 110 with a WC on
 * it at the head), 150 mm no flatter than 1 in 150.
 */
export function pipeFall(d: Drains, p: DrainPipe): { oneIn: number | null; verdict: 'ok' | 'flat' | 'steep' | 'backfall' | 'level' } {
  const a = d.nodes[p.a];
  const c = d.nodes[p.b];
  const drop = c.invert - a.invert; // deeper downstream is a fall
  const len = dist(a, c);
  if (Math.abs(drop) < 1e-4) return { oneIn: null, verdict: 'level' };
  if (drop < 0) return { oneIn: len / -drop, verdict: 'backfall' };
  const n = len / drop;
  const flattest = p.diameter >= 150 ? 150 : 110;
  if (n > flattest) return { oneIn: n, verdict: 'flat' };
  if (n < 40) return { oneIn: n, verdict: 'steep' };
  return { oneIn: n, verdict: 'ok' };
}

/** The drain node at p (within tol), if any. */
export function drainNodeAt(b: Building, p: Vec2, tol: number): string | undefined {
  let best: string | undefined;
  let bestD = tol;
  for (const n of Object.values(b.drains?.nodes ?? {})) {
    const d = dist(n, p);
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

/** The pipe passing p (within tol), if any. */
export function drainPipeAt(b: Building, p: Vec2, tol: number): string | undefined {
  const d = b.drains;
  if (!d) return undefined;
  let best: string | undefined;
  let bestD = tol;
  for (const pipe of Object.values(d.pipes)) {
    const r = projectOnSegment(p, d.nodes[pipe.a], d.nodes[pipe.b]);
    if (r.dist < bestD) {
      bestD = r.dist;
      best = pipe.id;
    }
  }
  return best;
}

/** Split a pipe at p with a new node (for joining a new run into the middle of one). */
export function splitPipe(b: Building, pipeId: string, p: Vec2): DrainNode | null {
  const d = drainsOf(b);
  const pipe = d.pipes[pipeId];
  if (!pipe) return null;
  const a = d.nodes[pipe.a];
  const c = d.nodes[pipe.b];
  const r = projectOnSegment(p, a, c);
  const node = addDrainNode(b, r.point, 'junction', a.invert + (c.invert - a.invert) * r.t);
  delete d.pipes[pipeId];
  addDrainPipe(b, a.id, node.id, pipe.kind, pipe.diameter);
  addDrainPipe(b, node.id, c.id, pipe.kind, pipe.diameter);
  return node;
}
