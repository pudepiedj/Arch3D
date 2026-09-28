// Printing to scale: paper sizes, the frame and title block on each sheet, the standard
// scale that fits the drawings, and how much of the plan a floor plan sheet has to show.

import { computeFootprints } from './joints';
import type { Level } from './types';
import type { Vec2 } from './geom';

export type Paper = 'A4' | 'A3' | 'roll';
export type Orientation = 'landscape' | 'portrait';

/**
 * Roll paper for the Epson SC-P800: 17 inches wide (431.8 mm), cut to whatever length the
 * drawings need.
 */
export const ROLL_WIDTH = 431.8;

/** Paper sizes in millimetres, portrait. */
export const PAPER: Record<Exclude<Paper, 'roll'>, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};

/** The usual architectural scales, 1:n, largest drawing first. */
export const SCALES = [20, 25, 50, 100, 200, 250, 500];

/** Margin to the frame, and the title block's height, in millimetres. */
export const MARGIN = 10;
export const TITLE_H = 18;
/** Gap between the frame and the drawing, and between the drawing and the title block. */
export const PAD = 4;

export interface Sheet {
  /** Paper, mm. */
  w: number;
  h: number;
  /** The drawing area on it, mm from the top left of the paper. */
  area: { x: number; y: number; w: number; h: number };
}

export function sheetLayout(paper: Exclude<Paper, 'roll'>, orientation: Orientation): Sheet {
  const p = PAPER[paper];
  const [w, h] = orientation === 'landscape' ? [p.h, p.w] : [p.w, p.h];
  const x = MARGIN + PAD;
  const y = MARGIN + PAD;
  return { w, h, area: { x, y, w: w - 2 * x, h: h - 2 * MARGIN - TITLE_H - 2 * PAD } };
}

/** Millimetres on paper for a length in metres at 1:n. */
export const mmOnPaper = (metres: number, n: number) => (metres * 1000) / n;

/** A drawing to fit on a sheet: its size in metres, and a border in millimetres on paper round it (each side). */
export interface Drawing {
  w: number;
  h: number;
  bx: number;
  by: number;
}

/** Does a drawing fit the area at 1:n? */
export function fitsAt(d: Drawing, area: { w: number; h: number }, n: number) {
  return mmOnPaper(d.w, n) + 2 * d.bx <= area.w + 1e-6 && mmOnPaper(d.h, n) + 2 * d.by <= area.h + 1e-6;
}

/** The largest standard scale at which every drawing fits the area (the smallest scale if none does). */
export function fitScale(drawings: Drawing[], area: { w: number; h: number }): number {
  return SCALES.find((n) => drawings.every((d) => fitsAt(d, area, n))) ?? SCALES[SCALES.length - 1];
}

export interface Extent {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * What the floor plans have to show, in plan metres: the walls, stairs, pillars and roof
 * sections of the given floors, and with `patios` the patios and decks too. (Trees, drains
 * and garden furniture are drawn where they fall within that, but don't widen it: a tree at
 * the end of the garden would shrink the house.) One extent for every floor, so the plans
 * lie over one another sheet to sheet.
 */
export function planExtent(levels: Level[], patios: boolean): Extent | null {
  const e = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const take = (p: Vec2, r = 0) => {
    e.x0 = Math.min(e.x0, p.x - r);
    e.y0 = Math.min(e.y0, p.y - r);
    e.x1 = Math.max(e.x1, p.x + r);
    e.y1 = Math.max(e.y1, p.y + r);
  };
  for (const level of levels) {
    for (const fp of computeFootprints(level).values()) fp.polygon.forEach((p) => take(p));
    for (const q of Object.values(level.pillars ?? {})) take(q, q.size / 2);
    for (const s of Object.values(level.roofSections ?? {})) s.points.forEach((p) => take(p));
    if (patios) for (const pt of Object.values(level.patios ?? {})) pt.points.forEach((p) => take(p));
  }
  if (!Number.isFinite(e.x0)) return null;
  // Room for the eaves drawn round the walls.
  return { x0: e.x0 - 0.6, y0: e.y0 - 0.6, x1: e.x1 + 0.6, y1: e.y1 + 0.6 };
}

/** The elevations, by the compass direction the side of the house faces. */
export const SIDES = ['N', 'E', 'S', 'W'] as const;
export type Side = (typeof SIDES)[number];
export const SIDE_NAMES: Record<Side, string> = { N: 'North', E: 'East', S: 'South', W: 'West' };
const BEARING: Record<Side, number> = { N: 0, E: 90, S: 180, W: 270 };

/**
 * The way out of the house on one side, in plan coordinates (x right, y down the screen):
 * where you stand to look at that elevation. `north` is the compass direction the top of the
 * plan faces, degrees.
 */
export function sideDirection(side: Side, north: number): Vec2 {
  const a = ((BEARING[side] - north) * Math.PI) / 180;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

/** A scale bar's length in metres: a round number no longer than `maxMm` on paper. */
export function scaleBarLength(n: number, maxMm = 50): number {
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
  let best = steps[0];
  for (const s of steps) if (mmOnPaper(s, n) <= maxMm) best = s;
  return best;
}

// ---------------------------------------------------------------- roll paper

/** The drawing width across the roll, inside the frame and its padding, in millimetres. */
export const ROLL_AREA_W = ROLL_WIDTH - 2 * (MARGIN + PAD);
/** Height of each drawing's caption, and the gap between drawings, in millimetres. */
export const CAPTION_H = 7;
export const GAP = 8;

/** The largest standard scale at which every drawing fits across the roll. */
export function rollScale(drawings: Drawing[]): number {
  return SCALES.find((n) => drawings.every((d) => mmOnPaper(d.w, n) + 2 * d.bx <= ROLL_AREA_W + 1e-6)) ?? SCALES[SCALES.length - 1];
}

/**
 * Drawings stacked down the roll, each under its caption: where each goes (mm from the top
 * left of the paper, and its size), and the length of paper it all takes, title block and
 * margins included.
 */
export function rollLayout(heights: number[]): { tops: number[]; length: number } {
  let y = MARGIN + PAD;
  const tops: number[] = [];
  for (const h of heights) {
    tops.push(y + CAPTION_H);
    y += CAPTION_H + h + GAP;
  }
  return { tops, length: y - GAP + PAD + TITLE_H + MARGIN };
}

/** A plan area grown by a margin (metres) all round. */
export function grow(e: Extent, by: number): Extent {
  return { x0: e.x0 - by, y0: e.y0 - by, x1: e.x1 + by, y1: e.y1 + by };
}

export type SectionWay = 'leftright' | 'updown';

/**
 * The line a section is cut along, through the middle of an area: left to right across the
 * plan (looking up it), or top to bottom (looking to the left). `a` to `b` on the plan.
 */
export function sectionLine(e: Extent, way: SectionWay): { a: Vec2; b: Vec2 } {
  const cx = (e.x0 + e.x1) / 2;
  const cy = (e.y0 + e.y1) / 2;
  // You look from the left of a->b: from below the plan looking up, or from the right looking left.
  return way === 'updown' ? { a: { x: cx, y: e.y1 }, b: { x: cx, y: e.y0 } } : { a: { x: e.x0, y: cy }, b: { x: e.x1, y: cy } };
}
