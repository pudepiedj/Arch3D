// Stretching: move everything inside a box by the same amount, as CAD programs do. Joints
// inside the box move, so walls wholly inside it move with them and walls crossing its edge
// get longer or shorter; doors and windows, furniture, stairs, pillars, roof items, trees,
// patio and roof-section corners inside it move too. So "this part of the house is 1 m too
// long" is one drag through the middle of it.

import type { Vec2 } from './geom';
import { normalize, planarize } from './plan';
import type { Building, Level } from './types';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A box from two corners in any order. */
export function boxFrom(a: Vec2, b: Vec2): Box {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

export function inBox(box: Box, p: Vec2): boolean {
  return p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;
}

/** Stretch every floor (or just the given one) by d, moving what lies inside the box. */
export function stretch(b: Building, box: Box, d: Vec2, onlyLevel?: string) {
  for (const level of b.levels) if (!onlyLevel || level.id === onlyLevel) stretchLevel(level, box, d);
  // The drains belong to the ground: they move with the ground floor.
  if (!onlyLevel || onlyLevel === b.levels[0]?.id) {
    for (const n of Object.values(b.drains?.nodes ?? {})) {
      if (inBox(box, n)) {
        n.x += d.x;
        n.y += d.y;
      }
    }
  }
}

export function stretchLevel(level: Level, box: Box, d: Vec2) {
  if (Math.abs(d.x) < 1e-9 && Math.abs(d.y) < 1e-9) return;
  const inside = (p: Vec2) => inBox(box, p);
  const move = (p: { x: number; y: number }) => {
    if (inside(p)) {
      p.x += d.x;
      p.y += d.y;
    }
  };

  // Where each door and window is, before anything moves: it keeps that place (or moves
  // with the box if it is inside it) whatever happens to the ends of its wall.
  const openingsAt = new Map<string, Vec2>();
  for (const o of Object.values(level.openings)) {
    const w = level.walls[o.wallId];
    const a = w && level.nodes[w.a];
    const c = w && level.nodes[w.b];
    if (!a || !c) continue;
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const p = { x: a.x + ((c.x - a.x) / len) * o.offset, y: a.y + ((c.y - a.y) / len) * o.offset };
    openingsAt.set(o.id, inside(p) ? { x: p.x + d.x, y: p.y + d.y } : p);
  }

  for (const n of Object.values(level.nodes)) move(n);

  for (const o of Object.values(level.openings)) {
    const p = openingsAt.get(o.id);
    const w = level.walls[o.wallId];
    if (!p || !w) continue;
    const a = level.nodes[w.a];
    const c = level.nodes[w.b];
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    o.offset = ((p.x - a.x) * (c.x - a.x) + (p.y - a.y) * (c.y - a.y)) / len;
  }

  // Everything placed by a point.
  for (const list of [level.stairs, level.pillars, level.chimneys, level.solar, level.rooflights, level.furniture, level.trees]) {
    for (const item of Object.values(list ?? {})) move(item);
  }
  // Outlines drawn corner by corner: each corner inside the box moves.
  for (const pt of Object.values(level.patios ?? {})) pt.points.forEach(move);
  for (const s of Object.values(level.roofSections ?? {})) {
    s.points.forEach(move);
    s.roof.edges?.forEach(move);
  }
  // Roof settings are found by a point: keep them with what they belong to.
  level.roof?.edges?.forEach(move);
  for (const area of level.roofAreas ?? []) {
    move(area);
    area.roof.edges?.forEach(move);
  }

  // Walls that now cross or meet are joined up, and doors and windows re-fitted.
  planarize(level);
  normalize(level);
}
