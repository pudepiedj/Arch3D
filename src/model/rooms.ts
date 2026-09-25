// Room detection: rooms are the bounded faces of the planar wall graph.
// Walk each directed wall edge, always taking the sharpest turn, and collect the loops.

import { Vec2, add, lineIntersect, normalize, perp, polygonArea, polygonCentroid, scale, sub } from './geom';
import type { Plan } from './types';

export interface Room {
  /** Stable-ish key: sorted node ids of the loop. */
  key: string;
  nodeIds: string[];
  /** Loop through the wall centre lines (used for the floor slab, which runs under the walls). */
  polygon: Vec2[];
  /** Area inside the wall centre lines. */
  area: number;
  /** Loop along the inside faces of the walls. */
  inner: Vec2[];
  /** Net floor area, measured to the inside faces of the walls. */
  netArea: number;
  centroid: Vec2;
}

export function detectRooms(plan: Plan): Room[] {
  // Adjacency, with dangling walls (dead ends) pruned since they cannot bound a room.
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  const thickness = new Map<string, number>();
  for (const w of Object.values(plan.walls)) {
    link(w.a, w.b);
    link(w.b, w.a);
    thickness.set(`${w.a}|${w.b}`, w.thickness);
    thickness.set(`${w.b}|${w.a}`, w.thickness);
  }
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [n, set] of adj) {
      if (set.size <= 1) {
        for (const m of set) adj.get(m)?.delete(n);
        adj.delete(n);
        pruned = true;
      }
    }
  }

  // Outgoing edges at each node sorted by angle.
  const sorted = new Map<string, string[]>();
  for (const [n, set] of adj) {
    const p = plan.nodes[n];
    sorted.set(
      n,
      [...set].sort((u, v) => angle(p, plan.nodes[u]) - angle(p, plan.nodes[v])),
    );
  }

  const visited = new Set<string>();
  const rooms: Room[] = [];
  for (const [start, outs] of sorted) {
    for (const first of outs) {
      if (visited.has(`${start}>${first}`)) continue;
      const loop: string[] = [];
      let u = start;
      let v = first;
      let guard = 0;
      while (!visited.has(`${u}>${v}`) && guard++ < 10000) {
        visited.add(`${u}>${v}`);
        loop.push(u);
        // At v, take the outgoing edge just clockwise of the way back to u.
        const list = sorted.get(v)!;
        const i = list.indexOf(u);
        const next = list[(i - 1 + list.length) % list.length];
        u = v;
        v = next;
      }
      const polygon = loop.map((id) => ({ x: plan.nodes[id].x, y: plan.nodes[id].y }));
      const area = polygonArea(polygon);
      // Interior faces are counter-clockwise (positive); the outer face is negative.
      if (area > 0.05) {
        const halves = loop.map((id, i) => (thickness.get(`${id}|${loop[(i + 1) % loop.length]}`) ?? 0) / 2);
        const inner = insetLoop(polygon, halves);
        rooms.push({
          key: [...loop].sort().join(','),
          nodeIds: loop,
          polygon,
          area,
          inner,
          netArea: Math.max(0, polygonArea(inner)),
          centroid: polygonCentroid(inner),
        });
      }
    }
  }
  return rooms;
}

function angle(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Offset each edge of a counter-clockwise loop inwards by its own distance and
 * intersect neighbouring edges, giving the loop along the inside faces of the walls.
 */
function insetLoop(pts: Vec2[], offsets: number[]): Vec2[] {
  const k = pts.length;
  const out: Vec2[] = [];
  for (let i = 0; i < k; i++) {
    const prev = (i - 1 + k) % k;
    const dPrev = normalize(sub(pts[i], pts[prev]));
    const dCur = normalize(sub(pts[(i + 1) % k], pts[i]));
    const pPrev = add(pts[prev], scale(perp(dPrev), offsets[prev]));
    const pCur = add(pts[i], scale(perp(dCur), offsets[i]));
    out.push(lineIntersect(pPrev, dPrev, pCur, dCur) ?? pCur);
  }
  return out;
}

/**
 * Walls on the outside of the building: those with a room on one side only.
 * (Interior walls have rooms on both sides; free-standing walls have none.)
 */
export function outlineWallIds(plan: Plan, rooms: Room[] = detectRooms(plan)): string[] {
  const sides = new Map<string, number>();
  for (const r of rooms) {
    r.nodeIds.forEach((id, i) => {
      const next = r.nodeIds[(i + 1) % r.nodeIds.length];
      const key = id < next ? `${id}|${next}` : `${next}|${id}`;
      sides.set(key, (sides.get(key) ?? 0) + 1);
    });
  }
  return Object.values(plan.walls)
    .filter((w) => sides.get(w.a < w.b ? `${w.a}|${w.b}` : `${w.b}|${w.a}`) === 1)
    .map((w) => w.id);
}
