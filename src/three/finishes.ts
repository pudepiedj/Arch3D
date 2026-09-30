// Materials for the finishes: wall faces, floors and roof coverings, each drawn once on a
// canvas and repeated. Surfaces carry texture coordinates in metres (see Mesher), so each
// texture is scaled by the size of the patch of wall, floor or roof it shows: stone courses
// and bricks come out their real size on every wall.

import * as THREE from 'three';
import type { FloorFinish, RoofCovering, WallFinish } from '../model/types';

/** Pseudo-random numbers from a fixed seed, so the textures look the same every time. */
export function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A texture covering `w` x `h` metres, repeated. */
function sized(t: THREE.Texture | null, w: number, h: number) {
  t?.repeat.set(1 / w, 1 / h);
  return t;
}

const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`;

/** Speckle over the whole canvas: light and dark flecks, for render, stone and concrete. */
function speckle(ctx: CanvasRenderingContext2D, W: number, H: number, n: number, r: () => number, alpha = 0.07) {
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,30,20'}, ${alpha * (0.5 + r())})`;
    ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
}

// ---------------------------------------------------------------- walls

/** Render or plaster: nearly flat, with a faint trowelled grain. Tinted by the material's colour. */
function renderTexture() {
  return sized(
    canvasTexture(256, 256, (ctx) => {
      const r = rng(21);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 256, 256);
      speckle(ctx, 256, 256, 2500, r, 0.05);
    }),
    1.2,
    1.2,
  );
}

/** Dressed stone in courses 30 cm high, blocks of different lengths and shades. 2.4 x 1.8 m. */
function ashlarTexture() {
  return sized(
    canvasTexture(512, 384, (ctx) => {
      const r = rng(31);
      const course = 384 / 6;
      ctx.fillStyle = '#cbbfa6'; // mortar
      ctx.fillRect(0, 0, 512, 384);
      for (let i = 0; i < 6; i++) {
        let x = -r() * 80;
        while (x < 512) {
          const len = 70 + r() * 110;
          ctx.fillStyle = hsl(36 + r() * 10, 30 + r() * 18, 62 + r() * 14);
          ctx.fillRect(x + 2, i * course + 2, len - 4, course - 4);
          // The block wraps round the repeat.
          if (x + len > 512) ctx.fillRect(x + 2 - 512, i * course + 2, len - 4, course - 4);
          x += len;
        }
      }
      speckle(ctx, 512, 384, 9000, r, 0.08);
    }),
    2.4,
    1.8,
  );
}

/** Random rubble: irregular stones of all sizes, roughly coursed, in lime mortar. 1.6 x 1.6 m. */
function rubbleTexture() {
  return sized(
    canvasTexture(512, 512, (ctx) => {
      const r = rng(41);
      ctx.fillStyle = '#d3c9b4';
      ctx.fillRect(0, 0, 512, 512);
      // Rough courses of differing heights, each packed with stones of differing lengths;
      // every stone an irregular polygon a little smaller than its slot, so the mortar
      // shows as thin, uneven joints.
      let y = 0;
      while (y < 512) {
        const h = Math.min(26 + r() * 30, 512 - y);
        let x = -r() * 40;
        while (x < 512) {
          const w = 30 + r() * 70;
          const cx = x + w / 2;
          const cy = y + h / 2;
          // Its corners near the slot's corners, pulled in a little and knocked about, with a
          // point part-way along each side: a squarish, rough-faced stone.
          const hw = w / 2;
          const hh = h / 2;
          const j = () => 2 + r() * 5;
          const pts: [number, number][] = [
            [cx - hw + j(), cy - hh + j()],
            [cx + (r() - 0.5) * w * 0.5, cy - hh + j() * 0.6],
            [cx + hw - j(), cy - hh + j()],
            [cx + hw - j() * 0.6, cy + (r() - 0.5) * h * 0.4],
            [cx + hw - j(), cy + hh - j()],
            [cx + (r() - 0.5) * w * 0.5, cy + hh - j() * 0.6],
            [cx - hw + j(), cy + hh - j()],
            [cx - hw + j() * 0.6, cy + (r() - 0.5) * h * 0.4],
          ];
          ctx.fillStyle = hsl(30 + r() * 14, 10 + r() * 12, 50 + r() * 22);
          for (const dx of [0, -512, 512]) {
            ctx.beginPath();
            pts.forEach(([px, py], k) => (k ? ctx.lineTo(px + dx, py) : ctx.moveTo(px + dx, py)));
            ctx.closePath();
            ctx.fill();
          }
          x += w;
        }
        y += h;
      }
      speckle(ctx, 512, 512, 9000, r, 0.1);
    }),
    1.6,
    1.6,
  );
}

/** Red brick in stretcher bond: 215 x 65 mm with 10 mm joints. 0.9 x 0.3 m. */
function brickTexture() {
  return sized(
    canvasTexture(512, 171, (ctx) => {
      const r = rng(51);
      const cw = 512 / 4; // one brick plus joint
      const ch = 171 / 4;
      ctx.fillStyle = '#d6cfc3';
      ctx.fillRect(0, 0, 512, 171);
      for (let i = 0; i < 4; i++) {
        const off = i % 2 ? cw / 2 : 0;
        for (let k = -1; k < 5; k++) {
          ctx.fillStyle = hsl(12 + r() * 10, 45 + r() * 15, 34 + r() * 12);
          ctx.fillRect(k * cw + off + 3, i * ch + 3, cw - 6, ch - 6);
        }
      }
      speckle(ctx, 512, 171, 3000, r, 0.1);
    }),
    0.9,
    0.3,
  );
}

const WALL_COLOURS: Record<WallFinish, number> = {
  plaster: 0xf1ede6,
  render: 0xf1ede6,
  'render-cream': 0xeadcbf,
  'render-ochre': 0xd9a860,
  'render-pink': 0xdca38e,
  'paint-sage': 0xb9c4ad,
  'paint-blue': 0xb8c7d3,
  stone: 0xffffff,
  rubble: 0xffffff,
  brick: 0xffffff,
};

const cache = new Map<string, THREE.Material>();
function once(key: string, make: () => THREE.Material) {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = make()));
  return m;
}

let renderMap: THREE.Texture | null | undefined;

export function wallMaterial(f: WallFinish): THREE.Material {
  return once(`wall:${f}`, () => {
    let map: THREE.Texture | null = null;
    if (f === 'stone') map = ashlarTexture();
    else if (f === 'rubble') map = rubbleTexture();
    else if (f === 'brick') map = brickTexture();
    else if (f !== 'plaster' && !f.startsWith('paint')) map = renderMap === undefined ? (renderMap = renderTexture()) : renderMap;
    return new THREE.MeshStandardMaterial({ color: WALL_COLOURS[f], map, roughness: 0.9, side: THREE.DoubleSide });
  });
}

// ---------------------------------------------------------------- floors

/** Oak boards 18 cm wide, of random lengths. 2.4 x 1.44 m. */
function oakTexture() {
  return sized(
    canvasTexture(1024, 512, (ctx) => {
      const r = rng(61);
      const n = 8;
      const bh = 512 / n;
      ctx.fillStyle = '#6b5236';
      ctx.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < n; i++) {
        let x = -r() * 400;
        while (x < 1024) {
          const len = 250 + r() * 400;
          const tone = 52 + r() * 10;
          ctx.fillStyle = hsl(30 + r() * 6, 38 + r() * 10, tone);
          ctx.fillRect(x + 1, i * bh + 1, len - 2, bh - 2);
          if (x + len > 1024) ctx.fillRect(x + 1 - 1024, i * bh + 1, len - 2, bh - 2);
          // Grain.
          ctx.strokeStyle = `hsla(28, 40%, ${tone - 10}%, 0.35)`;
          for (let g = 0; g < 5; g++) {
            const y = i * bh + 4 + r() * (bh - 8);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(x + len / 3, y + (r() - 0.5) * 6, x + (2 * len) / 3, y + (r() - 0.5) * 6, x + len, y);
            ctx.stroke();
          }
          x += len;
        }
      }
    }),
    2.4,
    1.44,
  );
}

/** Square tiles with grout: `n` x `n` of them per repeat, coloured by `shade`. */
function tileTexture(seed: number, n: number, grout: string, shade: (r: () => number) => string, size: number) {
  return sized(
    canvasTexture(512, 512, (ctx) => {
      const r = rng(seed);
      const s = 512 / n;
      ctx.fillStyle = grout;
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          ctx.fillStyle = shade(r);
          ctx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
        }
      }
      speckle(ctx, 512, 512, 4000, r, 0.06);
    }),
    size,
    size,
  );
}

/** Stone flags in random rectangles, courses of two widths. 2.4 x 2.4 m. */
function flagTexture() {
  return sized(
    canvasTexture(512, 512, (ctx) => {
      const r = rng(71);
      ctx.fillStyle = '#b4ab98';
      ctx.fillRect(0, 0, 512, 512);
      let y = 0;
      while (y < 512) {
        const h = r() < 0.5 ? 85 : 128;
        let x = -r() * 100;
        while (x < 512) {
          const w = 85 + r() * 130;
          ctx.fillStyle = hsl(40 + r() * 8, 18 + r() * 12, 72 + r() * 10);
          ctx.fillRect(x + 2, y + 2, w - 4, Math.min(h, 512 - y) - 4);
          if (x + w > 512) ctx.fillRect(x + 2 - 512, y + 2, w - 4, Math.min(h, 512 - y) - 4);
          x += w;
        }
        y += h;
      }
      speckle(ctx, 512, 512, 8000, r, 0.07);
    }),
    2.4,
    2.4,
  );
}

function noiseTexture(seed: number, base: string, n: number, size: number) {
  return sized(
    canvasTexture(256, 256, (ctx) => {
      const r = rng(seed);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      speckle(ctx, 256, 256, n, r, 0.12);
    }),
    size,
    size,
  );
}

/** The floors are see-through in the Underground view, so the drains show beneath them. */
let floorsSeeThrough = false;
const floorMats: THREE.Material[] = [];
function seeThrough(m: THREE.Material) {
  m.transparent = floorsSeeThrough;
  m.opacity = floorsSeeThrough ? 0.4 : 1;
  m.depthWrite = !floorsSeeThrough;
  m.needsUpdate = true;
}
export function setFloorsSeeThrough(on: boolean) {
  floorsSeeThrough = on;
  floorMats.forEach(seeThrough);
}

export function floorMaterial(f: FloorFinish): THREE.Material {
  return once(`floor:${f}`, () => {
    const map =
      f === 'oak'
        ? oakTexture()
        : f === 'terracotta'
          ? tileTexture(81, 4, '#b8a58e', (r) => hsl(16 + r() * 8, 50 + r() * 12, 50 + r() * 10), 1.2)
          : f === 'stone'
            ? flagTexture()
            : f === 'tiles'
              ? tileTexture(91, 2, '#b9b9b6', (r) => hsl(40, 4, 84 + r() * 4), 1.2)
              : f === 'carpet'
                ? noiseTexture(101, '#9a9ca2', 9000, 0.6)
                : noiseTexture(111, '#b3b1ac', 5000, 3);
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: f === 'concrete' || f === 'tiles' ? 0.45 : f === 'carpet' ? 1 : 0.7, shadowSide: THREE.DoubleSide });
    floorMats.push(m);
    seeThrough(m);
    return m;
  });
}

// ---------------------------------------------------------------- roofs

/**
 * Courses of tiles along the slope (the texture's width runs along the eaves, its height up
 * the slope): `per` tiles of `w` metres across each repeat, courses `g` metres apart.
 */
function tileCourses(seed: number, cols: number, rows: number, tile: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number) => void) {
  return canvasTexture(512, 512, (ctx) => {
    const r = rng(seed);
    const w = 512 / cols;
    const h = 512 / rows;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 512);
    for (let j = 0; j < rows; j++) {
      const off = j % 2 ? w / 2 : 0;
      for (let i = -1; i <= cols; i++) tile(ctx, i * w + off, j * h, w, h, r);
    }
  });
}

export function roofMaterial(c: RoofCovering): THREE.Material {
  return once(`roof:${c}`, () => {
    let map: THREE.Texture | null;
    if (c === 'roman') {
      // Barrel tiles: rounded channels running down the slope, light on their crowns.
      map = sized(
        canvasTexture(512, 512, (ctx) => {
          const r = rng(121);
          const n = 8;
          const w = 512 / n;
          for (let i = 0; i < n; i++) {
            const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
            const l = 46 + r() * 8;
            g.addColorStop(0, hsl(18, 55, l - 16));
            g.addColorStop(0.5, hsl(20 + r() * 6, 58, l + 8));
            g.addColorStop(1, hsl(18, 55, l - 16));
            ctx.fillStyle = g;
            ctx.fillRect(i * w, 0, w, 512);
          }
          // Where each course overlaps the one below.
          for (let j = 0; j < 6; j++) {
            ctx.fillStyle = 'rgba(40, 15, 5, 0.3)';
            ctx.fillRect(0, (j * 512) / 6, 512, 5);
          }
          speckle(ctx, 512, 512, 5000, r, 0.08);
        }),
        1.6,
        2.4,
      );
    } else if (c === 'slate') {
      map = sized(
        tileCourses(131, 4, 8, (ctx, x, y, w, h, r) => {
          ctx.fillStyle = hsl(210, 8 + r() * 6, 26 + r() * 10);
          ctx.fillRect(x + 2, y + 2, w - 4, h - 3);
        }),
        1.2,
        2.0,
      );
    } else if (c === 'plain') {
      map = sized(
        tileCourses(141, 8, 10, (ctx, x, y, w, h, r) => {
          ctx.fillStyle = hsl(14 + r() * 8, 45 + r() * 12, 34 + r() * 10);
          ctx.fillRect(x + 2, y + 2, w - 4, h - 3);
        }),
        1.3,
        1.0,
      );
    } else {
      map = sized(
        tileCourses(151, 4, 6, (ctx, x, y, w, h, r) => {
          ctx.fillStyle = hsl(10 + r() * 4, 40 + r() * 6, 36 + r() * 5);
          ctx.fillRect(x + 1, y + 2, w - 2, h - 3);
          // The interlocking roll along each tile.
          ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
          ctx.fillRect(x + w * 0.62, y + 2, w * 0.1, h - 3);
        }),
        1.2,
        2.07,
      );
    }
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: c === 'slate' ? 0.6 : 0.85, side: THREE.DoubleSide });
  });
}
