// A porch: a small single-storey brick (or rendered) room built onto the front of the
// house, with a gabled roof whose gable faces out. Placed like furniture, back against the
// house wall: width across the front, depth out from the wall, height to the eaves.

import { type Vec2, projectOnSegment } from './geom';
import type { Furniture, Plan } from './types';

export const isPorch = (f: Furniture) => f.kind === 'porch';

/** Wall thickness (a cavity wall). */
export const PORCH_WALL = 0.25;
/** The roof's overhang at the front and sides. */
export const PORCH_OVERHANG = 0.2;
export const PORCH_PITCH = 40;

/** The doorway in the front wall: its width and height. */
export function porchDoor(f: Furniture): { width: number; height: number } {
  return { width: Math.max(0.6, Math.min(1.0, f.width - 2 * PORCH_WALL - 0.3)), height: Math.min(2.1, f.height - 0.15) };
}

/**
 * The walls as boxes in the piece's frame (x across, y out from the house to the front at
 * +y): the two sides, and the front either side of the doorway. Each is { x0, x1, y0, y1 }.
 */
export function porchWalls(f: Furniture): { x0: number; x1: number; y0: number; y1: number }[] {
  const w = f.width / 2;
  const d = f.depth / 2;
  const t = PORCH_WALL;
  const door = porchDoor(f).width / 2;
  const sides = [
    { x0: -w, x1: -w + t, y0: -d, y1: d },
    { x0: w - t, x1: w, y0: -d, y1: d },
  ];
  // Open-fronted: just the sides, the gable carried on a beam across the front.
  if (f.openFront) return sides;
  return [...sides, { x0: -w + t, x1: -door, y0: d - t, y1: d }, { x0: door, x1: w - t, y0: d - t, y1: d }];
}

/**
 * Where a front door into the house goes, behind the porch: the wall of the floor its back
 * stands against, and how far along that wall (from its first end) the middle of the porch is.
 */
export function wallBehindPorch(level: Plan, f: Furniture): { wallId: string; u: number } | null {
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  const back = { x: f.x + (f.depth / 2) * s, y: f.y - (f.depth / 2) * c };
  let best: { wallId: string; u: number; gap: number } | null = null;
  for (const w of Object.values(level.walls)) {
    const a = level.nodes[w.a];
    const b = level.nodes[w.b];
    if (!a || !b) continue;
    const pr = projectOnSegment(back, a, b);
    const gap = pr.dist - w.thickness / 2;
    if (gap < 0.2 && (!best || gap < best.gap)) best = { wallId: w.id, u: pr.t * Math.hypot(b.x - a.x, b.y - a.y), gap };
  }
  return best && { wallId: best.wallId, u: best.u };
}

/** What stops you walking, on the plan: the walls, and the door when it is shut. */
export function porchBarriers(f: Furniture): Vec2[][] {
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  const at = (x: number, y: number): Vec2 => ({ x: f.x + x * c - y * s, y: f.y + x * s + y * c });
  const boxes = porchWalls(f);
  if (!f.open && !f.openFront) {
    const door = porchDoor(f).width / 2;
    boxes.push({ x0: -door, x1: door, y0: f.depth / 2 - PORCH_WALL / 2 - 0.03, y1: f.depth / 2 - PORCH_WALL / 2 + 0.03 });
  }
  return boxes.map((b) => [at(b.x0, b.y0), at(b.x1, b.y0), at(b.x1, b.y1), at(b.x0, b.y1)]);
}
