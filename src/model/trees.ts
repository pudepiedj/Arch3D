// Trees and bushes: a trunk (or stems) and a crown, placed on a floor's plan (normally the
// ground floor). Each kind has its own usual size, shape, bark and colours through the year.

import { type Vec2, dist } from './geom';
import type { Level, Tree, TreeKind } from './types';

export type CrownShape = 'dome' | 'spreading' | 'oval' | 'narrow' | 'multistem' | 'pine' | 'cone' | 'bush';

export interface Species {
  name: string;
  height: number;
  spread: number;
  evergreen: boolean;
  shape: CrownShape;
  /** Where the crown starts, as a share of the height. */
  crownBase: number;
  /** Trunk radius at the ground, as a share of the height (and never more than 0.5 m). */
  trunk: number;
  bark: number;
  /** Bark near the top (Scots pine goes orange). */
  barkTop?: number;
  leaf: number;
  autumn: number;
  /** Berries in autumn (rowan), and their colour. */
  berries?: number;
  /** How full the crown is (1 dense, less for an airy one like ash). */
  density: number;
  note: string;
}

export const SPECIES: Record<TreeKind, Species> = {
  oak: {
    name: 'Oak', height: 18, spread: 16, evergreen: false, shape: 'spreading', crownBase: 0.22, trunk: 0.03,
    bark: 0x5a5046, leaf: 0x4b6a2c, autumn: 0x9a6a2a, density: 1,
    note: 'English oak: a short, massive trunk and a broad, low, spreading crown. In leaf mid-May to late October, turning russet-brown.',
  },
  ash: {
    name: 'Ash', height: 20, spread: 12, evergreen: false, shape: 'oval', crownBase: 0.3, trunk: 0.02,
    bark: 0x8e8a80, leaf: 0x6f9a45, autumn: 0xc9b04a, density: 0.65,
    note: 'Ash: pale grey bark and a tall, open, airy crown that lets a lot of light through. Late into leaf and early to drop, yellow in autumn.',
  },
  beech: {
    name: 'Beech', height: 20, spread: 15, evergreen: false, shape: 'dome', crownBase: 0.25, trunk: 0.025,
    bark: 0x8b8b87, leaf: 0x5c8a34, autumn: 0xb0602a, density: 1.1,
    note: 'Beech: smooth silver-grey bark and a dense domed crown that casts deep shade; copper in autumn.',
  },
  hazel: {
    name: 'Hazel', height: 5, spread: 4, evergreen: false, shape: 'multistem', crownBase: 0.1, trunk: 0.012,
    bark: 0x7a5a40, leaf: 0x6d9640, autumn: 0xc0a040, density: 0.9,
    note: 'Hazel: many stems from the ground, a rounded shrubby crown, catkins in late winter; yellow in autumn.',
  },
  birch: {
    name: 'Silver birch', height: 15, spread: 6, evergreen: false, shape: 'narrow', crownBase: 0.35, trunk: 0.012,
    bark: 0xe6e2da, leaf: 0x86a84a, autumn: 0xd8b84a, density: 0.6,
    note: 'Silver birch: slender white trunk and a light, narrow crown with dappled shade; butter-yellow in autumn.',
  },
  rowan: {
    name: 'Rowan', height: 8, spread: 5, evergreen: false, shape: 'oval', crownBase: 0.3, trunk: 0.02,
    bark: 0x7d7870, leaf: 0x5e8a3a, autumn: 0xc0502a, berries: 0xc8281e, density: 0.8,
    note: 'Rowan (mountain ash): a small upright tree, clusters of red berries from August and red-orange leaves in autumn.',
  },
  pine: {
    name: 'Scots pine', height: 18, spread: 7, evergreen: true, shape: 'pine', crownBase: 0.6, trunk: 0.02,
    bark: 0x5e4a3c, barkTop: 0xb86a3a, leaf: 0x3a5a45, autumn: 0x3a5a45, density: 1,
    note: 'Scots pine: evergreen; a tall bare trunk, orange towards the top, under a flat-topped, irregular crown.',
  },
  deciduous: {
    name: 'Broad-leaved (general)', height: 8, spread: 6, evergreen: false, shape: 'dome', crownBase: -1, trunk: 0.018,
    bark: 0x5a4a3c, leaf: 0x5f8f3e, autumn: 0xb8742e, density: 1,
    note: 'In leaf from May to October, bare in winter.',
  },
  conifer: {
    name: 'Conifer (general)', height: 10, spread: 4, evergreen: true, shape: 'cone', crownBase: 0.15, trunk: 0.018,
    bark: 0x5a4a3c, leaf: 0x2f5a36, autumn: 0x2f5a36, density: 1,
    note: 'Evergreen: the same shade all year.',
  },
  bush: {
    name: 'Bush (deciduous)', height: 1.8, spread: 2, evergreen: false, shape: 'bush', crownBase: 0, trunk: 0.02,
    bark: 0x6a5240, leaf: 0x5f8a3e, autumn: 0xa86a30, density: 1,
    note: 'A deciduous bush with its leaves right down to the ground; bare twigs in winter. Set any height and spread.',
  },
};

/** The kinds in the order the lists show them. */
export const TREE_ORDER: TreeKind[] = ['oak', 'ash', 'beech', 'hazel', 'birch', 'rowan', 'pine', 'deciduous', 'conifer', 'bush'];

export const TREE_DEFAULTS: Record<TreeKind, { height: number; spread: number }> = Object.fromEntries(
  Object.entries(SPECIES).map(([k, s]) => [k, { height: s.height, spread: s.spread }]),
) as Record<TreeKind, { height: number; spread: number }>;

export const speciesOf = (t: { kind: TreeKind }): Species => SPECIES[t.kind] ?? SPECIES.deciduous;

export function addTree(level: Level, p: Vec2, kind: TreeKind = 'deciduous', size?: { height: number; spread: number }): Tree {
  const id = `tr${level.nextId++}`;
  const tree: Tree = { id, x: p.x, y: p.y, kind, ...(size ?? TREE_DEFAULTS[kind]) };
  level.trees ??= {};
  level.trees[id] = tree;
  return tree;
}

/** Radius of the trunk at the ground. */
export function trunkRadius(t: Tree): number {
  return Math.min(0.5, Math.max(0.04, t.height * speciesOf(t).trunk));
}

/** How much of it you can't walk through: the trunk, or the whole of a bush. */
export function solidRadius(t: Tree): number {
  const s = speciesOf(t).shape;
  if (s === 'bush') return (t.spread / 2) * 0.85;
  if (s === 'multistem') return Math.max(trunkRadius(t) * 4, t.spread * 0.15);
  return trunkRadius(t);
}

/** Height of the bottom of the crown (where the branches start). */
export function crownBase(t: Tree): number {
  const s = speciesOf(t);
  if (s.crownBase < 0) return Math.min(t.height * 0.4, Math.max(1.2, t.height - t.spread * 0.9));
  return t.height * s.crownBase;
}

/** The tree whose trunk is at p, or failing that whose crown is over p. */
export function treeAt(level: Level, p: Vec2, trunkTol: number, crowns = true): string | undefined {
  const list = Object.values(level.trees ?? {});
  const trunk = list.find((t) => dist(t, p) <= solidRadius(t) + trunkTol);
  if (trunk || !crowns) return trunk?.id;
  return list.filter((t) => dist(t, p) <= t.spread / 2).sort((a, b) => dist(a, p) - dist(b, p))[0]?.id;
}
