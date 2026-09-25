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

export type StairShape = 'straight' | 'L' | 'U';

/** A stair rising from its level to the next one up. Steps are computed, not stored. */
export interface Stair {
  id: string;
  /** Middle of the bottom edge of the first step. */
  x: number;
  y: number;
  /** Direction of travel up the first flight, in radians. */
  angle: number;
  width: number;
  /** Depth of each tread. */
  going: number;
  shape: StairShape;
  /** Which way an L or U stair turns, as you walk up it. */
  turn: 'left' | 'right';
}

export type RoofKind = 'gable' | 'hip' | 'flat' | 'none';

export interface Roof {
  kind: RoofKind;
  /** Slope in degrees. */
  pitch: number;
  /** How far the eaves project beyond the outside face of the walls. */
  overhang: number;
}

/** The drawing of one floor: its wall graph, doors and windows. */
export interface Plan {
  nodes: Record<string, PlanNode>;
  walls: Record<string, Wall>;
  openings: Record<string, Opening>;
  nextId: number;
}

/** A storey: a floor plan plus its vertical dimensions. */
export interface Level extends Plan {
  id: string;
  name: string;
  /** Floor-to-floor height. Walls normally run this full height, up to the next floor. */
  height: number;
  /** Thickness of this floor's structure (the slab above the storey below). */
  slab: number;
  /** Stairs going up from this level. */
  stairs: Record<string, Stair>;
  /** Roof over this level. Unset means the default: a gable roof if it is the top floor. */
  roof?: Roof;
}

/** A building is a stack of levels, listed from the bottom up. */
export interface Building {
  version: 2;
  levels: Level[];
  nextId: number;
}

export const DEFAULTS = {
  exteriorThickness: 0.3,
  interiorThickness: 0.12,
  /** Floor-to-floor height: 2.6 m ceilings under a 0.3 m floor structure. */
  levelHeight: 2.9,
  slab: 0.3,
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
};
