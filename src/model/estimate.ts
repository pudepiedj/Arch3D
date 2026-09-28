// A rough bill of quantities from the drawing, with rough prices: enough to judge whether
// something is affordable, not to order from or to build to. Structural sizes are first
// guesses by the usual hand methods (a structural engineer must design the real thing).
//
// Everything is measured from the model: wall lengths and heights less their openings, the
// true areas of the roof slopes, rooms' floor areas, and so on. Where the drawing doesn't say
// (how the walls are built, what the roof is covered with) the assumptions say.

import { levelAbove } from './building';
import { type Vec2, dist } from './geom';
import { computeFootprints, wallPoint } from './joints';
import { levelRoofs, type Point3 } from './roof';
import { rooflightGeometry } from './roofitems';
import { pillarHeight } from './pillars';
import { patioArea } from './patios';
import { detectRooms } from './rooms';
import { hedgeLength } from './hedges';
import { isGate } from './gates';
import { pipeLength } from './drains';
import type { Extent } from './print';
import type { Building, Opening } from './types';

export type WallBuild = 'cavity' | 'block';
export type Covering = 'plain' | 'interlocking' | 'slate';

export interface Assumptions {
  /** Outside walls: brick and block cavity walls, or rendered block. */
  wall: WallBuild;
  covering: Covering;
  /** Underfloor heating in the new floors (with a screed over it). */
  ufh: boolean;
  /** Depth of the trench-fill foundations (m). */
  foundationDepth: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = { wall: 'cavity', covering: 'interlocking', ufh: true, foundationDepth: 1.0 };

export type Group = 'Structure' | 'Glazing, doors and windows' | 'Foundations and floor' | 'Walls' | 'Roof' | 'Garden and drains';
export const GROUPS: Group[] = ['Structure', 'Glazing, doors and windows', 'Foundations and floor', 'Walls', 'Roof', 'Garden and drains'];

export interface Line {
  /** Stable key for this line (to leave it out). */
  id: string;
  /** Key for its unit price (lines of a kind share one, e.g. all steel by the kg). */
  price: string;
  group: Group;
  item: string;
  /** How it was worked out, or its size. */
  detail?: string;
  qty: number;
  unit: string;
  /** One of the big-ticket items. */
  key?: boolean;
}

/** Rough supply prices, UK, 2025, materials only and before VAT (£ per unit). Change them freely. */
export const DEFAULT_PRICES: Record<string, number> = {
  steel: 4.5, // £/kg supplied, cut and drilled
  padstone: 45,
  'glazed-sliding': 1300, // £/m²
  'glazed-bifold': 1200,
  'glazed-french': 900,
  window: 450,
  'door-ext': 850,
  'door-int': 160,
  garage: 1600,
  'gable-glazing': 1200,
  velux: 480,
  'velux-flashing': 130,
  'velux-trim': 60,
  lintel: 55, // £/m
  'trench-concrete': 140, // £/m³
  excavation: 60, // £/m³ dug and taken away
  hardcore: 45,
  dpm: 1.5,
  'floor-insulation': 18,
  'slab-concrete': 140,
  screed: 160,
  ufh: 35,
  'floor-finish': 40,
  bricks: 0.8, // each
  blocks: 2.2,
  'cavity-insulation': 15,
  ties: 0.3,
  render: 25,
  plasterboard: 15,
  partition: 45,
  'tiles-plain': 0.6,
  'tiles-interlocking': 1.6,
  'tiles-slate': 3,
  membrane: 2,
  battens: 1,
  rafter: 7, // £/m
  ridge: 30,
  valley: 45, // GRP valley trough and fixings, £/m
  fascia: 35, // fascia, soffit and gutter, £/m
  downpipe: 45,
  'roof-insulation': 28,
  'roof-lining': 15,
  'flat-roof': 65,
  coping: 40,
  paving: 35,
  decking: 60,
  gravel: 12,
  'sub-base': 45,
  fence: 45,
  hedge: 4,
  'gate-5bar': 380,
  'gate-path': 220,
  pipe: 12,
  chamber: 260,
  soakaway: 450,
  treatment: 5500,
};

// ---------------------------------------------------------------- steel beams

/** Universal beams: mass (kg/m), second moment of area Iy (cm⁴), plastic modulus Wpl,y (cm³). */
export const UB: { name: string; mass: number; I: number; W: number }[] = [
  { name: '127×76 UB 13', mass: 13, I: 473, W: 84 },
  { name: '152×89 UB 16', mass: 16, I: 834, W: 123 },
  { name: '178×102 UB 19', mass: 19, I: 1356, W: 171 },
  { name: '203×102 UB 23', mass: 23, I: 2105, W: 234 },
  { name: '203×133 UB 25', mass: 25, I: 2340, W: 258 },
  { name: '203×133 UB 30', mass: 30, I: 2896, W: 314 },
  { name: '254×146 UB 31', mass: 31, I: 4413, W: 393 },
  { name: '254×146 UB 37', mass: 37, I: 5537, W: 483 },
  { name: '305×165 UB 40', mass: 40, I: 8503, W: 623 },
  { name: '305×165 UB 46', mass: 46, I: 9899, W: 720 },
  { name: '356×171 UB 45', mass: 45, I: 12070, W: 775 },
  { name: '356×171 UB 57', mass: 57, I: 16040, W: 1010 },
  { name: '406×178 UB 60', mass: 60, I: 21600, W: 1200 },
  { name: '457×191 UB 67', mass: 67, I: 29380, W: 1470 },
];

/**
 * The lightest universal beam for a simply supported span `L` (m) carrying `g` and `q`
 * (kN/m, dead and imposed, spread evenly) plus, optionally, a point load `P` (kN, dead
 * and imposed parts) at the middle: bending at the ultimate limit state (1.35 G + 1.5 Q,
 * S275 steel, the compression flange held by what it carries) and deflection under the
 * working load within span/360.
 */
export function sizeBeam(L: number, g: number, q: number, P: { g: number; q: number } = { g: 0, q: 0 }) {
  const wu = 1.35 * g + 1.5 * q;
  const Pu = 1.35 * P.g + 1.5 * P.q;
  const M = (wu * L * L) / 8 + (Pu * L) / 4; // kNm
  const Wreq = (M * 1e3) / 275; // cm³ (kNm → N mm / (N/mm²) → mm³ / 1000)
  const ws = g + q;
  const Ps = P.g + P.q;
  const E = 210; // kN/mm²
  const Lmm = L * 1000;
  // Deflection (mm) of a section with I (cm⁴): 5wL⁴/384EI + PL³/48EI.
  const defl = (I: number) => (5 * ws * Lmm ** 4) / (384 * E * 1e3 * I * 1e4) + (Ps * 1e3 * Lmm ** 3) / (48 * E * 1e3 * I * 1e4);
  const beam = UB.find((s) => s.W >= Wreq && defl(s.I) <= Lmm / 360) ?? null;
  return { beam, M, Wreq };
}

/** Rafter depth (C24, 47 mm wide, at 400 mm centres) for a horizontal span, from the usual span tables. */
export function rafterSize(span: number): string {
  const table: [number, string][] = [
    [2.4, '47×100'],
    [3.0, '47×125'],
    [3.6, '47×150'],
    [4.2, '47×175'],
    [4.8, '47×200'],
    [5.4, '47×225'],
  ];
  return (table.find(([s]) => span <= s) ?? table[table.length - 1])[1];
}

/** The nearest standard Velux size code (width letter, height number) for a window's size in metres. */
export function veluxCode(width: number, length: number): string {
  const widths: [string, number][] = [['C', 0.55], ['F', 0.66], ['M', 0.78], ['P', 0.94], ['S', 1.14], ['U', 1.34]];
  const heights: [string, number][] = [['02', 0.78], ['04', 0.98], ['06', 1.18], ['08', 1.4], ['10', 1.6]];
  const near = <T>(list: [T, number][], v: number) => list.reduce((a, b) => (Math.abs(b[1] - v) < Math.abs(a[1] - v) ? b : a))[0];
  return `${near(widths, width)}K${near(heights, length)}`;
}

// ---------------------------------------------------------------- loads

/** Pitched roof: tiles, battens, membrane and rafters on the slope (kN/m²), and a lined vault. */
const ROOF_DEAD: Record<Covering, number> = { plain: 0.85, interlocking: 0.65, slate: 0.75 };
const VAULT_LINING = 0.3;
/** Snow, or the imposed roof load, whichever is more (kN/m² on plan). */
const ROOF_IMPOSED = 0.75;
const FLAT_DEAD = 0.7;
/** A cavity wall (kN/m² of face) carried over an opening; glazing in a gable. */
const WALL_DEAD = 4.0;
const GLAZING_DEAD = 0.5;

// ---------------------------------------------------------------- the estimate

const area3d = (pts: Point3[]) => {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    x += a.y * b.z - a.z * b.y;
    y += a.z * b.x - a.x * b.z;
    z += a.x * b.y - a.y * b.x;
  }
  return Math.hypot(x, y, z) / 2;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The bill of quantities for the whole building, or for what lies within a plan area (the
 * extension, say: things whose middle is in it).
 */
export function estimate(b: Building, area: Extent | null, a: Assumptions = DEFAULT_ASSUMPTIONS): Line[] {
  const inside = (p: Vec2) => !area || (p.x >= area.x0 - 0.05 && p.x <= area.x1 + 0.05 && p.y >= area.y0 - 0.05 && p.y <= area.y1 + 0.05);
  const lines: Line[] = [];
  const add = (l: Line) => {
    if (l.qty > 1e-6) lines.push({ ...l, qty: r2(l.qty) });
  };

  b.levels.forEach((level, li) => {
    const ground = li === 0;
    const fps = computeFootprints(level);
    const roofs = levelRoofs(b, level);
    // For an area, only the floors that have a room or a roof in it (not the upper floor of
    // the house whose wall the extension is built against).
    if (area) {
      const room = detectRooms(level).some((r) => inside(r.centroid));
      const roof = roofs.some((r) => r.geometry?.faces.some((f) => f.kind !== 'gable' && inside(centroid(f.pts))));
      if (!room && !roof) return;
    }
    const above = levelAbove(b, level.id);

    // ---- The roofs over this floor, and what they put on the walls under them.
    /** For a point on a wall's outside face: the roof edge over it, and its load per metre. */
    const edgeLoad = (p: Vec2): { g: number; q: number; how: string } | null => {
      for (const r of roofs) {
        if (!r.geometry) continue;
        const ring = r.ring;
        for (let i = 0; i < ring.length; i++) {
          const e0 = ring[i];
          const e1 = ring[(i + 1) % ring.length];
          const len = dist(e0, e1);
          if (len < 1e-6) continue;
          const t = ((p.x - e0.x) * (e1.x - e0.x) + (p.y - e0.y) * (e1.y - e0.y)) / (len * len);
          if (t < -0.02 || t > 1.02) continue;
          const off = Math.abs((p.x - e0.x) * (e1.y - e0.y) - (p.y - e0.y) * (e1.x - e0.x)) / len;
          if (off > 0.4) continue;
          // How far the roof reaches in from this edge (to the far side, on plan).
          const n = { x: -(e1.y - e0.y) / len, y: (e1.x - e0.x) / len };
          const depth = Math.max(...ring.map((q) => Math.abs((q.x - e0.x) * n.x + (q.y - e0.y) * n.y)));
          const role = r.roles[i];
          const pitched = r.roof.kind === 'gable' || r.roof.kind === 'hip';
          const cos = Math.cos(((pitched ? r.roof.pitch : 0) * Math.PI) / 180) || 1;
          const dead = pitched ? (ROOF_DEAD[a.covering] + (r.roof.vaulted ? VAULT_LINING : 0)) / cos : FLAT_DEAD;
          if (role === 'eave') {
            // Rafters bearing on this wall: half their span with ceiling ties; a quarter of the
            // roof's width if the rafters bear on a structural ridge (a vault).
            const trib = (pitched ? (r.roof.vaulted ? depth / 4 : depth / 2) : depth / 2) + r.roof.overhang;
            return { g: dead * trib, q: ROOF_IMPOSED * trib, how: `${pitched ? 'rafters' : 'roof joists'} bearing on it (${trib.toFixed(1)} m of roof)` };
          }
          if (role === 'gable') {
            // A gable: a strip of roof at the verge, and the gable's own glazing or wall above.
            const rise = Math.tan(((r.roof.pitch ?? 0) * Math.PI) / 180) * (len / 2);
            const over = r.roof.glazedGables ? GLAZING_DEAD * (rise / 2) : WALL_DEAD * (rise / 2);
            return { g: dead * 0.4 + over, q: ROOF_IMPOSED * 0.4, how: `the gable above (${r.roof.glazedGables ? 'glazed' : 'wall'}) and the verge` };
          }
        }
      }
      return null;
    };

    // Ridge beams: a vaulted pitched roof has no ceiling ties, so its ridge must carry the
    // rafters' top ends. Found as the roof's highest horizontal line.
    const ridges: { a: Vec2; b: Vec2; L: number; g: number; q: number; roofId: string }[] = [];
    for (const r of roofs) {
      const g = r.geometry;
      const pitched = r.roof.kind === 'gable' || r.roof.kind === 'hip';
      if (!g || !pitched || !r.roof.vaulted) continue;
      const pts = g.faces.flatMap((f) => f.pts);
      const top = Math.max(...pts.map((p) => p.z));
      const high = pts.filter((p) => top - p.z < 1e-3);
      const atTop = (p: Vec2) => high.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < 1e-3);
      const seen = new Set<string>();
      for (const [p, q] of g.lines) {
        if (!atTop(p) || !atTop(q) || dist(p, q) < 0.3) continue;
        // The ridge is drawn once for each slope that meets it: count it once.
        const key = [p, q].map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        if (!inside(mid)) continue;
        // Each side's rafters bring half their plan span to the ridge.
        const dx = (q.x - p.x) / dist(p, q);
        const dy = (q.y - p.y) / dist(p, q);
        const reach = Math.max(...r.ring.map((v) => Math.abs((v.x - p.x) * -dy + (v.y - p.y) * dx)));
        const cos = Math.cos((r.roof.pitch * Math.PI) / 180) || 1;
        const dead = (ROOF_DEAD[a.covering] + VAULT_LINING) / cos;
        ridges.push({ a: p, b: q, L: dist(p, q), g: dead * reach, q: ROOF_IMPOSED * reach, roofId: r.id });
      }
    }
    for (const [i, rg] of ridges.entries()) {
      const L = rg.L + 0.2;
      const { beam } = sizeBeam(L, rg.g, rg.q);
      const kg = beam ? beam.mass * L : 0;
      add({
        id: `ridge:${level.id}:${rg.roofId}:${i}`,
        price: 'steel',
        group: 'Structure',
        item: `Steel ridge beam, ${L.toFixed(2)} m`,
        detail: beam
          ? `${beam.name}: carries the top of the rafters of the vaulted roof (no ceiling ties); ${Math.round(kg)} kg. Could be glulam instead.`
          : `Needs a deeper section than listed: ask an engineer (span ${L.toFixed(1)} m).`,
        qty: kg,
        unit: 'kg',
        key: true,
      });
    }

    // ---- Openings: steel beams over the wide ones and glazing, lintels over the rest.
    for (const o of Object.values(level.openings)) {
      const fp = fps.get(o.wallId);
      if (!fp) continue;
      const p = wallPoint(fp, o.offset, 0);
      if (!inside(p)) continue;
      const wall = level.walls[o.wallId];
      const outer = { x: p.x + fp.n.x * (fp.thickness / 2), y: p.y + fp.n.y * (fp.thickness / 2) };
      const inner = { x: p.x - fp.n.x * (fp.thickness / 2), y: p.y - fp.n.y * (fp.thickness / 2) };
      const load = edgeLoad(outer) ?? edgeLoad(inner);
      const over = Math.max(0, wall.height - (o.sill + o.height));
      const wide = o.kind === 'glazed' || o.kind === 'garage' || o.width > 2.4;
      if (wide) {
        const L = o.width + 0.3;
        let g = WALL_DEAD * Math.min(over, 0.6);
        let q = 0;
        let how = 'the wall over it';
        if (load) {
          g += load.g;
          q += load.q;
          how = load.how;
        } else if (above) {
          // A floor above: the wall over it, a strip of floor and what stands on it.
          g += WALL_DEAD * above.height * 0.5 + 1.2 * 2.0;
          q += 1.5 * 2.0;
          how = 'the wall and floor above';
        }
        // A ridge beam ending on this wall lands on the beam: a point load at its middle, near enough.
        let P = { g: 0, q: 0 };
        for (const rg of ridges) {
          for (const end of [rg.a, rg.b]) {
            const d = Math.hypot(end.x - p.x, end.y - p.y);
            if (d < o.width / 2 + fp.thickness) P = { g: P.g + (rg.g * rg.L) / 2, q: P.q + (rg.q * rg.L) / 2 };
          }
        }
        if (P.g) how += ', and the end of the ridge beam';
        const { beam } = sizeBeam(L, g, q, P);
        const kg = beam ? beam.mass * L : 0;
          const what = o.kind === 'glazed' ? `${o.style ?? 'French'} doors` : o.kind === 'garage' ? 'the garage door' : `a ${o.kind}`;
        add({
          id: `beam:${level.id}:${o.id}`,
          price: 'steel',
          group: 'Structure',
          item: `Steel beam over ${what}, ${L.toFixed(2)} m`,
          detail: beam
            ? `${beam.name}, ${Math.round(kg)} kg: carries ${how}.`
            : `Needs a deeper section than listed: ask an engineer.`,
          qty: kg,
          unit: 'kg',
          key: true,
        });
        add({ id: `pad:${level.id}:${o.id}`, price: 'padstone', group: 'Structure', item: 'Padstones or bearings for the beam', qty: 2, unit: 'no.' });
      } else {
        add({
          id: `lintel:${level.id}:${o.id}`,
          price: 'lintel',
          group: 'Structure',
          item: `Lintel over ${o.kind === 'door' ? 'a door' : 'a window'} (${Math.round(o.width * 100)} cm)`,
          detail: `Steel cavity lintel ${Math.ceil((o.width + 0.3) / 0.15) * 150} mm long`,
          qty: Math.ceil((o.width + 0.3) / 0.15) * 0.15,
          unit: 'm',
        });
      }

      // The openings themselves.
      const size = `${o.width.toFixed(2)} × ${o.height.toFixed(2)} m`;
      if (o.kind === 'glazed') {
        const style = o.style ?? 'french';
        add({ id: `glazed:${level.id}:${o.id}`, price: `glazed-${style}`, group: 'Glazing, doors and windows', item: `${{ french: 'French', sliding: 'Sliding', bifold: 'Bi-fold' }[style]} doors ${size}`, detail: 'Floor-to-ceiling glass doors, supply', qty: o.width * o.height, unit: 'm²', key: true });
      } else if (o.kind === 'window') {
        add({ id: `window:${level.id}:${o.id}`, price: 'window', group: 'Glazing, doors and windows', item: `Window ${size}`, qty: o.width * o.height, unit: 'm²' });
      } else if (o.kind === 'garage') {
        add({ id: `garage:${level.id}:${o.id}`, price: 'garage', group: 'Glazing, doors and windows', item: `Garage roller door ${size}`, qty: 1, unit: 'no.' });
      } else {
        const ext = fp.thickness >= 0.25;
        add({ id: `door:${level.id}:${o.id}`, price: ext ? 'door-ext' : 'door-int', group: 'Glazing, doors and windows', item: `${ext ? 'Outside' : 'Inside'} door ${size}`, qty: 1, unit: 'no.' });
      }
    }

    // ---- Posts.
    for (const pl of Object.values(level.pillars ?? {})) {
      if (!inside(pl)) continue;
      const h = pillarHeight(b, level, pl);
      const round = pl.shape === 'round';
      const mass = round ? 13.5 : 14.7; // CHS 114.3×5 / SHS 100×100×5
      add({
        id: `post:${level.id}:${pl.id}`,
        price: 'steel',
        group: 'Structure',
        item: `Steel post, ${h.toFixed(2)} m`,
        detail: `${round ? 'CHS 114.3×5' : 'SHS 100×100×5'} with base and cap plates, ${Math.round(mass * h + 8)} kg (clad as drawn)`,
        qty: mass * h + 8,
        unit: 'kg',
        key: true,
      });
      if (ground) {
        const d = a.foundationDepth;
        add({ id: `postpad:${level.id}:${pl.id}`, price: 'trench-concrete', group: 'Foundations and floor', item: 'Pad foundation under a post', detail: `0.8 × 0.8 × ${d.toFixed(1)} m`, qty: 0.64 * d, unit: 'm³' });
      }
    }

    // ---- Walls, and the foundations under the ground floor's.
    let external = 0;
    let externalLen = 0;
    let partitions = 0;
    for (const fp of fps.values()) {
      const mid = { x: (fp.a.x + fp.b.x) / 2, y: (fp.a.y + fp.b.y) / 2 };
      if (!inside(mid)) continue;
      const wall = level.walls[fp.wallId];
      const holes = Object.values(level.openings)
        .filter((o: Opening) => o.wallId === fp.wallId)
        .reduce((s, o) => s + o.width * o.height, 0);
      const net = Math.max(0, fp.length * wall.height - holes);
      if (fp.thickness >= 0.25) {
        external += net;
        externalLen += fp.length;
      } else partitions += net;
    }
    if (external > 0) {
      const lv = level.name;
      if (a.wall === 'cavity') {
        add({ id: `bricks:${level.id}`, price: 'bricks', group: 'Walls', item: `Facing bricks, ${lv}`, detail: `${external.toFixed(1)} m² of outside wall less openings, 60 a m², 5% extra`, qty: Math.ceil(external * 60 * 1.05), unit: 'no.' });
        add({ id: `blocks:${level.id}`, price: 'blocks', group: 'Walls', item: `Blocks for the inner leaf, ${lv}`, detail: '10 a m², 5% extra', qty: Math.ceil(external * 10 * 1.05), unit: 'no.' });
        add({ id: `cavity:${level.id}`, price: 'cavity-insulation', group: 'Walls', item: `Cavity insulation, ${lv}`, qty: external, unit: 'm²' });
        add({ id: `ties:${level.id}`, price: 'ties', group: 'Walls', item: `Wall ties, ${lv}`, detail: '2.5 a m²', qty: Math.ceil(external * 2.5), unit: 'no.' });
      } else {
        add({ id: `blocks:${level.id}`, price: 'blocks', group: 'Walls', item: `Blocks (both leaves), ${lv}`, detail: `${external.toFixed(1)} m² less openings, 20 a m², 5% extra`, qty: Math.ceil(external * 20 * 1.05), unit: 'no.' });
        add({ id: `render:${level.id}`, price: 'render', group: 'Walls', item: `Render, ${lv}`, qty: external, unit: 'm²' });
      }
      add({ id: `lining:${level.id}`, price: 'plasterboard', group: 'Walls', item: `Plasterboard and skim inside, ${lv}`, qty: external, unit: 'm²' });
      if (ground) {
        const d = a.foundationDepth;
        add({ id: 'trench', price: 'trench-concrete', group: 'Foundations and floor', item: 'Trench-fill foundations', detail: `${externalLen.toFixed(1)} m of outside wall, 0.6 m wide × ${d.toFixed(1)} m deep`, qty: externalLen * 0.6 * d, unit: 'm³' });
        add({ id: 'dig', price: 'excavation', group: 'Foundations and floor', item: 'Digging and taking away', detail: 'trenches and the floor dig, bulked up by a fifth', qty: (externalLen * 0.6 * d) * 1.2, unit: 'm³' });
      }
    }
    if (partitions > 0) add({ id: `partitions:${level.id}`, price: 'partition', group: 'Walls', item: `Stud partitions, boarded both sides, ${level.name}`, qty: partitions, unit: 'm²' });

    // ---- Floors: the ground floor's slab, and finishes.
    const rooms = detectRooms(level).filter((r) => inside(r.centroid));
    const floor = rooms.reduce((s, r) => s + r.area, 0);
    const net = rooms.reduce((s, r) => s + r.netArea, 0);
    if (ground && floor > 0) {
      add({ id: 'hardcore', price: 'hardcore', group: 'Foundations and floor', item: 'Hardcore under the floor', detail: `${floor.toFixed(1)} m² × 150 mm`, qty: floor * 0.15, unit: 'm³' });
      add({ id: 'dpm', price: 'dpm', group: 'Foundations and floor', item: 'Damp-proof membrane', qty: floor * 1.1, unit: 'm²' });
      add({ id: 'slab', price: 'slab-concrete', group: 'Foundations and floor', item: 'Concrete floor slab', detail: '100 mm', qty: floor * 0.1, unit: 'm³' });
      add({ id: 'floor-ins', price: 'floor-insulation', group: 'Foundations and floor', item: 'Floor insulation (PIR, 100 mm)', qty: floor, unit: 'm²' });
      if (a.ufh) {
        add({ id: 'ufh', price: 'ufh', group: 'Foundations and floor', item: 'Underfloor heating', detail: 'pipes, clips and a share of the manifold', qty: net, unit: 'm²', key: true });
        add({ id: 'screed', price: 'screed', group: 'Foundations and floor', item: 'Screed over the heating', detail: '65 mm', qty: net * 0.065, unit: 'm³' });
      }
    }
    if (net > 0) add({ id: `finish:${level.id}`, price: 'floor-finish', group: 'Foundations and floor', item: `Floor finish (tiles or boards), ${level.name}`, detail: '10% extra for cutting', qty: net * 1.1, unit: 'm²' });

    // ---- Roofs over this floor.
    for (const r of roofs) {
      const g = r.geometry;
      if (!g) continue;
      const slopes = g.faces.filter((f) => f.kind === 'slope' && inside(centroid(f.pts)));
      const flats = g.faces.filter((f) => f.kind === 'flat' && inside(centroid(f.pts)));
      const glazedGables = r.roof.glazedGables ? g.faces.filter((f) => f.kind === 'gable' && inside(centroid(f.pts))) : [];
      const slopeArea = slopes.reduce((s, f) => s + area3d(f.pts), 0);
      const flatArea = flats.reduce((s, f) => s + area3d(f.pts), 0);
      const tag = `${level.name}, ${r.id.startsWith('section') ? 'roof section' : 'roof'}`;
      if (slopeArea > 0) {
        const per = { plain: 60, interlocking: 10, slate: 20 }[a.covering];
        const gauge = { plain: 0.1, interlocking: 0.345, slate: 0.2 }[a.covering];
        add({ id: `cover:${level.id}:${r.id}`, price: `tiles-${a.covering}`, group: 'Roof', item: `${{ plain: 'Plain clay tiles', interlocking: 'Interlocking concrete tiles', slate: 'Natural slates' }[a.covering]}, ${tag}`, detail: `${slopeArea.toFixed(1)} m² of slope, ${per} a m², 5% extra`, qty: Math.ceil(slopeArea * per * 1.05), unit: 'no.' });
        add({ id: `membrane:${level.id}:${r.id}`, price: 'membrane', group: 'Roof', item: `Breathable membrane, ${tag}`, qty: slopeArea * 1.1, unit: 'm²' });
        add({ id: `battens:${level.id}:${r.id}`, price: 'battens', group: 'Roof', item: `Tile battens, ${tag}`, qty: slopeArea / gauge, unit: 'm' });
        // Rafters: every 400 mm along each eave, as long as the slope, sized for the span.
        let count = 0;
        let len = 0;
        let span = 0;
        const cos = Math.cos((r.roof.pitch * Math.PI) / 180) || 1;
        for (const [p, q] of g.eaves) {
          const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
          if (!inside(mid)) continue;
          const e = Math.hypot(q.x - p.x, q.y - p.y);
          const n = Math.ceil(e / 0.4) + 1;
          // The slope's run on plan, from this eave up to the ridge.
          const face = slopes.find((f) => f.pts.some((v) => Math.hypot(v.x - p.x, v.y - p.y) < 1e-3));
          const run = face ? Math.max(...face.pts.map((v) => distToLine(v, p, q))) : 0;
          span = Math.max(span, run);
          count += n;
          len += n * (run / cos);
        }
        if (count) add({ id: `rafters:${level.id}:${r.id}`, price: 'rafter', group: 'Roof', item: `Rafters, ${tag}`, detail: `${count} at 400 mm centres, C24 ${rafterSize(span)} (span ${span.toFixed(1)} m on plan)`, qty: len, unit: 'm' });
        // Ridges, hips and valleys (each drawn once for each slope that meets it: counted once).
        const { ridge, hips, valleys } = roofLines(g, inside);
        add({ id: `ridge:${level.id}:${r.id}:cap`, price: 'ridge', group: 'Roof', item: `Ridge tiles, ${tag}`, qty: ridge, unit: 'm' });
        add({ id: `hips:${level.id}:${r.id}`, price: 'ridge', group: 'Roof', item: `Hip tiles, ${tag}`, qty: hips, unit: 'm' });
        add({ id: `valleys:${level.id}:${r.id}`, price: 'valley', group: 'Roof', item: `Valley troughs (GRP or lead), ${tag}`, qty: valleys, unit: 'm' });
        const eaves = g.eaves.filter(([p, q]) => inside({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })).reduce((s, [p, q]) => s + Math.hypot(q.x - p.x, q.y - p.y), 0);
        add({ id: `fascia:${level.id}:${r.id}`, price: 'fascia', group: 'Roof', item: `Fascia, soffit and gutter, ${tag}`, qty: eaves, unit: 'm' });
        add({ id: `downpipes:${level.id}:${r.id}`, price: 'downpipe', group: 'Roof', item: `Downpipes, ${tag}`, qty: eaves > 0 ? Math.max(1, Math.ceil(eaves / 8)) : 0, unit: 'no.' });
        if (r.roof.vaulted) {
          add({ id: `roofins:${level.id}:${r.id}`, price: 'roof-insulation', group: 'Roof', item: `Insulation between and under the rafters, ${tag}`, detail: 'vaulted: PIR, about 150 + 50 mm', qty: slopeArea, unit: 'm²' });
          add({ id: `rooflining:${level.id}:${r.id}`, price: 'roof-lining', group: 'Roof', item: `Plasterboard and skim to the vault, ${tag}`, qty: slopeArea, unit: 'm²' });
        }
      }
      if (flatArea > 0) {
        add({ id: `flat:${level.id}:${r.id}`, price: 'flat-roof', group: 'Roof', item: `Flat roof (joists, deck, insulation, EPDM), ${tag}`, qty: flatArea, unit: 'm²' });
        const runs = g.parapet?.runs.filter((run) => inside({ x: (run.a.x + run.b.x) / 2, y: (run.a.y + run.b.y) / 2 })) ?? [];
        const coping = runs.reduce((s, run) => s + dist(run.a, run.b), 0);
        add({ id: `coping:${level.id}:${r.id}`, price: 'coping', group: 'Roof', item: `Parapet coping, ${tag}`, qty: coping, unit: 'm' });
      }
      const gableGlass = glazedGables.reduce((s, f) => s + area3d(f.pts), 0);
      add({ id: `gableglass:${level.id}:${r.id}`, price: 'gable-glazing', group: 'Glazing, doors and windows', item: `Glazed gable (triangular), ${tag}`, detail: 'structural glazing filling the gable', qty: gableGlass * 0.85, unit: 'm²', key: true });
    }

    // ---- Roof windows.
    let windows = 0;
    const sizes = new Map<string, number>();
    for (const rl of Object.values(level.rooflights ?? {})) {
      if (!inside(rl)) continue;
      const geo = rooflightGeometry(b, level, rl);
      if (!geo) continue;
      windows += rl.count;
      const code = veluxCode(rl.width, rl.length);
      sizes.set(code, (sizes.get(code) ?? 0) + rl.count);
    }
    for (const [code, n] of sizes) {
      add({ id: `velux:${level.id}:${code}`, price: 'velux', group: 'Glazing, doors and windows', item: `Roof windows, size ${code}`, detail: 'Velux-type, centre-pivot', qty: n, unit: 'no.', key: true });
    }
    if (windows) {
      add({ id: `flashing:${level.id}`, price: 'velux-flashing', group: 'Glazing, doors and windows', item: 'Roof window flashing kits', qty: windows, unit: 'no.' });
      add({ id: `trim:${level.id}`, price: 'velux-trim', group: 'Roof', item: 'Trimming rafters round the roof windows', qty: windows, unit: 'sets' });
    }

    // ---- Garden and drains (the ground floor's).
    if (ground) {
      for (const pt of Object.values(level.patios ?? {})) {
        if (!inside(centroid(pt.points.map((p) => ({ ...p, z: 0 }))))) continue;
        const m2 = patioArea(level, pt);
        add({ id: `patio:${pt.id}`, price: pt.surface, group: 'Garden and drains', item: `${{ paving: 'Paving', decking: 'Decking', gravel: 'Gravel' }[pt.surface]}`, detail: pt.surface === 'paving' ? `${m2.toFixed(1)} m²: about ${Math.ceil((m2 / (pt.module * pt.module)) * 1.05)} slabs of ${Math.round(pt.module * 100)} cm` : undefined, qty: m2, unit: 'm²' });
        if (pt.surface !== 'decking') add({ id: `subbase:${pt.id}`, price: 'sub-base', group: 'Garden and drains', item: 'Sub-base (MOT type 1, 100 mm)', qty: m2 * 0.1, unit: 'm³' });
      }
      for (const h of Object.values(level.hedges ?? {})) {
        const mid = h.points[Math.floor(h.points.length / 2)];
        if (!mid || !inside(mid) || h.kind === 'ditch') continue;
        const L = hedgeLength(h);
        if (h.kind === 'fence') add({ id: `fence:${h.id}`, price: 'fence', group: 'Garden and drains', item: 'Close-board fence', detail: `${L.toFixed(1)} m, ${h.height} m high`, qty: L, unit: 'm' });
        else add({ id: `hedge:${h.id}`, price: 'hedge', group: 'Garden and drains', item: `${h.kind[0].toUpperCase()}${h.kind.slice(1)} hedge plants`, detail: `${L.toFixed(1)} m, 5 a metre in a double row`, qty: Math.ceil(L * 5), unit: 'no.' });
      }
      for (const f of Object.values(level.furniture ?? {})) {
        if (!isGate(f.kind) || !inside(f)) continue;
        add({ id: `gate:${f.id}`, price: f.kind === 'gate5' ? 'gate-5bar' : 'gate-path', group: 'Garden and drains', item: f.kind === 'gate5' ? `Five-bar gate, ${f.width.toFixed(1)} m` : `Path gate, ${f.width.toFixed(1)} m`, detail: 'with posts', qty: 1, unit: 'no.' });
      }
      const d = b.drains;
      if (d) {
        const pipes = Object.values(d.pipes).filter((p) => {
          const na = d.nodes[p.a];
          const nb = d.nodes[p.b];
          return na && nb && inside({ x: (na.x + nb.x) / 2, y: (na.y + nb.y) / 2 });
        });
        add({ id: 'pipes', price: 'pipe', group: 'Garden and drains', item: 'Drain pipes', detail: `${pipes.length} runs`, qty: pipes.reduce((s, p) => s + pipeLength(d, p), 0), unit: 'm' });
        const nodes = Object.values(d.nodes).filter((n) => inside(n));
        add({ id: 'chambers', price: 'chamber', group: 'Garden and drains', item: 'Inspection chambers', qty: nodes.filter((n) => n.fitting === 'chamber').length, unit: 'no.' });
        add({ id: 'soakaways', price: 'soakaway', group: 'Garden and drains', item: 'Soakaways', qty: nodes.filter((n) => n.fitting === 'soakaway').length, unit: 'no.' });
        add({ id: 'stp', price: 'treatment', group: 'Garden and drains', item: 'Sewage treatment plant', qty: nodes.filter((n) => n.fitting === 'treatment').length, unit: 'no.', key: true });
      }
    }
  });

  return lines;
}

function centroid(pts: { x: number; y: number }[]): Vec2 {
  const n = pts.length || 1;
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
}

function distToLine(v: Vec2, p: Vec2, q: Vec2): number {
  const len = dist(p, q) || 1;
  return Math.abs((v.x - p.x) * (q.y - p.y) - (v.y - p.y) * (q.x - p.x)) / len;
}

/** The total of the lines at the given prices. */
export function totalOf(lines: Line[], prices: Record<string, number>, left: Set<string> = new Set()): number {
  return lines.filter((l) => !left.has(l.id)).reduce((s, l) => s + l.qty * (prices[l.price] ?? 0), 0);
}


/**
 * The lengths of a pitched roof's ridges (level), hips (sloping, the roof falling away either
 * side) and valleys (sloping, the roof rising either side), each counted once, within the area.
 */
export function roofLines(g: { faces: { pts: { x: number; y: number; z: number }[] }[]; outline: Vec2[]; lines: [Vec2, Vec2][] }, inside: (p: Vec2) => boolean) {
  const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-3;
  const height = (p: Vec2) => {
    let z = -Infinity;
    for (const f of g.faces) for (const v of f.pts) if (near(v, p)) z = Math.max(z, v.z);
    return z;
  };
  // Which way round the outline runs, to tell its convex corners from its reflex ones.
  const o = g.outline;
  let twice = 0;
  for (let i = 0; i < o.length; i++) {
    const p = o[i];
    const q = o[(i + 1) % o.length];
    twice += p.x * q.y - q.x * p.y;
  }
  const reflex = (p: Vec2) => {
    const i = o.findIndex((v) => near(v, p));
    if (i < 0) return false;
    const a = o[(i + o.length - 1) % o.length];
    const c = o[(i + 1) % o.length];
    const cross = (p.x - a.x) * (c.y - p.y) - (p.y - a.y) * (c.x - p.x);
    return cross * twice < 0;
  };
  const seen = new Set<string>();
  const out = { ridge: 0, hips: 0, valleys: 0 };
  for (const [p, q] of g.lines) {
    const key = [p, q].map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    if (!inside({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })) continue;
    const zp = height(p);
    const zq = height(q);
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    if (!Number.isFinite(zp) || !Number.isFinite(zq) || Math.abs(zp - zq) < 0.1 * L + 0.02) out.ridge += L; // level, or nearly
    // A valley runs down into a reflex (inside) corner of the eaves.
    else if (reflex(zp < zq ? p : q)) out.valleys += Math.hypot(L, zq - zp);
    else out.hips += Math.hypot(L, zq - zp);
  }
  return out;
}
