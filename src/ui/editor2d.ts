// The 2D plan editor: a canvas with pan/zoom, snapping, drawing and direct manipulation.
// All geometry it draws (mitred wall outlines, openings, rooms) comes from the same model
// functions that feed the 3D view, so the plan and the 3D model always agree.

import {
  Vec2,
  add,
  dist,
  dot,
  lineIntersect,
  normalize as unit,
  pointInPolygon,
  projectOnSegment,
  scale,
  sub,
  vec,
} from '../model/geom';
import { getLevel, levelBelow } from '../model/building';
import { addPillar, pillarAt } from '../model/pillars';
import { addPatio, patioShapes } from '../model/patios';
import { addTree, treeAt, trunkRadius } from '../model/trees';
import { siteOf } from '../model/sun';
import { addFurniture, againstWall, catalogueItem, footprint } from '../model/furniture';
import { drawFurnitureSymbol } from './furniture2d';
import { addChimney, addRooflight, addSolarArray, chimneyFootprint, rooflightGeometry, solarGeometry } from '../model/roofitems';
import { roofSurfaceAt } from '../model/roof';
import { DEFAULT_ROOF, type LevelRoof, levelRoofs, roofAreaRings, setAreaRoof, toggleEdge } from '../model/roof';
import { DEFAULT_GOING, DEFAULT_STAIR_WIDTH, type StairGeometry, addStair, stairAt, stairGeometry } from '../model/stairs';
import { computeFootprints, type Footprint, wallPoint } from '../model/joints';
import {
  type OpeningTemplate,
  duplicateOpening,
  matchOpening,
  moveOpening,
  placeOpening,
  templateOf,
} from '../model/openings';
import {
  EPS,
  addWall,
  clonePlan,
  deleteNode,
  deleteOpening,
  deleteWall,
  finishNodeMove,
  moveNode,
  planBounds,
  splitWallAt,
} from '../model/plan';
import { detectRooms } from '../model/rooms';
import type { Furniture, Level, Opening, OpeningKind, PatioSurface, Plan, StairShape, TreeKind } from '../model/types';
import type { Store } from './store';

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'garage' | 'glazed' | 'split' | 'paste' | 'stair' | 'roof' | 'pillar' | 'chimney' | 'solar' | 'rooflight' | 'patio' | 'tree' | 'furniture';
export type Selection = {
  kind: 'wall' | 'node' | 'opening' | 'level' | 'stair' | 'roof' | 'pillar' | 'chimney' | 'solar' | 'rooflight' | 'patio' | 'tree' | 'furniture';
  id: string;
} | null;

type Gesture =
  | { kind: 'pan'; last: Vec2 }
  | { kind: 'pinch'; dist: number; mid: Vec2 }
  | { kind: 'dragNode'; id: string }
  | { kind: 'dragWall'; id: string; start: Vec2; a0: Vec2; b0: Vec2; n: Vec2 }
  | { kind: 'dragOpening'; id: string }
  | { kind: 'dragStair'; id: string; start: Vec2; x0: number; y0: number }
  | { kind: 'dragPillar'; id: string }
  | { kind: 'dragFurniture'; id: string; start: Vec2; x0: number; y0: number }
  | { kind: 'dragPatio'; id: string; start: Vec2; pts0: Vec2[] }
  | { kind: 'dragRoofItem'; what: 'chimney' | 'solar' | 'rooflight' | 'tree'; id: string; start: Vec2; x0: number; y0: number }
  | { kind: 'click' };

interface Snap {
  p: Vec2;
  kind: 'node' | 'wall' | 'grid' | 'angle' | 'free';
  guides: { from: Vec2; to: Vec2 }[];
}

const DRAG_THRESHOLD = 5; // px before a press becomes a drag
const SNAP_PX = 12;

export class Editor2D {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private view = { scale: 40, ox: 40, oy: 40 };
  tool: Tool = 'select';
  selection: Selection = null;
  /** Thickness for new walls; their height is the level's floor-to-floor height. */
  wallProps = { thickness: 0.3 };
  /** Shape for new stairs. */
  stairShape: StairShape = 'straight';
  /** First click of a stair being placed (its bottom step). */
  private stairStart: Vec2 | null = null;
  /** Roof tool: editing existing roofs, or drawing a new roof section. */
  roofMode: 'edit' | 'draw' = 'edit';
  /** Corners of a roof section or patio being drawn. */
  private sectionPts: Vec2[] = [];
  /** Surface for new patios. */
  patioSurface: PatioSurface = 'paving';
  /** Kind of tree the Tree tool plants. */
  treeKind: TreeKind = 'deciduous';
  /** Catalogue entry the Furniture tool places, and the angle it is placed at. */
  furnitureKind = 'grand';
  furnitureAngle = 0;
  /** A copied door or window: its exact type and size. */
  clipboard: OpeningTemplate | null = null;
  ortho = false;
  /** Show every room's inside dimensions on the plan. */
  showDims = false;
  gridStep = 0.05;
  onSelectionChange?: () => void;
  onToolChange?: () => void;
  onDimsChange?: () => void;
  onOpenCatalogue?: () => void;
  shortcutsEnabled: () => boolean = () => true;

  private pointers = new Map<number, Vec2>();
  /** What a click (without dragging) on the current selection moves on to. */
  private cycle: Selection = null;
  private gesture: Gesture | null = null;
  private downAt: Vec2 | null = null;
  private dragging = false;
  private hover: Vec2 | null = null; // world position of the pointer
  private drawStart: Vec2 | null = null;
  private chainStart: Vec2 | null = null;
  private lengthInput = '';
  private renderQueued = false;
  private fps: Map<string, Footprint> = new Map();

  constructor(
    private container: HTMLElement,
    private store: Store,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.touchAction = 'none';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e, true));
    c.addEventListener('pointerleave', () => {
      this.hover = null;
      this.requestRender();
    });
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('dblclick', () => {
      if (this.tool === 'wall') this.finishChain();
      if (this.drawingOutline) this.finishOutline();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    new ResizeObserver(() => this.resize()).observe(container);
    store.subscribe(() => {
      this.validateSelection();
      this.requestRender();
    });
    this.resize();
  }

  get plan(): Level {
    return this.store.plan;
  }

  /** The level under the one being edited, if any. */
  private below(): Plan | undefined {
    return levelBelow(this.store.building, this.store.activeId);
  }

  setTool(t: Tool) {
    if (this.tool === 'wall' && t !== 'wall') this.finishChain();
    this.stairStart = null;
    this.sectionPts = [];
    this.tool = t;
    this.onToolChange?.();
    this.requestRender();
  }

  select(s: Selection) {
    this.selection = s;
    this.onSelectionChange?.();
    this.requestRender();
  }

  /** True while a wall chain is being drawn. */
  get drawing() {
    return this.drawStart !== null;
  }

  toggleDims() {
    this.showDims = !this.showDims;
    this.onDimsChange?.();
    this.requestRender();
  }

  finishChain() {
    this.drawStart = null;
    this.chainStart = null;
    this.lengthInput = '';
    this.onToolChange?.();
    this.requestRender();
  }

  zoomToFit() {
    const b = planBounds(this.plan);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!b || !w || !h) return;
    const pad = 60;
    const sx = (w - pad * 2) / Math.max(1, b.max.x - b.min.x);
    const sy = (h - pad * 2) / Math.max(1, b.max.y - b.min.y);
    this.view.scale = Math.min(120, Math.max(5, Math.min(sx, sy)));
    this.view.ox = w / 2 - ((b.min.x + b.max.x) / 2) * this.view.scale;
    this.view.oy = h / 2 - ((b.min.y + b.max.y) / 2) * this.view.scale;
    this.requestRender();
  }

  // ---------------------------------------------------------------- coordinates

  private toScreen(p: Vec2): Vec2 {
    return vec(p.x * this.view.scale + this.view.ox, p.y * this.view.scale + this.view.oy);
  }

  private toWorld(p: Vec2): Vec2 {
    return vec((p.x - this.view.ox) / this.view.scale, (p.y - this.view.oy) / this.view.scale);
  }

  private eventPoint(e: PointerEvent | WheelEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return vec(e.clientX - r.left, e.clientY - r.top);
  }

  // ---------------------------------------------------------------- snapping

  private snap(raw: Vec2, opts: { from?: Vec2 | null; excludeNode?: string } = {}): Snap {
    const tol = SNAP_PX / this.view.scale;
    const plan = this.plan;
    const guides: Snap['guides'] = [];

    // 1. Existing joints.
    let best: Vec2 | null = null;
    let bestD = tol;
    for (const n of Object.values(plan.nodes)) {
      if (n.id === opts.excludeNode) continue;
      const d = dist(n, raw);
      if (d < bestD) {
        bestD = d;
        best = vec(n.x, n.y);
      }
    }
    if (best) return { p: best, kind: 'node', guides };
    // ...then joints on the floor below, so walls can be stacked exactly.
    const below = this.below();
    if (below) {
      for (const n of Object.values(below.nodes)) {
        const d = dist(n, raw);
        if (d < bestD) {
          bestD = d;
          best = vec(n.x, n.y);
        }
      }
      if (best) return { p: best, kind: 'node', guides };
    }

    // 2. Direction lock relative to the previous point (always within 4 degrees of 45s; hard with Ortho).
    const from = opts.from ?? null;
    let dir: Vec2 | null = null;
    let p = raw;
    let kind: Snap['kind'] = 'free';
    if (from) {
      const d = sub(raw, from);
      const L = Math.hypot(d.x, d.y);
      if (L > 1e-9) {
        const ang = Math.atan2(d.y, d.x);
        const step = Math.PI / 4;
        const snapped = Math.round(ang / step) * step;
        if (this.ortho || Math.abs(snapped - ang) < (4 * Math.PI) / 180) {
          dir = vec(Math.cos(snapped), Math.sin(snapped));
          const Ls = Math.round(dot(d, dir) / this.gridStep) * this.gridStep;
          p = add(from, scale(dir, Ls));
          kind = 'angle';
        } else {
          const Ls = Math.round(L / this.gridStep) * this.gridStep;
          p = add(from, scale(unit(d), Ls));
        }
      }
    } else {
      p = vec(Math.round(raw.x / this.gridStep) * this.gridStep, Math.round(raw.y / this.gridStep) * this.gridStep);
      kind = 'grid';
    }

    // 3. Onto an existing wall (creating a T-junction when the wall is added).
    let wallHit: { a: Vec2; b: Vec2; point: Vec2; d: number } | null = null;
    for (const w of Object.values(plan.walls)) {
      if (opts.excludeNode && (w.a === opts.excludeNode || w.b === opts.excludeNode)) continue;
      const a = plan.nodes[w.a];
      const b = plan.nodes[w.b];
      const pr = projectOnSegment(raw, a, b);
      const reach = Math.max(tol, w.thickness / 2);
      if (pr.dist < reach && (!wallHit || pr.dist < wallHit.d)) wallHit = { a, b, point: pr.point, d: pr.dist };
    }
    if (wallHit) {
      let q = wallHit.point;
      if (dir && from) {
        // Keep the drawing direction and land exactly on the wall's centre line.
        const x = lineIntersect(from, dir, wallHit.a, sub(wallHit.b, wallHit.a));
        if (x && projectOnSegment(x, wallHit.a, wallHit.b).dist < 1e-6 && dist(x, raw) < tol * 3) q = x;
      } else {
        // Round the position along the wall to the grid step.
        const wd = unit(sub(wallHit.b, wallHit.a));
        const u = Math.round(dot(sub(q, wallHit.a), wd) / this.gridStep) * this.gridStep;
        const L = dist(wallHit.a, wallHit.b);
        if (u > EPS && u < L - EPS) q = add(wallHit.a, scale(wd, u));
      }
      return { p: q, kind: 'wall', guides };
    }

    // 4. Line up with other joints horizontally / vertically.
    if (kind !== 'angle') {
      let ax: Vec2 | null = null;
      let ay: Vec2 | null = null;
      for (const n of Object.values(plan.nodes)) {
        if (n.id === opts.excludeNode) continue;
        if (Math.abs(n.x - p.x) < tol && (!ax || Math.abs(n.x - p.x) < Math.abs(ax.x - p.x))) ax = n;
        if (Math.abs(n.y - p.y) < tol && (!ay || Math.abs(n.y - p.y) < Math.abs(ay.y - p.y))) ay = n;
      }
      if (ax) {
        p = vec(ax.x, p.y);
        guides.push({ from: ax, to: p });
      }
      if (ay) {
        p = vec(p.x, ay.y);
        guides.push({ from: ay, to: p });
      }
    }
    return { p, kind, guides };
  }

  // ---------------------------------------------------------------- hit testing

  /**
   * Everything under the pointer, most specific first: joints, doors and windows, then what
   * stands on this floor (trunks, pillars, stairs, furniture, walls), and only then what is on
   * the roof over it (chimneys, rooflights, solar panels), tree crowns and patios.
   */
  private hitAll(s: Vec2): NonNullable<Selection>[] {
    const w = this.toWorld(s);
    const tol = 8 / this.view.scale;
    const plan = this.plan;
    const out: NonNullable<Selection>[] = [];
    let node: string | null = null;
    let bestD = 12 / this.view.scale;
    for (const n of Object.values(plan.nodes)) {
      const d = dist(n, w);
      if (d < bestD) {
        bestD = d;
        node = n.id;
      }
    }
    if (node) out.push({ kind: 'node', id: node });
    for (const o of Object.values(plan.openings)) {
      const fp = this.fps.get(o.wallId);
      if (!fp) continue;
      const { u, v } = local(fp, w);
      if (Math.abs(u - o.offset) <= o.width / 2 + tol && Math.abs(v) <= fp.thickness / 2 + tol) out.push({ kind: 'opening', id: o.id });
    }
    const trunk = treeAt(plan, w, 6 / this.view.scale, false);
    if (trunk) out.push({ kind: 'tree', id: trunk });
    const pillar = pillarAt(plan, w, 4 / this.view.scale);
    if (pillar) out.push({ kind: 'pillar', id: pillar });
    const stair = stairAt(plan, w);
    if (stair) out.push({ kind: 'stair', id: stair });
    const pieces = Object.values(plan.furniture ?? {}).filter((f) => pointInPolygon(w, footprint(f)));
    pieces.sort((a, b) => a.width * a.depth - b.width * b.depth);
    for (const f of pieces) out.push({ kind: 'furniture', id: f.id });
    const wall = this.wallAt(w, tol);
    if (wall) out.push({ kind: 'wall', id: wall.wallId });
    for (const c of Object.values(plan.chimneys ?? {})) {
      if (pointInPolygon(w, chimneyFootprint(c))) out.push({ kind: 'chimney', id: c.id });
    }
    for (const r of Object.values(plan.rooflights ?? {})) {
      const g = rooflightGeometry(this.store.building, plan, r);
      if (g && pointInPolygon(w, g.footprint)) out.push({ kind: 'rooflight', id: r.id });
    }
    for (const sa of Object.values(plan.solar ?? {})) {
      const g = solarGeometry(this.store.building, plan, sa);
      if (g && pointInPolygon(w, g.outline)) out.push({ kind: 'solar', id: sa.id });
    }
    for (const t of Object.values(plan.trees ?? {})) {
      if (t.id !== trunk && dist(t, w) <= t.spread / 2) out.push({ kind: 'tree', id: t.id });
    }
    const patios = Object.values(plan.patios ?? {}).filter((pt) => pointInPolygon(w, pt.points));
    patios.sort((a, b) => b.height - a.height);
    for (const pt of patios) out.push({ kind: 'patio', id: pt.id });
    return out;
  }

  private wallAt(w: Vec2, tol: number): Footprint | null {
    let best: Footprint | null = null;
    let bestD = Infinity;
    for (const fp of this.fps.values()) {
      const pr = projectOnSegment(w, fp.a, fp.b);
      const inside = pointInPolygon(w, fp.polygon);
      const d = inside ? 0 : pr.dist - fp.thickness / 2;
      if (d < tol && d < bestD) {
        bestD = d;
        best = fp;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- pointer input

  private onDown(e: PointerEvent) {
    this.canvas.setPointerCapture(e.pointerId);
    const s = this.eventPoint(e);
    this.pointers.set(e.pointerId, s);
    if (this.pointers.size === 2) {
      // Second finger: abandon whatever the first one started and pinch instead.
      if (this.dragging && this.gesture && this.gesture.kind.startsWith('drag')) this.store.revert();
      const [p, q] = [...this.pointers.values()];
      this.gesture = { kind: 'pinch', dist: dist(p, q), mid: scale(add(p, q), 0.5) };
      return;
    }
    if (this.pointers.size > 2) return;
    this.downAt = s;
    this.dragging = false;

    if (e.button === 1 || (e.button === 2 && this.tool !== 'wall')) {
      this.gesture = { kind: 'pan', last: s };
      this.dragging = true;
      return;
    }
    if (e.button === 2) {
      this.finishChain();
      this.gesture = null;
      return;
    }

    if (this.tool === 'select') {
      // Pressing on what is already selected keeps it (to drag it); clicking it again without
      // dragging then moves on to the next thing underneath (see onUp).
      const hits = this.hitAll(s);
      const cur = this.selection;
      const again = cur ? hits.findIndex((h) => h.kind === cur.kind && h.id === cur.id) : -1;
      const hit = again >= 0 ? hits[again] : (hits[0] ?? null);
      this.cycle = again >= 0 && hits.length > 1 ? hits[(again + 1) % hits.length] : null;
      this.select(hit);
      if (hit?.kind === 'node') this.gesture = { kind: 'dragNode', id: hit.id };
      else if (hit?.kind === 'pillar') this.gesture = { kind: 'dragPillar', id: hit.id };
      else if (hit?.kind === 'chimney' || hit?.kind === 'solar' || hit?.kind === 'rooflight' || hit?.kind === 'tree') {
        const item = this.roofItem(hit.kind, hit.id)!;
        this.gesture = { kind: 'dragRoofItem', what: hit.kind, id: hit.id, start: this.toWorld(s), x0: item.x, y0: item.y };
      }
      else if (hit?.kind === 'stair') {
        const st = this.plan.stairs[hit.id];
        this.gesture = { kind: 'dragStair', id: hit.id, start: this.toWorld(s), x0: st.x, y0: st.y };
      }
      else if (hit?.kind === 'opening') this.gesture = { kind: 'dragOpening', id: hit.id };
      else if (hit?.kind === 'furniture') {
        const f = this.plan.furniture![hit.id];
        this.gesture = { kind: 'dragFurniture', id: hit.id, start: this.toWorld(s), x0: f.x, y0: f.y };
      }
      else if (hit?.kind === 'patio') {
        const pts0 = this.plan.patios![hit.id].points.map((p) => ({ ...p }));
        this.gesture = { kind: 'dragPatio', id: hit.id, start: this.toWorld(s), pts0 };
      }
      else if (hit?.kind === 'wall') {
        const fp = this.fps.get(hit.id)!;
        const wall = this.plan.walls[hit.id];
        this.gesture = {
          kind: 'dragWall',
          id: hit.id,
          start: this.toWorld(s),
          a0: { ...this.plan.nodes[wall.a] },
          b0: { ...this.plan.nodes[wall.b] },
          n: fp.n,
        };
      } else this.gesture = { kind: 'pan', last: s };
    } else {
      this.gesture = { kind: 'click' };
    }
  }

  private onMove(e: PointerEvent) {
    const s = this.eventPoint(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, s);
    if (e.pointerType === 'mouse' || this.pointers.size === 1) this.hover = this.toWorld(s);

    const g = this.gesture;
    if (g?.kind === 'pinch' && this.pointers.size >= 2) {
      const [p, q] = [...this.pointers.values()];
      const d = dist(p, q);
      const mid = scale(add(p, q), 0.5);
      this.zoomAt(g.mid, d / Math.max(1, g.dist));
      this.view.ox += mid.x - g.mid.x;
      this.view.oy += mid.y - g.mid.y;
      g.dist = d;
      g.mid = mid;
      this.requestRender();
      return;
    }
    if (!g || !this.downAt) {
      this.requestRender();
      return;
    }
    if (!this.dragging && dist(s, this.downAt) < DRAG_THRESHOLD) return;
    if (!this.dragging) {
      this.dragging = true;
      // A drag with a drawing tool pans the view instead of placing anything.
      if (g.kind === 'click') this.gesture = { kind: 'pan', last: this.downAt };
    }
    const w = this.toWorld(s);
    const plan = this.plan;
    const cur = this.gesture!;
    switch (cur.kind) {
      case 'pan':
        this.view.ox += s.x - cur.last.x;
        this.view.oy += s.y - cur.last.y;
        cur.last = s;
        this.requestRender();
        break;
      case 'dragNode': {
        const snap = this.snap(w, { excludeNode: cur.id });
        this.lastGuides = snap.guides;
        moveNode(plan, cur.id, snap.p);
        this.store.changed();
        break;
      }
      case 'dragWall': {
        const wall = plan.walls[cur.id];
        if (!wall) break;
        const off = Math.round(dot(sub(w, cur.start), cur.n) / this.gridStep) * this.gridStep;
        moveNode(plan, wall.a, add(cur.a0, scale(cur.n, off)));
        moveNode(plan, wall.b, add(cur.b0, scale(cur.n, off)));
        this.store.changed();
        break;
      }
      case 'dragRoofItem': {
        const item = this.roofItem(cur.what, cur.id);
        if (!item) break;
        const snapTo = (v: number) => Math.round(v / this.gridStep) * this.gridStep;
        item.x = cur.x0 + snapTo(w.x - cur.start.x);
        item.y = cur.y0 + snapTo(w.y - cur.start.y);
        this.store.changed();
        break;
      }
      case 'dragPatio': {
        const pt = plan.patios?.[cur.id];
        if (!pt) break;
        const snapTo = (v: number) => Math.round(v / this.gridStep) * this.gridStep;
        const dx = snapTo(w.x - cur.start.x);
        const dy = snapTo(w.y - cur.start.y);
        pt.points = cur.pts0.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        this.store.changed();
        break;
      }
      case 'dragFurniture': {
        const f = plan.furniture?.[cur.id];
        if (!f) break;
        const snapTo = (v: number) => Math.round(v / this.gridStep) * this.gridStep;
        f.x = cur.x0 + snapTo(w.x - cur.start.x);
        f.y = cur.y0 + snapTo(w.y - cur.start.y);
        // Keep it tight against a wall it is square to and near.
        const wall = againstWall(this.fps.values(), f, f.depth, 0.12);
        if (wall && Math.abs(Math.sin(wall.angle - f.angle)) < 1e-3 && Math.cos(wall.angle - f.angle) > 0) {
          f.x = wall.at.x;
          f.y = wall.at.y;
        }
        this.store.changed();
        break;
      }
      case 'dragPillar': {
        const q = plan.pillars?.[cur.id];
        if (!q) break;
        const snap = this.snap(w);
        q.x = snap.p.x;
        q.y = snap.p.y;
        this.lastGuides = snap.guides;
        this.store.changed();
        break;
      }
      case 'dragStair': {
        const st = plan.stairs[cur.id];
        if (!st) break;
        const snapTo = (v: number) => Math.round(v / this.gridStep) * this.gridStep;
        st.x = cur.x0 + snapTo(w.x - cur.start.x);
        st.y = cur.y0 + snapTo(w.y - cur.start.y);
        this.store.changed();
        break;
      }
      case 'dragOpening': {
        const o = plan.openings[cur.id];
        if (!o) break;
        // Follow the pointer onto another wall if it moves over one.
        const fp = this.wallAt(w, 10 / this.view.scale) ?? this.fps.get(o.wallId);
        if (!fp) break;
        const u = Math.round(local(fp, w).u / 0.01) * 0.01;
        moveOpening(plan, o.id, fp.wallId, u, this.fps);
        this.store.changed();
        break;
      }
    }
  }

  private lastGuides: Snap['guides'] = [];

  private onUp(e: PointerEvent, cancelled = false) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (g?.kind === 'pinch') {
      if (this.pointers.size === 0) this.gesture = null;
      return;
    }
    if (!g) return;
    this.gesture = null;
    this.lastGuides = [];
    if (cancelled) {
      if (this.dragging && g.kind.startsWith('drag')) this.store.revert();
      return;
    }
    const plan = this.plan;
    switch (g.kind) {
      case 'dragNode':
        if (this.dragging) {
          finishNodeMove(plan, g.id);
          this.store.commit();
        }
        break;
      case 'dragWall':
        if (this.dragging) {
          const wall = plan.walls[g.id];
          if (wall) {
            const b = wall.b;
            finishNodeMove(plan, wall.a);
            finishNodeMove(plan, b);
          }
          this.store.commit();
        }
        break;
      case 'dragOpening':
      case 'dragStair':
      case 'dragPillar':
      case 'dragRoofItem':
      case 'dragPatio':
      case 'dragFurniture':
        if (this.dragging) this.store.commit();
        break;
      case 'click':
        if (!this.dragging) this.click(this.toWorld(this.eventPoint(e)));
        break;
    }
    // A click (no drag) on the selected thing: select the next thing under it.
    if (!this.dragging && this.cycle) this.select(this.cycle);
    this.cycle = null;
    this.dragging = false;
    this.downAt = null;
  }

  /** A chimney, solar array, rooflight or tree: things placed by a point and dragged about. */
  private roofItem(what: 'chimney' | 'solar' | 'rooflight' | 'tree', id: string): { x: number; y: number } | undefined {
    const p = this.plan;
    if (what === 'chimney') return p.chimneys?.[id];
    if (what === 'solar') return p.solar?.[id];
    if (what === 'rooflight') return p.rooflights?.[id];
    return p.trees?.[id];
  }

  /** Where the Furniture tool would put its piece for the pointer at w: back to a nearby wall, or free. */
  private furniturePlacement(w: Vec2): { at: Vec2; angle: number } | null {
    const c = catalogueItem(this.furnitureKind);
    if (!c) return null;
    const wall = c.flat ? null : againstWall(this.fps.values(), w, c.depth);
    if (wall) return wall;
    const snapTo = (v: number) => Math.round(v / this.gridStep) * this.gridStep;
    return { at: { x: snapTo(w.x), y: snapTo(w.y) }, angle: this.furnitureAngle };
  }

  /** Turn the selected piece (or the one about to be placed) by a step. */
  rotateFurniture(step: number) {
    const s = this.selection;
    const f = s?.kind === 'furniture' ? this.plan.furniture?.[s.id] : undefined;
    if (f) {
      f.angle = normAngle(f.angle + step);
      this.store.commit();
    } else if (this.tool === 'furniture') {
      this.furnitureAngle = normAngle(this.furnitureAngle + step);
      this.requestRender();
    }
  }

  private click(w: Vec2) {
    const plan = this.plan;
    switch (this.tool) {
      case 'wall': {
        const s = this.snap(w, { from: this.drawStart });
        this.placeWallPoint(s.p);
        break;
      }
      case 'chimney': {
        const c = addChimney(plan, this.snap(w).p);
        this.store.commit();
        this.select({ kind: 'chimney', id: c.id });
        break;
      }
      case 'rooflight': {
        if (!roofSurfaceAt(this.store.building, plan, w)) {
          this.flash('No roof here on this floor: switch to the floor the roof belongs to', w);
          break;
        }
        const rl = addRooflight(plan, w);
        this.store.commit();
        this.select({ kind: 'rooflight', id: rl.id });
        break;
      }
      case 'solar': {
        if (!roofSurfaceAt(this.store.building, plan, w)) {
          this.flash('No roof here on this floor: switch to the floor the roof belongs to', w);
          break;
        }
        const sa = addSolarArray(plan, w);
        this.store.commit();
        this.select({ kind: 'solar', id: sa.id });
        break;
      }
      case 'pillar': {
        const q = addPillar(plan, this.snap(w).p);
        this.store.commit();
        this.select({ kind: 'pillar', id: q.id });
        break;
      }
      case 'door':
      case 'window':
      case 'garage':
      case 'glazed':
      case 'paste': {
        const fp = this.wallAt(w, 10 / this.view.scale);
        const spec = this.openingSpec();
        if (!fp || !spec) break;
        const o = placeOpening(plan, fp.wallId, local(fp, w).u, spec, this.fps);
        if (o) {
          this.store.commit();
          this.select({ kind: 'opening', id: o.id });
        }
        break;
      }
      case 'roof':
        this.roofClick(w);
        break;
      case 'patio':
        this.outlineClick(w);
        break;
      case 'furniture': {
        const at = this.furniturePlacement(w);
        if (!at) break;
        const f = addFurniture(plan, this.furnitureKind, at.at, at.angle);
        this.store.commit();
        this.select({ kind: 'furniture', id: f.id });
        break;
      }
      case 'tree': {
        const t = addTree(plan, this.snap(w).p, this.treeKind);
        this.store.commit();
        this.select({ kind: 'tree', id: t.id });
        break;
      }
      case 'stair': {
        if (!this.stairStart) {
          this.stairStart = this.snap(w).p;
          this.requestRender();
          break;
        }
        const angle = this.stairAngle(this.stairStart, w);
        if (angle === null) break;
        const st = addStair(plan, this.stairStart.x, this.stairStart.y, angle, this.stairShape);
        this.stairStart = null;
        this.store.commit();
        this.setTool('select');
        this.select({ kind: 'stair', id: st.id });
        break;
      }
      case 'split': {
        const fp = this.wallAt(w, 10 / this.view.scale);
        if (!fp) break;
        const u = Math.round(local(fp, w).u / this.gridStep) * this.gridStep;
        const id = splitWallAt(plan, fp.wallId, u);
        if (id) {
          this.store.commit();
          this.setTool('select');
          this.select({ kind: 'node', id });
        }
        break;
      }
    }
  }

  private placeWallPoint(p: Vec2) {
    if (!this.drawStart) {
      this.drawStart = p;
      this.chainStart = p;
      this.onToolChange?.();
      this.requestRender();
      return;
    }
    if (dist(p, this.drawStart) < 1e-6) {
      this.finishChain();
      return;
    }
    const res = addWall(this.plan, this.drawStart, p, { thickness: this.wallProps.thickness, height: this.plan.height });
    this.store.commit();
    if (res && this.chainStart && dist(p, this.chainStart) < 1e-6) {
      this.finishChain(); // closed the loop
      return;
    }
    this.drawStart = p;
    this.lengthInput = '';
    this.requestRender();
  }

  private zoomAt(s: Vec2, factor: number) {
    const before = this.toWorld(s);
    this.view.scale = Math.min(400, Math.max(4, this.view.scale * factor));
    this.view.ox = s.x - before.x * this.view.scale;
    this.view.oy = s.y - before.y * this.view.scale;
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const s = this.eventPoint(e);
    // Wheel / trackpad pinch (ctrlKey) zooms about the pointer; horizontal scroll pans.
    if (e.deltaY) this.zoomAt(s, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    if (!e.ctrlKey && e.deltaX) this.view.ox -= e.deltaX;
    this.requestRender();
  }

  private onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (!this.shortcutsEnabled()) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.store.redo();
      else this.store.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.store.redo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'c') {
      if (this.copySelection()) e.preventDefault();
      return;
    }
    if (mod && e.key.toLowerCase() === 'v') {
      if (this.clipboard) {
        e.preventDefault();
        this.setTool('paste');
      }
      return;
    }
    if (!mod && (e.key === '[' || e.key === ']')) {
      this.rotateFurniture(((e.key === ']' ? 1 : -1) * Math.PI) / 12);
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      this.duplicateSelection();
      return;
    }
    if (mod) return;

    // Typing a length while drawing a wall: e.g. "3.5" then Enter.
    if (this.tool === 'wall' && this.drawStart) {
      if (/^[0-9.]$/.test(e.key)) {
        this.lengthInput += e.key;
        this.requestRender();
        return;
      }
      if (e.key === 'Backspace' && this.lengthInput) {
        this.lengthInput = this.lengthInput.slice(0, -1);
        this.requestRender();
        return;
      }
      if (e.key === 'Enter') {
        const L = parseFloat(this.lengthInput);
        const target = this.hover ? this.snap(this.hover, { from: this.drawStart }).p : null;
        if (L > 0 && target && dist(target, this.drawStart) > 1e-6) {
          const d = unit(sub(target, this.drawStart));
          this.placeWallPoint(add(this.drawStart, scale(d, L)));
        } else this.finishChain();
        return;
      }
    }
    switch (e.key) {
      case 'Enter':
        if (this.sectionPts.length) this.finishOutline();
        break;
      case 'Escape':
        if (this.sectionPts.length) {
          this.sectionPts = [];
          this.requestRender();
        } else if (this.stairStart) {
          this.stairStart = null;
          this.requestRender();
        } else if (this.drawStart) this.finishChain();
        else if (this.tool !== 'select') this.setTool('select');
        else this.select(null);
        break;
      case 'Delete':
      case 'Backspace':
        this.deleteSelection();
        e.preventDefault();
        break;
      case 'v':
        this.setTool('select');
        break;
      case 'w':
        this.setTool('wall');
        break;
      case 'd':
        this.setTool('door');
        break;
      case 'n':
        this.setTool('window');
        break;
      case 'x':
        this.setTool('split');
        break;
      case 's':
        this.setTool('stair');
        break;
      case 'r':
        this.setTool('roof');
        break;
      case 'g':
        this.setTool('garage');
        break;
      case 'p':
        this.setTool('pillar');
        break;
      case 'c':
        this.setTool('chimney');
        break;
      case 't':
        this.setTool('patio');
        break;
      case 'e':
        this.setTool('tree');
        break;
      case 'm':
        this.toggleDims();
        break;
      case 'k':
        this.setTool('glazed');
        break;
      case 'f':
        this.onOpenCatalogue?.();
        break;
      case 'o':
        this.ortho = !this.ortho;
        this.onToolChange?.();
        break;
    }
  }

  /** What a click with the current tool places: a default door/window, or the copied one. */
  private openingSpec(): OpeningKind | OpeningTemplate | null {
    if (this.tool === 'door' || this.tool === 'window' || this.tool === 'garage' || this.tool === 'glazed') return this.tool;
    if (this.tool === 'paste') return this.clipboard;
    return null;
  }

  /** Copy the selected door or window's type and size. */
  copySelection(): boolean {
    const s = this.selection;
    const o = s?.kind === 'opening' ? this.plan.openings[s.id] : null;
    if (!o) return false;
    this.clipboard = templateOf(o);
    this.onToolChange?.();
    return true;
  }

  /** Put an identical copy of the selected door or window next to it. */
  duplicateSelection(): boolean {
    const s = this.selection;
    if (s?.kind === 'furniture') {
      const f = this.plan.furniture?.[s.id];
      if (!f) return false;
      // Side by side, to its right: handy for a run of kitchen units.
      const copy: Furniture = { ...f, id: `f${this.plan.nextId++}` };
      copy.x = f.x + Math.cos(f.angle) * f.width;
      copy.y = f.y + Math.sin(f.angle) * f.width;
      this.plan.furniture![copy.id] = copy;
      this.store.commit();
      this.select({ kind: 'furniture', id: copy.id });
      return true;
    }
    if (s?.kind !== 'opening') return false;
    const copy = duplicateOpening(this.plan, s.id);
    if (!copy) return false;
    this.store.commit();
    this.select({ kind: 'opening', id: copy.id });
    return true;
  }

  /** Make the selected door or window the same type and size as the copied one. */
  matchSelection(): boolean {
    const s = this.selection;
    if (s?.kind !== 'opening' || !this.clipboard) return false;
    if (!matchOpening(this.plan, s.id, this.clipboard)) return false;
    this.store.commit();
    this.onSelectionChange?.();
    return true;
  }

  /** Direction from the stair's start towards the pointer, snapped to 90° (or 15° steps). */
  private stairAngle(start: Vec2, to: Vec2): number | null {
    if (dist(start, to) < 0.2) return null;
    const a = Math.atan2(to.y - start.y, to.x - start.x);
    const right = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
    if (this.ortho || Math.abs(right - a) < (10 * Math.PI) / 180) return right;
    const step = Math.PI / 12;
    return Math.round(a / step) * step;
  }

  /** A stair on the plan: treads, and the walking line with an arrow pointing up. */
  private drawStair(g: StairGeometry, selected: boolean, fromBelow: boolean, C: Record<string, string>) {
    const ctx = this.ctx;
    const ink = selected ? C.accent : C.ink;
    ctx.lineWidth = 1;
    if (fromBelow) {
      // The stairwell: an open hole in this floor, with the stair seen through it.
      for (const part of g.parts) {
        this.path(part);
        ctx.fillStyle = C.bg;
        ctx.fill();
      }
      ctx.strokeStyle = C.underlay;
      for (const t of g.treads) {
        this.path(t.poly);
        ctx.stroke();
      }
      ctx.strokeStyle = C.ink;
      ctx.setLineDash([5, 4]);
      for (const part of g.parts) {
        this.path(part);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      return;
    }
    for (const t of g.treads) {
      this.path(t.poly);
      ctx.fillStyle = selected ? hexAlpha(C.accent, 0.12) : C.opening;
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
    // Walking line with an arrowhead at the top.
    const pts = g.path.map((p) => this.toScreen(p));
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const end = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - 9 * Math.cos(ang - 0.45), end.y - 9 * Math.sin(ang - 0.45));
    ctx.lineTo(end.x - 9 * Math.cos(ang + 0.45), end.y - 9 * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const a0 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    ctx.fillText('UP', pts[0].x - 14 * Math.cos(a0), pts[0].y - 14 * Math.sin(a0));
  }

  private flashMsg: { text: string; at: Vec2; until: number } | null = null;

  /** Show a short message by the pointer for a couple of seconds. */
  private flash(text: string, at: Vec2) {
    this.flashMsg = { text, at, until: performance.now() + 2500 };
    this.requestRender();
    setTimeout(() => this.requestRender(), 2600);
  }

  /** The roofs of the floor being edited (areas with a roof, and drawn sections). */
  roofs(): LevelRoof[] {
    return levelRoofs(this.store.building, this.plan);
  }

  private areaRing(id: string): Vec2[] | null {
    if (!id.startsWith('area:')) return null;
    return roofAreaRings(this.store.building, this.plan)[Number(id.slice(5))] ?? null;
  }

  private roofExists(id: string): boolean {
    return id.startsWith('section:') ? !!this.plan.roofSections?.[id.slice(8)] : !!this.areaRing(id);
  }

  /** Roof tool click: switch an edge of the selected roof, select a roof, or add a section corner. */
  private roofClick(w: Vec2) {
    const plan = this.plan;
    if (this.roofMode === 'draw') return this.outlineClick(w);
    const roofs = this.roofs();
    const sel = this.selection?.kind === 'roof' ? roofs.find((r) => r.id === this.selection!.id) : undefined;
    if (sel?.geometry && sel.roof.kind !== 'flat') {
      const tol = 10 / this.view.scale;
      const outline = sel.geometry.outline;
      const edge = outline.findIndex((a, i) => projectOnSegment(w, a, outline[(i + 1) % outline.length]).dist < tol);
      if (edge >= 0 && sel.roles[edge] !== 'wall') {
        const edges = toggleEdge(sel, edge);
        if (sel.id.startsWith('section:')) plan.roofSections![sel.id.slice(8)].roof.edges = edges;
        else setAreaRoof(plan, sel.ring, { ...sel.roof, edges });
        this.store.commit();
        return;
      }
    }
    // Hand-drawn sections sit on top, so they are picked first.
    const hit =
      roofs.find((r) => r.id.startsWith('section:') && (pointInPolygon(w, r.ring) || (r.geometry && pointInPolygon(w, r.geometry.outline)))) ??
      roofs.find((r) => pointInPolygon(w, r.ring) || (r.geometry && pointInPolygon(w, r.geometry.outline)));
    if (hit) return this.select({ kind: 'roof', id: hit.id });
    const area = roofAreaRings(this.store.building, plan).findIndex((ring) => pointInPolygon(w, ring));
    this.select(area >= 0 ? { kind: 'roof', id: `area:${area}` } : null);
  }

  /** True while the tool draws an outline corner by corner (a roof section or a patio). */
  get drawingOutline(): boolean {
    return (this.tool === 'roof' && this.roofMode === 'draw') || this.tool === 'patio';
  }

  /** Add a corner to the outline being drawn, or close it on its first corner. */
  private outlineClick(w: Vec2) {
    const s = this.snap(w, { from: this.sectionPts[this.sectionPts.length - 1] ?? null });
    const first = this.sectionPts[0];
    if (first && this.sectionPts.length >= 3 && dist(s.p, first) < 12 / this.view.scale) this.finishOutline();
    else this.sectionPts.push(s.p);
    this.requestRender();
  }

  finishOutline() {
    if (this.tool === 'patio') this.finishPatio();
    else this.finishSection();
  }

  private finishPatio() {
    const pts = this.sectionPts;
    this.sectionPts = [];
    if (pts.length < 3) return this.requestRender();
    const pt = addPatio(this.plan, pts, this.patioSurface);
    this.store.commit();
    this.select({ kind: 'patio', id: pt.id });
  }

  finishSection() {
    const pts = this.sectionPts;
    this.sectionPts = [];
    if (pts.length < 3) return this.requestRender();
    const id = `r${this.plan.nextId++}`;
    this.plan.roofSections ??= {};
    this.plan.roofSections[id] = { id, points: pts.map((p) => ({ x: p.x, y: p.y })), roof: { ...DEFAULT_ROOF } };
    this.roofMode = 'edit';
    this.store.commit();
    this.onToolChange?.();
    this.select({ kind: 'roof', id: `section:${id}` });
  }

  /** Roofs on the plan: eaves dashed, ridges/hips/valleys dotted, gable ends solid. */
  private drawRoofs(C: Record<string, string>) {
    const ctx = this.ctx;
    const active = this.tool === 'roof';
    for (const r of this.roofs()) {
      const g = r.geometry;
      if (!g) continue;
      const selected = this.selection?.kind === 'roof' && this.selection.id === r.id;
      const ink = selected ? C.accent : C.text;
      if (active) {
        this.path(g.outline);
        ctx.fillStyle = hexAlpha(C.accent, selected ? 0.16 : 0.05);
        ctx.fill();
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = selected ? 1.5 : 1;
      g.outline.forEach((a, i) => {
        const b = g.outline[(i + 1) % g.outline.length];
        if (r.roles[i] === 'wall') return;
        if (r.roles[i] === 'gable') {
          ctx.lineWidth = selected ? 3 : 2;
          ctx.setLineDash([]);
        } else {
          ctx.lineWidth = selected ? 1.5 : 1;
          ctx.setLineDash([8, 5]);
        }
        this.line(a, b);
      });
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      for (const [a, b] of g.lines) this.line(a, b);
      ctx.setLineDash([]);
    }
  }

  /** Patios: a fill in the surface's colour, with the slab joints or deck boards drawn in. */
  private drawPatios(C: Record<string, string>) {
    const ctx = this.ctx;
    const plan = this.plan;
    const fills = { paving: 'rgba(196, 184, 164, 0.55)', decking: 'rgba(170, 118, 76, 0.45)', gravel: 'rgba(170, 162, 148, 0.5)' };
    const list = Object.values(plan.patios ?? {}).sort((a, b) => a.height - b.height);
    for (const pt of list) {
      const shapes = patioShapes(plan, pt);
      const sel = this.selection?.kind === 'patio' && this.selection.id === pt.id;
      ctx.save();
      ctx.beginPath();
      for (const ring of shapes.flat()) {
        ring.forEach((p, i) => {
          const q = this.toScreen(p);
          if (i) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
        });
        ctx.closePath();
      }
      ctx.fillStyle = sel ? hexAlpha(C.accent, 0.22) : fills[pt.surface];
      ctx.fill('evenodd');
      ctx.clip('evenodd');
      // The pattern: lines along the boards/courses, and across them for slabs.
      const along = { x: Math.cos(pt.angle), y: Math.sin(pt.angle) };
      const across = { x: -along.y, y: along.x };
      const step = pt.surface === 'decking' ? pt.module + 0.006 : pt.module;
      if (pt.surface !== 'gravel' && step * this.view.scale > 4) {
        const c = pt.points.reduce((a, p) => ({ x: a.x + p.x / pt.points.length, y: a.y + p.y / pt.points.length }), { x: 0, y: 0 });
        const R = Math.max(...pt.points.map((p) => dist(p, c))) + step;
        const n = Math.ceil(R / step);
        ctx.strokeStyle = pt.surface === 'decking' ? 'rgba(90, 55, 30, 0.45)' : 'rgba(110, 100, 85, 0.45)';
        ctx.lineWidth = 1;
        const dirs = pt.surface === 'paving' ? [[along, across], [across, along]] : [[along, across]];
        for (const [d, o] of dirs) {
          // Lines through points on a grid anchored at the plan origin, so they don't jump as the patio is dragged.
          const base = Math.round((c.x * o.x + c.y * o.y) / step) * step;
          const offset = base - (c.x * o.x + c.y * o.y);
          for (let k = -n; k <= n; k++) {
            const m = add(c, scale(o, offset + k * step));
            this.line(add(m, scale(d, -R)), add(m, scale(d, R)));
          }
        }
      } else if (pt.surface === 'gravel') {
        ctx.fillStyle = 'rgba(110, 100, 85, 0.5)';
        const b = pt.points;
        const minX = Math.min(...b.map((p) => p.x));
        const maxX = Math.max(...b.map((p) => p.x));
        const minY = Math.min(...b.map((p) => p.y));
        const maxY = Math.max(...b.map((p) => p.y));
        const g = Math.max(0.15, 6 / this.view.scale);
        for (let x = Math.floor(minX / g) * g; x <= maxX; x += g) {
          for (let y = Math.floor(minY / g) * g; y <= maxY; y += g) {
            const j = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            const q = this.toScreen({ x: x + (j - Math.floor(j)) * g * 0.6, y: y + ((j * 7) % 1) * g * 0.6 });
            ctx.fillRect(q.x, q.y, 1.5, 1.5);
          }
        }
      }
      ctx.restore();
      ctx.strokeStyle = sel ? C.accent : 'rgba(110, 100, 85, 0.8)';
      ctx.lineWidth = sel ? 2 : 1;
      for (const ring of shapes.flat()) {
        this.path(ring);
        ctx.stroke();
      }
    }
  }

  /**
   * A room's inside dimensions: each wall face's length, written just inside it along a
   * thin dimension line with ticks at the corners.
   */
  private drawRoomDims(inner: Vec2[], C: Record<string, string>) {
    const ctx = this.ctx;
    const k = this.view.scale;
    ctx.save();
    ctx.strokeStyle = hexAlpha(C.accent, 0.7);
    ctx.fillStyle = C.accent;
    ctx.lineWidth = 1;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    inner.forEach((a, i) => {
      const b = inner[(i + 1) % inner.length];
      const len = dist(a, b);
      if (len * k < 40) return;
      const d = unit(sub(b, a));
      let n = vec(-d.y, d.x);
      const mid = scale(add(a, b), 0.5);
      if (!pointInPolygon(add(mid, scale(n, 0.02)), inner)) n = scale(n, -1);
      const off = 12 / k;
      const pa = add(a, scale(n, off));
      const pb = add(b, scale(n, off));
      this.line(pa, pb);
      const t = 3 / k;
      this.line(add(pa, scale(n, -t)), add(pa, scale(n, t)));
      this.line(add(pb, scale(n, -t)), add(pb, scale(n, t)));
      // The figure sits on the line, reading along the wall and never upside down.
      const m = this.toScreen(add(mid, scale(n, off + 8 / k)));
      let ang = Math.atan2(d.y, d.x);
      if (ang > Math.PI / 2 + 1e-6) ang -= Math.PI;
      if (ang <= -Math.PI / 2 + 1e-6) ang += Math.PI;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(ang);
      ctx.fillText(len.toFixed(2), 0, 0);
      ctx.restore();
    });
    ctx.restore();
  }

  private drawFurniture(C: Record<string, string>) {
    // Largest first, so a rug lies under the table on it.
    const list = Object.values(this.plan.furniture ?? {}).sort((a, b) => b.width * b.depth - a.width * a.depth);
    for (const f of list) {
      const sel = this.selection?.kind === 'furniture' && this.selection.id === f.id;
      this.drawPiece(f, sel ? C.accent : C.ink, sel ? hexAlpha(C.accent, 0.18) : hexAlpha(C.opening, 0.92));
    }
  }

  private drawPiece(f: Furniture, ink: string, fill: string) {
    const ctx = this.ctx;
    const k = this.view.scale;
    const s = this.toScreen(f);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(f.angle);
    ctx.scale(k, k);
    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = ink;
    drawFurnitureSymbol(ctx, f, fill);
    ctx.restore();
  }

  /** Trees, seen from above: a translucent crown, and the trunk. */
  private drawTrees(C: Record<string, string>) {
    const ctx = this.ctx;
    for (const t of Object.values(this.plan.trees ?? {})) {
      const sel = this.selection?.kind === 'tree' && this.selection.id === t.id;
      const c = this.toScreen(t);
      const R = (t.spread / 2) * this.view.scale;
      const green = t.kind === 'conifer' ? '47, 90, 54' : '95, 143, 62';
      ctx.beginPath();
      // A scalloped crown for broad-leaved trees; a star-like one for conifers.
      const lobes = t.kind === 'conifer' ? 16 : 9;
      for (let i = 0; i <= lobes * 4; i++) {
        const a = (i / (lobes * 4)) * Math.PI * 2;
        const wobble = t.kind === 'conifer' ? (i % 4 === 0 ? 1 : 0.86) : 0.93 + 0.07 * Math.cos(a * lobes);
        const x = c.x + Math.cos(a) * R * wobble;
        const y = c.y + Math.sin(a) * R * wobble;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = sel ? hexAlpha(C.accent, 0.25) : `rgba(${green}, 0.28)`;
      ctx.fill();
      ctx.strokeStyle = sel ? C.accent : `rgba(${green}, 0.9)`;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(2.5, trunkRadius(t) * this.view.scale), 0, Math.PI * 2);
      ctx.fillStyle = sel ? C.accent : '#6b5341';
      ctx.fill();
    }
  }

  /** A north arrow in the corner, from the building's site orientation. */
  private drawNorth(C: Record<string, string>, W: number, H: number) {
    const ctx = this.ctx;
    const site = siteOf(this.store.building);
    // True north on the plan: turned anticlockwise by the direction the top of the plan faces.
    const a = (-site.north * Math.PI) / 180;
    const cx = W - 34;
    const cy = H - 70;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = hexAlpha(C.bg.startsWith('#') ? C.bg : '#ffffff', 0.85);
    ctx.fill();
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(6, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.fillText('N', 0, -25);
    ctx.restore();
  }

  deleteSelection() {
    const s = this.selection;
    if (!s) return;
    if (s.kind === 'wall') deleteWall(this.plan, s.id);
    else if (s.kind === 'node') deleteNode(this.plan, s.id);
    else if (s.kind === 'opening') deleteOpening(this.plan, s.id);
    else if (s.kind === 'stair') delete this.plan.stairs[s.id];
    else if (s.kind === 'pillar') delete this.plan.pillars?.[s.id];
    else if (s.kind === 'chimney') delete this.plan.chimneys?.[s.id];
    else if (s.kind === 'solar') delete this.plan.solar?.[s.id];
    else if (s.kind === 'rooflight') delete this.plan.rooflights?.[s.id];
    else if (s.kind === 'patio') delete this.plan.patios?.[s.id];
    else if (s.kind === 'tree') delete this.plan.trees?.[s.id];
    else if (s.kind === 'furniture') delete this.plan.furniture?.[s.id];
    else if (s.kind === 'roof') {
      if (s.id.startsWith('section:')) delete this.plan.roofSections?.[s.id.slice(8)];
      else {
        const ring = this.areaRing(s.id);
        if (ring) setAreaRoof(this.plan, ring, { ...DEFAULT_ROOF, kind: 'none' });
      }
    }
    else return;
    this.select(null);
    this.store.commit();
  }

  private validateSelection() {
    const s = this.selection;
    if (!s) return;
    const p = this.plan;
    const exists =
      (s.kind === 'level' && getLevel(this.store.building, s.id)) ||
      (s.kind === 'wall' && p.walls[s.id]) || (s.kind === 'node' && p.nodes[s.id]) || (s.kind === 'opening' && p.openings[s.id]) ||
      (s.kind === 'stair' && p.stairs?.[s.id]) ||
      (s.kind === 'roof' && this.roofExists(s.id)) ||
      (s.kind === 'pillar' && p.pillars?.[s.id]) ||
      (s.kind === 'chimney' && p.chimneys?.[s.id]) ||
      (s.kind === 'solar' && p.solar?.[s.id]) ||
      (s.kind === 'rooflight' && p.rooflights?.[s.id]) ||
      (s.kind === 'patio' && p.patios?.[s.id]) ||
      (s.kind === 'tree' && p.trees?.[s.id]) ||
      (s.kind === 'furniture' && p.furniture?.[s.id]);
    if (!exists) this.select(null);
  }

  // ---------------------------------------------------------------- rendering

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.requestRender();
  }

  requestRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  private render() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const W = this.canvas.width / dpr;
    const H = this.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(this.canvas);
    const col = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const C = {
      bg: col('--plan-bg', '#fbfaf7'),
      grid: col('--plan-grid', '#ebe8e1'),
      gridMajor: col('--plan-grid-major', '#d9d4ca'),
      wall: col('--plan-wall', '#3b3d42'),
      room: col('--plan-room', '#efe6d6'),
      text: col('--plan-text', '#5b5549'),
      accent: col('--accent', '#2f6fdf'),
      opening: col('--plan-opening', '#fbfaf7'),
      ink: col('--plan-ink', '#3b3d42'),
      danger: col('--danger', '#c2413a'),
      underlay: col('--plan-underlay', 'rgba(59, 61, 66, 0.16)'),
    };
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const plan = this.plan;
    this.fps = computeFootprints(plan);
    this.drawGrid(W, H, C.grid, C.gridMajor);
    this.drawPatios(C);


    // Rooms.
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rooms = detectRooms(plan);
    for (const r of rooms) {
      this.path(r.polygon);
      ctx.fillStyle = C.room;
      ctx.fill();
    }

    this.drawFurniture(C);

    // The floor below, faintly, as a guide for placing walls above it.
    const below = this.below();
    if (below) {
      ctx.fillStyle = C.underlay;
      for (const fp of computeFootprints(below).values()) {
        this.path(fp.polygon);
        ctx.fill();
      }
    }

    // Walls.
    for (const fp of this.fps.values()) {
      this.path(fp.polygon);
      const sel = this.selection?.kind === 'wall' && this.selection.id === fp.wallId;
      ctx.fillStyle = sel ? C.accent : C.wall;
      ctx.fill();
    }

    // Openings.
    for (const o of Object.values(plan.openings)) {
      const fp = this.fps.get(o.wallId);
      if (fp) this.drawOpening(fp, o, this.selection?.kind === 'opening' && this.selection.id === o.id, C);
    }

    // Stairs going up from here, and the stairwells of the stairs coming up from below.
    if (below) {
      for (const st of Object.values(levelBelowOf(this.store).stairs ?? {})) {
        this.drawStair(stairGeometry(st, levelBelowOf(this.store).height), false, true, C);
      }
    }
    for (const st of Object.values(plan.stairs ?? {})) {
      const sel = this.selection?.kind === 'stair' && this.selection.id === st.id;
      this.drawStair(stairGeometry(st, plan.height), sel, false, C);
    }

    this.drawRoofs(C);

    // Solar arrays: the panels, blue; chimney stacks: brick-red with a cross.
    for (const sa of Object.values(plan.solar ?? {})) {
      const g = solarGeometry(this.store.building, plan, sa);
      if (!g) continue;
      const sel = this.selection?.kind === 'solar' && this.selection.id === sa.id;
      for (const quad of g.panels) {
        this.path(quad);
        ctx.fillStyle = sel ? hexAlpha(C.accent, 0.45) : 'rgba(40, 64, 120, 0.55)';
        ctx.fill();
        ctx.strokeStyle = sel ? C.accent : 'rgba(40, 64, 120, 0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // Rooflights: the box outline, and each window with the usual cross.
    for (const r of Object.values(plan.rooflights ?? {})) {
      const g = rooflightGeometry(this.store.building, plan, r);
      if (!g) continue;
      const sel = this.selection?.kind === 'rooflight' && this.selection.id === r.id;
      const ink = sel ? C.accent : C.ink;
      this.path(g.footprint);
      ctx.fillStyle = sel ? hexAlpha(C.accent, 0.2) : 'rgba(170, 200, 225, 0.5)';
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = sel ? 2 : 1.2;
      ctx.stroke();
      ctx.lineWidth = 1;
      for (const win of g.windows) {
        this.path(win.frame);
        ctx.stroke();
        this.line(win.frame[0], win.frame[2]);
        this.line(win.frame[1], win.frame[3]);
      }
    }
    for (const c of Object.values(plan.chimneys ?? {})) {
      const f = chimneyFootprint(c);
      const sel = this.selection?.kind === 'chimney' && this.selection.id === c.id;
      this.path(f);
      ctx.fillStyle = sel ? C.accent : '#9a5b45';
      ctx.fill();
      ctx.strokeStyle = C.bg;
      ctx.lineWidth = 1;
      this.line(f[0], f[2]);
      this.line(f[1], f[3]);
    }
    if (this.flashMsg && performance.now() < this.flashMsg.until) {
      const q = this.toScreen(this.flashMsg.at);
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = C.danger;
      ctx.fillText(this.flashMsg.text, q.x + 12, q.y - 12);
    }

    // Pillars: solid squares or circles.
    for (const q of Object.values(plan.pillars ?? {})) {
      const sel = this.selection?.kind === 'pillar' && this.selection.id === q.id;
      const c = this.toScreen(q);
      const r = Math.max(3, (q.size / 2) * this.view.scale);
      ctx.beginPath();
      if (q.shape === 'round') ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      else ctx.rect(c.x - r, c.y - r, r * 2, r * 2);
      ctx.fillStyle = sel ? C.accent : C.wall;
      ctx.fill();
    }

    for (const r of rooms) {
      const c = this.toScreen(r.centroid);
      ctx.fillStyle = C.text;
      ctx.fillText(`${r.netArea.toFixed(1)} m²`, c.x, c.y);
    }
    if (this.showDims) for (const r of rooms) this.drawRoomDims(r.inner, C);

    // Selected wall: dimension.
    if (this.selection?.kind === 'wall') {
      const fp = this.fps.get(this.selection.id);
      if (fp) this.dimension(fp.a, fp.b, fp.thickness / 2 + 12 / this.view.scale, C.accent);
    }

    // Joints.
    const showNodes = this.tool === 'select' || this.tool === 'wall' || this.tool === 'split';
    if (showNodes) {
      for (const n of Object.values(plan.nodes)) {
        const s = this.toScreen(n);
        const sel = this.selection?.kind === 'node' && this.selection.id === n.id;
        ctx.beginPath();
        ctx.arc(s.x, s.y, sel ? 6 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = sel ? C.accent : C.bg;
        ctx.strokeStyle = sel ? C.bg : C.accent;
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }
    }

    this.drawTrees(C);
    this.drawNorth(C, W, H);
    this.drawToolPreview(C);

    for (const g of this.lastGuides) this.guide(g.from, g.to, C.accent);
  }

  private drawToolPreview(C: Record<string, string>) {
    const ctx = this.ctx;
    const h = this.hover;
    if (this.tool === 'wall') {
      const s = h ? this.snap(h, { from: this.drawStart }) : null;
      if (this.drawStart && s) {
        let end = s.p;
        const L = parseFloat(this.lengthInput);
        if (L > 0 && dist(end, this.drawStart) > 1e-6) end = add(this.drawStart, scale(unit(sub(end, this.drawStart)), L));
        const d = unit(sub(end, this.drawStart));
        const n = scale(vec(-d.y, d.x), this.wallProps.thickness / 2);
        this.path([add(this.drawStart, n), add(end, n), sub(end, n), sub(this.drawStart, n)]);
        ctx.fillStyle = hexAlpha(C.accent, 0.35);
        ctx.fill();
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1;
        ctx.stroke();
        this.dimension(this.drawStart, end, this.wallProps.thickness / 2 + 14 / this.view.scale, C.accent, this.lengthInput ? `${this.lengthInput}▍ m` : undefined);
      }
      if (s) {
        for (const g of s.guides) this.guide(g.from, g.to, C.accent);
        const p = this.toScreen(s.p);
        ctx.beginPath();
        if (s.kind === 'node' || s.kind === 'wall') ctx.rect(p.x - 5, p.y - 5, 10, 10);
        else ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else if ((this.tool === 'door' || this.tool === 'window' || this.tool === 'garage' || this.tool === 'glazed' || this.tool === 'paste') && h) {
      const fp = this.wallAt(h, 10 / this.view.scale);
      const spec = this.openingSpec();
      if (fp && spec) {
        const ghostPlan = clonePlan(this.plan);
        const o = placeOpening(ghostPlan, fp.wallId, local(fp, h).u, spec, this.fps);
        if (o) {
          ctx.globalAlpha = 0.6;
          this.drawOpening(fp, o, true, C);
          ctx.globalAlpha = 1;
        } else if (this.tool === 'paste') {
          const s = this.toScreen(h);
          ctx.font = '600 12px system-ui, sans-serif';
          ctx.fillStyle = C.danger;
          ctx.textAlign = 'left';
          ctx.fillText('No room for an exact copy here', s.x + 12, s.y - 12);
        }
      }
    } else if (this.drawingOutline) {
      const pts = [...this.sectionPts];
      const s = h ? this.snap(h, { from: pts[pts.length - 1] ?? null }) : null;
      if (s) pts.push(s.p);
      if (pts.length) {
        ctx.beginPath();
        pts.forEach((p, i) => {
          const q = this.toScreen(p);
          if (i) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
        });
        if (pts.length > 2) ctx.closePath();
        ctx.fillStyle = hexAlpha(C.accent, 0.12);
        ctx.fill();
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        for (const p of this.sectionPts) {
          const q = this.toScreen(p);
          ctx.fillStyle = C.accent;
          ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
        }
      }
    } else if (this.tool === 'furniture' && h) {
      const at = this.furniturePlacement(h);
      const c = catalogueItem(this.furnitureKind);
      if (at && c) {
        const ghost: Furniture = { id: '', kind: c.kind, x: at.at.x, y: at.at.y, angle: at.angle, width: c.width, depth: c.depth, height: c.height, open: true, stool: true };
        ctx.save();
        ctx.globalAlpha = 0.6;
        this.drawPiece(ghost, C.accent, hexAlpha(C.accent, 0.15));
        ctx.restore();
      }
    } else if (this.tool === 'stair' && h) {
      const start = this.stairStart;
      if (start) {
        const angle = this.stairAngle(start, h);
        if (angle !== null) {
          const ghost = { id: '', x: start.x, y: start.y, angle, width: DEFAULT_STAIR_WIDTH, going: DEFAULT_GOING, shape: this.stairShape, turn: 'left' as const };
          ctx.globalAlpha = 0.6;
          this.drawStair(stairGeometry(ghost, this.plan.height), true, false, C);
          ctx.globalAlpha = 1;
        }
      }
      const p = this.toScreen(start ?? this.snap(h).p);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (this.tool === 'split' && h) {
      const fp = this.wallAt(h, 10 / this.view.scale);
      if (fp) {
        const u = Math.round(local(fp, h).u / this.gridStep) * this.gridStep;
        const p1 = this.toScreen(wallPoint(fp, u, fp.thickness / 2 + 6 / this.view.scale));
        const p2 = this.toScreen(wallPoint(fp, u, -fp.thickness / 2 - 6 / this.view.scale));
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawOpening(fp: Footprint, o: Opening, selected: boolean, C: Record<string, string>) {
    const ctx = this.ctx;
    const half = fp.thickness / 2;
    const lo = o.offset - o.width / 2;
    const hi = o.offset + o.width / 2;
    const rect = [wallPoint(fp, lo, half), wallPoint(fp, hi, half), wallPoint(fp, hi, -half), wallPoint(fp, lo, -half)];
    this.path(rect);
    ctx.fillStyle = C.opening;
    ctx.fill();
    const ink = selected ? C.accent : C.ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = selected ? 2 : 1.2;
    // Jamb lines.
    this.line(rect[0], rect[3]);
    this.line(rect[1], rect[2]);
    if (o.kind === 'garage') {
      // Roller door: the door line on the inside face (dashed when open), and the casing.
      const side = o.swingFlip ? -1 : 1;
      if (o.open) ctx.setLineDash([5, 4]);
      ctx.lineWidth = selected ? 3 : 2.5;
      this.line(wallPoint(fp, lo, side * half), wallPoint(fp, hi, side * half));
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      this.line(wallPoint(fp, lo - 0.1, side * (half + 0.34)), wallPoint(fp, hi + 0.1, side * (half + 0.34)));
      ctx.setLineDash([]);
    } else if (o.kind === 'glazed') {
      this.drawGlazed(fp, o, half);
    } else if (o.kind === 'window') {
      this.line(wallPoint(fp, lo, half * 0.25), wallPoint(fp, hi, half * 0.25));
      this.line(wallPoint(fp, lo, -half * 0.25), wallPoint(fp, hi, -half * 0.25));
      this.line(rect[0], rect[1]);
      this.line(rect[3], rect[2]);
    } else {
      const side = o.swingFlip ? -1 : 1;
      const hingeU = o.hingeFlip ? hi : lo;
      const otherU = o.hingeFlip ? lo : hi;
      const hinge = wallPoint(fp, hingeU, side * half);
      const leafEnd = add(hinge, scale(fp.n, side * o.width));
      this.line(hinge, leafEnd);
      const hs = this.toScreen(hinge);
      const a1 = Math.atan2(leafEnd.y - hinge.y, leafEnd.x - hinge.x);
      const closed = wallPoint(fp, otherU, side * half);
      const a2 = Math.atan2(closed.y - hinge.y, closed.x - hinge.x);
      let delta = a2 - a1;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(hs.x, hs.y, o.width * this.view.scale, a1, a2, delta < 0);
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Glazed doors: the glass line(s), and the leaves' swing, slide or fold. */
  private drawGlazed(fp: Footprint, o: Opening, half: number) {
    const ctx = this.ctx;
    const lo = o.offset - o.width / 2;
    const hi = o.offset + o.width / 2;
    const side = o.swingFlip ? -1 : 1;
    const style = o.style ?? 'french';
    const thin = () => {
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
    };
    if (style === 'sliding') {
      // Two panes on two tracks, overlapping in the middle.
      const mid = o.offset;
      const a = 0.18 * half;
      this.line(wallPoint(fp, lo, a), wallPoint(fp, mid + 0.05, a));
      this.line(wallPoint(fp, mid - 0.05, -a), wallPoint(fp, hi, -a));
      // The arrow on the moving pane.
      const movesToLo = !o.hingeFlip;
      const from = movesToLo ? mid + (hi - mid) * 0.7 : mid - (mid - lo) * 0.7;
      const to = movesToLo ? mid + (hi - mid) * 0.2 : mid - (mid - lo) * 0.2;
      const y = movesToLo ? -a - half * 0.5 : a + half * 0.5;
      thin();
      this.line(wallPoint(fp, from, y), wallPoint(fp, to, y));
      ctx.setLineDash([]);
      const tip = wallPoint(fp, to, y);
      const back = movesToLo ? 0.12 : -0.12;
      this.line(tip, wallPoint(fp, to + back, y + 0.06));
      this.line(tip, wallPoint(fp, to + back, y - 0.06));
      return;
    }
    this.line(wallPoint(fp, lo, 0), wallPoint(fp, hi, 0));
    thin();
    if (style === 'french') {
      // Two leaves, each swinging from its jamb.
      const w = o.width / 2;
      for (const [hingeU, otherU] of [[lo, o.offset], [hi, o.offset]]) {
        const hinge = wallPoint(fp, hingeU, side * half);
        const leafEnd = add(hinge, scale(fp.n, side * w));
        ctx.setLineDash([]);
        this.line(hinge, leafEnd);
        ctx.setLineDash([3, 3]);
        const hs = this.toScreen(hinge);
        const closed = wallPoint(fp, otherU, side * half);
        const a1 = Math.atan2(leafEnd.y - hinge.y, leafEnd.x - hinge.x);
        const a2 = Math.atan2(closed.y - hinge.y, closed.x - hinge.x);
        let delta = a2 - a1;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        ctx.beginPath();
        ctx.arc(hs.x, hs.y, w * this.view.scale, a1, a2, delta < 0);
        ctx.stroke();
      }
    } else {
      // Bi-fold: a zigzag of leaves folding out to one side.
      const n = Math.max(2, Math.round((o.width - 0.12) / 0.8));
      const w = o.width / n;
      const depth = Math.min(w * 0.45, 0.35);
      ctx.beginPath();
      for (let k = 0; k <= n; k++) {
        const p = this.toScreen(wallPoint(fp, lo + k * w, side * (half + (k % 2 ? depth : 0))));
        if (k) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private drawGrid(W: number, H: number, minor: string, major: string) {
    const ctx = this.ctx;
    const tl = this.toWorld(vec(0, 0));
    const br = this.toWorld(vec(W, H));
    const steps = [0.1, 0.5, 1, 5, 10];
    const step = steps.find((s) => s * this.view.scale >= 12) ?? 10;
    const majorStep = step < 1 ? 1 : step * 5;
    ctx.lineWidth = 1;
    for (const [s, color] of [
      [step, minor],
      [majorStep, major],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let x = Math.floor(tl.x / s) * s; x <= br.x; x += s) {
        const sx = Math.round(this.toScreen(vec(x, 0)).x) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, H);
      }
      for (let y = Math.floor(tl.y / s) * s; y <= br.y; y += s) {
        const sy = Math.round(this.toScreen(vec(0, y)).y) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(W, sy);
      }
      ctx.stroke();
    }
  }

  private dimension(a: Vec2, b: Vec2, offset: number, color: string, label?: string) {
    const ctx = this.ctx;
    const d = unit(sub(b, a));
    const n = vec(-d.y, d.x);
    const pa = add(a, scale(n, offset));
    const pb = add(b, scale(n, offset));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    this.line(pa, pb);
    const t = 4 / this.view.scale;
    this.line(add(pa, scale(n, -t)), add(pa, scale(n, t)));
    this.line(add(pb, scale(n, -t)), add(pb, scale(n, t)));
    const m = this.toScreen(add(scale(add(pa, pb), 0.5), scale(n, 10 / this.view.scale)));
    const text = label ?? `${dist(a, b).toFixed(2)} m`;
    ctx.font = '600 12px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(m.x - w / 2, m.y - 9, w, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, m.x, m.y + 0.5);
  }

  private guide(a: Vec2, b: Vec2, color: string) {
    const ctx = this.ctx;
    ctx.strokeStyle = hexAlpha(color, 0.6);
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;
    this.line(a, b);
    ctx.setLineDash([]);
  }

  private path(pts: Vec2[]) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = this.toScreen(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
  }

  private line(a: Vec2, b: Vec2) {
    const ctx = this.ctx;
    const sa = this.toScreen(a);
    const sb = this.toScreen(b);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }
}

function levelBelowOf(store: Store): Level {
  return levelBelow(store.building, store.activeId)!;
}

/** A point in a wall's local frame. */
function local(fp: Footprint, p: Vec2) {
  const r = sub(p, fp.a);
  return { u: dot(r, fp.dir), v: dot(r, fp.n) };
}

function normAngle(a: number): number {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

function hexAlpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}

