// A vineyard: a block of vines in straight rows on a trellis (vertical shoot positioning:
// a trunk up to the fruiting wire, the cordon along it, and the shoots trained up between
// wires above into a narrow wall of leaves). Placed like a piece of garden furniture:
// its width is across the rows, its depth along them, and its "height" the top of the
// trellis. Rows run along the piece's y; everything here is in the piece's own frame.

import type { Vec2 } from './geom';
import type { Furniture } from './types';

export const isVineyard = (f: Furniture) => f.kind === 'vineyard';

export const ROW_GAP = 1.0;
export const VINE_GAP = 1.0;
/** Thickness of the wall of leaves along a row. */
export const CANOPY = 0.4;
/** Intermediate posts no more than this far apart along a row. */
export const POST_GAP = 6;

export const rowGap = (f: Furniture) => f.rowGap ?? ROW_GAP;
export const vineGap = (f: Furniture) => f.vineGap ?? VINE_GAP;

/** Across-row positions of the rows: as many as fit, half a gap in from each side. */
export function vineRows(f: Furniture): number[] {
  const g = rowGap(f);
  const n = Math.max(1, Math.floor(f.width / g + 1e-6));
  const x0 = -((n - 1) * g) / 2;
  return Array.from({ length: n }, (_, i) => x0 + i * g);
}

/** Along-row positions of the vines in each row. */
export function vinesAlong(f: Furniture): number[] {
  const g = vineGap(f);
  const n = Math.max(1, Math.floor(f.depth / g + 1e-6));
  const y0 = -((n - 1) * g) / 2;
  return Array.from({ length: n }, (_, i) => y0 + i * g);
}

/** Along-row positions of the posts: strainer posts at the ends, others between. */
export function vinePosts(f: Furniture): number[] {
  const n = Math.max(1, Math.ceil(f.depth / POST_GAP));
  return Array.from({ length: n + 1 }, (_, i) => -f.depth / 2 + (f.depth * i) / n);
}

/** Height of the fruiting wire (the cordon): about 40% of the trellis, 0.4 to 0.9 m. */
export const cordonHeight = (f: Furniture) => Math.min(0.9, Math.max(0.4, f.height * 0.4));

export function vineCount(f: Furniture): { rows: number; perRow: number; vines: number; rowLength: number } {
  const rows = vineRows(f).length;
  const perRow = vinesAlong(f).length;
  return { rows, perRow, vines: rows * perRow, rowLength: rows * f.depth };
}

/** What stops you walking: each row, as an outline on the plan, to the top of the trellis. */
export function vineBarriers(f: Furniture): Vec2[][] {
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  const at = (x: number, y: number): Vec2 => ({ x: f.x + x * c - y * s, y: f.y + x * s + y * c });
  const h = CANOPY / 2;
  const d = f.depth / 2;
  return vineRows(f).map((x) => [at(x - h, -d), at(x + h, -d), at(x + h, d), at(x - h, d)]);
}
