// Plan symbols for the furniture catalogue, drawn in the piece's own frame and in metres
// (the editor sets up the transform): centred, back at -y, front at +y.

import { grandOutline } from '../model/furniture';
import type { Vec2 } from '../model/geom';
import type { Furniture } from '../model/types';

type Ctx = CanvasRenderingContext2D;

/** Draw a piece: outline filled with `fill`, details in the current stroke style. */
export function drawFurnitureSymbol(ctx: Ctx, f: Furniture, fill: string) {
  const { width: w, depth: d } = f;
  const draw = SYMBOLS[f.kind] ?? ((c: Ctx) => rect(c, -w / 2, -d / 2, w, d, fill));
  draw(ctx, f, w, d, fill);
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, fill?: string, r = 0) {
  ctx.beginPath();
  if (r > 0) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.stroke();
}

function circle(ctx: Ctx, x: number, y: number, r: number, fill?: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.stroke();
}

function poly(ctx: Ctx, pts: Vec2[], fill?: string) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.stroke();
}

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** A chair seen from above at (x, y), its front facing direction a. */
function chair(ctx: Ctx, x: number, y: number, a: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  rect(ctx, -0.22, -0.22, 0.44, 0.44, fill, 0.04);
  rect(ctx, -0.22, -0.25, 0.44, 0.06, fill);
  ctx.restore();
}

const facingCentre = (a: number) => Math.atan2(Math.cos(a), -Math.sin(a));

type Symbol = (ctx: Ctx, f: Furniture, w: number, d: number, fill: string) => void;

function sofa(ctx: Ctx, w: number, d: number, fill: string, seats: number) {
  const arm = Math.min(0.2, w * 0.12);
  rect(ctx, -w / 2, -d / 2, w, d, fill, 0.06);
  rect(ctx, -w / 2 + arm, -d / 2, w - arm * 2, 0.22);
  const inner = w - arm * 2;
  for (let i = 1; i < seats; i++) line(ctx, -inner / 2 + (inner * i) / seats, -d / 2 + 0.22, -inner / 2 + (inner * i) / seats, d / 2);
  line(ctx, -w / 2 + arm, -d / 2, -w / 2 + arm, d / 2);
  line(ctx, w / 2 - arm, -d / 2, w / 2 - arm, d / 2);
}

function bed(ctx: Ctx, w: number, d: number, fill: string, pillows: number) {
  rect(ctx, -w / 2, -d / 2, w, d, fill);
  const pw = (w - 0.12) / pillows;
  for (let i = 0; i < pillows; i++) rect(ctx, -w / 2 + 0.06 + pw * i + 0.02, -d / 2 + 0.1, pw - 0.04, 0.36, undefined, 0.05);
  // The turned-down duvet.
  line(ctx, -w / 2, d / 2 - d * 0.62, w / 2, d / 2 - d * 0.62);
  line(ctx, -w / 2, d / 2 - d * 0.62, -w / 2 + 0.3, d / 2 - d * 0.62 + 0.3);
}

function unit(ctx: Ctx, w: number, d: number, fill: string) {
  rect(ctx, -w / 2, -d / 2, w, d, fill);
  line(ctx, -w / 2, d / 2 - 0.03, w / 2, d / 2 - 0.03);
}

const SYMBOLS: Record<string, Symbol> = {
  fireplace: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, 'rgba(60, 60, 64, 0.25)'); // hearth
    rect(ctx, -w / 2, -d / 2, w, 0.22, fill); // surround
    const leg = Math.min(0.25, w * 0.18);
    rect(ctx, -w / 2 + leg, -d / 2, w - 2 * leg, 0.18, '#444444');
  },
  woodburner: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, 'rgba(60, 60, 64, 0.25)');
    const sw = Math.min(0.5, w * 0.55);
    const sd = Math.min(0.42, d * 0.5);
    rect(ctx, -sw / 2, -d / 2 + 0.08, sw, sd, fill);
    circle(ctx, 0, -d / 2 + 0.08 + sd / 2 - 0.02, 0.075);
  },
  radiator: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2 + 0.03, w, d - 0.03, fill);
    for (let x = -w / 2 + 0.1; x < w / 2 - 0.05; x += 0.1) line(ctx, x, -d / 2 + 0.03, x, d / 2);
  },
  columnrad: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2 + 0.02, w, d - 0.02, fill);
    for (let x = -w / 2 + 0.07; x < w / 2 - 0.03; x += 0.07) line(ctx, x, -d / 2 + 0.02, x, d / 2);
  },
  grand: (ctx, f, w, d, fill) => {
    const outline = grandOutline(w, d);
    poly(ctx, outline, fill);
    // Keyboard, with the keys hinted.
    const front = d / 2 - 0.24;
    rect(ctx, -w / 2 + 0.1, d / 2 - 0.16, w - 0.2, 0.15, '#ffffff');
    for (let i = 1; i < 8; i++) line(ctx, -w / 2 + 0.1 + ((w - 0.2) * i) / 8, d / 2 - 0.16, -w / 2 + 0.1 + ((w - 0.2) * i) / 8, d / 2 - 0.01);
    line(ctx, -w / 2, front, w / 2, front);
    // The lid's hinge along the straight side, and the lid shown open by a dashed line.
    if (f.open) {
      ctx.save();
      ctx.setLineDash([0.06, 0.05]);
      line(ctx, -w / 2 + 0.05, front - 0.02, -w / 2 + 0.05, -d / 2 + 0.2);
      ctx.restore();
    }
    if (f.stool) {
      ctx.save();
      ctx.setLineDash([0.05, 0.04]);
      rect(ctx, -0.29, d / 2 + 0.275, 0.58, 0.35);
      ctx.restore();
    }
  },
  upright: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    rect(ctx, -w / 2 + 0.1, -d / 2 + d * 0.6, w - 0.2, d * 0.4 - 0.02, '#ffffff');
  },
  musicstand: (ctx, _f, w, d, fill) => {
    line(ctx, -w / 2, 0, w / 2, 0);
    circle(ctx, 0, 0, Math.min(w, d) * 0.3, fill);
  },
  sofa3: (ctx, _f, w, d, fill) => sofa(ctx, w, d, fill, 3),
  sofa2: (ctx, _f, w, d, fill) => sofa(ctx, w, d, fill, 2),
  armchair: (ctx, _f, w, d, fill) => sofa(ctx, w, d, fill, 1),
  coffee: (ctx, _f, w, d, fill) => rect(ctx, -w / 2, -d / 2, w, d, fill, 0.03),
  tvunit: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    rect(ctx, -Math.min(w * 0.85, 1.45) / 2, -0.1, Math.min(w * 0.85, 1.45), 0.05, '#333333');
  },
  bookcase: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    line(ctx, -w / 2, -d / 2, w / 2, d / 2);
  },
  lamp: (ctx, _f, w, _d, fill) => {
    circle(ctx, 0, 0, w / 2, fill);
    line(ctx, -w / 2, 0, w / 2, 0);
    line(ctx, 0, -w / 2, 0, w / 2);
  },
  rug: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    rect(ctx, -w / 2 + 0.25, -d / 2 + 0.25, w - 0.5, d - 0.5);
  },
  dining6: (ctx, _f, w, d, fill) => {
    const td = d - 1.0;
    for (const x of [-w / 3, 0, w / 3]) {
      chair(ctx, x, -td / 2 - 0.2, 0, fill);
      chair(ctx, x, td / 2 + 0.2, Math.PI, fill);
    }
    rect(ctx, -w / 2, -td / 2, w, td, fill);
  },
  dininground: (ctx, _f, w, d, fill) => {
    const r = Math.min(w, d) / 2 - 0.35;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      chair(ctx, Math.cos(a) * (r + 0.1), Math.sin(a) * (r + 0.1), facingCentre(a), fill);
    }
    circle(ctx, 0, 0, r, fill);
  },
  chair: (ctx, _f, _w, _d, fill) => chair(ctx, 0, 0, 0, fill),
  sideboard: (ctx, _f, w, d, fill) => unit(ctx, w, d, fill),
  double: (ctx, _f, w, d, fill) => bed(ctx, w, d, fill, 2),
  single: (ctx, _f, w, d, fill) => bed(ctx, w, d, fill, 1),
  bedside: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    circle(ctx, 0, -0.05, 0.12);
  },
  wardrobe: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    line(ctx, -w / 2, -d / 2, w / 2, d / 2);
    line(ctx, w / 2, -d / 2, -w / 2, d / 2);
  },
  chest: (ctx, _f, w, d, fill) => unit(ctx, w, d, fill),
  desk: (ctx, _f, w, d, fill) => {
    const dd = Math.min(0.65, d - 0.4);
    chair(ctx, 0, -d / 2 + dd + 0.1, Math.PI, fill);
    rect(ctx, -w / 2, -d / 2, w, dd, fill);
  },
  base: (ctx, _f, w, d, fill) => unit(ctx, w, d, fill),
  tall: (ctx, _f, w, d, fill) => {
    unit(ctx, w, d, fill);
    line(ctx, -w / 2, -d / 2, w / 2, d / 2 - 0.03);
  },
  sink: (ctx, _f, w, d, fill) => {
    unit(ctx, w, d, fill);
    rect(ctx, -Math.min(0.7, w - 0.3) / 2, -d / 2 + 0.15, Math.min(0.7, w - 0.3), d - 0.3, '#ffffff', 0.05);
    circle(ctx, 0, -d / 2 + 0.07, 0.025);
  },
  hob: (ctx, _f, w, d, fill) => {
    unit(ctx, w, d, fill);
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) circle(ctx, x * w * 0.2, y * d * 0.2, 0.08);
  },
  fridge: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    ctx.font = `${Math.min(w, d) * 0.3}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText('FF', 0, 0);
  },
  island: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    line(ctx, -w / 2, d / 2 - 0.3, w / 2, d / 2 - 0.3);
  },
  bath: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill, 0.05);
    rect(ctx, -w / 2 + 0.07, -d / 2 + 0.07, w - 0.14, d - 0.14, '#ffffff', Math.min(w, d) * 0.25);
    circle(ctx, -w / 2 + 0.16, 0, 0.03);
  },
  shower: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    line(ctx, -w / 2, -d / 2, w / 2, d / 2);
    line(ctx, w / 2, -d / 2, -w / 2, d / 2);
    circle(ctx, 0, 0, 0.04);
  },
  wc: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, 0.18, fill);
    ctx.beginPath();
    ctx.ellipse(0, -d / 2 + 0.18 + (d - 0.18) / 2, w * 0.45, (d - 0.18) / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  },
  basin: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill, 0.04);
    ctx.beginPath();
    ctx.ellipse(0, 0.02, (w - 0.14) / 2, (d - 0.14) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  },
  gardenset: (ctx, _f, w, d, fill) => {
    const r = Math.min(w, d) / 2 - 0.4;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      chair(ctx, Math.cos(a) * (r + 0.15), Math.sin(a) * (r + 0.15), facingCentre(a), fill);
    }
    circle(ctx, 0, 0, r, fill);
  },
  lounger: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill, 0.05);
    line(ctx, -w / 2, -d / 2 + d * 0.3, w / 2, -d / 2 + d * 0.3);
  },
  bench: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    for (let i = 1; i < 4; i++) line(ctx, -w / 2 + 0.05, -d / 2 + (d * i) / 4, w / 2 - 0.05, -d / 2 + (d * i) / 4);
  },
  parasol: (ctx, _f, w, _d, fill) => {
    ctx.save();
    ctx.globalAlpha = 0.5;
    const pts: Vec2[] = [];
    for (let i = 0; i < 8; i++) pts.push({ x: Math.cos((i / 8) * Math.PI * 2) * (w / 2), y: Math.sin((i / 8) * Math.PI * 2) * (w / 2) });
    poly(ctx, pts, fill);
    ctx.restore();
    for (const p of pts) line(ctx, 0, 0, p.x, p.y);
  },
  bbq: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    rect(ctx, -w * 0.275, -d / 2, w * 0.55, d, '#444444');
  },
  planter: (ctx, _f, w, d, fill) => {
    rect(ctx, -w / 2, -d / 2, w, d, fill);
    circle(ctx, 0, 0, Math.min(w, d) * 0.4, 'rgba(95, 143, 62, 0.5)');
  },
};
