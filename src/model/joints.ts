// Wall joint solver.
//
// For every node we sort its walls by angle and intersect the facing edge lines of each
// neighbouring pair. That gives a mitred corner for L-joints, clean T and X junctions,
// and handles walls of different thickness meeting at any angle. Each wall's footprint
// is then the polygon between its corner points at both ends (plus the node centre at
// junctions of 3+ walls, so the walls' polygons tile the junction without gaps).

import {
  Vec2,
  add,
  cross,
  dist,
  dot,
  lineIntersect,
  normalize,
  perp,
  scale,
  sub,
} from './geom';
import type { Plan, Wall } from './types';

export interface Footprint {
  wallId: string;
  a: Vec2;
  b: Vec2;
  /** Unit direction a -> b. */
  dir: Vec2;
  /** Unit normal pointing to the wall's left side (perp of dir). */
  n: Vec2;
  length: number;
  thickness: number;
  height: number;
  /** Corners: L on the +n side, R on the -n side; 0 at node a, 1 at node b. */
  L0: Vec2;
  R0: Vec2;
  L1: Vec2;
  R1: Vec2;
  /** Node centre inserted into the outline at a junction end, if needed. */
  capA: Vec2 | null;
  capB: Vec2 | null;
  /** Corner positions measured along the wall axis from node a. */
  uL0: number;
  uR0: number;
  uL1: number;
  uR1: number;
  /** Stretch of the wall where both faces are straight: openings must sit inside it. */
  uMin: number;
  uMax: number;
  degA: number;
  degB: number;
  /** Closed outline of the wall (L0, L1, [capB], R1, R0, [capA]). */
  polygon: Vec2[];
}

interface EndInfo {
  left: Vec2;
  right: Vec2;
  deg: number;
}

/** Longest a mitre may reach from its node, in multiples of the thicker wall. */
const MITRE_LIMIT = 4;

export function wallAxis(plan: Plan, w: Wall) {
  const a = plan.nodes[w.a];
  const b = plan.nodes[w.b];
  const d = sub(b, a);
  const length = Math.hypot(d.x, d.y);
  const dir = normalize(d);
  return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, dir, n: perp(dir), length };
}

export function incidentWalls(plan: Plan, nodeId: string): Wall[] {
  const out: Wall[] = [];
  for (const w of Object.values(plan.walls)) if (w.a === nodeId || w.b === nodeId) out.push(w);
  return out;
}

export function computeFootprints(plan: Plan): Map<string, Footprint> {
  // Per node: incident walls with their outgoing direction.
  const byNode = new Map<string, { wall: Wall; d: Vec2; angle: number }[]>();
  for (const w of Object.values(plan.walls)) {
    const { dir, length } = wallAxis(plan, w);
    if (length < 1e-9) continue;
    const back = scale(dir, -1);
    push(byNode, w.a, { wall: w, d: dir, angle: Math.atan2(dir.y, dir.x) });
    push(byNode, w.b, { wall: w, d: back, angle: Math.atan2(back.y, back.x) });
  }

  // Corner results keyed by `${wallId}:${nodeId}`, expressed relative to the outgoing direction.
  const ends = new Map<string, EndInfo>();
  for (const [nodeId, list] of byNode) {
    const node = plan.nodes[nodeId];
    list.sort((p, q) => p.angle - q.angle);
    const k = list.length;
    const lefts: Vec2[] = new Array(k);
    const rights: Vec2[] = new Array(k);
    if (k === 1) {
      const { wall, d } = list[0];
      const off = scale(perp(d), wall.thickness / 2);
      lefts[0] = add(node, off);
      rights[0] = sub(node, off);
    } else {
      for (let i = 0; i < k; i++) {
        const j = (i + 1) % k;
        const wi = list[i];
        const wj = list[j];
        // Left edge of wall i and right edge of wall j both face the sector between them.
        const p = add(node, scale(perp(wi.d), wi.wall.thickness / 2));
        const q = sub(node, scale(perp(wj.d), wj.wall.thickness / 2));
        const x = lineIntersect(p, wi.d, q, wj.d);
        const limit = MITRE_LIMIT * Math.max(wi.wall.thickness, wj.wall.thickness);
        if (x && dist(x, node) <= limit) {
          lefts[i] = x;
          rights[j] = x;
        } else {
          // Collinear or extremely acute: square the ends off instead.
          lefts[i] = p;
          rights[j] = q;
        }
      }
    }
    list.forEach((e, i) => ends.set(`${e.wall.id}:${nodeId}`, { left: lefts[i], right: rights[i], deg: k }));
  }

  const result = new Map<string, Footprint>();
  for (const w of Object.values(plan.walls)) {
    const ax = wallAxis(plan, w);
    if (ax.length < 1e-9) continue;
    const ea = ends.get(`${w.id}:${w.a}`)!;
    const eb = ends.get(`${w.id}:${w.b}`)!;
    // At node a the outgoing direction is the wall direction; at node b it is reversed,
    // so the outgoing "left" there is the wall's right side.
    const L0 = ea.left;
    const R0 = ea.right;
    const L1 = eb.right;
    const R1 = eb.left;
    const u = (p: Vec2) => dot(sub(p, ax.a), ax.dir);
    const uL0 = u(L0);
    const uR0 = u(R0);
    const uL1 = u(L1);
    const uR1 = u(R1);
    const capA = ea.deg >= 2 && !collinear(R0, ax.a, L0) ? ax.a : null;
    const capB = eb.deg >= 2 && !collinear(L1, ax.b, R1) ? ax.b : null;
    const polygon = [L0, L1];
    if (capB) polygon.push(capB);
    polygon.push(R1, R0);
    if (capA) polygon.push(capA);
    result.set(w.id, {
      wallId: w.id,
      a: ax.a,
      b: ax.b,
      dir: ax.dir,
      n: ax.n,
      length: ax.length,
      thickness: w.thickness,
      height: w.height,
      L0,
      R0,
      L1,
      R1,
      capA,
      capB,
      uL0,
      uR0,
      uL1,
      uR1,
      uMin: Math.max(uL0, uR0, 0),
      uMax: Math.min(uL1, uR1, ax.length),
      degA: ea.deg,
      degB: eb.deg,
      polygon,
    });
  }
  return result;
}

/** Point on a wall in its local frame: u along the axis from node a, v towards the left face. */
export function wallPoint(fp: Footprint, u: number, v: number): Vec2 {
  return add(add(fp.a, scale(fp.dir, u)), scale(fp.n, v));
}

function collinear(a: Vec2, b: Vec2, c: Vec2): boolean {
  return Math.abs(cross(sub(b, a), sub(c, a))) < 1e-8;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
}
