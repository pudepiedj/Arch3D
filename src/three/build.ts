// Turns the plan into three.js geometry.
//
// Walls are not boxes with holes cut out (CSG). Each wall is assembled directly from its
// mitred footprint: the two long faces are tiled around the openings, and each opening
// gets its reveals (jambs, head, sill) across the wall thickness. So no matter how the
// plan is edited, the result is watertight at joints and has no stray slivers.

import * as THREE from 'three';
import { Vec2, dot, pointInPolygon, polygonArea, projectOnSegment, sub } from '../model/geom';
import { computeFootprints, type Footprint, wallPoint } from '../model/joints';
import { openingsOf } from '../model/openings';
import { detectRooms } from '../model/rooms';
import { ceilingHeight, levelBelow, levelElevation } from '../model/building';
import { type Shape, intersectAll, subtract } from '../model/clip';
import { FLAT_THICKNESS, type Point3, type RoofGeometry, levelRoofs, outerFaces, outsetLoop, planeOf } from '../model/roof';
import { type StairGeometry, reachesFloorAbove, stairGeometry, stairRise, stairSurfaceAt, stairwells } from '../model/stairs';
import { type RailLine, againstWall, buildRails, onSegment } from './rails';
import { pillarHeight } from '../model/pillars';
import {
  type ChimneyGeometry,
  type RooflightGeometry,
  type SolarGeometry,
  chimneyGeometry,
  rooflightGeometry,
  solarGeometry,
} from '../model/roofitems';
import { POOL_COPING, POOL_WATER, patioShapes } from '../model/patios';
import { type Species, crownBase, leanDirection, speciesOf, trunkRadius } from '../model/trees';
import { standingHeight } from '../model/furniture';
import { buildFurniture } from './furniture3d';
import { canvasTexture, floorMaterial, rng, roofMaterial, wallMaterial } from './finishes';
import { DEFAULT_MATERIALS, faceSides } from '../model/materials';
import type { Building, FloorFinish, FrameColour, Level, RailStyle, RoofCovering, StairStyle, WallFinish, Furniture, Hedge, Opening, Patio, Pillar, Plan, Tree } from '../model/types';
import { buildHedge } from './hedges3d';
import { type HedgeRun, hedgeRuns } from '../model/hedges';

export interface Materials {
  wall: THREE.Material;
  wallTop: THREE.Material;
  floor: THREE.Material;
  frame: THREE.Material;
  glass: THREE.Material;
  door: THREE.Material;
  ceiling: THREE.Material;
  roof: THREE.Material;
  flatRoof: THREE.Material;
  garage: THREE.Material;
  brick: THREE.Material;
  pot: THREE.Material;
  solar: THREE.Material;
  darkFrame: THREE.Material;
  blind: THREE.Material;
  paving: THREE.Material;
  decking: THREE.Material;
  gravel: THREE.Material;
  rubber: THREE.Material;
  lawn: THREE.Material;
  /** A pool's mosaic lining (floor and sides), and its water. */
  pool: THREE.Material;
  water: THREE.Material;
  lawnEdge: THREE.Material;
  paveEdge: THREE.Material;
  deckEdge: THREE.Material;
  bark: THREE.Material;
  leaves: THREE.Material;
  autumn: THREE.Material;
  needles: THREE.Material;
}

export function createMaterials(): Materials {
  return {
    wall: new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 0.9, side: THREE.DoubleSide }),
    wallTop: new THREE.MeshStandardMaterial({ color: 0x55575c, roughness: 0.8, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ color: 0xc8a57c, roughness: 0.7, shadowSide: THREE.DoubleSide }),
    frame: new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xa8cde8,
      roughness: 0.05,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    door: new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.6 }),
    // One-sided: seen from inside the room, invisible when looking down from above.
    ceiling: new THREE.MeshStandardMaterial({ color: 0xfbfaf8, roughness: 0.95, shadowSide: THREE.DoubleSide }),
    roof: new THREE.MeshStandardMaterial({ color: 0x8f4b3a, roughness: 0.85, side: THREE.DoubleSide }),
    flatRoof: new THREE.MeshStandardMaterial({ color: 0x5d6066, roughness: 0.95, side: THREE.DoubleSide }),
    garage: new THREE.MeshStandardMaterial({ color: 0xcdd1d5, roughness: 0.45, metalness: 0.35 }),
    brick: new THREE.MeshStandardMaterial({ color: 0x9a5b45, roughness: 0.9 }),
    pot: new THREE.MeshStandardMaterial({ color: 0xb8653f, roughness: 0.8 }),
    solar: new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.25, metalness: 0.4, side: THREE.DoubleSide }),
    darkFrame: new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
    blind: new THREE.MeshStandardMaterial({ color: 0xe8dcc2, roughness: 0.95, side: THREE.DoubleSide }),
    paving: new THREE.MeshStandardMaterial({ color: 0xffffff, map: pavingTexture(), roughness: 0.9 }),
    decking: new THREE.MeshStandardMaterial({ color: 0xffffff, map: deckingTexture(), roughness: 0.75 }),
    gravel: new THREE.MeshStandardMaterial({ color: 0xffffff, map: gravelTexture(), roughness: 1 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0xffffff, map: rubberTexture(), roughness: 0.95 }),
    lawn: new THREE.MeshStandardMaterial({ color: 0xffffff, map: lawnTexture(), roughness: 1 }),
    pool: new THREE.MeshStandardMaterial({ color: 0xffffff, map: mosaicTexture(), roughness: 0.3, side: THREE.DoubleSide }),
    water: new THREE.MeshPhysicalMaterial({ color: 0x3f9fc8, roughness: 0.05, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    lawnEdge: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }),
    paveEdge: new THREE.MeshStandardMaterial({ color: 0xb9b3a8, roughness: 0.9 }),
    deckEdge: new THREE.MeshStandardMaterial({ color: 0x8a6446, roughness: 0.75 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 1 }),
    leaves: new THREE.MeshStandardMaterial({ color: 0x5f8f3e, roughness: 0.9, flatShading: true }),
    autumn: new THREE.MeshStandardMaterial({ color: 0xb8742e, roughness: 0.9, flatShading: true }),
    needles: new THREE.MeshStandardMaterial({ color: 0x2f5a36, roughness: 0.9, flatShading: true }),
  };
}

// ---------------------------------------------------------------- patio textures
//
// Drawn on a canvas once, then repeated. Each texture covers one "period" of the pattern
// (see patioPeriod), so the patio's texture coordinates are just its plan coordinates,
// turned to the patio's direction and divided by the period.

/** Slabs per texture period, each way. */
const SLABS = 4;

/** 4 x 4 sandstone slabs with mortar joints, each a slightly different shade. */
function pavingTexture() {
  return canvasTexture(512, 512, (ctx) => {
    const r = rng(7);
    const s = 512 / SLABS;
    ctx.fillStyle = '#8d877d';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < SLABS; i++) {
      for (let j = 0; j < SLABS; j++) {
        const l = 70 + r() * 10;
        ctx.fillStyle = `hsl(${34 + r() * 8}, ${14 + r() * 10}%, ${l}%)`;
        ctx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
        // Riven texture: faint speckles.
        for (let k = 0; k < 140; k++) {
          ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '60,50,40'}, ${0.05 + r() * 0.08})`;
          ctx.fillRect(i * s + 3 + r() * (s - 8), j * s + 3 + r() * (s - 8), 1 + r() * 3, 1 + r() * 3);
        }
      }
    }
  });
}

/** Boards per texture period across, and the period's length along the boards (m). */
const BOARDS = 8;
const BOARD_RUN = 3.6;
const BOARD_GAP = 0.006;

/** 8 boards side by side, with grain, and butt joints staggered from board to board. */
function deckingTexture() {
  return canvasTexture(1024, 512, (ctx) => {
    const r = rng(11);
    const b = 512 / BOARDS;
    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(0, 0, 1024, 512);
    for (let j = 0; j < BOARDS; j++) {
      const y = j * b + 2;
      const h = b - 4;
      // Each board is cut into two lengths at a different point.
      const cut = Math.floor((0.15 + r() * 0.7) * 1024);
      for (const [x0, x1] of [[0, cut], [cut, 1024]]) {
        ctx.fillStyle = `hsl(${25 + r() * 5}, ${40 + r() * 8}%, ${42 + r() * 7}%)`;
        ctx.fillRect(x0 + 1, y, x1 - x0 - 2, h);
        // Grain: long thin streaks along the board.
        for (let k = 0; k < 26; k++) {
          ctx.strokeStyle = `rgba(${r() < 0.5 ? '255,230,200' : '40,20,10'}, ${0.06 + r() * 0.1})`;
          ctx.lineWidth = 0.6 + r() * 1.2;
          const gy = y + 2 + r() * (h - 4);
          ctx.beginPath();
          ctx.moveTo(x0 + 2, gy);
          ctx.bezierCurveTo(x0 + (x1 - x0) * 0.3, gy + r() * 4 - 2, x0 + (x1 - x0) * 0.7, gy + r() * 4 - 2, x1 - 2, gy);
          ctx.stroke();
        }
        // Grooves (anti-slip ribs).
        ctx.strokeStyle = 'rgba(40, 22, 12, 0.18)';
        ctx.lineWidth = 1;
        for (let g = 1; g < 6; g++) {
          ctx.beginPath();
          ctx.moveTo(x0 + 2, y + (h * g) / 6);
          ctx.lineTo(x1 - 2, y + (h * g) / 6);
          ctx.stroke();
        }
      }
    }
  });
}

/** Pea gravel: a dense scatter of little stones. */
function gravelTexture() {
  return canvasTexture(512, 512, (ctx) => {
    const r = rng(3);
    ctx.fillStyle = '#a79f92';
    ctx.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 9000; k++) {
      const x = r() * 512;
      const y = r() * 512;
      const s = 1.5 + r() * 3.5;
      ctx.fillStyle = `hsl(${25 + r() * 20}, ${8 + r() * 14}%, ${45 + r() * 35}%)`;
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** 4 x 4 interlocking rubber tiles: near-black, with a fine grain and the jigsaw joints. */
function rubberTexture() {
  return canvasTexture(512, 512, (ctx) => {
    const r = rng(13);
    const s = 512 / SLABS;
    ctx.fillStyle = '#2c2d30';
    ctx.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 6000; k++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'}, ${0.04 + r() * 0.06})`;
      ctx.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2);
    }
    // The joints, with the dovetails of the interlock along them.
    ctx.strokeStyle = '#18191b';
    ctx.lineWidth = 2;
    for (let i = 0; i <= SLABS; i++) {
      for (let k = 0; k < 4; k++) {
        const t = (k + 0.5) * (s / 4);
        for (let j = 0; j < SLABS; j++) {
          const bump = (k % 2 ? 1 : -1) * 5;
          // Across (a vertical joint at x = i*s) and along (a horizontal one at y = i*s).
          ctx.beginPath();
          ctx.moveTo(i * s, j * s + t - 6);
          ctx.lineTo(i * s + bump, j * s + t - 4);
          ctx.lineTo(i * s + bump, j * s + t + 4);
          ctx.lineTo(i * s, j * s + t + 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(j * s + t - 6, i * s);
          ctx.lineTo(j * s + t - 4, i * s + bump);
          ctx.lineTo(j * s + t + 4, i * s + bump);
          ctx.lineTo(j * s + t + 6, i * s);
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.moveTo(i * s, 0);
      ctx.lineTo(i * s, 512);
      ctx.moveTo(0, i * s);
      ctx.lineTo(512, i * s);
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });
}

/** Mown grass: two mowing stripes across the period, one lighter than the other, with blades. */
function lawnTexture() {
  return canvasTexture(512, 512, (ctx) => {
    const r = rng(17);
    ctx.fillStyle = '#6f9d52';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#5b8a41';
    ctx.fillRect(0, 256, 512, 256);
    for (let k = 0; k < 14000; k++) {
      const x = r() * 512;
      const y = r() * 512;
      ctx.fillStyle = `hsla(${88 + r() * 24}, ${30 + r() * 25}%, ${y < 256 ? 42 + r() * 22 : 34 + r() * 18}%, 0.55)`;
      ctx.fillRect(x, y, 1, 2 + r() * 3);
    }
  });
}

/** Pool mosaic: 3 cm glass tiles in light blues, a metre square. */
function mosaicTexture() {
  return canvasTexture(512, 512, (ctx) => {
    const r = rng(19);
    const n = 32;
    const s = 512 / n;
    ctx.fillStyle = '#e6eef0';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = `hsl(${190 + r() * 16}, ${45 + r() * 25}%, ${52 + r() * 18}%)`;
        ctx.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
      }
    }
  });
}

/** Size in metres of one repeat of the texture: along the courses/boards, and across them. */
function patioPeriod(p: Patio): { along: number; across: number } {
  if (p.surface === 'paving' || p.surface === 'rubber') return { along: SLABS * p.module, across: SLABS * p.module };
  if (p.surface === 'decking') return { along: BOARD_RUN, across: BOARDS * (p.module + BOARD_GAP) };
  if (p.surface === 'lawn') return { along: 2 * p.module, across: 2 * p.module };
  return { along: 1, across: 1 };
}

/** Door leaves are shown open by this angle so you can walk through. */
const DOOR_OPEN_DEG = 80;
const FRAME = 0.05;

/** Collects triangles with an explicit outward normal so winding is always right. */
class Mesher {
  pos: number[] = [];
  /**
   * Texture coordinates in metres, in the plane of each face: across it horizontally, and up
   * it (up the slope of a roof, up a wall; across a floor, the plan's y).
   */
  uv: number[] = [];

  /** Plan point + height -> world (x, height, y). */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, outward: THREE.Vector3) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-14) return;
    if (n.dot(outward) < 0) {
      [b, c] = [c, b];
      n.negate();
    }
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    n.normalize();
    const t = Math.abs(n.y) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-n.z, 0, n.x).normalize();
    const up = new THREE.Vector3().crossVectors(t, n);
    for (const p of [a, b, c]) this.uv.push(p.dot(t), p.dot(up));
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, outward: THREE.Vector3) {
    this.tri(a, b, c, outward);
    this.tri(a, c, d, outward);
  }

  /** Vertical rectangle standing on plan segment p->q between heights z0 and z1. */
  vface(p: Vec2, q: Vec2, z0: number, z1: number, outward: THREE.Vector3) {
    if (z1 - z0 < 1e-6) return;
    this.quad(w3(p, z0), w3(q, z0), w3(q, z1), w3(p, z1), outward);
  }

  /** Horizontal polygon with holes (outer ring first) at height z. */
  hshape(rings: Vec2[][], z: number, up: boolean) {
    const [outer, ...holes] = rings;
    if (!outer || outer.length < 3) return;
    const all = rings.flat();
    const tris = THREE.ShapeUtils.triangulateShape(
      outer.map((p) => new THREE.Vector2(p.x, p.y)),
      holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.y))),
    );
    const n = new THREE.Vector3(0, up ? 1 : -1, 0);
    for (const [i, j, k] of tris) this.tri(w3(all[i], z), w3(all[j], z), w3(all[k], z), n);
  }

  /** Horizontal polygon at height z. */
  hpoly(pts: Vec2[], z: number, up: boolean) {
    const contour = pts.map((p) => new THREE.Vector2(p.x, p.y));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const n = new THREE.Vector3(0, up ? 1 : -1, 0);
    for (const [i, j, k] of tris) this.tri(w3(pts[i], z), w3(pts[j], z), w3(pts[k], z), n);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

/** Meshers by material: one mesh each, built at the end. */
class MeshSet<K extends string> {
  private map = new Map<K, Mesher>();
  get(k: K): Mesher {
    let m = this.map.get(k);
    if (!m) this.map.set(k, (m = new Mesher()));
    return m;
  }
  entries() {
    return [...this.map.entries()];
  }
}

const w3 = (p: Vec2, z: number) => new THREE.Vector3(p.x, z, p.y);
const n3 = (p: Vec2, s = 1) => new THREE.Vector3(p.x * s, 0, p.y * s);

export interface LevelOptions {
  /** Height of the ceiling above this floor, or null for no ceilings. */
  ceiling: number | null;
  /** Stairwells from the level below, cut out of this floor. */
  floorHoles?: Shape[];
  /** This level's own stairwells, cut out of its ceilings. */
  ceilingHoles?: Shape[];
  /** Thickness of this floor, for the edges of stairwells cut through it. */
  slab?: number;
  /** Where the stairs from below arrive (their walking line ends), to leave those edges open. */
  wellExits?: Vec2[];
  /** Stairs standing on this floor. */
  stairs?: (StairGeometry & { style?: StairStyle; rail?: RailStyle })[];
  /** The roofs over this floor (none when it is cut away). */
  /** Roofs, each flagged if it is vaulted (open to the room below, lined with plaster). */
  roofs?: (RoofGeometry & { vaulted?: boolean; glazedGables?: boolean; covering?: RoofCovering })[];
  /** Chimney stacks and solar arrays on this floor's roofs (none when cut away). */
  chimneys?: ChimneyGeometry[];
  solar?: SolarGeometry[];
  rooflights?: RooflightGeometry[];
  /** Free-standing pillars, each with the height it rises to. */
  pillars?: (Pillar & { height: number })[];
  /** Patios, decks and gravel, with their outlines less the house. */
  patios?: { patio: Patio; shapes: Shape[] }[];
  trees?: Tree[];
  /** Which way the top of the plan faces (degrees), for the way leaning trees lean. */
  north?: number;
  hedges?: { hedge: Hedge; runs: HedgeRun[] }[];
  /** Furniture, each with the height of what it stands on (floor, patio or deck). */
  furniture?: (Furniture & { base: number })[];
  /** How leafy the broad-leaved trees are: 1 summer, 0 bare; `autumn` colours them. */
  season?: Season;
  /**
   * Walls of other floors beside this one's stairs (a stair on the garden floor set into the
   * wall of a house): a rail along one of them needs no balusters.
   */
  nearWalls?: Footprint[];
  /** The ground's height in this floor's terms (minus the floor's elevation), and the house's outline. */
  ground?: number;
  house?: Vec2[][];
  /** The drawing's default finishes (walls outside and in, floors). */
  materials?: { outside: WallFinish; inside: WallFinish; floor: FloorFinish };
}

export interface Season {
  leaf: number;
  autumn: boolean;
}

/**
 * The whole building: each level built in its own coordinates and lifted to its elevation.
 * `upTo` hides the levels above it (a doll's-house cutaway) and that level's ceilings.
 */
export function buildBuildingObject(
  b: Building,
  mats: Materials,
  upTo?: string,
  season: Season = { leaf: 1, autumn: false },
): THREE.Group {
  const group = new THREE.Group();
  // Cut away: hide the floors higher than the one chosen (and its ceilings and roofs).
  const cutZ = upTo ? levelElevation(b, upTo) : Infinity;
  b.levels.forEach((level) => {
    const z = levelElevation(b, level.id);
    if (z > cutZ + 1e-6) return;
    const isCut = level.id === upTo;
    const below = levelBelow(b, level.id);
    // Rooflight boxes on flat roofs open a light well through the ceiling and the roof.
    const rooflights =
      isCut ? [] : Object.values(level.rooflights ?? {}).flatMap((r) => rooflightGeometry(b, level, r) ?? []);
    const kerbs = rooflights.filter((r) => r.kind === 'kerb');
    const roofs = isCut ? [] : levelRoofs(b, level);
    // Vaulted roofs have no flat ceiling under them: cut their outline out of the ceilings.
    const vaults = roofs.filter((r) => r.roof.vaulted && r.roof.kind !== 'flat' && r.geometry).map((r) => [r.ring]);
    const obj = buildPlanObject(level, mats, {
      ceiling: isCut ? null : ceilingHeight(b, level),
      floorHoles: below ? stairwells(below) : [],
      wellExits: below ? Object.values(below.stairs ?? {}).filter((st) => reachesFloorAbove(st, below)).map((st) => stairGeometry(st, stairRise(st, below)).path.at(-1)!) : [],
      ceilingHoles: [...stairwells(level), ...kerbs.map((r) => [r.footprint]), ...vaults],
      slab: level.slab,
      stairs: Object.values(level.stairs ?? {}).map((st) => ({ ...stairGeometry(st, stairRise(st, level)), style: st.style, rail: st.rail })),
      pillars: Object.values(level.pillars ?? {}).map((q) => ({ ...q, height: pillarHeight(b, level, q) })),
      chimneys: isCut ? [] : Object.values(level.chimneys ?? {}).map((c) => chimneyGeometry(b, level, c)),
      solar: isCut ? [] : Object.values(level.solar ?? {}).flatMap((sa) => solarGeometry(b, level, sa) ?? []),
      rooflights,
      roofs: roofs.flatMap((r) => (r.geometry ? [{ ...r.geometry, vaulted: !!r.roof.vaulted && r.roof.kind !== 'flat', glazedGables: !!r.roof.glazedGables && r.roof.kind !== 'flat', covering: r.roof.covering }] : [])),
      patios: Object.values(level.patios ?? {}).map((patio) => ({ patio, shapes: patioShapes(level, patio) })),
      trees: Object.values(level.trees ?? {}),
      north: (b.site?.north ?? 0),
      hedges: Object.values(level.hedges ?? {}).map((hedge) => ({ hedge, runs: hedgeRuns(hedge, level) })),
      furniture: Object.values(level.furniture ?? {}).map((f) => ({ ...f, base: standingHeight(level, f) })),
      season,
      materials: { ...DEFAULT_MATERIALS, ...b.materials },
      nearWalls: Object.keys(level.stairs ?? {}).length ? nearWalls(b, level) : [],
      ground: -levelElevation(b, level.id),
      house: Object.values(level.patios ?? {}).some((pt) => pt.height < -levelElevation(b, level.id)) ? outerFaces(level) : [],
    });
    obj.position.y = levelElevation(b, level.id);
    obj.name = `level:${level.id}`;
    group.add(obj);
  });
  return group;
}

/** The walls of the other floors that stand at the same heights as a floor's stairs. */
function nearWalls(b: Building, level: Level): Footprint[] {
  const z0 = levelElevation(b, level.id);
  const z1 = z0 + Math.max(level.height, ...Object.values(level.stairs ?? {}).map((s) => stairRise(s, level)));
  return b.levels
    .filter((l) => l !== level)
    .filter((l) => {
      const e = levelElevation(b, l.id);
      return e < z1 && e + l.height > z0;
    })
    .flatMap((l) => [...computeFootprints(l).values()]);
}

export function buildPlanObject(plan: Plan, mats: Materials, opts: LevelOptions = { ceiling: null }): THREE.Group {
  const group = new THREE.Group();
  const fps = computeFootprints(plan);
  const finishes = opts.materials ?? DEFAULT_MATERIALS;
  const faces = new MeshSet<WallFinish>();
  const tops = new Mesher();
  // Which face of each wall looks into a room, for the default finishes.
  const sidesOf = faceSides(plan as Level);

  // Heights of the other walls at each node, to cap a taller wall above a lower neighbour.
  const heightsAt = new Map<string, number[]>();
  for (const w of Object.values(plan.walls)) {
    for (const n of [w.a, w.b]) {
      if (!heightsAt.has(n)) heightsAt.set(n, []);
      heightsAt.get(n)!.push(w.height);
    }
  }
  const lowestNeighbour = (nodeId: string, own: number, deg: number) => {
    if (deg <= 1) return 0;
    const hs = [...heightsAt.get(nodeId)!];
    hs.splice(hs.indexOf(own), 1);
    return Math.min(...hs);
  };

  for (const w of Object.values(plan.walls)) {
    const fp = fps.get(w.id);
    if (!fp) continue;
    const ops = openingsOf(plan, w.id);
    const where = sidesOf.get(w.id) ?? { left: 'outside', right: 'outside' };
    const left = w.faces?.left ?? finishes[where.left];
    const right = w.faces?.right ?? finishes[where.right];
    // Reveals and exposed ends take the outside finish (stone through the thickness of a stone wall).
    const edge = where.left === 'outside' ? left : where.right === 'outside' ? right : left;
    buildWall(faces.get(left), faces.get(right), faces.get(edge), tops, fp, ops);
    const mid = wallPoint(fp, fp.length / 2, 0);
    endCap(faces.get(edge), fp, 'a', lowestNeighbour(w.a, w.height, fp.degA), mid);
    endCap(faces.get(edge), fp, 'b', lowestNeighbour(w.b, w.height, fp.degB), mid);
    for (const o of ops) group.add(buildOpeningObject(fp, o, mats));
  }


  const floors = new MeshSet<FloorFinish>();
  const ceilings = new Mesher();
  const floorHoles = opts.floorHoles ?? [];
  const ceilingHoles = opts.ceilingHoles ?? [];
  const defaults = { ...DEFAULT_MATERIALS, ...finishes };
  for (const r of detectRooms(plan)) {
    const set = ((plan as Level).floorFinishes ?? []).filter((f) => pointInPolygon(f, r.polygon)).at(-1);
    const floor = floors.get(set?.finish ?? defaults.floor);
    // Slightly above the level's datum so it never fights with wall tops of the floor below.
    for (const piece of subtract(r.polygon, floorHoles)) floor.hshape(piece, 0.005, true);
    if (opts.ceiling !== null) {
      for (const piece of subtract(r.polygon, ceilingHoles)) ceilings.hshape(piece, opts.ceiling - 0.001, false);
    }
  }
  // Guard rails around stairwells, except along walls and where the stair arrives.
  const guards: RailLine[] = [];
  for (const well of floorHoles) {
    const ring = well[0];
    ring.forEach((a, k) => {
      const b = ring[(k + 1) % ring.length];
      if ((opts.wellExits ?? []).some((e) => onSegment(e, a, b))) return;
      if (againstWall(a, b, [...fps.values()])) return;
      guards.push({ points: [{ p: a, z: 0 }, { p: b, z: 0 }], baseAt: () => 0 });
    });
  }
  if (guards.length) group.add(buildRails(guards, [...fps.values()], mats.door, mats.frame));

  // The cut edges of the floor around a stairwell coming up from below.
  const slab = opts.slab ?? 0;
  for (const well of floorHoles) {
    for (const ring of well) {
      ring.forEach((p, k) => faces.get(finishes.inside).vface(p, ring[(k + 1) % ring.length], -slab, 0.005, new THREE.Vector3(0, 0, 0)));
    }
  }

  const wells = (opts.rooflights ?? []).filter((r) => r.kind === 'kerb').map((r) => r.footprint);
  // Windows lying in a slope get their openings cut through the roof, so a vaulted room
  // (or the loft) sees the sky through them.
  const slopeHoles = (opts.rooflights ?? []).filter((r) => r.kind === 'slope').flatMap((r) => r.windows.map((w) => w.frame.map((p) => ({ x: p.x, y: p.y }))));
  for (const r of opts.roofs ?? []) group.add(buildRoofObject(r, mats, wells, slopeHoles, wallMaterial(finishes.outside)));
  if (opts.rooflights?.length) group.add(buildRooflights(opts.rooflights, opts.ceiling ?? 0, mats));
  for (const c of opts.chimneys ?? []) group.add(buildChimney(c, mats));
  if (opts.solar?.length) group.add(buildSolar(opts.solar, mats));
  for (const q of opts.pillars ?? []) {
    const geo =
      q.shape === 'round'
        ? new THREE.CylinderGeometry(q.size / 2, q.size / 2, q.height, 24)
        : new THREE.BoxGeometry(q.size, q.height, q.size);
    const m = new THREE.Mesh(geo, mats.frame);
    m.position.set(q.x, q.height / 2, q.y);
    m.castShadow = m.receiveShadow = true;
    m.name = `pillar:${q.id}`;
    group.add(m);
  }

  if (opts.patios?.length) group.add(buildPatios(opts.patios, mats, wallMaterial(finishes.outside), opts.ground ?? 0, opts.house ?? []));
  // Railings round patios that have one: round a pool at the outside of its coping, at the
  // ground; round a raised terrace at its edge, on its top.
  for (const style of ['glass', 'iron', 'timber'] as const) {
    const lines: RailLine[] = [];
    for (const { patio, shapes } of opts.patios ?? []) {
      if (patio.guard !== style) continue;
      const pool = patio.surface === 'pool';
      const z = pool || patio.height < (opts.ground ?? 0) ? (opts.ground ?? 0) + (pool ? 0.03 : 0) : patio.height;
      for (const shape of shapes) {
        let ring = shape[0];
        if (polygonArea(ring) < 0) ring = [...ring].reverse();
        if (pool) ring = outsetLoop(ring, ring.map(() => POOL_COPING - 0.05));
        const pts = [...ring, ring[0]].map((p) => ({ p, z }));
        lines.push({ points: pts, baseAt: () => z });
      }
    }
    if (lines.length) group.add(buildRails(lines, [...fps.values(), ...(opts.nearWalls ?? [])], mats.door, mats.frame, style, mats.glass));
  }
  for (const t of opts.trees ?? []) group.add(buildTree(t, mats, opts.season ?? { leaf: 1, autumn: false }, opts.north ?? 0));
  for (const { hedge, runs } of opts.hedges ?? []) group.add(buildHedge(hedge, runs, opts.season ?? { leaf: 1, autumn: false }));
  for (const f of opts.furniture ?? []) {
    const obj = buildFurniture(f);
    // Just above the floor, so a piece never fights with it.
    obj.position.set(f.x, f.base + 0.006, f.y);
    obj.rotation.y = -f.angle;
    group.add(obj);
  }

  for (const [finish, m] of faces.entries()) {
    const wallMesh = new THREE.Mesh(m.geometry(), wallMaterial(finish));
    wallMesh.castShadow = wallMesh.receiveShadow = true;
    wallMesh.name = 'walls';
    group.add(wallMesh);
  }
  const topMesh = new THREE.Mesh(tops.geometry(), mats.wallTop);
  topMesh.castShadow = true;
  group.add(topMesh);

  // Stairs: each step solid down to the floor, with a timber tread on top; or all stone; or
  // stone treads cantilevered from the wall, each a slab with nothing under it.
  if (opts.stairs?.length) {
    const treadTops = new Mesher();
    const stringers = new Mesher();
    const stone = new Mesher();
    const SLAB = 0.07;
    for (const g of opts.stairs) {
      const isStone = g.style === 'stone' || g.style === 'cantilever';
      const tops = isStone ? stone : treadTops;
      const sides = isStone ? stone : stringers;
      for (const t of g.treads) {
        tops.hpoly(t.poly, t.top, true);
        const bottom = g.style === 'cantilever' ? t.top - SLAB : 0;
        if (g.style === 'cantilever') stone.hpoly(t.poly, bottom, false);
        const c = t.poly.reduce((acc, p) => ({ x: acc.x + p.x / t.poly.length, y: acc.y + p.y / t.poly.length }), { x: 0, y: 0 });
        t.poly.forEach((p, k) => {
          const q = t.poly[(k + 1) % t.poly.length];
          const nrm = { x: q.y - p.y, y: p.x - q.x };
          const mid = { x: (p.x + q.x) / 2 - c.x, y: (p.y + q.y) / 2 - c.y };
          const out = dot(nrm, mid) >= 0 ? n3(nrm) : n3(nrm, -1);
          sides.vface(p, q, bottom, t.top, out);
        });
      }
    }
    const stairMesh = new THREE.Mesh(stringers.geometry(), wallMaterial(finishes.inside));
    stairMesh.castShadow = stairMesh.receiveShadow = true;
    const treadMesh = new THREE.Mesh(treadTops.geometry(), mats.floor);
    treadMesh.castShadow = treadMesh.receiveShadow = true;
    const stoneMesh = new THREE.Mesh(stone.geometry(), wallMaterial('stone'));
    stoneMesh.castShadow = stoneMesh.receiveShadow = true;
    stairMesh.name = 'stairs';
    group.add(stairMesh, treadMesh, stoneMesh);

    // Handrails up both sides of every stair (balusters only where the side is open), in
    // each stair's style.
    for (const style of ['timber', 'iron', 'glass'] as const) {
      const ofStyle = opts.stairs.filter((g) => (g.rail ?? 'timber') === style);
      if (!ofStyle.length) continue;
      const lines: RailLine[] = ofStyle.flatMap((g) =>
        g.rails.map((points) => ({
        points,
        baseAt: (p: Vec2, pitch: number) => {
          // The tread under the rail: look just either side of the stair's edge.
          let top: number | null = null;
          for (const dx of [-0.03, 0.03]) {
            for (const dy of [-0.03, 0.03]) {
              const z = stairSurfaceAt(g, { x: p.x + dx, y: p.y + dy });
              if (z !== null && (top === null || z > top)) top = z;
            }
          }
          return top ?? pitch - g.rise;
        },
      })),
      );
      group.add(buildRails(lines, [...fps.values(), ...(opts.nearWalls ?? [])], mats.door, mats.frame, style, mats.glass));
    }
  }
  if (opts.ceiling !== null) {
    const ceilingMesh = new THREE.Mesh(ceilings.geometry(), mats.ceiling);
    ceilingMesh.castShadow = true;
    ceilingMesh.name = 'ceilings';
    group.add(ceilingMesh);
  }
  for (const [finish, m] of floors.entries()) {
    const floorMesh = new THREE.Mesh(m.geometry(), floorMaterial(finish));
    floorMesh.receiveShadow = floorMesh.castShadow = true;
    floorMesh.name = 'floors';
    group.add(floorMesh);
  }
  return group;
}

/**
 * Patios: a textured top, with the pattern turned to the patio's direction, and edges down
 * to the ground (the level's floor): stone for paving and gravel, a timber fascia for decks.
 */
/**
 * Patios, decks and the rest, with their sides: a raised one more than a step high (a
 * plinth) has sides in the outside wall finish; a sunken one (its top below the ground) has
 * retaining walls round it in that finish, from its floor up to the ground, except along the
 * house, whose own wall is there. `ground` is the ground's height in this floor's terms.
 */
function buildPatios(
  list: { patio: Patio; shapes: Shape[] }[],
  mats: Materials,
  outside: THREE.Material = mats.paveEdge,
  ground = 0,
  house: Vec2[][] = [],
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'patios';
  const alongHouse = (p: Vec2, q: Vec2) => {
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    return house.some((ring) => ring.some((a, k) => projectOnSegment(m, a, ring[(k + 1) % ring.length]).dist < 0.03));
  };
  for (const { patio, shapes } of list) {
    const sunk = patio.height < ground - 0.005;
    const plinth = patio.height > ground + 0.25;
    const period = patioPeriod(patio);
    const along = { x: Math.cos(patio.angle), y: Math.sin(patio.angle) };
    const across = { x: -along.y, y: along.x };
    const pos: number[] = [];
    const uv: number[] = [];
    const edges = new Mesher();
    const z = patio.height;
    for (const shape of shapes) {
      const [outer, ...holes] = shape;
      const all = shape.flat();
      const tris = THREE.ShapeUtils.triangulateShape(
        outer.map((p) => new THREE.Vector2(p.x, p.y)),
        holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.y))),
      );
      for (const t of tris) {
        const [a, b, c] = t.map((k) => all[k]);
        // Facing up: in plan (x, y) -> world (x, z), that is clockwise seen from +y.
        const ccw = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
        for (const p of ccw ? [a, c, b] : [a, b, c]) {
          pos.push(p.x, z, p.y);
          uv.push(dot(p, along) / period.along, dot(p, across) / period.across);
        }
      }
      for (const ring of shape) {
        const inside = ring === outer ? 1 : -1;
        const ccw = polygonSign(ring) * inside;
        ring.forEach((p, k) => {
          const q = ring[(k + 1) % ring.length];
          // Outward normal of the edge p->q, for a ring running counter-clockwise.
          const out = new THREE.Vector3(q.y - p.y, 0, p.x - q.x).multiplyScalar(ccw);
          if (!sunk) edges.vface(p, q, ground - 0.01, z, out);
          else if (!alongHouse(p, q)) edges.vface(p, q, z, ground, out.negate());
        });
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const top = new THREE.Mesh(geo, mats[patio.surface]);
    top.receiveShadow = true;
    top.name = `patio:${patio.id}`;
    const pool = patio.surface === 'pool';
    const side = new THREE.Mesh(
      edges.geometry(),
      pool ? mats.pool : sunk || plinth ? outside : patio.surface === 'decking' ? mats.deckEdge : patio.surface === 'lawn' ? mats.lawnEdge : mats.paveEdge,
    );
    side.receiveShadow = side.castShadow = true;
    g.add(top, side);
    if (pool) {
      // The water, a little below the edge, and a stone coping round the edge.
      const water = new Mesher();
      const coping = new Mesher();
      for (const shape of shapes) {
        water.hshape(shape, ground - POOL_WATER, true);
        let ring = shape[0];
        if (polygonArea(ring) < 0) ring = [...ring].reverse();
        const outer = outsetLoop(ring, ring.map(() => POOL_COPING));
        const top = ground + 0.03;
        coping.hshape([outer, ring], top, true);
        outer.forEach((p, k) => coping.vface(p, outer[(k + 1) % outer.length], ground, top, n3({ x: outer[(k + 1) % outer.length].y - p.y, y: p.x - outer[(k + 1) % outer.length].x })));
        ring.forEach((p, k) => coping.vface(p, ring[(k + 1) % ring.length], ground - 0.02, top, n3({ x: p.y - ring[(k + 1) % ring.length].y, y: ring[(k + 1) % ring.length].x - p.x })));
      }
      const waterMesh = new THREE.Mesh(water.geometry(), mats.water);
      waterMesh.renderOrder = 1;
      const copingMesh = new THREE.Mesh(coping.geometry(), wallMaterial('stone'));
      copingMesh.castShadow = copingMesh.receiveShadow = true;
      g.add(waterMesh, copingMesh);
    }
  }
  return g;
}

/**
 * A tree. Broad-leaved: a trunk forking into branches, under a crown of leafy clumps that
 * thins in spring and autumn and is gone in winter (so its winter shadow is just twigs).
 * Conifer: a trunk under tiers of cones, the same all year.
 */
function buildTree(t: Tree, mats: Materials, season: Season, north = 0): THREE.Group {
  const g = new THREE.Group();
  g.name = `tree:${t.id}`;
  g.position.set(t.x, 0, t.y);
  // A leaning tree: the whole tree tipped over from its foot, towards the way it leans.
  if (t.lean) {
    const d = leanDirection(t, north);
    const axis = new THREE.Vector3(0, 1, 0).cross(new THREE.Vector3(d.x, 0, d.y)).normalize();
    g.quaternion.setFromAxisAngle(axis, (Math.min(45, t.lean) * Math.PI) / 180);
  }
  const r = trunkRadius(t);
  const base = crownBase(t);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const sp = speciesOf(t);
  // The two general kinds keep their own simple models; species (and bushes) are shaped here.
  if (t.kind !== 'conifer' && t.kind !== 'deciduous') {
    buildSpeciesTree(add, t, sp, season);
    return g;
  }
  if (t.kind === 'conifer') {
    add(new THREE.CylinderGeometry(r * 0.5, r, t.height * 0.9, 8), mats.bark, 0, t.height * 0.45, 0);
    const tiers = 4;
    const span = t.height - base;
    for (let i = 0; i < tiers; i++) {
      const bottom = base + (span * i) / tiers * 0.8;
      const h = span - (bottom - base);
      const radius = (t.spread / 2) * (1 - i / (tiers + 0.5));
      add(new THREE.ConeGeometry(radius, h * 0.7, 10), mats.needles, 0, bottom + h * 0.35, 0);
    }
    return g;
  }

  // Pseudo-random but fixed for this tree, so it looks the same on every rebuild.
  let seed = [...t.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const R = t.spread / 2;
  const top = t.height;
  const crownMid = (base + top) / 2;
  const Rv = (top - base) / 2;
  const fork = base + (top - base) * 0.15;
  add(new THREE.CylinderGeometry(r * 0.7, r, fork, 8), mats.bark, 0, fork / 2, 0);

  // Main branches from the fork out towards the crown, each with two twigs.
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = add(new THREE.CylinderGeometry(r1, r0, d.length(), 6), mats.bark, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  };
  const n = 5;
  const forkPt = new THREE.Vector3(0, fork, 0);
  for (let i = 0; i < n; i++) {
    const a = ((i + rand() * 0.6) / n) * Math.PI * 2;
    const end = new THREE.Vector3(Math.cos(a) * R * 0.6, crownMid + Rv * (0.2 + rand() * 0.4), Math.sin(a) * R * 0.6);
    limb(forkPt, end, r * 0.6, r * 0.25);
    for (let k = 0; k < 2; k++) {
      const b = a + (k ? 0.5 : -0.5) + (rand() - 0.5) * 0.3;
      const tip = new THREE.Vector3(Math.cos(b) * R * 0.95, end.y + Rv * (0.2 + rand() * 0.45), Math.sin(b) * R * 0.95);
      limb(end, tip, r * 0.25, r * 0.08);
    }
  }

  if (season.leaf > 0.05) {
    // Clumps of leaves: one in the middle and a ring round it, in an ellipsoid the crown's size.
    const mat = season.autumn ? mats.autumn : mats.leaves;
    const s = 0.45 + 0.55 * season.leaf;
    const clump = (x: number, y: number, z: number, size: number) => {
      const m = add(new THREE.IcosahedronGeometry(size * s, 1), mat, x, y, z);
      m.scale.set(1, Rv / R, 1);
    };
    clump(0, crownMid, 0, R * 0.62);
    const ring = 7;
    for (let i = 0; i < ring; i++) {
      const a = ((i + rand() * 0.5) / ring) * Math.PI * 2;
      const up = (rand() - 0.35) * Rv * 0.8;
      clump(Math.cos(a) * R * 0.52, crownMid + up, Math.sin(a) * R * 0.52, R * (0.4 + rand() * 0.1));
    }
    clump(0, crownMid + Rv * 0.5, 0, R * 0.45);
  }
  return g;
}

/** One material per colour for bark and foliage, shared by every tree. */
const treeMats = new Map<string, THREE.MeshStandardMaterial>();
function treeMat(color: number, flat: boolean): THREE.MeshStandardMaterial {
  const key = `${color}-${flat}`;
  let m = treeMats.get(key);
  if (!m) treeMats.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: flat })));
  return m;
}

type AddFn = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => THREE.Mesh;

/**
 * A tree of a particular species (or a bush), from a few shapes: the trunk or stems and
 * branches in its bark, and clumps of foliage making up its crown's outline, sized and
 * coloured for the season. Bare in winter unless evergreen.
 */
function buildSpeciesTree(add: AddFn, t: Tree, sp: Species, season: Season) {
  let seed = [...t.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 11) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const bark = treeMat(sp.bark, false);
  const r = trunkRadius(t);
  const H = t.height;
  const R = t.spread / 2;
  const base = crownBase(t);
  const leaf = sp.evergreen ? 1 : season.leaf;
  const foliage = treeMat(sp.evergreen || !season.autumn ? sp.leaf : sp.autumn, true);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, m: THREE.Material = bark) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const mesh = add(new THREE.CylinderGeometry(r1, r0, d.length(), 6), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  };
  /** A clump of foliage, squashed by `sy` up and down; smaller as the leaves come and go. */
  const s = 0.4 + 0.6 * leaf;
  const clump = (x: number, y: number, z: number, size: number, sy = 1) => {
    if (leaf < 0.05) return;
    const m = add(new THREE.IcosahedronGeometry(size * s * (0.9 + rand() * 0.2), 1), foliage, x, y, z);
    m.scale.set(1, sy, 1);
    m.rotation.y = rand() * Math.PI;
  };
  /** Clumps filling an ellipsoid (centre cy, radii R across and Rv up), `n` of them. */
  const fill = (cy: number, Rh: number, Rv: number, n: number, size: number, flatBottom = 0) => {
    for (let i = 0; i < n; i++) {
      // Spread evenly over the ellipsoid (a spiral), pushed out towards its surface.
      const k = (i + 0.5) / n;
      const phi = Math.acos(1 - 2 * k);
      const theta = i * 2.39996 + rand() * 0.4;
      const out = 0.55 + rand() * 0.25;
      let y = Math.cos(phi) * Rv * out;
      if (y < -Rv * (1 - flatBottom)) y = -Rv * (1 - flatBottom);
      clump(Math.sin(phi) * Math.cos(theta) * Rh * out, cy + y, Math.sin(phi) * Math.sin(theta) * Rh * out, size);
    }
  };
  const dens = sp.density;
  const count = (n: number) => Math.max(3, Math.round(n * dens));

  switch (sp.shape) {
    case 'spreading':
    case 'dome':
    case 'oval':
    case 'narrow': {
      const wide = sp.shape === 'spreading';
      const Rv = (H - base) / 2;
      const cy = base + Rv;
      // Trunk to where it divides, then main limbs out and up into the crown.
      const fork = base + Rv * (wide ? 0.1 : 0.35);
      limb(V(0, 0, 0), V(0, fork, 0), r, r * 0.7);
      const limbs = wide ? 6 : sp.shape === 'narrow' ? 4 : 5;
      for (let i = 0; i < limbs; i++) {
        const a = ((i + rand() * 0.6) / limbs) * Math.PI * 2;
        const reach = wide ? 0.75 : sp.shape === 'narrow' ? 0.4 : 0.55;
        const end = V(Math.cos(a) * R * reach, cy + Rv * (wide ? -0.1 + rand() * 0.3 : 0.1 + rand() * 0.4), Math.sin(a) * R * reach);
        limb(V(0, fork, 0), end, r * 0.55, r * 0.2);
        for (let k = 0; k < 2; k++) {
          const b = a + (k ? 0.5 : -0.5) + (rand() - 0.5) * 0.3;
          limb(end, V(Math.cos(b) * R * 0.92, end.y + Rv * (0.15 + rand() * 0.4), Math.sin(b) * R * 0.92), r * 0.2, r * 0.06);
        }
      }
      if (sp.shape === 'narrow') {
        // Birch: the leader carries on up the middle.
        limb(V(0, fork, 0), V(0, H * 0.97, 0), r * 0.6, r * 0.12);
      }
      const size = sp.shape === 'narrow' ? R * 0.42 : wide ? R * 0.38 : R * 0.45;
      fill(cy, R * (wide ? 0.95 : 0.9), Rv * (wide ? 0.85 : 0.9), count(wide ? 26 : 18), size, wide ? 0.35 : 0);
      if (sp.berries && season.autumn && leaf > 0.2) {
        const berry = treeMat(sp.berries, false);
        for (let i = 0; i < 26; i++) {
          const a = rand() * Math.PI * 2;
          const y = cy + (rand() - 0.3) * Rv * 1.2;
          const rr = R * (0.75 + rand() * 0.2) * Math.sqrt(Math.max(0.1, 1 - ((y - cy) / Rv) ** 2));
          add(new THREE.IcosahedronGeometry(0.09, 0), berry, Math.cos(a) * rr, y, Math.sin(a) * rr);
        }
      }
      break;
    }
    case 'column': {
      // Lombardy poplar: a trunk up the middle, branches swept steeply up close to it, and
      // a tall narrow column of foliage tapering to a point.
      limb(V(0, 0, 0), V(0, H * 0.96, 0), r, r * 0.15);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996 + rand() * 0.4;
        const y0 = base + (H - base) * (i / n) * 0.85;
        const reach = R * 0.55 * (1 - (i / n) * 0.6);
        limb(V(0, y0, 0), V(Math.cos(a) * reach, y0 + (H - base) * 0.18, Math.sin(a) * reach), r * 0.25, r * 0.06);
      }
      const layers = count(20);
      for (let i = 0; i < layers; i++) {
        const k = i / (layers - 1);
        const y = base + 0.4 + (H - base - 1.2) * k;
        // Widest a third of the way up, tapering to a blunt point at the top.
        const w = R * (k < 0.3 ? 0.8 + 0.67 * k : 1 - (k - 0.3) * 0.85);
        for (let j = 0; j < 3; j++) {
          const a = rand() * Math.PI * 2;
          clump(Math.cos(a) * w * 0.3, y, Math.sin(a) * w * 0.3, Math.max(0.45, w * 0.72), 1.6);
        }
      }
      break;
    }
    case 'multistem': {
      // Hazel: several stems from the ground, fanning out, with a rounded crown over them.
      const stems = 7;
      for (let i = 0; i < stems; i++) {
        const a = (i / stems) * Math.PI * 2 + rand() * 0.5;
        const foot = V(Math.cos(a) * R * 0.08, 0, Math.sin(a) * R * 0.08);
        const top = V(Math.cos(a) * R * (0.5 + rand() * 0.25), H * (0.8 + rand() * 0.18), Math.sin(a) * R * (0.5 + rand() * 0.25));
        limb(foot, top, r, r * 0.3);
      }
      const Rv = (H - base) / 2;
      fill(base + Rv, R * 0.95, Rv, count(20), R * 0.42, 0.2);
      break;
    }
    case 'pine': {
      // Scots pine: tall trunk, orange above, a few near-level branches, a flat-topped crown.
      const top = treeMat(sp.barkTop ?? sp.bark, false);
      limb(V(0, 0, 0), V(0, base, 0), r, r * 0.75);
      limb(V(0, base, 0), V(rand() * 0.3, H * 0.93, rand() * 0.3), r * 0.75, r * 0.3, top);
      const branches = 6;
      for (let i = 0; i < branches; i++) {
        const a = (i / branches) * Math.PI * 2 + rand() * 0.8;
        const y0 = base + (H - base) * (0.1 + 0.7 * (i / branches));
        const reach = R * (0.55 + rand() * 0.4);
        const tip = V(Math.cos(a) * reach, y0 + 0.4 + rand() * 0.8, Math.sin(a) * reach);
        limb(V(0, y0, 0), tip, r * 0.3, r * 0.1, top);
        // A flattened pad of needles at the end of each branch.
        clump(tip.x, tip.y + 0.25, tip.z, R * (0.38 + rand() * 0.12), 0.45);
      }
      clump(0, H * 0.94, 0, R * 0.5, 0.5);
      break;
    }
    case 'bush': {
      // Leaves right down to the ground: a mound of clumps. In winter, a thicket of twigs.
      if (leaf < 0.5) {
        const twigs = 14;
        for (let i = 0; i < twigs; i++) {
          const a = rand() * Math.PI * 2;
          const reach = R * (0.4 + rand() * 0.55);
          limb(V(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05), V(Math.cos(a) * reach, H * (0.6 + rand() * 0.4), Math.sin(a) * reach), Math.max(0.012, r * 0.5), 0.006);
        }
      }
      const Rv = H / 2;
      const n = count(Math.round(10 + t.spread * 4));
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n;
        const phi = Math.acos(1 - k); // upper half: a dome sitting on the ground
        const theta = i * 2.39996 + rand() * 0.5;
        const out = 0.5 + rand() * 0.3;
        const y = Math.max(Rv * 0.35, Math.cos(phi) * H * out + Rv * 0.3);
        clump(Math.sin(phi) * Math.cos(theta) * R * out, y, Math.sin(phi) * Math.sin(theta) * R * out, Math.min(R, Rv) * 0.62);
      }
      break;
    }
  }
}

/**
 * A window filling a gable triangle, in the gable's own plane (x along the wall, y up): the
 * opening (the gable less a margin, above a band over the wall plate), the glass inside a
 * slim frame, and upright glazing bars about every 80 cm. Null if the gable is too small.
 */
function gableWindow(face: Vec2[]): { opening: Vec2[]; glass: Vec2[]; bars: Vec2[][] } | null {
  const MARGIN = 0.15;
  const FRAME_W = 0.06;
  let ring = face.filter((p, i) => {
    const a = face[(i - 1 + face.length) % face.length];
    const b = face[(i + 1) % face.length];
    return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-9;
  });
  if (ring.length < 3) return null;
  if (polygonSign(ring) < 0) ring = [...ring].reverse();
  const base = Math.min(...ring.map((p) => p.y));
  const inset = insetConvex(ring, MARGIN);
  if (!inset) return null;
  // Keep clear of the wall plate: nothing lower than a band above it.
  const band: Vec2[] = [
    { x: -1e4, y: base + MARGIN + 0.05 },
    { x: 1e4, y: base + MARGIN + 0.05 },
    { x: 1e4, y: 1e4 },
    { x: -1e4, y: 1e4 },
  ];
  const opening = intersectAll(inset, band)[0]?.[0];
  if (!opening || Math.abs(polygonSign(opening) * areaOf(opening)) < 0.15) return null;
  const glass = insetConvex(polygonSign(opening) < 0 ? [...opening].reverse() : opening, FRAME_W);
  if (!glass) return null;
  // Glazing bars: upright, from the bottom of the glass to its sloping top.
  const xs = glass.map((p) => p.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const n = Math.max(0, Math.round((x1 - x0) / 0.8) - 1);
  const bars: Vec2[][] = [];
  const bottom = Math.min(...glass.map((p) => p.y));
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / (n + 1);
    const top = Math.min(topAt(glass, x - 0.02), topAt(glass, x + 0.02));
    if (top - bottom > 0.1) {
      bars.push([
        { x: x - 0.02, y: bottom },
        { x: x + 0.02, y: bottom },
        { x: x + 0.02, y: top },
        { x: x - 0.02, y: top },
      ]);
    }
  }
  return { opening, glass, bars };
}

/** A convex, counter-clockwise polygon moved inwards by d (null if it vanishes). */
function insetConvex(ring: Vec2[], d: number): Vec2[] | null {
  const n = ring.length;
  const lines = ring.map((a, i) => {
    const b = ring[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const inward = { x: -dir.y, y: dir.x };
    return { p: { x: a.x + inward.x * d, y: a.y + inward.y * d }, dir };
  });
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const den = l1.dir.x * l2.dir.y - l1.dir.y * l2.dir.x;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((l2.p.x - l1.p.x) * l2.dir.y - (l2.p.y - l1.p.y) * l2.dir.x) / den;
    out.push({ x: l1.p.x + l1.dir.x * t, y: l1.p.y + l1.dir.y * t });
  }
  if (out.length < 3 || polygonSign(out) < 0 || areaOf(out) < 0.01) return null;
  return out;
}

function areaOf(ring: Vec2[]): number {
  let a = 0;
  ring.forEach((p, k) => {
    const q = ring[(k + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  });
  return Math.abs(a) / 2;
}

/** The highest point of a polygon's outline at x. */
function topAt(ring: Vec2[], x: number): number {
  let top = -Infinity;
  ring.forEach((a, k) => {
    const b = ring[(k + 1) % ring.length];
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) return;
    top = Math.max(top, a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y));
  });
  return top;
}

/** +1 for a counter-clockwise ring (in plan coordinates), -1 for clockwise. */
function polygonSign(ring: Vec2[]): number {
  let a = 0;
  ring.forEach((p, k) => {
    const q = ring[(k + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  });
  return a >= 0 ? 1 : -1;
}

/**
 * Rooflights. A kerb box: sides from the ceiling below (lining the light well) up to the
 * sloping top, with the windows in it. Windows in a slope just sit on the roof.
 */
function buildRooflights(list: RooflightGeometry[], ceiling: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  g.name = 'rooflights';
  const sides = new Mesher();
  const top = new Mesher();
  const frames = new Mesher();
  const glass = new Mesher();
  const motors = new Mesher();
  const blinds = new Mesher();
  const v = (p: Point3) => new THREE.Vector3(p.x, p.z, p.y);
  const n0 = new THREE.Vector3(0, 0, 0);
  const quad = (m: Mesher, q: Point3[]) => m.quad(v(q[0]), v(q[1]), v(q[2]), v(q[3]), new THREE.Vector3(0, 1, 0));
  for (const r of list) {
    if (r.kind === 'kerb') {
      r.top.forEach((a, k) => {
        const b = r.top[(k + 1) % 4];
        sides.quad(v({ ...a, z: ceiling }), v({ ...b, z: ceiling }), v(b), v(a), n0);
      });
      // The box top, open where the windows are.
      planeWithHoles(top, r.top, r.windows.map((w) => w.frame));
    }
    for (const w of r.windows) {
      // The frame is a ring round the glass, so you can see out through it.
      planeWithHoles(frames, w.frame, [insetQuad(w.frame, 0.07)]);
      quad(glass, w.glass);
      if (w.motor) quad(motors, w.motor);
      if (w.blind) quad(blinds, w.blind);
    }
  }
  for (const [m, mat] of [
    [sides, mats.wall],
    [top, mats.flatRoof],
    [frames, mats.darkFrame],
    [glass, mats.glass],
    [motors, mats.solar],
    [blinds, mats.blind],
  ] as const) {
    if (!m.pos.length) continue;
    const mesh = new THREE.Mesh(m.geometry(), mat);
    mesh.castShadow = mat !== mats.glass;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

/** A flat quad (4 corners in order) with quad-shaped holes, triangulated in its own plane. */
function planeWithHoles(m: Mesher, outer: Point3[], holes: Point3[][]) {
  const o = outer[0];
  const e1 = { x: outer[1].x - o.x, y: outer[1].y - o.y, z: outer[1].z - o.z };
  const e2 = { x: outer[3].x - o.x, y: outer[3].y - o.y, z: outer[3].z - o.z };
  const l1 = Math.hypot(e1.x, e1.y, e1.z);
  const l2 = Math.hypot(e2.x, e2.y, e2.z);
  const local = (p: Point3) => {
    const d = { x: p.x - o.x, y: p.y - o.y, z: p.z - o.z };
    return new THREE.Vector2((d.x * e1.x + d.y * e1.y + d.z * e1.z) / l1, (d.x * e2.x + d.y * e2.y + d.z * e2.z) / l2);
  };
  const world = (q: THREE.Vector2) =>
    new THREE.Vector3(o.x + (e1.x * q.x) / l1 + (e2.x * q.y) / l2, o.z + (e1.z * q.x) / l1 + (e2.z * q.y) / l2, o.y + (e1.y * q.x) / l1 + (e2.y * q.y) / l2);
  const contour = outer.map(local);
  const holeRings = holes.map((h) => h.map(local));
  const all = [...contour, ...holeRings.flat()];
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, holeRings)) {
    m.tri(world(all[i]), world(all[j]), world(all[k]), new THREE.Vector3(0, 1, 0));
  }
}

/** A quad shrunk towards its middle by `by` along both of its sides. */
function insetQuad(q: Point3[], by: number): Point3[] {
  const lerp3 = (a: Point3, b: Point3, t: number): Point3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  const w = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y, q[1].z - q[0].z);
  const h = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y, q[3].z - q[0].z);
  const tu = by / w;
  const tv = by / h;
  const bottom = [lerp3(q[0], q[1], tu), lerp3(q[0], q[1], 1 - tu)];
  const topEdge = [lerp3(q[3], q[2], tu), lerp3(q[3], q[2], 1 - tu)];
  return [lerp3(bottom[0], topEdge[0], tv), lerp3(bottom[1], topEdge[1], tv), lerp3(bottom[1], topEdge[1], 1 - tv), lerp3(bottom[0], topEdge[0], 1 - tv)];
}

/** A brick stack with a projecting cap and terracotta pots. */
function buildChimney(c: ChimneyGeometry, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  g.name = 'chimney';
  const [a, b, , d] = c.footprint;
  const width = Math.hypot(b.x - a.x, b.y - a.y);
  const depth = Math.hypot(d.x - a.x, d.y - a.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const cx = c.footprint.reduce((s, p) => s + p.x, 0) / 4;
  const cy = c.footprint.reduce((s, p) => s + p.y, 0) / 4;
  const add = (mesh: THREE.Mesh) => {
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  };
  const stack = new THREE.Mesh(new THREE.BoxGeometry(width, c.top - c.base, depth), mats.brick);
  stack.position.set(cx, (c.base + c.top) / 2, cy);
  stack.rotation.y = -angle;
  add(stack);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.1, depth + 0.1), mats.brick);
  cap.position.set(cx, c.top + 0.05, cy);
  cap.rotation.y = -angle;
  add(cap);
  for (const p of c.pots) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.45, 16), mats.pot);
    pot.position.set(p.x, c.top + 0.1 + 0.225, p.y);
    add(pot);
  }
  return g;
}

/** Solar panels: dark glass on a thin silver frame. */
function buildSolar(arrays: SolarGeometry[], mats: Materials): THREE.Group {
  const g = new THREE.Group();
  g.name = 'solar';
  const glass = new Mesher();
  const frame = new Mesher();
  const v = (p: Point3, lift = 0) => new THREE.Vector3(p.x, p.z + lift, p.y);
  const up = new THREE.Vector3(0, 1, 0);
  for (const s of arrays) {
    for (const [p0, p1, p2, p3] of s.panels) {
      frame.quad(v(p0), v(p1), v(p2), v(p3), up);
      // Glass inset 3 cm from the frame edge, and just above it.
      const inset = (p: Point3, q: Point3, r: Point3, t: number): Point3 => ({
        x: p.x + (q.x - p.x) * t + (r.x - p.x) * t,
        y: p.y + (q.y - p.y) * t + (r.y - p.y) * t,
        z: p.z + (q.z - p.z) * t + (r.z - p.z) * t,
      });
      const k = 0.02;
      glass.quad(
        v(inset(p0, p1, p3, k), 0.01),
        v(inset(p1, p0, p2, k), 0.01),
        v(inset(p2, p3, p1, k), 0.01),
        v(inset(p3, p2, p0, k), 0.01),
        up,
      );
    }
  }
  for (const [m, mat] of [
    [frame, mats.frame],
    [glass, mats.solar],
  ] as const) {
    const mesh = new THREE.Mesh(m.geometry(), mat);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

/** Roof slopes, gable walls, fascia boards along the eaves, or a flat slab. */
function buildRoofObject(
  r: RoofGeometry & { vaulted?: boolean; glazedGables?: boolean; covering?: RoofCovering },
  mats: Materials,
  holes: Vec2[][] = [],
  slopeHoles: Vec2[][] = [],
  outside: THREE.Material = mats.wall,
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'roof';
  const covering = new Mesher();
  const lining = new Mesher();
  const gableFrames = new Mesher();
  const gableGlass = new Mesher();
  /** Plaster under a vaulted roof: just below the covering, seen from the room. */
  const LINING = 0.03;
  const flatTop = new Mesher();
  const gableWalls = new Mesher();
  const trim = new Mesher();
  const v = (p: Point3) => new THREE.Vector3(p.x, p.z, p.y);
  const up = new THREE.Vector3(0, 1, 0);
  for (const f of r.faces) {
    if (f.kind === 'gable') {
      // A vertical polygon: triangulate it in its own plane (distance along the wall, height).
      const o = f.pts[0];
      const far = f.pts.reduce((m, p) => (Math.hypot(p.x - o.x, p.y - o.y) > Math.hypot(m.x - o.x, m.y - o.y) ? p : m), o);
      const len = Math.hypot(far.x - o.x, far.y - o.y) || 1;
      const ux = (far.x - o.x) / len;
      const uy = (far.y - o.y) / len;
      const flat = f.pts.map((p) => new THREE.Vector2((p.x - o.x) * ux + (p.y - o.y) * uy, p.z));
      const glazing = r.glazedGables ? gableWindow(flat.map((q) => ({ x: q.x, y: q.y }))) : null;
      if (!glazing) {
        for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(flat, [])) {
          gableWalls.tri(v(f.pts[i]), v(f.pts[j]), v(f.pts[k]), new THREE.Vector3(0, 0, 0));
        }
        continue;
      }
      // The gable wall with the window's opening in it, then the frame, glass and glazing bars.
      const at = (q: Vec2, off = 0) => new THREE.Vector3(o.x + q.x * ux - uy * off, q.y, o.y + q.x * uy + ux * off);
      const none = new THREE.Vector3(0, 0, 0);
      const fill = (m: Mesher, outer: Vec2[], holesIn: Vec2[][], off = 0) => {
        const all = [outer, ...holesIn].flat();
        const tris = THREE.ShapeUtils.triangulateShape(
          outer.map((q) => new THREE.Vector2(q.x, q.y)),
          holesIn.map((h) => h.map((q) => new THREE.Vector2(q.x, q.y))),
        );
        for (const [i, j, k] of tris) m.tri(at(all[i], off), at(all[j], off), at(all[k], off), none);
      };
      const face = flat.map((q) => ({ x: q.x, y: q.y }));
      fill(gableWalls, face, [glazing.opening]);
      fill(gableFrames, glazing.opening, [glazing.glass]);
      fill(gableGlass, glazing.glass, []);
      for (const bar of glazing.bars) for (const off of [-0.012, 0.012]) fill(gableFrames, bar, [], off);
      continue;
    }
    if (f.kind === 'flat' && holes.some((h) => h.some((p) => pointInPolygon(p, f.pts)))) {
      // A flat roof with rooflight openings cut through it.
      const top = f.pts[0].z;
      for (const piece of subtract(f.pts, holes.map((h) => [h]))) {
        flatTop.hshape(piece, top, true);
        flatTop.hshape(piece, top - FLAT_THICKNESS, false);
      }
      continue;
    }
    if (f.kind !== 'flat' && (r.vaulted || slopeHoles.some((h) => h.some((p) => pointInPolygon(p, f.pts))))) {
      // A slope with roof-window openings cut through it, and (vaulted) its plaster lining.
      const plane = planeOf(f.pts);
      if (plane) {
        const cut = slopeHoles.filter((h) => h.some((p) => pointInPolygon(p, f.pts)));
        for (const [outer, ...inner] of cut.length ? subtract(f.pts, cut.map((h) => [h])) : [[f.pts.map((p) => ({ x: p.x, y: p.y }))]]) {
          const all = [outer, ...inner].flat();
          const tris = THREE.ShapeUtils.triangulateShape(
            outer.map((p) => new THREE.Vector2(p.x, p.y)),
            inner.map((h) => h.map((p) => new THREE.Vector2(p.x, p.y))),
          );
          for (const [i, j, k] of tris) {
            const [a, b2, c] = [all[i], all[j], all[k]];
            covering.tri(v({ ...a, z: plane(a) }), v({ ...b2, z: plane(b2) }), v({ ...c, z: plane(c) }), up);
            if (r.vaulted) {
              lining.tri(
                v({ ...a, z: plane(a) - LINING }),
                v({ ...b2, z: plane(b2) - LINING }),
                v({ ...c, z: plane(c) - LINING }),
                up.clone().negate(),
              );
            }
          }
        }
        continue;
      }
    }
    // Slopes and flat tops are never vertical, so they can be triangulated in plan.
    const tris = THREE.ShapeUtils.triangulateShape(f.pts.map((p) => new THREE.Vector2(p.x, p.y)), []);
    const m = f.kind === 'flat' ? flatTop : covering;
    for (const [i, j, k] of tris) m.tri(v(f.pts[i]), v(f.pts[j]), v(f.pts[k]), up);
    if (f.kind === 'flat') {
      const z0 = f.pts[0].z - FLAT_THICKNESS;
      for (const [i, j, k] of tris) flatTop.tri(v({ ...f.pts[i], z: z0 }), v({ ...f.pts[j], z: z0 }), v({ ...f.pts[k], z: z0 }), up.clone().negate());
    }
  }
  // Fascia: a board below each eave (the full slab edge for a flat roof).
  const flat = r.faces.some((f) => f.kind === 'flat');
  for (const [a, b] of r.eaves) trim.vface(a, b, a.z - (flat ? FLAT_THICKNESS : 0.18), a.z, new THREE.Vector3(0, 0, 0));
  // A flat roof's parapet: the wall carried up round the edge, rendered like the walls, with
  // a coping along its top.
  const parapet = new Mesher();
  const coping = new Mesher();
  if (r.parapet) {
    const { runs, z0, z1, roof } = r.parapet;
    const none = new THREE.Vector3(0, 0, 0);
    for (const { a, b, ia, ib } of runs) {
      parapet.vface(a, b, z0, z1, none);
      parapet.vface(ia, ib, roof, z1, none);
      // Square ends where a run stops short of a corner (against the roof it joins).
      parapet.vface(a, ia, roof, z1, none);
      parapet.vface(b, ib, roof, z1, none);
      coping.quad(w3(a, z1), w3(b, z1), w3(ib, z1), w3(ia, z1), up);
    }
  }
  for (const [m, mat] of [
    [covering, roofMaterial(r.covering ?? 'tiles')],
    [flatTop, mats.flatRoof],
    [gableWalls, outside],
    [trim, mats.frame],
    [lining, mats.ceiling],
    [gableFrames, mats.darkFrame],
    [gableGlass, mats.glass],
    [parapet, outside],
    [coping, mats.wallTop],
  ] as const) {
    const mesh = new THREE.Mesh(m.geometry(), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

const ARCH_STEPS = 16;

/**
 * A round-headed opening's arch: where it springs, its crown, and points round it from the
 * left springing to the right, as (distance along the wall, height). Null if it has none
 * (or is too low for a half-circle across its width).
 */
function archOf(o: Opening): { spring: number; crown: number; arc: [number, number][] } | null {
  if (o.kind !== 'open' || !o.arched) return null;
  const r = o.width / 2;
  const crown = o.sill + o.height;
  const spring = crown - r;
  if (spring < o.sill + 0.05) return null;
  const arc: [number, number][] = [];
  for (let k = 0; k <= ARCH_STEPS; k++) {
    const t = Math.PI - (k / ARCH_STEPS) * Math.PI;
    arc.push([o.offset + r * Math.cos(t), spring + r * Math.sin(t)]);
  }
  return { spring, crown, arc };
}

function buildWall(leftFace: Mesher, rightFace: Mesher, reveals: Mesher, tops: Mesher, fp: Footprint, ops: Opening[]) {
  const H = fp.height;
  const half = fp.thickness / 2;
  const left = n3(fp.n);
  const right = n3(fp.n, -1);

  // Long faces, tiled around the openings.
  for (const [v, u0, u1, out, sides] of [
    [half, fp.uL0, fp.uL1, left, leftFace],
    [-half, fp.uR0, fp.uR1, right, rightFace],
  ] as const) {
    let cursor = u0;
    for (const o of ops) {
      const lo = o.offset - o.width / 2;
      const hi = o.offset + o.width / 2;
      sides.vface(wallPoint(fp, cursor, v), wallPoint(fp, lo, v), 0, H, out);
      sides.vface(wallPoint(fp, lo, v), wallPoint(fp, hi, v), 0, o.sill, out);
      sides.vface(wallPoint(fp, lo, v), wallPoint(fp, hi, v), o.sill + o.height, H, out);
      const a = archOf(o);
      if (a) {
        // The wall filling the corners above the arch: each a curved triangle from the
        // springing up to the crown.
        const at = ([u, z]: [number, number]) => w3(wallPoint(fp, u, v), z);
        const corners: [number, number][][] = [
          [[lo, a.crown], ...a.arc.slice(0, ARCH_STEPS / 2 + 1)],
          [...a.arc.slice(ARCH_STEPS / 2), [hi, a.crown]],
        ];
        for (const half of corners) {
          const tris = THREE.ShapeUtils.triangulateShape(half.map(([u, z]) => new THREE.Vector2(u, z)), []);
          for (const [i, j, k] of tris) sides.tri(at(half[i]), at(half[j]), at(half[k]), out);
        }
      }
      cursor = hi;
    }
    sides.vface(wallPoint(fp, cursor, v), wallPoint(fp, u1, v), 0, H, out);
  }

  // Reveals: the inside surfaces of each opening, across the full wall thickness.
  const along = n3(fp.dir);
  const back = n3(fp.dir, -1);
  for (const o of ops) {
    const lo = o.offset - o.width / 2;
    const hi = o.offset + o.width / 2;
    const a = archOf(o);
    const top = a ? a.spring : o.sill + o.height;
    reveals.vface(wallPoint(fp, lo, -half), wallPoint(fp, lo, half), o.sill, top, along);
    reveals.vface(wallPoint(fp, hi, -half), wallPoint(fp, hi, half), o.sill, top, back);
    const rect = [wallPoint(fp, lo, -half), wallPoint(fp, hi, -half), wallPoint(fp, hi, half), wallPoint(fp, lo, half)];
    if (a) {
      // The underside of the arch, round through the wall's thickness.
      for (let k = 0; k < ARCH_STEPS; k++) {
        const [u0, z0] = a.arc[k];
        const [u1, z1] = a.arc[k + 1];
        const mid = Math.PI - ((k + 0.5) / ARCH_STEPS) * Math.PI;
        const inward = n3(fp.dir, -Math.cos(mid)).add(new THREE.Vector3(0, -Math.sin(mid), 0));
        reveals.quad(w3(wallPoint(fp, u0, -half), z0), w3(wallPoint(fp, u1, -half), z1), w3(wallPoint(fp, u1, half), z1), w3(wallPoint(fp, u0, half), z0), inward);
      }
    } else if (top < H - 1e-6) reveals.hpoly(rect, top, false);
    if (o.sill > 1e-6) reveals.hpoly(rect, o.sill, true);
  }

  tops.hpoly(fp.polygon, H, true);
}

/** Close a wall end that is exposed: a free end, or the part above a lower neighbour. */
function endCap(m: Mesher, fp: Footprint, end: 'a' | 'b', from: number, mid: Vec2) {
  if (from >= fp.height - 1e-6) return;
  const pts =
    end === 'a'
      ? [fp.R0, ...(fp.capA ? [fp.capA] : []), fp.L0]
      : [fp.L1, ...(fp.capB ? [fp.capB] : []), fp.R1];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const e = sub(q, p);
    let nrm = { x: -e.y, y: e.x };
    const c = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if (dot(nrm, sub(c, mid)) < 0) nrm = { x: -nrm.x, y: -nrm.y };
    m.vface(p, q, from, fp.height, n3(nrm));
  }
}

const FRAME_COLOURS: Record<FrameColour, number> = { white: 0xfafafa, anthracite: 0x3b4046, black: 0x18191b, oak: 0xb08556 };
const frameMats = new Map<FrameColour, THREE.Material>();

/** A window's or glass door's frame, in its chosen colour (the usual one if not chosen). */
function frameMaterial(o: Opening, mats: Materials): THREE.Material {
  const c = o.frameColour;
  if (!c) return o.kind === 'glazed' ? mats.darkFrame : mats.frame;
  let m = frameMats.get(c);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: FRAME_COLOURS[c], roughness: c === 'oak' ? 0.7 : 0.5, metalness: c === 'white' || c === 'oak' ? 0 : 0.3, side: THREE.DoubleSide });
    frameMats.set(c, m);
  }
  return m;
}

/** Frame, glass and door leaf, built in the wall's local frame (u along, y up, v across). */
function buildOpeningObject(fp: Footprint, o: Opening, mats: Materials): THREE.Object3D {
  const g = new THREE.Group();
  g.name = `opening:${o.id}`;
  const basis = new THREE.Matrix4().makeBasis(n3(fp.dir), new THREE.Vector3(0, 1, 0), n3(fp.n));
  basis.setPosition(fp.a.x, 0, fp.a.y);
  g.matrixAutoUpdate = false;
  g.matrix.copy(basis);

  const lo = o.offset - o.width / 2;
  const hi = o.offset + o.width / 2;
  const top = o.sill + o.height;
  const t = fp.thickness;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  // A plain opening: nothing in it (the wall's reveals, and an arch if it has one, are
  // built with the wall).
  if (o.kind === 'open') return g;
  if (o.kind === 'window') {
    const frame = frameMaterial(o, mats);
    const depth = Math.min(0.08, t);
    box(FRAME, o.height, depth, lo + FRAME / 2, o.sill + o.height / 2, 0, frame);
    box(FRAME, o.height, depth, hi - FRAME / 2, o.sill + o.height / 2, 0, frame);
    box(o.width, FRAME, depth, o.offset, top - FRAME / 2, 0, frame);
    box(o.width, FRAME, depth, o.offset, o.sill + FRAME / 2, 0, frame);
    if (o.width > 1.0) box(FRAME * 0.8, o.height, depth, o.offset, o.sill + o.height / 2, 0, frame);
    // Window board on the inside and a small sill outside.
    box(o.width + 0.1, 0.03, t / 2 + 0.04, o.offset, o.sill - 0.015, t / 4 + 0.02, mats.frame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(o.width - 2 * FRAME, o.height - 2 * FRAME), mats.glass);
    glass.position.set(o.offset, o.sill + o.height / 2, 0);
    g.add(glass);
  } else if (o.kind === 'garage') {
    // Roller door: runs in guides on the inside face, and rolls up into a casing above.
    const side = o.swingFlip ? -1 : 1; // +1: inside is the wall's left (+v) face
    const face = side * (t / 2 + 0.03);
    box(0.06, top + 0.3, 0.07, lo + 0.03, (top + 0.3) / 2, face, mats.garage);
    box(0.06, top + 0.3, 0.07, hi - 0.03, (top + 0.3) / 2, face, mats.garage);
    box(o.width + 0.2, 0.34, 0.34, o.offset, top + 0.17, side * (t / 2 + 0.17), mats.garage);
    if (!o.open) {
      const slat = 0.1;
      const n = Math.max(1, Math.round(o.height / slat));
      for (let k = 0; k < n; k++) {
        box(o.width - 0.04, (o.height / n) * 0.86, 0.025, o.offset, o.sill + (k + 0.5) * (o.height / n), face, mats.garage);
      }
    } else {
      // Rolled up: only the bottom rail shows, tucked under the casing.
      box(o.width - 0.04, 0.05, 0.04, o.offset, top - 0.03, face, mats.garage);
    }
  } else if (o.kind === 'glazed') {
    buildGlazed(g, o, t, mats);
  } else {
    // Door lining covers the reveals.
    const depth = t + 0.01;
    box(FRAME / 2, o.height, depth, lo + FRAME / 4, o.height / 2, 0, mats.frame);
    box(FRAME / 2, o.height, depth, hi - FRAME / 4, o.height / 2, 0, mats.frame);
    box(o.width, FRAME / 2, depth, o.offset, top - FRAME / 4, 0, mats.frame);
    const leafW = o.width - FRAME;
    const leafH = o.height - FRAME / 2 - 0.01;
    const leafT = 0.04;
    const hingeSign = o.hingeFlip ? -1 : 1; // +1: hinge at the low-u jamb
    const side = o.swingFlip ? -1 : 1; // +1: opens towards the wall's left (+v) face
    const pivot = new THREE.Group();
    pivot.position.set(o.hingeFlip ? hi - FRAME / 2 : lo + FRAME / 2, 0, side * (t / 2 - leafT / 2));
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, leafT), mats.door);
    leaf.position.set((hingeSign * leafW) / 2, leafH / 2 + 0.005, 0);
    leaf.castShadow = true;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.1), mats.frame);
    handle.position.set(hingeSign * (leafW - 0.08), 1.0, 0);
    pivot.add(leaf, handle);
    const openAngle = -side * hingeSign * THREE.MathUtils.degToRad(DOOR_OPEN_DEG);
    pivot.rotation.y = o.shut ? 0 : openAngle;
    // Shut doors swing open in walk mode as the walker comes up to them (see View3D).
    if (o.shut) {
      pivot.name = `door:${o.id}`;
      pivot.userData.openAngle = openAngle;
      pivot.userData.centre = wallPoint(fp, o.offset, 0);
    }
    g.add(pivot);
  }
  return g;
}

/**
 * A floor-to-ceiling glazed door in the wall's local frame (u along, y up, v across): a slim
 * outer frame, and glass leaves that swing (French), slide (one behind the other) or fold
 * back into a stack at one end (bi-fold) when shown open.
 */
function buildGlazed(g: THREE.Group, o: Opening, t: number, mats: Materials) {
  const lo = o.offset - o.width / 2;
  const hi = o.offset + o.width / 2;
  const top = o.sill + o.height;
  const F = 0.06; // outer frame
  const S = 0.05; // leaf frame (sash)
  const depth = Math.min(0.1, t);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D, mat = frameMaterial(o, mats)) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
  };
  box(F, o.height, depth, lo + F / 2, o.sill + o.height / 2, 0, g);
  box(F, o.height, depth, hi - F / 2, o.sill + o.height / 2, 0, g);
  box(o.width, F, depth, o.offset, top - F / 2, 0, g);
  box(o.width, 0.02, depth + 0.04, o.offset, o.sill + 0.01, 0, g); // threshold

  const clearW = o.width - 2 * F;
  const leafH = o.height - F - 0.02;
  /** A glass leaf, `w` wide, running from its pivot at x = 0 towards +x (or -x if `dir` is -1). */
  const leaf = (w: number, dir: number) => {
    const p = new THREE.Group();
    const cx = (dir * w) / 2;
    box(S, leafH, 0.05, dir * (S / 2), leafH / 2, 0, p);
    box(S, leafH, 0.05, dir * (w - S / 2), leafH / 2, 0, p);
    box(w, S, 0.05, cx, leafH - S / 2, 0, p);
    box(w, S * 1.4, 0.05, cx, (S * 1.4) / 2, 0, p);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * S, leafH - S * 2.4), mats.glass);
    glass.position.set(cx, S * 1.4 + (leafH - S * 2.4) / 2, 0);
    p.add(glass);
    p.position.y = o.sill + 0.02;
    g.add(p);
    return p;
  };
  const side = o.swingFlip ? -1 : 1; // which face the leaves open towards
  const style = o.style ?? 'french';
  if (style === 'french') {
    const w = clearW / 2;
    const a = o.open ? THREE.MathUtils.degToRad(85) : 0;
    const l = leaf(w, 1);
    l.position.set(lo + F, l.position.y, side * (depth / 2 - 0.025));
    l.rotation.y = -side * a;
    const r = leaf(w, -1);
    r.position.set(hi - F, r.position.y, side * (depth / 2 - 0.025));
    r.rotation.y = side * a;
  } else if (style === 'sliding') {
    // Two leaves on two tracks; open, the moving one sits behind the fixed one.
    const w = clearW / 2 + 0.03;
    const fixedAtLo = !o.hingeFlip;
    const fixed = leaf(w, 1);
    fixed.position.set(fixedAtLo ? lo + F : hi - F - w, fixed.position.y, 0.028);
    const moving = leaf(w, 1);
    const shut = fixedAtLo ? hi - F - w : lo + F;
    const open = fixedAtLo ? lo + F + 0.02 : hi - F - w - 0.02;
    moving.position.set(o.open ? open : shut, moving.position.y, -0.028);
  } else {
    // Bi-fold: n leaves; open, they fold into a stack at one end.
    const n = Math.max(2, Math.round(clearW / 0.8));
    const w = clearW / n;
    const atLo = !o.hingeFlip;
    for (let k = 0; k < n; k++) {
      const dir = atLo ? 1 : -1;
      if (!o.open) {
        const l = leaf(w, dir);
        l.position.set(atLo ? lo + F + k * w : hi - F - k * w, l.position.y, 0);
      } else {
        const l = leaf(w, 1);
        const u = atLo ? lo + F + 0.03 + k * 0.06 : hi - F - 0.03 - k * 0.06;
        l.position.set(u, l.position.y, side * (depth / 2));
        l.rotation.y = -side * (Math.PI / 2);
      }
    }
  }
}

export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
    // An instanced mesh (fence boards) has its own buffers besides its geometry.
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}
