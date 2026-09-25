// The plan is a graph: nodes are wall junctions, walls are edges between two nodes.
// Doors and windows are not holes in geometry; they are positions along a wall.
// All 2D/3D geometry (mitred joints, reveals, floors) is derived from this data.

export interface PlanNode {
  id: string;
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  /** Start node id. */
  a: string;
  /** End node id. */
  b: string;
  thickness: number;
  height: number;
}

export type OpeningKind = 'door' | 'window';

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distance of the opening's centre from the wall's start node, along the wall. */
  offset: number;
  width: number;
  height: number;
  /** Height of the bottom of the opening above the floor (0 for doors). */
  sill: number;
  /** Door hinge at the far end (towards node b) instead of the near end. */
  hingeFlip?: boolean;
  /** Door swings to the right-hand side of the wall instead of the left. */
  swingFlip?: boolean;
}

export interface Plan {
  version: 1;
  nodes: Record<string, PlanNode>;
  walls: Record<string, Wall>;
  openings: Record<string, Opening>;
  nextId: number;
}

export const DEFAULTS = {
  exteriorThickness: 0.3,
  interiorThickness: 0.12,
  wallHeight: 2.6,
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
};
