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

/** What a stretch with this box would move, counted over the floors it applies to. */
export function stretchSummary(b: Building, box: Box, onlyLevel?: string) {
  const c = { joints: 0, openings: 0, furniture: 0, other: 0, drains: 0 };
  for (const level of b.levels) {
    if (onlyLevel && level.id !== onlyLevel) continue;
    c.joints += Object.values(level.nodes).filter((n) => inBox(box, n)).length;
    for (const o of Object.values(level.openings)) {
      const w = level.walls[o.wallId];
      const a = w && level.nodes[w.a];
      const e = w && level.nodes[w.b];
      if (!a || !e) continue;
      const len = Math.hypot(e.x - a.x, e.y - a.y) || 1;
      if (inBox(box, { x: a.x + ((e.x - a.x) / len) * o.offset, y: a.y + ((e.y - a.y) / len) * o.offset })) c.openings++;
    }
    c.furniture += Object.values(level.furniture ?? {}).filter((f) => inBox(box, f)).length;
    for (const list of [level.stairs, level.pillars, level.chimneys, level.solar, level.rooflights, level.trees]) {
      c.other += Object.values(list ?? {}).filter((it) => inBox(box, it)).length;
    }
  }
  if (!onlyLevel || onlyLevel === b.levels[0]?.id) c.drains = Object.values(b.drains?.nodes ?? {}).filter((n) => inBox(box, n)).length;
  return c;
}

/**
 * What a stretch moved, so the same things can be moved again: things with an id by id, and
 * joints and outline corners by where they ended up. (Keys start with the floor's id.)
 */
export interface Picked {
  ids: Set<string>;
  points: Set<string>;
}

const at = (level: string, p: Vec2) => `${level}@${p.x.toFixed(5)},${p.y.toFixed(5)}`;

/**
 * Stretch every floor (or just the given one) by d, moving what lies inside the box, or, if
 * `picked` is given, exactly what an earlier stretch moved. Returns what this one moved.
 */
export function stretch(b: Building, box: Box, d: Vec2, onlyLevel?: string, picked?: Picked): Picked {
  const moved: Picked = { ids: new Set(), points: new Set() };
  for (const level of b.levels) if (!onlyLevel || level.id === onlyLevel) stretchLevel(level, box, d, picked, moved);
  // The drains belong to the ground: they move with the ground floor.
  if (!onlyLevel || onlyLevel === b.levels[0]?.id) {
    for (const n of Object.values(b.drains?.nodes ?? {})) {
      if (picked ? picked.ids.has(`drains:${n.id}`) : inBox(box, n)) {
        n.x += d.x;
        n.y += d.y;
        moved.ids.add(`drains:${n.id}`);
      }
    }
  }
  return moved;
}

export function stretchLevel(level: Level, box: Box, d: Vec2, picked?: Picked, moved?: Picked) {
  if (Math.abs(d.x) < 1e-9 && Math.abs(d.y) < 1e-9) return;
  const L = level.id;
  /** Does this move? A thing with an id is known by it; a point by where it is. */
  const inside = (p: Vec2, id?: string) =>
    picked ? (id ? picked.ids.has(`${L}:${id}`) : picked.points.has(at(L, p))) : inBox(box, p);
  const move = (p: { x: number; y: number; id?: string }) => {
    const id = typeof p.id === 'string' ? p.id : undefined;
    if (!inside(p, id)) return;
    p.x += d.x;
    p.y += d.y;
    if (id) moved?.ids.add(`${L}:${id}`);
    else moved?.points.add(at(L, p));
  };
  /** Joints and corners are remembered by position, even though (joints) they have ids. */
  const movePoint = (p: { x: number; y: number }) => {
    if (!inside({ x: p.x, y: p.y })) return;
    p.x += d.x;
    p.y += d.y;
    moved?.points.add(at(L, p));
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
    const goes = picked ? picked.ids.has(`${L}:${o.id}`) : inBox(box, p);
    if (goes) moved?.ids.add(`${L}:${o.id}`);
    openingsAt.set(o.id, goes ? { x: p.x + d.x, y: p.y + d.y } : p);
  }

  for (const n of Object.values(level.nodes)) movePoint(n);

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
  for (const pt of Object.values(level.patios ?? {})) pt.points.forEach(movePoint);
  for (const s of Object.values(level.roofSections ?? {})) {
    s.points.forEach(movePoint);
    s.roof.edges?.forEach(movePoint);
  }
  // Roof settings are found by a point: keep them with what they belong to.
  level.roof?.edges?.forEach(movePoint);
  for (const area of level.roofAreas ?? []) {
    movePoint(area);
    area.roof.edges?.forEach(movePoint);
  }

  // Walls that now cross or meet are joined up, and doors and windows re-fitted.
  planarize(level);
  normalize(level);
}
