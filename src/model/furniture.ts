// The furniture catalogue, and placing, finding and aligning pieces on the plan.
// The plan symbols live in ui/furniture2d.ts and the 3D models in three/furniture3d.ts;
// both work in a piece's own frame: centred on its footprint, x across its width, back at
// -y (against a wall), front at +y.

import { type Vec2, add, pointInPolygon, scale, sub } from './geom';
import type { Footprint } from './joints';
import { patioAt } from './patios';
import type { Furniture, Level } from './types';

export interface CatalogueItem {
  kind: string;
  name: string;
  category: string;
  width: number;
  depth: number;
  height: number;
  /** Finishes to choose from; the first is the default. */
  finishes?: string[];
  /** Has something to show open or shut (a piano lid). */
  openable?: boolean;
  /** Can be walked over (a rug). */
  flat?: boolean;
}

export const CATEGORIES = ['Music', 'Living', 'Dining', 'Bedroom', 'Kitchen', 'Bathroom', 'Garden'];

const WOODS = ['oak', 'walnut', 'white'];
const FABRICS = ['grey', 'blue', 'green', 'cream', 'rust'];

export const CATALOGUE: CatalogueItem[] = [
  { kind: 'grand', name: 'Grand piano', category: 'Music', width: 1.5, depth: 1.91, height: 1.0, finishes: ['black', 'walnut', 'mahogany', 'white'], openable: true },
  { kind: 'upright', name: 'Upright piano', category: 'Music', width: 1.5, depth: 0.6, height: 1.25, finishes: ['black', 'walnut', 'mahogany', 'white'] },
  { kind: 'musicstand', name: 'Music stand', category: 'Music', width: 0.5, depth: 0.45, height: 1.2 },

  { kind: 'sofa3', name: 'Sofa, 3 seat', category: 'Living', width: 2.1, depth: 0.92, height: 0.85, finishes: FABRICS },
  { kind: 'sofa2', name: 'Sofa, 2 seat', category: 'Living', width: 1.6, depth: 0.9, height: 0.85, finishes: FABRICS },
  { kind: 'armchair', name: 'Armchair', category: 'Living', width: 0.85, depth: 0.85, height: 0.9, finishes: FABRICS },
  { kind: 'coffee', name: 'Coffee table', category: 'Living', width: 1.2, depth: 0.6, height: 0.42, finishes: WOODS },
  { kind: 'tvunit', name: 'TV and unit', category: 'Living', width: 1.6, depth: 0.45, height: 1.25, finishes: WOODS },
  { kind: 'bookcase', name: 'Bookcase', category: 'Living', width: 1.0, depth: 0.32, height: 2.0, finishes: WOODS },
  { kind: 'lamp', name: 'Floor lamp', category: 'Living', width: 0.4, depth: 0.4, height: 1.6 },
  { kind: 'rug', name: 'Rug', category: 'Living', width: 2.4, depth: 1.7, height: 0.01, finishes: ['red', 'blue', 'grey', 'cream'], flat: true },

  { kind: 'dining6', name: 'Dining table, 6 chairs', category: 'Dining', width: 1.8, depth: 1.9, height: 0.75, finishes: WOODS },
  { kind: 'dininground', name: 'Round table, 4 chairs', category: 'Dining', width: 1.9, depth: 1.9, height: 0.75, finishes: WOODS },
  { kind: 'chair', name: 'Chair', category: 'Dining', width: 0.45, depth: 0.5, height: 0.9, finishes: WOODS },
  { kind: 'sideboard', name: 'Sideboard', category: 'Dining', width: 1.6, depth: 0.45, height: 0.8, finishes: WOODS },

  { kind: 'double', name: 'Double bed', category: 'Bedroom', width: 1.5, depth: 2.1, height: 1.0, finishes: WOODS },
  { kind: 'single', name: 'Single bed', category: 'Bedroom', width: 0.95, depth: 2.05, height: 0.9, finishes: WOODS },
  { kind: 'bedside', name: 'Bedside table', category: 'Bedroom', width: 0.45, depth: 0.4, height: 0.55, finishes: WOODS },
  { kind: 'wardrobe', name: 'Wardrobe', category: 'Bedroom', width: 1.0, depth: 0.6, height: 2.1, finishes: WOODS },
  { kind: 'chest', name: 'Chest of drawers', category: 'Bedroom', width: 0.9, depth: 0.48, height: 0.9, finishes: WOODS },
  { kind: 'desk', name: 'Desk and chair', category: 'Bedroom', width: 1.2, depth: 1.1, height: 0.75, finishes: WOODS },

  { kind: 'base', name: 'Base unit', category: 'Kitchen', width: 0.6, depth: 0.6, height: 0.9, finishes: ['white', 'sage', 'navy', 'oak'] },
  { kind: 'sink', name: 'Sink unit', category: 'Kitchen', width: 1.0, depth: 0.6, height: 0.9, finishes: ['white', 'sage', 'navy', 'oak'] },
  { kind: 'hob', name: 'Hob and oven', category: 'Kitchen', width: 0.6, depth: 0.6, height: 0.9, finishes: ['white', 'sage', 'navy', 'oak'] },
  { kind: 'tall', name: 'Tall unit', category: 'Kitchen', width: 0.6, depth: 0.6, height: 2.2, finishes: ['white', 'sage', 'navy', 'oak'] },
  { kind: 'fridge', name: 'Fridge freezer', category: 'Kitchen', width: 0.7, depth: 0.7, height: 1.85 },
  { kind: 'island', name: 'Island', category: 'Kitchen', width: 1.8, depth: 0.9, height: 0.9, finishes: ['white', 'sage', 'navy', 'oak'] },

  { kind: 'bath', name: 'Bath', category: 'Bathroom', width: 1.7, depth: 0.75, height: 0.58 },
  { kind: 'shower', name: 'Shower', category: 'Bathroom', width: 0.9, depth: 0.9, height: 2.0 },
  { kind: 'wc', name: 'WC', category: 'Bathroom', width: 0.4, depth: 0.68, height: 0.8 },
  { kind: 'basin', name: 'Basin', category: 'Bathroom', width: 0.6, depth: 0.45, height: 0.85 },

  { kind: 'gardenset', name: 'Garden table, 4 chairs', category: 'Garden', width: 1.8, depth: 1.8, height: 0.72, finishes: ['teak', 'grey', 'white'] },
  { kind: 'lounger', name: 'Sun lounger', category: 'Garden', width: 0.7, depth: 1.95, height: 0.8, finishes: ['teak', 'grey', 'white'] },
  { kind: 'bench', name: 'Garden bench', category: 'Garden', width: 1.5, depth: 0.6, height: 0.85, finishes: ['teak', 'grey', 'white'] },
  { kind: 'parasol', name: 'Parasol', category: 'Garden', width: 2.7, depth: 2.7, height: 2.5, finishes: ['cream', 'green', 'blue'] },
  { kind: 'bbq', name: 'Barbecue', category: 'Garden', width: 1.2, depth: 0.55, height: 1.1 },
  { kind: 'planter', name: 'Planter', category: 'Garden', width: 0.6, depth: 0.6, height: 1.1 },
];

export function catalogueItem(kind: string): CatalogueItem | undefined {
  return CATALOGUE.find((c) => c.kind === kind);
}

/** Grand piano sizes (case length, and approximate width) for Blüthner's models. */
export const GRAND_MODELS: { name: string; width: number; depth: number }[] = [
  { name: 'Blüthner Model 11 (154 cm)', width: 1.47, depth: 1.54 },
  { name: 'Blüthner Model 10 (166 cm)', width: 1.47, depth: 1.66 },
  { name: 'Blüthner Model 6 (191 cm)', width: 1.5, depth: 1.91 },
  { name: 'Blüthner Model 4 (210 cm)', width: 1.55, depth: 2.1 },
  { name: 'Blüthner Model 2 (232 cm)', width: 1.55, depth: 2.32 },
  { name: 'Blüthner Model 1 (280 cm)', width: 1.58, depth: 2.8 },
];

export function addFurniture(level: Level, kind: string, at: Vec2, angle = 0): Furniture {
  const c = catalogueItem(kind)!;
  const id = `f${level.nextId++}`;
  const f: Furniture = { id, kind, x: at.x, y: at.y, angle, width: c.width, depth: c.depth, height: c.height };
  if (c.finishes) f.finish = c.finishes[0];
  if (kind === 'grand') {
    f.open = true;
    f.stool = true;
  }
  level.furniture ??= {};
  level.furniture[id] = f;
  return f;
}

const rotate = (p: Vec2, a: number): Vec2 => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});

/** Plan point of a point given in the piece's own frame. */
export function toPlan(f: Furniture, p: Vec2): Vec2 {
  return add({ x: f.x, y: f.y }, rotate(p, f.angle));
}

/** The piece's footprint rectangle, in plan coordinates. */
export function footprint(f: Furniture): Vec2[] {
  const w = f.width / 2;
  const d = f.depth / 2;
  return [
    { x: -w, y: -d },
    { x: w, y: -d },
    { x: w, y: d },
    { x: -w, y: d },
  ].map((p) => toPlan(f, p));
}

/** The piece at p (the smallest, if several overlap, so a rug doesn't hide the table on it). */
export function furnitureAt(level: Level, p: Vec2): string | undefined {
  const hits = Object.values(level.furniture ?? {}).filter((f) => pointInPolygon(p, footprint(f)));
  hits.sort((a, b) => a.width * a.depth - b.width * b.depth);
  return hits[0]?.id;
}

/** What a piece stands on: the floor, or the top of a patio or deck under its centre. */
export function standingHeight(level: Level, f: { x: number; y: number }): number {
  const id = patioAt(level, f);
  return id ? level.patios![id].height : 0;
}

/**
 * Where a piece of this depth goes if pushed back against the nearest wall face to p (within
 * reach): the centre, and the angle that turns its back to the wall. Null if no wall is near.
 */
export function againstWall(
  fps: Iterable<Footprint>,
  p: Vec2,
  depth: number,
  reach = 0.45,
): { at: Vec2; angle: number } | null {
  let best: { at: Vec2; angle: number; d: number } | null = null;
  for (const fp of fps) {
    const dir = fp.dir;
    const rel = sub(p, fp.a);
    const u = rel.x * dir.x + rel.y * dir.y;
    if (u < 0 || u > fp.length) continue;
    const v = rel.x * fp.n.x + rel.y * fp.n.y;
    const side = v >= 0 ? 1 : -1;
    // Distance from the wall face to where the piece's back would be if centred at p.
    const gap = Math.abs(v) - fp.thickness / 2 - depth / 2;
    if (gap < -depth / 2 || gap > reach) continue;
    if (best && Math.abs(gap) >= best.d) continue;
    const n = scale(fp.n, side);
    const face = add(add(fp.a, scale(dir, u)), scale(n, fp.thickness / 2));
    best = { at: add(face, scale(n, depth / 2)), angle: Math.atan2(-n.x, n.y), d: Math.abs(gap) };
  }
  return best && { at: best.at, angle: best.angle };
}

// ---------------------------------------------------------------- the grand piano's shape

function cubic(a: Vec2, b: Vec2, c: Vec2, d: Vec2, n: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const s = 1 - t;
    out.push({
      x: s * s * s * a.x + 3 * s * s * t * b.x + 3 * s * t * t * c.x + t * t * t * d.x,
      y: s * s * s * a.y + 3 * s * s * t * b.y + 3 * s * t * t * c.y + t * t * t * d.y,
    });
  }
  return out;
}

/**
 * A grand piano's case, seen from above, in its own frame: the keyboard along the front
 * (+y), the long straight bass side on the left (-x, as the pianist sits), and on the
 * treble side the curved "bentside" sweeping in to the rounded tail.
 */
export function grandOutline(w: number, d: number): Vec2[] {
  const P = (fx: number, fy: number) => ({ x: fx * w, y: d / 2 - fy * d });
  const pts: Vec2[] = [P(-0.5, 0), P(0.5, 0), P(0.5, 0.22)];
  pts.push(...cubic(P(0.5, 0.22), P(0.5, 0.47), P(0.1, 0.56), P(0.0, 0.8), 20));
  pts.push(...cubic(P(0.0, 0.8), P(-0.06, 0.93), P(-0.22, 1.0), P(-0.36, 1.0), 12));
  pts.push(...cubic(P(-0.36, 1.0), P(-0.45, 1.0), P(-0.5, 0.98), P(-0.5, 0.92), 6));
  return pts;
}
