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

/** 'garage' is a roller door: slats that roll up into a casing above the opening. */
export type OpeningKind = 'door' | 'window' | 'garage';

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
  /** Garage door shown rolled up (open) rather than down. */
  open?: boolean;
}

/** A free-standing post, e.g. holding up a veranda or carport roof. */
export interface Pillar {
  id: string;
  x: number;
  y: number;
  /** Width (square) or diameter (round). */
  size: number;
  shape: 'square' | 'round';
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
  /**
   * Edges set by hand to a sloping eave or a vertical gable end, identified by the
   * midpoint of the edge (so they survive small edits to the walls).
   */
  edges?: RoofEdgeSetting[];
}

export interface RoofEdgeSetting {
  x: number;
  y: number;
  type: 'eave' | 'gable';
}

/** Settings for one separately roofed area of a floor, found by a point inside it. */
export interface RoofAreaSetting {
  x: number;
  y: number;
  roof: Roof;
}

/** An extra roof drawn by hand, e.g. a cross gable over a bay; it may overlap other roofs. */
export interface RoofSection {
  id: string;
  /** Outline, drawn along wall centre lines (edges on walls are taken to their outside face). */
  points: { x: number; y: number }[];
  roof: Roof;
  /** Height the roof starts from (its wall-plate level) above the floor; default the floor's wall top. */
  base?: number;
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
  /**
   * Default roof for the parts of this floor with nothing built above them. Unset means a
   * gable roof on the top floor and flat roofs on lower floors (e.g. single-storey extensions).
   */
  roof?: Roof;
  /** Different roofs for particular areas of this floor. */
  roofAreas?: RoofAreaSetting[];
  /** Extra hand-drawn roofs. */
  roofSections?: Record<string, RoofSection>;
  /** Free-standing pillars. They rise to the roof above them (or the floor's wall height). */
  pillars?: Record<string, Pillar>;
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
  garage: { width: 2.5, height: 2.1, sill: 0 },
  pillar: 0.25,
};
