// Free-standing pillars (posts), e.g. holding up a veranda, porch or carport roof.
// A pillar has no height of its own: it rises to the underside of the roof above it.

import { dist, normalize, polygonArea, sub, type Vec2 } from './geom';
import { outsetLoop, roofHeightAt } from './roof';
import { DEFAULTS, type Building, type Level, type Pillar } from './types';

/** Longest span between pillars along an open edge before another is added. */
const MAX_SPAN = 3.5;

export function addPillar(level: Level, p: Vec2, size = DEFAULTS.pillar, shape: Pillar['shape'] = 'square'): Pillar {
  const pillar: Pillar = { id: `p${level.nextId++}`, x: p.x, y: p.y, size, shape };
  level.pillars ??= {};
  level.pillars[pillar.id] = pillar;
  return pillar;
}

/** How tall a pillar is: up to the roof over it, else the floor's wall height. */
export function pillarHeight(b: Building, level: Level, pillar: Pillar): number {
  return roofHeightAt(b, level, pillar) ?? level.height;
}

export function pillarAt(level: Level, p: Vec2, tol = 0): string | null {
  for (const q of Object.values(level.pillars ?? {})) {
    const r = q.size / 2 + tol;
    const inside = q.shape === 'round' ? dist(p, q) <= r : Math.abs(p.x - q.x) <= r && Math.abs(p.y - q.y) <= r;
    if (inside) return q.id;
  }
  return null;
}

/**
 * Pillars to hold up a roof section: at each corner where it isn't resting on a wall, and
 * along open edges so no span is longer than MAX_SPAN. Pillars sit just inside the section
 * outline so their outer faces line up with it.
 */
export function pillarsForSection(level: Level, sectionId: string, size = DEFAULTS.pillar): Vec2[] {
  const section = level.roofSections?.[sectionId];
  if (!section || section.points.length < 3) return [];
  let pts = section.points.map((p) => ({ x: p.x, y: p.y }));
  if (polygonArea(pts) < 0) pts = pts.reverse();
  const n = pts.length;
  const onWall = pts.map((a, i) => edgeOnWall(level, a, pts[(i + 1) % n]));
  const inner = outsetLoop(pts, pts.map(() => -size / 2));
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    if (!onWall[prev] && !onWall[i]) out.push(inner[i]);
    if (!onWall[i]) {
      // Intermediate pillars along this open edge.
      const a = inner[i];
      const c = inner[(i + 1) % n];
      const spans = Math.ceil(dist(a, c) / MAX_SPAN);
      for (let k = 1; k < spans; k++) out.push({ x: a.x + ((c.x - a.x) * k) / spans, y: a.y + ((c.y - a.y) * k) / spans });
    }
  }
  // Skip any that would land where a pillar already is, or inside the building.
  const existing = Object.values(level.pillars ?? {});
  return out.filter((p) => !existing.some((q) => dist(p, q) < size) && !insideWalls(level, p));
}

/** True if the line a-b lies along (the centre line of) one of the level's walls. */
function edgeOnWall(level: Level, a: Vec2, b: Vec2): boolean {
  const d = normalize(sub(b, a));
  return Object.values(level.walls).some((w) => {
    const pa = level.nodes[w.a];
    const pb = level.nodes[w.b];
    const e = normalize(sub(pb, pa));
    const along = (p: Vec2) => (p.x - a.x) * d.x + (p.y - a.y) * d.y;
    const off = (p: Vec2) => Math.abs((p.x - a.x) * d.y - (p.y - a.y) * d.x);
    if (Math.abs(d.x * e.y - d.y * e.x) > 1e-3 || off(pa) > 1e-3 || off(pb) > 1e-3) return false;
    const u0 = Math.min(along(pa), along(pb));
    const u1 = Math.max(along(pa), along(pb));
    return Math.min(u1, dist(a, b)) - Math.max(u0, 0) > dist(a, b) * 0.5;
  });
}

function insideWalls(level: Level, p: Vec2): boolean {
  return Object.values(level.walls).some((w) => {
    const pa = level.nodes[w.a];
    const pb = level.nodes[w.b];
    const L = dist(pa, pb);
    if (L < 1e-9) return false;
    const t = ((p.x - pa.x) * (pb.x - pa.x) + (p.y - pa.y) * (pb.y - pa.y)) / (L * L);
    if (t < 0 || t > 1) return false;
    const q = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
    return dist(p, q) < w.thickness / 2;
  });
}

