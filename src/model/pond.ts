// A natural garden pond: a round (or oval) pool of water with a softly irregular edge,
// stones here and there round the rim, reeds and irises in the shallows along part of it,
// and water lilies. Placed like a piece of garden furniture: its width and depth are the
// water's size, and its "height" is the depth of water at the deepest point.

import type { Vec2 } from './geom';
import type { Furniture } from './types';

export const isPond = (f: Furniture) => f.kind === 'pond';

/** A repeatable random sequence for a pond, so it looks the same every time it's drawn. */
export function pondRandom(f: Furniture): () => number {
  let seed = [...f.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

/**
 * The water's edge in the piece's frame: an ellipse its width and depth across, gently
 * wavy (and never outside them), counter-clockwise from +x.
 */
export function pondOutline(f: Furniture, n = 48): Vec2[] {
  const rand = pondRandom(f);
  const waves = [2, 3, 5].map((k) => ({ k, a: 0.025 + rand() * 0.035, p: rand() * Math.PI * 2 }));
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const r = 1 - 0.09 + waves.reduce((s, w) => s + w.a * Math.sin(w.k * t + w.p), 0);
    return { x: (Math.cos(t) * f.width * r) / 2, y: (Math.sin(t) * f.depth * r) / 2 };
  });
}

/** The edge on the plan. */
export function pondOnPlan(f: Furniture, n = 48): Vec2[] {
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  return pondOutline(f, n).map((p) => ({ x: f.x + p.x * c - p.y * s, y: f.y + p.x * s + p.y * c }));
}

/** Where things grow and lie round it: angles (radians round the edge) and what. */
export interface PondPlanting {
  /** Clumps of reeds and irises in the shallows, round part of the edge. */
  marginals: { t: number; kind: 'reeds' | 'iris' }[];
  stones: { t: number; size: number }[];
  /** Lily pads on the water: where (as a share of the way out from the middle) and how big. */
  lilies: { t: number; out: number; size: number; flower: boolean }[];
}

export function pondPlanting(f: Furniture): PondPlanting {
  const rand = pondRandom(f);
  for (let i = 0; i < 9; i++) rand(); // past the numbers used for the outline
  const around = Math.max(f.width, f.depth) * Math.PI;
  // Planting along about half the edge, from a random start, in clumps about 0.8 m apart.
  const start = rand() * Math.PI * 2;
  const span = Math.PI * (0.8 + rand() * 0.4);
  const clumps = Math.max(3, Math.round((around * span) / (Math.PI * 2) / 0.8));
  const marginals = Array.from({ length: clumps }, (_, i) => ({
    t: start + (span * (i + rand() * 0.6)) / clumps,
    kind: (rand() < 0.65 ? 'reeds' : 'iris') as 'reeds' | 'iris',
  }));
  // Stones along the rest.
  const stoneN = Math.max(3, Math.round(around / 1.4));
  const stones = Array.from({ length: stoneN }, (_, i) => ({
    t: start + span + ((Math.PI * 2 - span) * (i + rand() * 0.7)) / stoneN,
    size: 0.15 + rand() * 0.2,
  }));
  const lilyN = Math.max(2, Math.round((f.width * f.depth) / 2.2));
  const lilies = Array.from({ length: lilyN }, () => ({
    t: rand() * Math.PI * 2,
    out: 0.25 + rand() * 0.5,
    size: 0.12 + rand() * 0.1,
    flower: rand() < 0.35,
  }));
  return { marginals, stones, lilies };
}

/** A point at angle t on the edge, pulled in (k < 1) or pushed out (k > 1) from the middle. */
export function pondEdgePoint(f: Furniture, t: number, k = 1): Vec2 {
  const ring = pondOutline(f, 96);
  const a = ((t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const p = ring[Math.round((a / (Math.PI * 2)) * ring.length) % ring.length];
  return { x: p.x * k, y: p.y * k };
}

/** Surface area of the water (m²). */
export function pondArea(f: Furniture): number {
  const ring = pondOutline(f);
  let a = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  });
  return Math.abs(a) / 2;
}
