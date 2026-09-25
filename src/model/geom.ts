// Small 2D vector toolkit. Plan coordinates are metres; x to the right, y down the screen.

export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
/** Rotate +90 degrees (counter-clockwise in maths orientation). */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/**
 * Intersection of the infinite lines p + d*t and q + e*s.
 * Returns null when the lines are (nearly) parallel.
 */
export function lineIntersect(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(q, p), e) / den;
  return add(p, scale(d, t));
}

export interface SegmentHit {
  /** Parameter along a->b in [0,1]. */
  t: number;
  /** Parameter along c->d in [0,1]. */
  s: number;
  point: Vec2;
}

/** Intersection of segments a-b and c-d, or null if they do not meet (or are parallel). */
export function segmentIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): SegmentHit | null {
  const r = sub(b, a);
  const q = sub(d, c);
  const den = cross(r, q);
  if (Math.abs(den) < 1e-12) return null;
  const ac = sub(c, a);
  const t = cross(ac, q) / den;
  const s = cross(ac, r) / den;
  if (t < 0 || t > 1 || s < 0 || s > 1) return null;
  return { t, s, point: add(a, scale(r, t)) };
}

export interface Projection {
  /** Parameter along a->b, clamped to [0,1]. */
  t: number;
  point: Vec2;
  dist: number;
}

export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): Projection {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 < 1e-18 ? 0 : dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = add(a, scale(ab, t));
  return { t, point, dist: dist(p, point) };
}

/** Signed area (positive for counter-clockwise in maths orientation). */
export function polygonArea(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polygonCentroid(pts: Vec2[]): Vec2 {
  const area = polygonArea(pts);
  if (Math.abs(area) < 1e-9) {
    const c = pts.reduce((acc, p) => add(acc, p), vec(0, 0));
    return scale(c, 1 / Math.max(1, pts.length));
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return vec(cx / (6 * area), cy / (6 * area));
}

export function pointInPolygon(p: Vec2, pts: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
