// Flags for the flagpole, painted onto a canvas at 2:1: the hoist (by the pole) on the
// left, the top at the top.

import * as THREE from 'three';
import { canvasTexture } from './finishes';

export const FLAGS: Record<string, string> = {
  union: 'Union Flag',
  stgeorge: 'St George’s cross (England)',
  scotland: 'Saltire (Scotland)',
  wales: 'Red dragon (Wales)',
  norfolk: 'County of Norfolk',
  white: 'Plain white',
  red: 'Plain red',
  blue: 'Plain blue',
  green: 'Plain green',
  none: 'None (bare pole)',
};

/** The main colour of each flag, for when it can't be painted (and for a quick look). */
export const FLAG_COLOUR: Record<string, number> = {
  union: 0x012169,
  stgeorge: 0xf6f6f6,
  scotland: 0x005eb8,
  wales: 0x00a650,
  norfolk: 0xf2c200,
  white: 0xf6f6f6,
  red: 0xc0241e,
  blue: 0x1f3f8f,
  green: 0x2f7d3a,
};

type Ctx = CanvasRenderingContext2D;

/** A band of width `w` along the line from (x0, y0) to (x1, y1). */
function band(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, colour: string) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = w;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/**
 * The Union Flag, on the official 60 × 30 grid: St Andrew's white saltire (6 wide), St
 * Patrick's red saltire (2 wide) counterchanged, so the broad white is uppermost next to
 * the pole; and St George's red cross (6 wide) on a white cross (10 wide).
 */
function union(ctx: Ctx, W: number, H: number) {
  const u = W / 60;
  ctx.fillStyle = '#012169';
  ctx.fillRect(0, 0, W, H);
  // Carry the diagonals past the corners so the bands are square-ended off the edge.
  band(ctx, -W * 0.1, -H * 0.1, W * 1.1, H * 1.1, 6 * u, '#ffffff');
  band(ctx, -W * 0.1, H * 1.1, W * 1.1, -H * 0.1, 6 * u, '#ffffff');
  // The red saltire, one arm in each quarter, offset to the same turning side of each
  // diagonal (below it in the top quarter by the pole).
  const cx = W / 2;
  const cy = H / 2;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const dx = sx * 30 * u;
    const dy = sy * 15 * u;
    const len = Math.hypot(dx, dy);
    // Turned a quarter: (x, y) -> (y, -x), a unit long, times 1 for the middle of a band 2 wide.
    const nx = dy / len;
    const ny = -dx / len;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx < 0 ? 0 : cx, sy < 0 ? 0 : cy, cx, cy);
    ctx.clip();
    band(ctx, cx + nx * u, cy + ny * u, cx + dx * 1.2 + nx * u, cy + dy * 1.2 + ny * u, 2 * u, '#c8102e');
    ctx.restore();
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - 5 * u, 0, 10 * u, H);
  ctx.fillRect(0, cy - 5 * u, W, 10 * u);
  ctx.fillStyle = '#c8102e';
  ctx.fillRect(cx - 3 * u, 0, 6 * u, H);
  ctx.fillRect(0, cy - 3 * u, W, 6 * u);
}

/** Y Ddraig Goch: white over green, with the red dragon passant facing the pole. */
function wales(ctx: Ctx, W: number, H: number) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H / 2);
  ctx.fillStyle = '#00a650';
  ctx.fillRect(0, H / 2, W, H / 2);
  // The dragon, drawn in a 200 × 130 box set in the middle of the flag.
  const s = Math.min((W * 0.78) / 200, (H * 0.86) / 130);
  ctx.save();
  ctx.translate(W / 2 - 100 * s, H / 2 - 65 * s);
  ctx.scale(s, s);
  const red = '#d21034';
  ctx.fillStyle = red;
  ctx.strokeStyle = red;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const limb = (w: number, ...pts: [number, number][]) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  const shape = (...pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  };
  // Body.
  ctx.beginPath();
  ctx.ellipse(98, 76, 46, 15, -0.05, 0, Math.PI * 2);
  ctx.fill();
  // Neck and head, with open jaws and a forked tongue.
  limb(16, [62, 70], [46, 52], [34, 40]);
  shape([40, 30], [22, 30], [6, 36], [24, 41], [42, 44]);
  shape([38, 46], [20, 47], [8, 53], [26, 52], [40, 52]);
  limb(2.5, [12, 44], [2, 41]);
  shape([0, 37], [5, 41], [0, 45]);
  shape([36, 30], [44, 18], [44, 32]); // ear
  // Wing, raised, with a scalloped trailing edge.
  shape([86, 64], [96, 34], [118, 12], [150, 4], [142, 18], [148, 22], [134, 30], [140, 36], [124, 42], [128, 50], [112, 54], [110, 64]);
  // Legs: the near foreleg raised, the others planted, each with claws.
  limb(9, [66, 82], [52, 96], [40, 92]);
  shape([40, 86], [30, 90], [40, 97]);
  limb(9, [80, 86], [76, 110], [66, 116]);
  shape([70, 110], [58, 118], [72, 120]);
  limb(10, [124, 84], [132, 106], [122, 116]);
  shape([126, 110], [114, 118], [128, 121]);
  limb(9, [138, 80], [152, 102], [164, 104]);
  shape([160, 98], [170, 104], [160, 110]);
  // Tail: down from the rump and up over the back, ending in a spade.
  limb(8, [140, 74], [168, 86], [184, 70], [178, 50], [162, 46], [158, 30]);
  shape([158, 16], [149, 32], [158, 28], [167, 32]);
  // Spines along the back.
  for (let x = 66; x < 132; x += 10) shape([x, 64], [x + 4, 56], [x + 8, 63]);
  ctx.restore();
}

/** St Andrew's white saltire on blue. */
function scotland(ctx: Ctx, W: number, H: number) {
  ctx.fillStyle = '#005eb8';
  ctx.fillRect(0, 0, W, H);
  band(ctx, -W * 0.1, -H * 0.1, W * 1.1, H * 1.1, H * 0.2, '#ffffff');
  band(ctx, -W * 0.1, H * 1.1, W * 1.1, -H * 0.1, H * 0.2, '#ffffff');
}

/**
 * An ermine spot, centred at the origin, `s` tall: three small dots over a tail that
 * spreads into three points at the foot.
 */
function ermineSpot(ctx: Ctx, s: number) {
  ctx.beginPath();
  for (const [x, y] of [[-0.22, -0.36], [0.22, -0.36], [0, -0.5]]) {
    ctx.moveTo(x * s + 0.08 * s, y * s);
    ctx.arc(x * s, y * s, 0.08 * s, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -0.32 * s);
  ctx.quadraticCurveTo(0.06 * s, 0.1 * s, 0.24 * s, 0.42 * s);
  ctx.lineTo(0.09 * s, 0.32 * s);
  ctx.lineTo(0, 0.5 * s);
  ctx.lineTo(-0.09 * s, 0.32 * s);
  ctx.lineTo(-0.24 * s, 0.42 * s);
  ctx.quadraticCurveTo(-0.06 * s, 0.1 * s, 0, -0.32 * s);
  ctx.fill();
}

/**
 * Norfolk's flag (the arms of Bigod, Earls of Norfolk): per pale gold and black, a bend
 * ermine: a white band from the top by the pole to the foot of the fly, strewn with ermine
 * spots two, one, two, one along it, turned to follow it.
 */
function norfolk(ctx: Ctx, W: number, H: number) {
  ctx.fillStyle = '#f2c200';
  ctx.fillRect(0, 0, W / 2, H);
  ctx.fillStyle = '#111111';
  ctx.fillRect(W / 2, 0, W / 2, H);
  const [x0, y0, x1, y1] = [-W * 0.05, -H * 0.1, W * 1.05, H * 1.1];
  const width = H * 0.26;
  band(ctx, x0, y0, x1, y1, width, '#ffffff');
  const len = Math.hypot(x1 - x0, y1 - y0);
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const spot = width * 0.5;
  const step = width * 0.62;
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(angle);
  ctx.fillStyle = '#111111';
  // Along the band: rows of two, then one, then two...; the band's own "up" is across it.
  for (let i = 0, t = step * 0.8; t < len; i++, t += step) {
    const across = i % 2 === 0 ? [-width * 0.22, width * 0.22] : [0];
    for (const a of across) {
      ctx.save();
      ctx.translate(t, a);
      ctx.rotate(Math.PI / 2);
      ermineSpot(ctx, spot);
      ctx.restore();
    }
  }
  ctx.restore();
}

function stgeorge(ctx: Ctx, W: number, H: number) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#c8102e';
  ctx.fillRect(W / 2 - H * 0.1, 0, H * 0.2, H);
  ctx.fillRect(0, H * 0.4, W, H * 0.2);
}

const PAINT: Record<string, (ctx: Ctx, W: number, H: number) => void> = { union, wales, scotland, norfolk, stgeorge };

const cache = new Map<string, THREE.Texture | null>();

/** A flag painted as a texture (2:1, the hoist on the left); null where there's no canvas. */
export function flagTexture(kind: string): THREE.Texture | null {
  if (cache.has(kind)) return cache.get(kind)!;
  const paint = PAINT[kind];
  const t = canvasTexture(512, 256, (ctx) => {
    if (paint) paint(ctx, 512, 256);
    else {
      ctx.fillStyle = `#${(FLAG_COLOUR[kind] ?? 0xf6f6f6).toString(16).padStart(6, '0')}`;
      ctx.fillRect(0, 0, 512, 256);
    }
  });
  if (t) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  }
  cache.set(kind, t);
  return t;
}
