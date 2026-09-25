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

/** The properties that make two openings "the same", independent of where they are. */
export interface OpeningTemplate {
  kind: OpeningKind;
  width: number;
  height: number;
  sill: number;
  hingeFlip?: boolean;
  swingFlip?: boolean;
}

export function templateOf(o: Opening): OpeningTemplate {
  return { kind: o.kind, width: o.width, height: o.height, sill: o.sill, hingeFlip: o.hingeFlip, swingFlip: o.swingFlip };
}

/**
 * Place a new opening on a wall near position `u`.
 * With a kind, it uses the default size, shrunk if necessary to fit.
 * With a template (copy/paste), it is placed at exactly that size or not at all.
 */
export function placeOpening(
  plan: Plan,
  wallId: string,
  u: number,
  what: OpeningKind | OpeningTemplate,
  fps: Map<string, Footprint> = computeFootprints(plan),
): Opening | null {
  const fp = fps.get(wallId);
  const wall = plan.walls[wallId];
  if (!fp || !wall) return null;
  const exact = typeof what !== 'string';
  const t: OpeningTemplate = exact ? what : { kind: what, ...DEFAULTS[what] };
  if (exact && t.sill + t.height > wall.height + 1e-9) return null;
  const minWidth = exact ? t.width : MIN_OPENING_WIDTH;
  // Use the free gap nearest to u, so clicking near a corner still places the opening.
  let iv: [number, number] | null = null;
  let bestD = Infinity;
  for (const g of freeGaps(plan, fp)) {
    if (g[1] - g[0] < minWidth - 1e-9) continue;
    const d = u < g[0] ? g[0] - u : u > g[1] ? u - g[1] : 0;
    if (d < bestD) {
      bestD = d;
      iv = g;
    }
  }
  if (!iv || bestD > 0.5) return null;
  const width = Math.min(t.width, iv[1] - iv[0]);
  const sill = Math.min(t.sill, Math.max(0, wall.height - MIN_OPENING_HEIGHT));
  const o: Opening = {
    id: `o${plan.nextId++}`,
    wallId,
    kind: t.kind,
    offset: clamp(u, iv[0] + width / 2, iv[1] - width / 2),
    width,
    height: Math.min(t.height, wall.height - sill),
    sill,
  };
  if (t.hingeFlip) o.hingeFlip = true;
  if (t.swingFlip) o.swingFlip = true;
  plan.openings[o.id] = o;
  return o;
}

/** Place an identical copy of an opening beside it on the same wall (after it if there is room, else before). */
export function duplicateOpening(
  plan: Plan,
  id: string,
  fps: Map<string, Footprint> = computeFootprints(plan),
): Opening | null {
  const o = plan.openings[id];
  if (!o) return null;
  const step = o.width + OPENING_GAP;
  for (const u of [o.offset + step, o.offset - step]) {
    const copy = placeOpening(plan, o.wallId, u, templateOf(o), fps);
    if (copy) return copy;
  }
  return null;
}

/**
 * Give an existing opening a template's type and size, keeping its centre where possible.
 * Returns false (and changes nothing) if it would not fit.
 */
export function matchOpening(
  plan: Plan,
  id: string,
  t: OpeningTemplate,
  fps: Map<string, Footprint> = computeFootprints(plan),
): boolean {
  const o = plan.openings[id];
  const fp = fps.get(o?.wallId ?? '');
  const wall = o && plan.walls[o.wallId];
  if (!o || !fp || !wall || t.sill + t.height > wall.height + 1e-9) return false;
  const gap = freeGaps(plan, fp, id).find(([a, b]) => o.offset >= a && o.offset <= b);
  if (!gap || gap[1] - gap[0] < t.width - 1e-9) return false;
  Object.assign(o, { kind: t.kind, width: t.width, height: t.height, sill: t.sill });
  o.hingeFlip = t.hingeFlip || undefined;
  o.swingFlip = t.swingFlip || undefined;
  o.offset = clamp(o.offset, gap[0] + t.width / 2, gap[1] - t.width / 2);
  return true;
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
