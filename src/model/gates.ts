// Gates: five-bar field gates and path gates. They are pieces from the furniture catalogue
// (so they have a width, a finish and can be shown open or shut), and set on the line of a
// hedge or fence they sit square in it and cut their own gap.

import type { Furniture } from './types';

export const GATE_KINDS = new Set(['gate5', 'pathgate', 'pathgatetall']);

export const isGate = (kind: string) => GATE_KINDS.has(kind);

/** A five-bar gate wider than this is hung as a pair meeting in the middle. */
export const MAX_LEAF = 3.7;

/** Size of the posts a gate hangs on and shuts against. */
export function gatePost(f: Furniture): number {
  return f.kind === 'gate5' ? 0.15 : 0.1;
}

/**
 * The gate's leaves, in its own frame (x across, the gate opening towards +y): each hangs
 * on a post at `hinge` and runs `length` towards the latch, the way `dir` says (+1 to +x).
 */
export function gateLeaves(f: Furniture): { hinge: number; dir: 1 | -1; length: number }[] {
  const post = gatePost(f);
  const gap = 0.015; // between the leaf and its posts
  const clear = f.width - 2 * post - 2 * gap;
  const left = -f.width / 2 + post + gap;
  if (f.kind === 'gate5' && clear > MAX_LEAF) {
    const half = (clear - gap) / 2;
    return [
      { hinge: left, dir: 1, length: half },
      { hinge: -left, dir: -1, length: half },
    ];
  }
  // Hung on the left post, or (flipped) the right.
  return f.flip ? [{ hinge: -left, dir: -1, length: clear }] : [{ hinge: left, dir: 1, length: clear }];
}
