// A porch: a small single-storey brick (or rendered) room built onto the front of the
// house, with a gabled roof whose gable faces out. Placed like furniture, back against the
// house wall: width across the front, depth out from the wall, height to the eaves.

import type { Vec2 } from './geom';
import type { Furniture } from './types';

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
  return [
    { x0: -w, x1: -w + t, y0: -d, y1: d },
    { x0: w - t, x1: w, y0: -d, y1: d },
    { x0: -w + t, x1: -door, y0: d - t, y1: d },
    { x0: door, x1: w - t, y0: d - t, y1: d },
  ];
}

/** What stops you walking, on the plan: the walls, and the door when it is shut. */
export function porchBarriers(f: Furniture): Vec2[][] {
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  const at = (x: number, y: number): Vec2 => ({ x: f.x + x * c - y * s, y: f.y + x * s + y * c });
  const boxes = porchWalls(f);
  if (!f.open) {
    const door = porchDoor(f).width / 2;
    boxes.push({ x0: -door, x1: door, y0: f.depth / 2 - PORCH_WALL / 2 - 0.03, y1: f.depth / 2 - PORCH_WALL / 2 + 0.03 });
  }
  return boxes.map((b) => [at(b.x0, b.y0), at(b.x1, b.y0), at(b.x1, b.y1), at(b.x0, b.y1)]);
}
