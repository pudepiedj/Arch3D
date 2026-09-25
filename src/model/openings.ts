// Doors and windows live on a wall as an interval [offset - width/2, offset + width/2].
// They may only occupy the part of the wall where both faces are straight (between the
// mitred corners), and never overlap each other. Every edit re-clamps them, which is what
// keeps openings valid when walls are shortened, split, merged or re-joined.

import { computeFootprints, type Footprint } from './joints';
import { DEFAULTS, type Opening, type OpeningKind, type Plan } from './types';

/** Minimum solid wall kept between openings, and between an opening and a corner. */
export const OPENING_GAP = 0.05;
export const MIN_OPENING_WIDTH = 0.3;
const MIN_OPENING_HEIGHT = 0.2;

export function openingsOf(plan: Plan, wallId: string): Opening[] {
  return Object.values(plan.openings)
    .filter((o) => o.wallId === wallId)
    .sort((p, q) => p.offset - q.offset);
}

/**
 * The free stretch of wall around `u`, ignoring opening `excludeId`.
 * Returns null if `u` falls inside another opening or outside the usable part of the wall.
 */
export function freeInterval(
  plan: Plan,
  fp: Footprint,
  u: number,
  excludeId?: string,
): [number, number] | null {
  let lo = fp.uMin + OPENING_GAP;
  let hi = fp.uMax - OPENING_GAP;
  if (u < lo || u > hi) return null;
  for (const o of openingsOf(plan, fp.wallId)) {
    if (o.id === excludeId) continue;
    const s = o.offset - o.width / 2 - OPENING_GAP;
    const e = o.offset + o.width / 2 + OPENING_GAP;
    if (u >= s && u <= e) return null;
    if (e <= u) lo = Math.max(lo, e);
    if (s >= u) hi = Math.min(hi, s);
  }
  return hi > lo ? [lo, hi] : null;
}

export function placeOpening(
  plan: Plan,
  wallId: string,
  u: number,
  kind: OpeningKind,
  fps: Map<string, Footprint> = computeFootprints(plan),
): Opening | null {
  const fp = fps.get(wallId);
  const wall = plan.walls[wallId];
  if (!fp || !wall) return null;
  // Use the free gap nearest to u, so clicking near a corner still places the opening.
  let iv: [number, number] | null = null;
  let bestD = Infinity;
  for (const g of freeGaps(plan, fp)) {
    if (g[1] - g[0] < MIN_OPENING_WIDTH) continue;
    const d = u < g[0] ? g[0] - u : u > g[1] ? u - g[1] : 0;
    if (d < bestD) {
      bestD = d;
      iv = g;
    }
  }
  if (!iv || bestD > 0.5) return null;
  const d = DEFAULTS[kind];
  const width = Math.min(d.width, iv[1] - iv[0]);
  const sill = Math.min(d.sill, Math.max(0, wall.height - MIN_OPENING_HEIGHT));
  const o: Opening = {
    id: `o${plan.nextId++}`,
    wallId,
    kind,
    offset: clamp(u, iv[0] + width / 2, iv[1] - width / 2),
    width,
    height: Math.min(d.height, wall.height - sill),
    sill,
  };
  plan.openings[o.id] = o;
  return o;
}

/**
 * Slide an opening to position `u` on wall `wallId` (possibly a different wall).
 * It stops against neighbouring openings and corners. Returns false if it cannot fit there.
 */
export function moveOpening(
  plan: Plan,
  id: string,
  wallId: string,
  u: number,
  fps: Map<string, Footprint> = computeFootprints(plan),
): boolean {
  const o = plan.openings[id];
  const fp = fps.get(wallId);
  if (!o || !fp) return false;
  // Find the free gap nearest to u that the opening fits in.
  const gaps = freeGaps(plan, fp, id).filter(([lo, hi]) => hi - lo >= o.width);
  if (gaps.length === 0) return false;
  let best = gaps[0];
  let bestD = Infinity;
  for (const g of gaps) {
    const c = clamp(u, g[0] + o.width / 2, g[1] - o.width / 2);
    const d = Math.abs(c - u);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  if (wallId !== o.wallId) {
    o.wallId = wallId;
    const wall = plan.walls[wallId];
    o.height = Math.min(o.height, wall.height - o.sill);
  }
  o.offset = clamp(u, best[0] + o.width / 2, best[1] - o.width / 2);
  return true;
}

/** All free stretches on a wall, ignoring opening `excludeId`. */
export function freeGaps(plan: Plan, fp: Footprint, excludeId?: string): [number, number][] {
  const gaps: [number, number][] = [];
  let cursor = fp.uMin + OPENING_GAP;
  const end = fp.uMax - OPENING_GAP;
  for (const o of openingsOf(plan, fp.wallId)) {
    if (o.id === excludeId) continue;
    const s = o.offset - o.width / 2 - OPENING_GAP;
    if (s > cursor) gaps.push([cursor, Math.min(s, end)]);
    cursor = Math.max(cursor, o.offset + o.width / 2 + OPENING_GAP);
  }
  if (end > cursor) gaps.push([cursor, end]);
  return gaps.filter(([a, b]) => b > a);
}

/**
 * Make every opening valid again after an edit: inside its wall's straight section,
 * no overlaps, sensible heights. Openings that no longer fit are removed.
 */
export function clampOpenings(plan: Plan, fps: Map<string, Footprint> = computeFootprints(plan)) {
  const byWall = new Map<string, Opening[]>();
  for (const o of Object.values(plan.openings)) {
    if (!plan.walls[o.wallId] || !fps.has(o.wallId)) {
      delete plan.openings[o.id];
      continue;
    }
    const l = byWall.get(o.wallId);
    if (l) l.push(o);
    else byWall.set(o.wallId, [o]);
  }
  for (const [wallId, list] of byWall) {
    const fp = fps.get(wallId)!;
    const wall = plan.walls[wallId];
    list.sort((p, q) => p.offset - q.offset);
    const lo = fp.uMin + OPENING_GAP;
    const hi = fp.uMax - OPENING_GAP;
    const avail = hi - lo;

    for (const o of list) {
      o.sill = clamp(o.sill, 0, Math.max(0, wall.height - MIN_OPENING_HEIGHT));
      o.height = clamp(o.height, MIN_OPENING_HEIGHT, wall.height - o.sill);
      o.width = Math.max(o.width, MIN_OPENING_WIDTH);
      if (o.width > avail) o.width = avail;
    }
    // Drop openings (farthest from the start first) until the rest fit side by side.
    while (list.length) {
      const need = list.reduce((s, o) => s + o.width, 0) + OPENING_GAP * (list.length - 1);
      if (need <= avail + 1e-9 && list.every((o) => o.width >= MIN_OPENING_WIDTH)) break;
      const victim = list.pop()!;
      delete plan.openings[victim.id];
    }
    // Push right past predecessors, then left inside the wall end.
    let cursor = lo;
    for (const o of list) {
      o.offset = Math.max(o.offset, cursor + o.width / 2);
      cursor = o.offset + o.width / 2 + OPENING_GAP;
    }
    cursor = hi;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      o.offset = Math.min(o.offset, cursor - o.width / 2);
      cursor = o.offset - o.width / 2 - OPENING_GAP;
    }
  }
}

/** Re-express an opening for the same wall with its direction reversed. */
export function reverseOpening(o: Opening, wallLength: number) {
  o.offset = wallLength - o.offset;
  o.hingeFlip = !o.hingeFlip;
  o.swingFlip = !o.swingFlip;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
