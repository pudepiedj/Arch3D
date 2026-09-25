// Editing operations on the wall graph. Every public operation leaves the plan "clean":
//  - walls only meet at nodes (crossings and T-junctions are split automatically),
//  - no duplicate or zero-length walls, no orphan nodes,
//  - every opening sits inside its wall's straight section without overlapping others.

import { Vec2, cross, dist, dot, normalize as unit, projectOnSegment, segmentIntersect, sub } from './geom';
import { computeFootprints, incidentWalls, wallAxis } from './joints';
import { clampOpenings, openingsOf, reverseOpening } from './openings';
import type { Plan, PlanNode, Wall } from './types';

/** Geometric tolerance in metres: points closer than this are the same point. */
export const EPS = 1e-3;

export function createPlan(): Plan {
  return { version: 1, nodes: {}, walls: {}, openings: {}, nextId: 1 };
}

export function clonePlan(p: Plan): Plan {
  return JSON.parse(JSON.stringify(p));
}

export function newId(plan: Plan, prefix: string): string {
  return `${prefix}${plan.nextId++}`;
}

export function addNode(plan: Plan, p: Vec2): string {
  const id = newId(plan, 'n');
  plan.nodes[id] = { id, x: p.x, y: p.y };
  return id;
}

export function findNodeAt(plan: Plan, p: Vec2, tol = EPS, exclude?: string): string | null {
  let best: string | null = null;
  let bestD = tol;
  for (const n of Object.values(plan.nodes)) {
    if (n.id === exclude) continue;
    const d = dist(n, p);
    if (d <= bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

/** A wall whose interior (not its end nodes) passes within `tol` of p. */
export function findWallInterior(
  plan: Plan,
  p: Vec2,
  tol = EPS,
  excludeNode?: string,
): { wallId: string; point: Vec2; u: number } | null {
  let best: { wallId: string; point: Vec2; u: number } | null = null;
  let bestD = tol;
  for (const w of Object.values(plan.walls)) {
    if (excludeNode && (w.a === excludeNode || w.b === excludeNode)) continue;
    const a = plan.nodes[w.a];
    const b = plan.nodes[w.b];
    const L = dist(a, b);
    const pr = projectOnSegment(p, a, b);
    const u = pr.t * L;
    if (pr.dist <= bestD && u > EPS && L - u > EPS) {
      bestD = pr.dist;
      best = { wallId: w.id, point: pr.point, u };
    }
  }
  return best;
}

export function findWallBetween(plan: Plan, a: string, b: string): Wall | null {
  for (const w of Object.values(plan.walls)) {
    if ((w.a === a && w.b === b) || (w.a === b && w.b === a)) return w;
  }
  return null;
}

/** The node at p: an existing node, a new node splitting a wall, or a new free node. */
export function ensureNode(plan: Plan, p: Vec2): string {
  const existing = findNodeAt(plan, p);
  if (existing) return existing;
  const hit = findWallInterior(plan, p);
  const id = addNode(plan, hit ? hit.point : p);
  if (hit) splitWall(plan, hit.wallId, id);
  return id;
}

/**
 * Split a wall at a node lying on it. The first half keeps the wall's id; openings go to
 * whichever half holds their centre (and are re-clamped by `normalize`).
 */
export function splitWall(plan: Plan, wallId: string, nodeId: string): [string, string] {
  const w = plan.walls[wallId];
  const ax = wallAxis(plan, w);
  const s = dot(sub(plan.nodes[nodeId], ax.a), ax.dir);
  const w2: Wall = { ...w, id: newId(plan, 'w'), a: nodeId, b: w.b };
  w.b = nodeId;
  plan.walls[w2.id] = w2;
  for (const o of openingsOf(plan, wallId)) {
    if (o.offset > s) {
      o.wallId = w2.id;
      o.offset -= s;
    }
  }
  return [w.id, w2.id];
}

/** Split a wall at a point along it (distance u from its start); returns the new node id. */
export function splitWallAt(plan: Plan, wallId: string, u: number): string | null {
  const w = plan.walls[wallId];
  const ax = wallAxis(plan, w);
  if (u <= EPS || u >= ax.length - EPS) return null;
  const id = addNode(plan, { x: ax.a.x + ax.dir.x * u, y: ax.a.y + ax.dir.y * u });
  splitWall(plan, wallId, id);
  normalize(plan);
  return id;
}

export interface WallProps {
  thickness: number;
  height: number;
}

/**
 * Add a wall from p to q. Endpoints snap onto existing nodes or split existing walls,
 * and any walls it crosses are split so the plan stays a proper graph.
 * Returns the end node ids (so drawing can continue from the end).
 */
export function addWall(plan: Plan, p: Vec2, q: Vec2, props: WallProps): { a: string; b: string } | null {
  if (dist(p, q) < EPS * 10) return null;
  const a = ensureNode(plan, p);
  const b = ensureNode(plan, q);
  if (a === b) return null;
  if (!findWallBetween(plan, a, b)) {
    const id = newId(plan, 'w');
    plan.walls[id] = { id, a, b, thickness: props.thickness, height: props.height };
  }
  planarize(plan);
  normalize(plan);
  return { a, b };
}

/** Live node move (during a drag) with no clean-up; call `finishNodeMove` on release. */
export function moveNode(plan: Plan, id: string, p: Vec2) {
  const n = plan.nodes[id];
  n.x = p.x;
  n.y = p.y;
}

/** After dragging a node: join it to a node or wall it was dropped on, and re-split crossings. */
export function finishNodeMove(plan: Plan, id: string) {
  const n = plan.nodes[id];
  if (!n) return;
  const other = findNodeAt(plan, n, EPS, id);
  if (other) mergeNodes(plan, other, id);
  planarize(plan);
  normalize(plan);
}

export function setWallLength(plan: Plan, wallId: string, length: number) {
  const w = plan.walls[wallId];
  if (!w || length < 0.05) return;
  const ax = wallAxis(plan, w);
  moveNode(plan, w.b, { x: ax.a.x + ax.dir.x * length, y: ax.a.y + ax.dir.y * length });
  finishNodeMove(plan, w.b);
}

export function deleteOpening(plan: Plan, id: string) {
  delete plan.openings[id];
}

export function deleteWall(plan: Plan, id: string) {
  const w = plan.walls[id];
  if (!w) return;
  removeWallRaw(plan, id);
  for (const nid of [w.a, w.b]) tidyNode(plan, nid);
  normalize(plan);
}

export function deleteNode(plan: Plan, id: string) {
  if (!plan.nodes[id]) return;
  const neighbours = new Set<string>();
  for (const w of incidentWalls(plan, id)) {
    neighbours.add(w.a === id ? w.b : w.a);
    removeWallRaw(plan, w.id);
  }
  delete plan.nodes[id];
  for (const nid of neighbours) tidyNode(plan, nid);
  normalize(plan);
}

/**
 * Remove a node that is no longer needed: orphaned, or a straight-through joint between
 * two matching walls (e.g. what is left of a T-junction after its stem is deleted).
 * The two walls become one and their openings are carried over.
 */
export function healNode(plan: Plan, nodeId: string): boolean {
  const inc = incidentWalls(plan, nodeId);
  if (inc.length !== 2) return false;
  const [w1, w2] = inc;
  if (Math.abs(w1.thickness - w2.thickness) > 1e-6 || Math.abs(w1.height - w2.height) > 1e-6) return false;
  const node = plan.nodes[nodeId];
  const o1 = w1.a === nodeId ? w1.b : w1.a;
  const o2 = w2.a === nodeId ? w2.b : w2.a;
  if (o1 === o2) return false;
  const p1 = plan.nodes[o1];
  const p2 = plan.nodes[o2];
  const d1 = unit(sub(node, p1));
  const d2 = unit(sub(p2, node));
  if (Math.abs(cross(d1, d2)) > 1e-6 || dot(d1, d2) < 0) return false;

  const len1 = dist(p1, node);
  const len2 = dist(node, p2);
  // Re-express all openings along the merged direction o1 -> o2.
  for (const o of openingsOf(plan, w1.id)) if (w1.a !== o1) reverseOpening(o, len1);
  for (const o of openingsOf(plan, w2.id)) {
    if (w2.a !== nodeId) reverseOpening(o, len2);
    o.offset += len1;
    o.wallId = w1.id;
  }
  w1.a = o1;
  w1.b = o2;
  delete plan.walls[w2.id];
  delete plan.nodes[nodeId];
  return true;
}

/** Rewire every wall of `removeId` to `keepId`, then delete `removeId`. */
export function mergeNodes(plan: Plan, keepId: string, removeId: string) {
  if (keepId === removeId) return;
  for (const w of Object.values(plan.walls)) {
    if (w.a === removeId) w.a = keepId;
    if (w.b === removeId) w.b = keepId;
    if (w.a === w.b) removeWallRaw(plan, w.id);
  }
  delete plan.nodes[removeId];
}

/**
 * Make the drawing a planar graph: wherever a node touches a wall's interior, or two walls
 * cross, split the walls there.
 */
export function planarize(plan: Plan) {
  mergeCoincidentNodes(plan);
  for (let guard = 0; guard < 10000; guard++) {
    if (!planarizeStep(plan)) break;
  }
  dedupeWalls(plan);
}

function planarizeStep(plan: Plan): boolean {
  const walls = Object.values(plan.walls);
  const nodes = Object.values(plan.nodes);
  for (const w of walls) {
    const A = plan.nodes[w.a];
    const B = plan.nodes[w.b];
    const L = dist(A, B);
    for (const n of nodes) {
      if (n.id === w.a || n.id === w.b) continue;
      const pr = projectOnSegment(n, A, B);
      if (pr.dist < EPS && pr.t * L > EPS && (1 - pr.t) * L > EPS) {
        splitWall(plan, w.id, n.id);
        return true;
      }
    }
  }
  for (let i = 0; i < walls.length; i++) {
    const w1 = walls[i];
    const A = plan.nodes[w1.a];
    const B = plan.nodes[w1.b];
    const L1 = dist(A, B);
    for (let j = i + 1; j < walls.length; j++) {
      const w2 = walls[j];
      if (w2.a === w1.a || w2.a === w1.b || w2.b === w1.a || w2.b === w1.b) continue;
      const C = plan.nodes[w2.a];
      const D = plan.nodes[w2.b];
      const L2 = dist(C, D);
      const hit = segmentIntersect(A, B, C, D);
      if (!hit) continue;
      if (hit.t * L1 > EPS && (1 - hit.t) * L1 > EPS && hit.s * L2 > EPS && (1 - hit.s) * L2 > EPS) {
        const id = addNode(plan, hit.point);
        splitWall(plan, w1.id, id);
        splitWall(plan, w2.id, id);
        return true;
      }
    }
  }
  return false;
}

function mergeCoincidentNodes(plan: Plan) {
  const nodes = Object.values(plan.nodes);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!plan.nodes[n.id]) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const m = nodes[j];
      if (plan.nodes[m.id] && dist(n, m) < EPS) mergeNodes(plan, n.id, m.id);
    }
  }
}

/** Collapse walls that join the same pair of nodes, keeping the first and its openings. */
function dedupeWalls(plan: Plan) {
  const seen = new Map<string, Wall>();
  for (const w of Object.values(plan.walls)) {
    const key = w.a < w.b ? `${w.a}|${w.b}` : `${w.b}|${w.a}`;
    const keep = seen.get(key);
    if (!keep) {
      seen.set(key, w);
      continue;
    }
    const L = dist(plan.nodes[w.a], plan.nodes[w.b]);
    for (const o of openingsOf(plan, w.id)) {
      if (keep.a !== w.a) reverseOpening(o, L);
      o.wallId = keep.id;
    }
    keep.thickness = Math.max(keep.thickness, w.thickness);
    keep.height = Math.max(keep.height, w.height);
    delete plan.walls[w.id];
  }
}

function removeWallRaw(plan: Plan, id: string) {
  delete plan.walls[id];
  for (const o of Object.values(plan.openings)) if (o.wallId === id) delete plan.openings[o.id];
}

function tidyNode(plan: Plan, nodeId: string) {
  if (!plan.nodes[nodeId]) return;
  if (incidentWalls(plan, nodeId).length === 0) delete plan.nodes[nodeId];
  else healNode(plan, nodeId);
}

/** General clean-up run after every edit. */
export function normalize(plan: Plan) {
  for (const w of Object.values(plan.walls)) {
    if (!plan.walls[w.id]) continue;
    const a = plan.nodes[w.a];
    const b = plan.nodes[w.b];
    if (!a || !b || w.a === w.b) removeWallRaw(plan, w.id);
    else if (dist(a, b) < EPS) mergeNodes(plan, w.a, w.b);
  }
  dedupeWalls(plan);
  const used = new Set<string>();
  for (const w of Object.values(plan.walls)) {
    used.add(w.a);
    used.add(w.b);
  }
  for (const id of Object.keys(plan.nodes)) if (!used.has(id)) delete plan.nodes[id];
  clampOpenings(plan, computeFootprints(plan));
}

export function planBounds(plan: Plan): { min: Vec2; max: Vec2 } | null {
  const ns: PlanNode[] = Object.values(plan.nodes);
  if (!ns.length) return null;
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  for (const n of ns) {
    min.x = Math.min(min.x, n.x);
    min.y = Math.min(min.y, n.y);
    max.x = Math.max(max.x, n.x);
    max.y = Math.max(max.y, n.y);
  }
  return { min, max };
}
