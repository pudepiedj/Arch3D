// Trees: a trunk and a crown, placed on a floor's plan (normally the ground floor).

import { type Vec2, dist } from './geom';
import type { Level, Tree, TreeKind } from './types';

export const TREE_DEFAULTS: Record<TreeKind, { height: number; spread: number }> = {
  deciduous: { height: 8, spread: 6 },
  conifer: { height: 10, spread: 4 },
};

export function addTree(level: Level, p: Vec2, kind: TreeKind = 'deciduous'): Tree {
  const id = `tr${level.nextId++}`;
  const tree: Tree = { id, x: p.x, y: p.y, kind, ...TREE_DEFAULTS[kind] };
  level.trees ??= {};
  level.trees[id] = tree;
  return tree;
}

/** Radius of the trunk at the ground. */
export function trunkRadius(t: Tree): number {
  return Math.min(0.35, Math.max(0.06, t.height * 0.018));
}

/** Height of the bottom of the crown (where the branches start). */
export function crownBase(t: Tree): number {
  return t.kind === 'conifer' ? t.height * 0.15 : Math.min(t.height * 0.4, Math.max(1.2, t.height - t.spread * 0.9));
}

/** The tree whose trunk is at p, or failing that whose crown is over p. */
export function treeAt(level: Level, p: Vec2, trunkTol: number, crowns = true): string | undefined {
  const list = Object.values(level.trees ?? {});
  const trunk = list.find((t) => dist(t, p) <= trunkRadius(t) + trunkTol);
  if (trunk || !crowns) return trunk?.id;
  return list.filter((t) => dist(t, p) <= t.spread / 2).sort((a, b) => dist(a, p) - dist(b, p))[0]?.id;
}
