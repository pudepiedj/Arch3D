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
  /** Finishes painted on its faces (left of a->b, and right); unset follows the drawing's defaults. */
  faces?: { left?: WallFinish; right?: WallFinish };
}

/** How a wall face looks: plaster, render, paint, stone or brick. */
export type WallFinish = 'plaster' | 'render' | 'render-cream' | 'render-ochre' | 'render-pink' | 'paint-sage' | 'paint-blue' | 'stone' | 'rubble' | 'brick';
export type FloorFinish = 'oak' | 'terracotta' | 'stone' | 'tiles' | 'carpet' | 'concrete';
export type RoofCovering = 'tiles' | 'roman' | 'plain' | 'slate';

/**
 * 'garage' is a roller door: slats that roll up into a casing above the opening.
 * 'glazed' is a floor-to-ceiling glass door: French doors, sliding doors or bi-folds.
 * 'open' is just an opening through the wall, with nothing in it (square or arched).
 */
export type OpeningKind = 'door' | 'window' | 'garage' | 'glazed' | 'open';

export type GlazedStyle = 'french' | 'sliding' | 'bifold';

export type FrameColour = 'white' | 'anthracite' | 'black' | 'oak';

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
  /** Garage or glazed door shown open rather than shut. */
  open?: boolean;
  /** Glazed doors: how the glass panels open (default French doors). */
  style?: GlazedStyle;
  /** Colour of the frame (windows and glass doors): unset is white for windows, anthracite for glass doors. */
  frameColour?: FrameColour;
  /** Door shown shut (doors are shown open unless this is set). In walk mode it opens as you reach it. */
  shut?: boolean;
  /** A plain opening with a round (semicircular) head: `height` is to the top of the arch. */
  arched?: boolean;
}

/** A chimney stack rising through the roof, with 1-3 pots. */
export interface Chimney {
  id: string;
  /** Centre of the stack. */
  x: number;
  y: number;
  width: number;
  depth: number;
  /** Rotation of the stack in radians. */
  angle: number;
  pots: 1 | 2 | 3;
  /** How far the stack rises above the highest point of the roof it passes through. */
  above: number;
}

/** A grid of solar panels laid on a roof slope. */
export interface SolarArray {
  id: string;
  /** Centre of the array, in plan. */
  x: number;
  y: number;
  rows: number;
  cols: number;
  /** Panels with their long side running up the slope. */
  portrait: boolean;
}

/**
 * Roof windows. On a sloping roof they lie in the slope; on a flat roof they sit on a
 * raised kerb box with a sloping top, over a light well down to the room below.
 */
export interface Rooflight {
  id: string;
  /** Centre, in plan. */
  x: number;
  y: number;
  /** Flat roofs: direction (radians) in which the box's sloping top rises. */
  angle: number;
  /** Windows side by side. */
  count: number;
  /** Size of each window: across, and up the slope. */
  width: number;
  length: number;
  /** Flat roofs: slope of the box top in degrees, and kerb height at its low side. */
  pitch: number;
  kerb: number;
  /** Shown opened (bottom edge tilted out). */
  open: boolean;
  /** Blinds drawn inside. */
  blinds: boolean;
  /** Solar-powered motor strip on the frame. */
  solarMotor: boolean;
}

export type PatioSurface = 'paving' | 'decking' | 'gravel' | 'rubber' | 'lawn' | 'pool' | 'balcony';

/** A paved, decked or gravelled area outside, drawn as a polygon on a floor's plan. */
export interface Patio {
  id: string;
  points: { x: number; y: number }[];
  surface: PatioSurface;
  /** Height of the top surface above the floor it belongs to. */
  height: number;
  /** Direction (radians) the paving courses or deck boards run in. */
  angle: number;
  /** Paving slab size (square), or deck board width. */
  module: number;
  /** A railing round its edge: glass panels (round a pool), wrought iron or timber. */
  guard?: Exclude<RailStyle, 'none'>;
}

/** 'deciduous' and 'conifer' are the generic kinds; the rest are species, plus a bush. */
export type TreeKind = 'deciduous' | 'conifer' | 'oak' | 'ash' | 'beech' | 'hazel' | 'birch' | 'rowan' | 'pine' | 'poplar' | 'bush';

/** A tree in the garden: shade in summer, and (if deciduous) far less in winter. */
export interface Tree {
  id: string;
  x: number;
  y: number;
  kind: TreeKind;
  height: number;
  /** Diameter of the crown. */
  spread: number;
  /** How far it leans from upright (degrees), and the compass bearing it leans towards. */
  lean?: number;
  leanTo?: number;
}

export type HedgeKind = 'privet' | 'hawthorn' | 'beech' | 'fence' | 'ditch' | 'wall';

/**
 * A hedge, fence or open drainage ditch along a line of points (closed if its last point is
 * its first). For a ditch, `height` is its depth.
 */
export interface Hedge {
  id: string;
  points: { x: number; y: number }[];
  kind: HedgeKind;
  height: number;
  /** Thickness through the hedge (a fence is always a board's thickness; a ditch's width at the top). */
  width: number;
  /** A garden wall's finish (dressed stone if unset). */
  finish?: WallFinish;
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

export type StairShape = 'straight' | 'L' | 'U' | 'spiral';

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
  /** Height it climbs, if not up to the next floor: a few steps up to a plinth, or an outside stair. */
  rise?: number;
  /** Solid underneath (the default), solid stone steps, or stone treads cantilevered from a wall. */
  style?: StairStyle;
  /** Timber handrail and balusters (the default), wrought iron, glass panels, or none. */
  rail?: RailStyle;
}

export type StairStyle = 'solid' | 'stone' | 'cantilever' | 'metal';
export type RailStyle = 'timber' | 'iron' | 'glass' | 'none';

export type RoofKind = 'gable' | 'hip' | 'flat' | 'none';

export interface Roof {
  kind: RoofKind;
  /** Slope in degrees. */
  pitch: number;
  /** How far the eaves project beyond the outside face of the walls. */
  overhang: number;
  /** No flat ceiling under this roof: the rooms are open to the slopes (a vaulted ceiling). */
  vaulted?: boolean;
  /** Gable ends glazed: a window filling each gable triangle above the wall plate. */
  glazedGables?: boolean;
  /**
   * Flat roofs: height of the parapet wall round the open edges, above the roof surface.
   * Unset means the usual 25 cm; 0 means none (the roof overhangs its walls instead).
   */
  parapet?: number;
  /**
   * Edges set by hand to a sloping eave or a vertical gable end, identified by the
   * midpoint of the edge (so they survive small edits to the walls).
   */
  edges?: RoofEdgeSetting[];
  /** What the slopes are covered with (concrete tiles if unset). */
  covering?: RoofCovering;
}

export interface RoofEdgeSetting {
  x: number;
  y: number;
  /** Pitched roofs: a sloping eave or a gable end. Flat roofs: 'open' for no parapet on this edge. */
  type: 'eave' | 'gable' | 'open';
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
  /**
   * Height of this floor above the ground, when it is not simply on top of the floor before
   * it in the list: a house on a plinth (+0.6), or half below ground (-1.5). The first floor
   * in the list (the garden's) is always at 0.
   */
  base?: number;
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
  /** Chimney stacks through this floor's roofs. */
  chimneys?: Record<string, Chimney>;
  /** Solar panel arrays on this floor's roofs. */
  solar?: Record<string, SolarArray>;
  /** Roof windows and rooflight boxes on this floor's roofs. */
  rooflights?: Record<string, Rooflight>;
  /** Patios, decks and gravelled areas. */
  patios?: Record<string, Patio>;
  /** Trees (normally on the ground floor's plan). */
  trees?: Record<string, Tree>;
  /** Hedges and fences (normally on the ground floor's plan). */
  hedges?: Record<string, Hedge>;
  /** Furniture, indoors and out. */
  furniture?: Record<string, Furniture>;
  /** Rooms' floors set differently from the drawing's default, each found by a point in the room. */
  floorFinishes?: { x: number; y: number; finish: FloorFinish }[];
}

/**
 * A piece of furniture. `kind` names an entry in the catalogue (furniture.ts); position is
 * the centre of its footprint, and in its own frame the back is towards -y (against a wall)
 * and the front, where you sit or stand, towards +y.
 */
export interface Furniture {
  id: string;
  kind: string;
  x: number;
  y: number;
  /** Rotation in radians (plan coordinates). */
  angle: number;
  width: number;
  depth: number;
  height: number;
  /** Colour or finish, from the catalogue entry's list. */
  finish?: string;
  /** Piano lid up (and similar things shown open). */
  open?: boolean;
  /** Piano stool shown. */
  stool?: boolean;
  /** Mirrored: a gate hung on its right-hand post instead of its left. */
  flip?: boolean;
}

export type DrainFitting = 'junction' | 'chamber' | 'gully' | 'downpipe' | 'soakaway' | 'sewer' | 'treatment' | 'outfall';
export type DrainKind = 'foul' | 'surface';

/** A point on the drains: a fitting, or just a bend or junction in the pipes. */
export interface DrainNode {
  id: string;
  x: number;
  y: number;
  fitting: DrainFitting;
  /** Depth of the pipe's invert (the inside bottom of the pipe) below the ground, in m. */
  invert: number;
  /** Inspection chamber: round rather than square. */
  round?: boolean;
  /** Treatment plant: tank shape, width (or diameter) and depth, in m. */
  tank?: { shape: 'round' | 'box'; width: number; depth: number };
}

/** A pipe run from one drain node to another; water flows from `a` to `b`. */
export interface DrainPipe {
  id: string;
  a: string;
  b: string;
  /** Bore in mm (100 for most house drains, 150 for shared or main runs). */
  diameter: number;
  kind: DrainKind;
}

/** The drains below ground, for the whole site. */
export interface Drains {
  nodes: Record<string, DrainNode>;
  pipes: Record<string, DrainPipe>;
}

/** Where the house is, for the sun. */
export interface Site {
  /** Degrees, north positive. */
  latitude: number;
  /** Degrees, east positive. */
  longitude: number;
  /** Compass direction the top of the plan faces, degrees clockwise from true north (0: north is up). */
  north: number;
}

/** A building is a stack of levels, listed from the bottom up. */
export interface Building {
  version: 2;
  levels: Level[];
  nextId: number;
  /** Location and orientation, for the sun. */
  site?: Site;
  /** Drains below ground (shown on the ground floor). */
  drains?: Drains;
  /** Default finishes: outside wall faces, inside wall faces, and floors. */
  materials?: { outside?: WallFinish; inside?: WallFinish; floor?: FloorFinish };
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
  glazed: { width: 2.4, height: 2.4, sill: 0 },
  open: { width: 1.2, height: 2.2, sill: 0 },
  pillar: 0.25,
};
