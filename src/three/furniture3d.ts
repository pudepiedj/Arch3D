// 3D models of the furniture catalogue. Each is built in the piece's own frame (centred,
// x across, back at -y, front at +y, heights up from the floor) and scaled to the piece's
// width, depth and height; the caller places and turns it.

import * as THREE from 'three';
import { grandOutline } from '../model/furniture';
import type { Vec2 } from '../model/geom';
import type { Furniture } from '../model/types';

// ---------------------------------------------------------------- materials

const cache = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = make()));
  return m;
}
const plain = (color: number, roughness = 0.7, metalness = 0) =>
  mat(`p${color}-${roughness}-${metalness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness }));
/** Polished like a piano: a clear lacquer over the colour. */
const lacquer = (color: number) =>
  // Two-sided: the inside of a piano's rim is seen as well as the outside.
  mat(`l${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }));
const glass = () =>
  mat('glass', () => new THREE.MeshPhysicalMaterial({ color: 0xd8ecf4, roughness: 0.05, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));

const WOOD: Record<string, number> = { oak: 0xc49a6c, walnut: 0x6b4a32, white: 0xf1efe9, teak: 0xa0703f, grey: 0x7f8387, mahogany: 0x5a2418, black: 0x151517 };
const FABRIC: Record<string, number> = { grey: 0x8c8f94, blue: 0x46638c, green: 0x5b7a55, cream: 0xe2d8c4, rust: 0xa8573a, red: 0x9e3b35 };
const UNIT: Record<string, number> = { white: 0xf4f3ef, sage: 0x9fb09a, navy: 0x2f3e5a, oak: 0xc49a6c };

const wood = (f?: string) => plain(WOOD[f ?? 'oak'] ?? WOOD.oak, 0.6);
const fabric = (f?: string) => plain(FABRIC[f ?? 'grey'] ?? FABRIC.grey, 0.95);
const ceramic = () => plain(0xfafafa, 0.2);
const steel = () => plain(0xc9ccd0, 0.3, 0.7);
const chrome = () => plain(0xe6e8ea, 0.15, 0.9);
const dark = () => plain(0x1c1d20, 0.4);
const worktop = () => plain(0xd9d6cf, 0.35);
const linen = () => plain(0xf6f3ec, 0.95);

// ---------------------------------------------------------------- a small kit of parts

class Kit {
  g = new THREE.Group();

  private add(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, z, y);
    mesh.castShadow = mesh.receiveShadow = true;
    this.g.add(mesh);
    return mesh;
  }

  /** A box w across, d deep, h tall, centred on (x, y) with its bottom at z. */
  box(w: number, d: number, h: number, x: number, y: number, z: number, m: THREE.Material) {
    return this.add(new THREE.BoxGeometry(w, h, d), m, x, y, z + h / 2);
  }

  /** An upright cylinder (radius r at the bottom, r2 at the top). */
  cyl(r: number, h: number, x: number, y: number, z: number, m: THREE.Material, r2 = r, seg = 16) {
    return this.add(new THREE.CylinderGeometry(r2, r, h, seg), m, x, y, z + h / 2);
  }

  /** A round rod between two points (plan x, y and height z). */
  rod(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, r: number, m: THREE.Material) {
    const d = new THREE.Vector3(b.x - a.x, b.z - a.z, b.y - a.y);
    const mesh = this.add(new THREE.CylinderGeometry(r, r, d.length(), 8), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return mesh;
  }

  sphere(r: number, x: number, y: number, z: number, m: THREE.Material) {
    return this.add(new THREE.SphereGeometry(r, 16, 12), m, x, y, z);
  }

  /** A horizontal slab in the shape of a plan outline, from z up by h. */
  slab(pts: Vec2[], h: number, z: number, m: THREE.Material, holes: Vec2[][] = []) {
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
    for (const hole of holes) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
    // The shape is drawn in (x, y); turn it to lie flat with plan y along world z.
    geo.rotateX(Math.PI / 2);
    geo.translate(0, h, 0);
    return this.add(geo, m, 0, 0, z);
  }

  /** Four legs just in from the corners of a w x d rectangle centred on (x, y). */
  legs(w: number, d: number, h: number, x: number, y: number, r: number, m: THREE.Material, inset = r * 1.5) {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) this.box(r * 2, r * 2, h, x + sx * (w / 2 - inset), y + sy * (d / 2 - inset), 0, m);
  }
}

// ---------------------------------------------------------------- the models

export function buildFurniture(f: Furniture): THREE.Group {
  const k = new Kit();
  const { width: w, depth: d, height: h } = f;
  const build = BUILDERS[f.kind];
  if (build) build(k, f, w, d, h);
  else k.box(w, d, h, 0, 0, 0, plain(0xcccccc));
  k.g.name = `furniture:${f.id}`;
  return k.g;
}

type Builder = (k: Kit, f: Furniture, w: number, d: number, h: number) => void;

/** A dining chair at (x, y) whose seat faces direction `a` (radians, in the piece's frame). */
function chair(k: Kit, x: number, y: number, a: number, m: THREE.Material) {
  const sub = new Kit();
  sub.legs(0.44, 0.44, 0.44, 0, 0, 0.018, m);
  sub.box(0.46, 0.46, 0.04, 0, 0, 0.44, m);
  sub.box(0.44, 0.03, 0.44, 0, -0.215, 0.48, m);
  sub.g.position.set(x, 0, y);
  sub.g.rotation.y = -a;
  k.g.add(sub.g);
}

function sofa(k: Kit, f: Furniture, w: number, d: number, h: number, seats: number) {
  const m = fabric(f.finish);
  const arm = Math.min(0.2, w * 0.12);
  k.box(w, d, 0.4, 0, 0, 0.08, m); // base
  k.box(w, 0.22, h - 0.08, 0, -d / 2 + 0.11, 0.08, m); // back
  for (const s of [-1, 1]) k.box(arm, d, 0.62 - 0.08, s * (w / 2 - arm / 2), 0, 0.08, m);
  const inner = w - arm * 2;
  const cw = inner / seats;
  for (let i = 0; i < seats; i++) {
    const cx = -inner / 2 + cw * (i + 0.5);
    k.box(cw - 0.02, d - 0.26, 0.14, cx, 0.1, 0.48, m); // seat cushion
    k.box(cw - 0.03, 0.16, h - 0.62 - 0.02, cx, -d / 2 + 0.28, 0.62, m); // back cushion
  }
  k.legs(w, d, 0.08, 0, 0, 0.02, wood('walnut'), 0.06);
}

function bed(k: Kit, f: Furniture, w: number, d: number, h: number, pillows: number) {
  const m = wood(f.finish);
  k.legs(w, d, 0.12, 0, 0, 0.03, m);
  k.box(w, d - 0.05, 0.22, 0, 0.025, 0.12, m); // divan
  k.box(w, 0.06, h, 0, -d / 2 + 0.03, 0, m); // headboard
  k.box(w - 0.04, d - 0.12, 0.2, 0, 0.03, 0.34, linen()); // mattress
  const pw = (w - 0.12) / pillows;
  for (let i = 0; i < pillows; i++) k.box(pw - 0.05, 0.36, 0.12, -w / 2 + 0.06 + pw * (i + 0.5), -d / 2 + 0.3, 0.54, linen());
  k.box(w + 0.02, d * 0.62, 0.06, 0, d / 2 - d * 0.31, 0.52, plain(0x9fb4c8, 0.95)); // duvet
}

function kitchenUnit(k: Kit, f: Furniture, w: number, d: number, h: number, top = true) {
  const m = plain(UNIT[f.finish ?? 'white'] ?? UNIT.white, 0.5);
  k.box(w - 0.004, d - 0.08, 0.1, 0, -0.04, 0, dark()); // plinth, set back
  k.box(w - 0.004, d - 0.03, h - 0.14, 0, -0.015, 0.1, m); // carcass and doors
  if (top) k.box(w, d, 0.04, 0, 0, h - 0.04, worktop());
  // A bar handle near the top of the door.
  k.box(Math.min(0.3, w * 0.5), 0.02, 0.015, 0, d / 2 - 0.02, h - 0.2, chrome());
}

function cabinet(k: Kit, w: number, d: number, h: number, m: THREE.Material, rows: number, cols: number) {
  k.box(w, d, h, 0, 0, 0, m);
  // Gaps between drawers and doors, and handles.
  const line = plain(0x000000, 1);
  for (let r = 1; r < rows; r++) k.box(w - 0.02, 0.004, 0.006, 0, d / 2 + 0.001, (h * r) / rows, line);
  for (let c = 1; c < cols; c++) k.box(0.006, 0.004, h - 0.02, -w / 2 + (w * c) / cols, d / 2 + 0.001, 0.01, line);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (w * (c + 0.5)) / cols;
      k.box(0.1, 0.02, 0.015, x, d / 2 + 0.01, (h * (r + 0.75)) / rows, chrome());
    }
  }
}

const SURROUND: Record<string, number> = { stone: 0xcfc6b6, white: 0xf3f1ec, marble: 0xe4e2de, oak: 0xb88a5a };
const METAL: Record<string, number> = { black: 0x1d1e20, grey: 0x55595e, cream: 0xe6dcc4, white: 0xf4f3ef, anthracite: 0x3a3d42 };

/** Burning logs: a few logs, glowing embers and flames. */
function fire(k: Kit, x: number, y: number, z: number, w: number) {
  const log = plain(0x3b2a1e, 0.9);
  for (let i = 0; i < 3; i++) {
    const m = k.cyl(0.045, w * 0.8, x, y + (i - 1) * 0.06, z + 0.05 + (i === 1 ? 0.06 : 0), log, 0.045, 8);
    m.rotation.z = Math.PI / 2;
    m.rotation.y = (i - 1) * 0.3;
    m.position.y = z + 0.05 + (i === 1 ? 0.06 : 0);
  }
  const ember = mat('ember', () => new THREE.MeshStandardMaterial({ color: 0x802010, emissive: 0xff4a10, emissiveIntensity: 1.2 }));
  const flame = mat('flame', () => new THREE.MeshStandardMaterial({ color: 0xff8a30, emissive: 0xff6a10, emissiveIntensity: 1.8, transparent: true, opacity: 0.75, depthWrite: false }));
  const core = mat('flamecore', () => new THREE.MeshStandardMaterial({ color: 0xffd070, emissive: 0xffc040, emissiveIntensity: 2.2, transparent: true, opacity: 0.85, depthWrite: false }));
  k.box(w * 0.8, 0.14, 0.02, x, y, z, ember);
  // Soft tongues of flame: tall rounded blobs, a yellow core inside each.
  const n = 4;
  for (let i = 0; i < n; i++) {
    const fx = x + (i - (n - 1) / 2) * w * 0.2;
    const fh = 0.1 + ((i * 37) % 5) * 0.02;
    const outer = k.sphere(0.05, fx, y, z + 0.08 + fh / 2, flame);
    outer.scale.set(1, fh / 0.1, 0.7);
    const inner = k.sphere(0.028, fx, y, z + 0.07 + fh / 3, core);
    inner.scale.set(1, fh / 0.09, 0.7);
  }
}

const DESK: Record<string, number> = { oak: 0xc49a6c, white: 0xf1efe9, walnut: 0x6b4a32, black: 0x1f2023 };

/** A desk top on metal side frames, with a modesty panel at the back. */
function officeDesk(k: Kit, f: Furniture, w: number, d: number, h: number, x = 0, y = 0) {
  const top = plain(DESK[f.finish ?? 'oak'] ?? DESK.oak, 0.5);
  const frame = plain(0x2a2c30, 0.4, 0.5);
  k.box(w, d, 0.025, x, y, h - 0.025, top);
  for (const s of [-1, 1]) {
    k.box(0.05, d - 0.1, 0.03, x + s * (w / 2 - 0.06), y, 0, frame); // foot
    k.box(0.05, 0.05, h - 0.055, x + s * (w / 2 - 0.06), y, 0.03, frame); // upright
    k.box(0.05, d - 0.1, 0.03, x + s * (w / 2 - 0.06), y, h - 0.055, frame); // top rail
  }
  k.box(w - 0.2, 0.015, 0.35, x, y - d / 2 + 0.06, h - 0.4, frame); // modesty panel
}

/** A monitor on its stand, facing +y (towards the user), at (x, y) on a surface at height z. */
function monitor(k: Kit, x: number, y: number, z: number, a = 0) {
  const sub = new Kit();
  const black = plain(0x151618, 0.35);
  sub.box(0.22, 0.18, 0.012, 0, 0, 0, black); // foot
  sub.box(0.04, 0.03, 0.22, 0, -0.05, 0.012, black); // neck
  sub.box(0.62, 0.03, 0.37, 0, -0.03, 0.12, black); // bezel
  sub.box(0.6, 0.004, 0.35, 0, -0.013, 0.13, mat('screen', () => new THREE.MeshStandardMaterial({ color: 0x1a2a3a, emissive: 0x3a5f8a, emissiveIntensity: 0.55, roughness: 0.15 })));
  sub.g.position.set(x, z, y);
  sub.g.rotation.y = -a;
  k.g.add(sub.g);
}

/** Keyboard and mouse in front of the user, at (x, y) on a surface at height z. */
function keyboard(k: Kit, x: number, y: number, z: number) {
  k.box(0.44, 0.14, 0.02, x, y, z, plain(0x2b2c2f, 0.5));
  k.box(0.42, 0.12, 0.004, x, y, z + 0.02, plain(0x4a4b4f, 0.6));
  const mouse = k.sphere(0.03, x + 0.3, y + 0.01, z + 0.012, plain(0x2b2c2f, 0.4));
  mouse.scale.set(1, 0.45, 1.6);
}

/** A PC tower standing on the floor. */
function tower(k: Kit, x: number, y: number) {
  k.box(0.2, 0.45, 0.45, x, y, 0, plain(0x1c1d20, 0.4, 0.3));
  k.box(0.004, 0.02, 0.02, x + 0.05, y + 0.226, 0.4, mat('led', () => new THREE.MeshStandardMaterial({ color: 0x3aa0ff, emissive: 0x3aa0ff, emissiveIntensity: 2 })));
}

/** A swivel office chair at (x, y) whose seat faces direction a (in the piece's frame). */
function officeChair(k: Kit, x: number, y: number, a: number, finish?: string) {
  const sub = new Kit();
  const fab = plain(finish === 'grey' ? 0x6f7378 : finish === 'blue' ? 0x2f4a70 : 0x1f2023, 0.9);
  const metal = plain(0x2a2c30, 0.35, 0.6);
  // Five-star base on castors, and the gas lift.
  for (let i = 0; i < 5; i++) {
    const t = (i / 5) * Math.PI * 2;
    const arm = sub.box(0.3, 0.04, 0.03, Math.cos(t) * 0.15, Math.sin(t) * 0.15, 0.06, metal);
    arm.rotation.y = -t;
    sub.sphere(0.028, Math.cos(t) * 0.3, Math.sin(t) * 0.3, 0.03, plain(0x111111, 0.5));
  }
  sub.cyl(0.025, 0.36, 0, 0, 0.08, metal);
  // Seat, back and arms.
  sub.box(0.5, 0.48, 0.08, 0, 0.02, 0.44, fab);
  sub.box(0.46, 0.05, 0.58, 0, -0.24, 0.55, fab).rotation.x = 0.1;
  sub.box(0.06, 0.04, 0.2, 0, -0.25, 0.4, metal);
  for (const s of [-1, 1]) {
    sub.box(0.03, 0.03, 0.2, s * 0.25, -0.02, 0.5, metal);
    sub.box(0.06, 0.26, 0.03, s * 0.25, 0.0, 0.69, fab);
  }
  sub.g.position.set(x, 0, y);
  sub.g.rotation.y = -a;
  k.g.add(sub.g);
}

const BUILDERS: Record<string, Builder> = {
  officedesk: (k, f, w, d, h) => officeDesk(k, f, w, d, h),
  officechair: (k, f) => officeChair(k, 0, 0, 0, f.finish),
  workstation: (k, f, w, d, h) => {
    const dd = 0.8;
    const y = -d / 2 + dd / 2;
    officeDesk(k, f, w, dd, h, 0, y);
    monitor(k, 0, -d / 2 + 0.2, h);
    keyboard(k, 0, -d / 2 + 0.52, h);
    tower(k, w / 2 - 0.25, -d / 2 + 0.3);
    officeChair(k, 0, -d / 2 + dd + 0.15, Math.PI);
  },
  workstation2: (k, f, w, d, h) => {
    const dd = 0.8;
    officeDesk(k, f, w, dd, h, 0, -d / 2 + dd / 2);
    // Two monitors, turned slightly in towards the user.
    monitor(k, -0.33, -d / 2 + 0.22, h, -0.2);
    monitor(k, 0.33, -d / 2 + 0.22, h, 0.2);
    keyboard(k, 0, -d / 2 + 0.52, h);
    tower(k, w / 2 - 0.25, -d / 2 + 0.3);
    officeChair(k, 0, -d / 2 + dd + 0.15, Math.PI);
  },
  cornerdesk: (k, f, w, d, h) => {
    // Main top along the back, a return down the left side.
    const back = 0.75;
    const ret = 0.65;
    officeDesk(k, f, w, back, h, 0, -d / 2 + back / 2);
    const top = plain(DESK[f.finish ?? 'oak'] ?? DESK.oak, 0.5);
    const frame = plain(0x2a2c30, 0.4, 0.5);
    const rl = d - back;
    k.box(ret, rl, 0.025, -w / 2 + ret / 2, -d / 2 + back + rl / 2, h - 0.025, top);
    k.box(0.05, 0.05, h - 0.025, -w / 2 + ret - 0.06, d / 2 - 0.06, 0, frame);
    k.box(0.05, 0.05, h - 0.025, -w / 2 + 0.06, d / 2 - 0.06, 0, frame);
    // Monitor in the corner, angled to the chair.
    monitor(k, -w / 2 + 0.42, -d / 2 + 0.38, h, -Math.PI / 4);
    keyboard(k, -w / 2 + 0.72, -d / 2 + 0.62, h);
    tower(k, w / 2 - 0.25, -d / 2 + 0.3);
    officeChair(k, -w / 2 + ret + 0.3, -d / 2 + back + 0.3, (Math.PI * 3) / 4);
  },
  filing: (k, f, w, d, h) => cabinet(k, w, d, h, plain(METAL[f.finish ?? 'grey'] ?? 0x9a9ea3, 0.45, 0.4), 3, 1),

  fireplace: (k, f, w, d, h) => {
    const stone = plain(SURROUND[f.finish ?? 'stone'] ?? SURROUND.stone, f.finish === 'marble' ? 0.25 : 0.7);
    const back = 0.22; // depth of the surround against the wall
    const by = -d / 2 + back / 2;
    // Hearth, projecting into the room.
    k.box(w, d, 0.05, 0, 0, 0, plain(0x2f3033, 0.6));
    // Surround: two pilasters, a frieze and the mantel shelf.
    const leg = Math.min(0.25, w * 0.18);
    for (const s of [-1, 1]) k.box(leg, back, h - 0.25, s * (w / 2 - leg / 2), by, 0.05, stone);
    k.box(w, back, 0.2, 0, by, h - 0.2, stone);
    k.box(w + 0.1, back + 0.08, 0.05, 0, by + 0.04, h, stone);
    // The fire opening: a black cast-iron insert with the fire in its grate.
    const ow = w - 2 * leg;
    k.box(ow, 0.05, h - 0.25, 0, -d / 2 + 0.03, 0.05, plain(0x121214, 0.7));
    k.box(ow * 0.7, back - 0.06, 0.05, 0, by, 0.06, plain(0x202022, 0.5, 0.4)); // grate
    fire(k, 0, by + 0.02, 0.1, ow * 0.6);
  },

  woodburner: (k, f, w, d, h) => {
    const body = plain(METAL[f.finish ?? 'black'] ?? METAL.black, 0.55, 0.3);
    k.box(w, d, 0.05, 0, 0, 0, plain(0x2f3033, 0.6)); // slate hearth
    const sw = Math.min(0.5, w * 0.55);
    const sd = Math.min(0.42, d * 0.5);
    const sy = -d / 2 + 0.08 + sd / 2;
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.04, 0.04, 0.15, x * (sw / 2 - 0.04), sy + y * (sd / 2 - 0.04), 0.05, body);
    k.box(sw, sd, 0.5, 0, sy, 0.2, body);
    k.box(sw + 0.04, sd + 0.04, 0.03, 0, sy, 0.7, body); // top plate
    // Glass door with the fire behind it.
    k.box(sw * 0.72, 0.01, 0.3, 0, sy + sd / 2 + 0.005, 0.28, mat('stoveglass', () => new THREE.MeshStandardMaterial({ color: 0x331a0a, emissive: 0xff5a18, emissiveIntensity: 0.4, roughness: 0.1 })));
    k.box(0.03, 0.04, 0.12, sw / 2 - 0.08, sy + sd / 2 + 0.02, 0.4, chrome());
    fire(k, 0, sy + 0.02, 0.26, sw * 0.6);
    // Flue pipe up to the ceiling.
    k.cyl(0.075, h - 0.73, 0, sy - 0.02, 0.73, body, 0.075, 16);
  },

  radiator: (k, f, w, d, h) => {
    const m = plain(METAL[f.finish ?? 'white'] ?? METAL.white, 0.4, 0.2);
    const z = 0.15; // fixed above the skirting
    const face = d / 2 - 0.035;
    k.box(w, 0.05, h, 0, face - 0.02, z, m); // panel
    for (let x = -w / 2 + 0.04; x < w / 2 - 0.02; x += 0.05) k.box(0.02, 0.008, h - 0.02, x, face + 0.008, z + 0.01, m);
    k.box(w, 0.07, 0.04, 0, face - 0.02, z + h - 0.04, m); // top grille
    for (const s of [-1, 1]) {
      k.cyl(0.012, z, s * (w / 2 + 0.03), face - 0.02, 0, chrome()); // pipes
      k.cyl(0.02, 0.06, s * (w / 2 + 0.03), face - 0.02, z - 0.02, chrome());
    }
    for (const s of [-1, 1]) k.box(0.03, 0.035, 0.05, s * (w / 2 - 0.15), -d / 2 + 0.017, z + h * 0.7, dark()); // brackets
  },

  columnrad: (k, f, w, d, h) => {
    const m = plain(METAL[f.finish ?? 'white'] ?? METAL.white, 0.35, 0.3);
    const z = 0.15;
    const n = Math.max(3, Math.round(w / 0.07));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w * (i + 0.5)) / n;
      for (const y of [-0.025, 0.025]) k.cyl(0.012, h, x, y + 0.01, z, m, 0.012, 8);
    }
    k.box(w, 0.07, 0.05, 0, 0.01, z, m);
    k.box(w, 0.07, 0.05, 0, 0.01, z + h - 0.05, m);
    for (const s of [-1, 1]) k.cyl(0.012, z, s * (w / 2 + 0.03), 0.01, 0, chrome());
    void d;
  },

  grand: (k, f, w, d) => {
    const lac = lacquer(WOOD[f.finish ?? 'black'] ?? WOOD.black);
    const outline = grandOutline(w, d);
    const key = 0.24; // depth of the keyboard at the front of the case
    // The case behind the keys: the outline with its front cut back.
    const front = d / 2 - key;
    const caseLine = outline.map((p) => (p.y > front ? { x: p.x, y: front } : p));
    const inset = insetRing(caseLine, 0.05);
    const floor = 0.64;
    const rim = 0.3;
    k.slab(caseLine, 0.08, floor, lac); // bottom of the case
    k.slab(caseLine, rim - 0.08, floor + 0.08, lac, [inset]); // the rim
    k.slab(inset, 0.012, floor + 0.14, plain(0xd9b77e, 0.6)); // soundboard (spruce)
    k.slab(insetRing(caseLine, 0.12), 0.02, floor + 0.17, plain(0xb9953f, 0.35, 0.6)); // iron frame (gilt)
    // Strings, fanned from the keyboard end towards the tail.
    const strings = plain(0xd8d8d8, 0.3, 0.9);
    for (let i = 0; i < 26; i++) {
      const x = -w / 2 + 0.12 + (i / 25) * (w - 0.34);
      const len = Math.max(0.35, (d - key - 0.25) * (1 - (i / 25) * 0.62));
      k.box(0.004, len, 0.004, x, front - 0.12 - len / 2, floor + 0.2, strings);
    }
    // Keybed, cheek blocks, keys and fallboard.
    k.box(w, key, 0.09, 0, d / 2 - key / 2, floor, lac);
    for (const s of [-1, 1]) k.box(0.1, key, 0.2, s * (w / 2 - 0.05), d / 2 - key / 2, floor, lac);
    const span = w - 0.2;
    const white = span / 52;
    k.box(span, 0.15, 0.022, 0, d / 2 - 0.085, floor + 0.09, plain(0xfaf8f2, 0.3));
    for (let i = 1; i < 52; i++) k.box(0.0015, 0.15, 0.023, -span / 2 + white * i, d / 2 - 0.085, floor + 0.09, plain(0x9a9a9a, 0.5));
    // Black keys: after A, C, D, F and G (the keyboard starts on A).
    const names = 'ABCDEFG';
    for (let i = 0; i < 51; i++) {
      if (!'ACDFG'.includes(names[i % 7])) continue;
      k.box(white * 0.55, 0.09, 0.03, -span / 2 + white * (i + 1), d / 2 - 0.115, floor + 0.1, plain(0x111111, 0.3));
    }
    k.box(span, 0.03, 0.13, 0, d / 2 - 0.175, floor + 0.09, lac); // fallboard
    // Music desk, leaning back.
    const desk = k.box(0.75, 0.02, 0.28, 0, front - 0.06, floor + rim + 0.02, lac);
    desk.rotation.x = -0.25;
    // Legs, and the lyre with its three pedals.
    const legAt: Vec2[] = [
      { x: -w / 2 + 0.1, y: d / 2 - 0.13 },
      { x: w / 2 - 0.1, y: d / 2 - 0.13 },
      { x: -w * 0.22, y: -d / 2 + 0.22 },
    ];
    for (const p of legAt) k.cyl(0.035, floor, p.x, p.y, 0, lac, 0.055, 12);
    const lyreY = d / 2 - 0.3;
    for (const s of [-1, 1]) k.box(0.025, 0.03, floor - 0.08, s * 0.07, lyreY, 0.08, lac);
    k.box(0.28, 0.12, 0.07, 0, lyreY, 0.02, lac);
    for (const s of [-1, 0, 1]) k.box(0.035, 0.12, 0.015, s * 0.06, lyreY + 0.1, 0.05, plain(0xc8a24a, 0.25, 0.9));
    // The lid: hinged along the straight bass side, propped open on its stick.
    const lid = new THREE.Group();
    const lidKit = new Kit();
    lidKit.slab(caseLine.map((p) => ({ x: p.x + w / 2, y: p.y })), 0.02, 0, lac);
    lid.add(lidKit.g);
    lid.position.set(-w / 2, floor + rim, 0);
    const angle = f.open ? THREE.MathUtils.degToRad(36) : 0;
    lid.rotation.z = angle;
    k.g.add(lid);
    if (f.open) {
      // The stick is hinged on top of the rim on the straight part of the treble side, near
      // the keyboard end, and leans in to a cup under the lid.
      const y = (front + (d / 2 - 0.22 * d)) / 2;
      const edge = rimEdgeAt(caseLine, y);
      const foot = { x: edge - 0.025, y, z: floor + rim };
      // A point on the lid's underside, a little inboard of the foot.
      const r = foot.x + w / 2 - 0.12;
      const top = { x: -w / 2 + r * Math.cos(angle), y, z: floor + rim + r * Math.sin(angle) };
      k.rod(foot, top, 0.011, lac);
      k.box(0.04, 0.05, 0.02, foot.x, y, foot.z, plain(0xc8a24a, 0.25, 0.9)); // brass hinge block
    }
    // The stool, in front of the keyboard.
    if (f.stool) {
      const y = d / 2 + 0.45;
      k.legs(0.56, 0.33, 0.48, 0, y, 0.022, lac);
      k.box(0.58, 0.35, 0.06, 0, y, 0.46, plain(0x1a1a1a, 0.8));
    }
  },

  upright: (k, f, w, d, h) => {
    const lac = lacquer(WOOD[f.finish ?? 'black'] ?? WOOD.black);
    const body = d * 0.6;
    k.box(w, body, h, 0, -d / 2 + body / 2, 0, lac);
    k.box(w, d - body, 0.08, 0, d / 2 - (d - body) / 2, 0.66, lac); // keybed
    const span = w - 0.2;
    k.box(span, d - body - 0.03, 0.02, 0, d / 2 - (d - body) / 2 + 0.01, 0.74, plain(0xfaf8f2, 0.3));
    const white = span / 52;
    for (let i = 0; i < 51; i++) {
      if (!'ACDFG'.includes('ABCDEFG'[i % 7])) continue;
      k.box(white * 0.55, 0.08, 0.025, -span / 2 + white * (i + 1), -d / 2 + body + 0.05, 0.75, plain(0x111111, 0.3));
    }
    for (const s of [-1, 1]) k.box(0.06, d - body, 0.66, s * (w / 2 - 0.08), d / 2 - (d - body) / 2, 0, lac); // toes
  },

  musicstand: (k, _f, w, d, h) => {
    const m = dark();
    k.cyl(0.012, h - 0.3, 0, 0, 0.05, m);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.box(0.3, 0.02, 0.02, Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.02, m).rotation.y = -a;
    }
    k.box(w, 0.01, 0.34, 0, 0, h - 0.34, m).rotation.x = -0.3;
    void d;
  },

  sofa3: (k, f, w, d, h) => sofa(k, f, w, d, h, 3),
  sofa2: (k, f, w, d, h) => sofa(k, f, w, d, h, 2),
  armchair: (k, f, w, d, h) => sofa(k, f, w, d, h, 1),

  coffee: (k, f, w, d, h) => {
    const m = wood(f.finish);
    k.box(w, d, 0.04, 0, 0, h - 0.04, m);
    k.box(w - 0.1, d - 0.1, 0.02, 0, 0, 0.12, m);
    k.legs(w, d, h - 0.04, 0, 0, 0.022, m, 0.05);
  },

  tvunit: (k, f, w, d, h) => {
    cabinet(k, w, d, 0.5, wood(f.finish), 1, 3);
    const tw = Math.min(w * 0.85, 1.45);
    k.box(0.3, 0.2, 0.05, 0, -0.05, 0.5, dark());
    k.box(tw, 0.05, Math.min(h - 0.58, tw * 0.57), 0, -0.05, 0.56, plain(0x0b0c0e, 0.15, 0.3));
  },

  bookcase: (k, f, w, d, h) => {
    const m = wood(f.finish);
    for (const s of [-1, 1]) k.box(0.02, d, h, s * (w / 2 - 0.01), 0, 0, m);
    k.box(w, 0.01, h, 0, -d / 2 + 0.005, 0, m);
    const shelves = Math.max(2, Math.round(h / 0.36));
    const colours = [0x8b2f2f, 0x2f4f7f, 0x3f6b3f, 0xc9a24a, 0x5a3f6b, 0xd9d2c0, 0x7a4a2a];
    let seed = [...f.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 3) >>> 0;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i <= shelves; i++) {
      const z = (i / shelves) * (h - 0.02);
      k.box(w - 0.04, d - 0.01, 0.02, 0, 0.005, z, m);
      if (i === shelves) break;
      // Books along the shelf, leaving a gap here and there.
      let x = -w / 2 + 0.03;
      while (x < w / 2 - 0.08) {
        const t = 0.02 + rand() * 0.035;
        const bh = (h / shelves) * (0.6 + rand() * 0.25);
        if (rand() > 0.08) k.box(t, d * 0.75, bh, x + t / 2, 0.02, z + 0.02, plain(colours[Math.floor(rand() * colours.length)], 0.8));
        x += t + 0.002;
      }
    }
  },

  lamp: (k, _f, w, _d, h) => {
    k.cyl(w * 0.3, 0.03, 0, 0, 0, dark());
    k.cyl(0.012, h - 0.3, 0, 0, 0.03, chrome());
    k.cyl(w / 2, 0.3, 0, 0, h - 0.32, mat('shade', () => new THREE.MeshStandardMaterial({ color: 0xf3e9d2, emissive: 0x5a4a2a, roughness: 0.9, side: THREE.DoubleSide })), w * 0.32);
  },

  rug: (k, f, w, d) => {
    const c = FABRIC[f.finish ?? 'red'] ?? FABRIC.red;
    k.box(w, d, 0.008, 0, 0, 0, plain(0xe7ddc9, 1));
    k.box(w - 0.16, d - 0.16, 0.01, 0, 0, 0, plain(c, 1));
    k.box(w - 0.5, d - 0.5, 0.012, 0, 0, 0, plain(0xe7ddc9, 1));
    k.box(w - 0.6, d - 0.6, 0.014, 0, 0, 0, plain(c, 1));
  },

  dining6: (k, f, w, d, h) => {
    const m = wood(f.finish);
    const td = d - 1.0;
    k.box(w, td, 0.04, 0, 0, h - 0.04, m);
    k.legs(w, td, h - 0.04, 0, 0, 0.03, m, 0.08);
    for (const x of [-w / 3, 0, w / 3]) {
      chair(k, x, -td / 2 - 0.2, 0, m); // backs towards -y, facing the table (+y)
      chair(k, x, td / 2 + 0.2, Math.PI, m);
    }
  },

  dininground: (k, f, w, d, h) => {
    const m = wood(f.finish);
    const r = Math.min(w, d) / 2 - 0.35;
    k.cyl(r, 0.04, 0, 0, h - 0.04, m, r, 32);
    k.cyl(0.05, h - 0.04, 0, 0, 0, m);
    k.cyl(0.3, 0.03, 0, 0, 0, m);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      // Seat facing the centre: its front (+y) points inward.
      chair(k, Math.cos(a) * (r + 0.1), Math.sin(a) * (r + 0.1), facingCentre(a), m);
    }
  },

  chair: (k, f) => chair(k, 0, 0, 0, wood(f.finish)),

  sideboard: (k, f, w, d, h) => {
    const m = wood(f.finish);
    k.legs(w, d, 0.15, 0, 0, 0.02, m, 0.05);
    cabinet(new KitAt(k, 0.15), w, d, h - 0.15, m, 1, 3);
  },

  double: (k, f, w, d, h) => bed(k, f, w, d, h, 2),
  single: (k, f, w, d, h) => bed(k, f, w, d, h, 1),

  bedside: (k, f, w, d, h) => {
    const m = wood(f.finish);
    cabinet(k, w, d, h, m, 2, 1);
    k.cyl(0.07, 0.03, 0, -0.05, h, dark());
    k.cyl(0.01, 0.3, 0, -0.05, h + 0.03, chrome());
    k.cyl(0.12, 0.16, 0, -0.05, h + 0.3, mat('shade', () => new THREE.MeshStandardMaterial({ color: 0xf3e9d2, emissive: 0x5a4a2a, roughness: 0.9, side: THREE.DoubleSide })), 0.08);
  },

  wardrobe: (k, f, w, d, h) => cabinet(k, w, d, h, wood(f.finish), 1, Math.max(1, Math.round(w / 0.5))),
  chest: (k, f, w, d, h) => cabinet(k, w, d, h, wood(f.finish), 4, 1),

  desk: (k, f, w, d, h) => {
    const m = wood(f.finish);
    const dd = Math.min(0.65, d - 0.4);
    k.box(w, dd, 0.03, 0, -d / 2 + dd / 2, h - 0.03, m);
    k.legs(w, dd, h - 0.03, 0, -d / 2 + dd / 2, 0.02, m, 0.04);
    chair(k, 0, -d / 2 + dd + 0.1, Math.PI, dark());
  },

  base: (k, f, w, d, h) => kitchenUnit(k, f, w, d, h),
  sink: (k, f, w, d, h) => {
    kitchenUnit(k, f, w, d, h);
    k.box(Math.min(0.8, w - 0.2), d - 0.2, 0.012, 0, 0.02, h + 0.001, steel());
    k.box(Math.min(0.7, w - 0.3), d - 0.3, 0.013, 0, 0.02, h + 0.001, plain(0x8f9396, 0.3, 0.8));
    k.cyl(0.015, 0.28, 0, -d / 2 + 0.07, h, chrome());
    k.box(0.02, 0.18, 0.02, 0, -d / 2 + 0.16, h + 0.26, chrome());
  },
  hob: (k, f, w, d, h) => {
    kitchenUnit(k, f, w, d, h);
    k.box(w - 0.06, 0.01, 0.55, 0, d / 2 - 0.005, 0.2, plain(0x121316, 0.1, 0.3)); // oven door
    k.box(w - 0.06, d - 0.08, 0.008, 0, 0, h, plain(0x0e0f11, 0.08, 0.2)); // glass hob
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(0.08, 0.002, x * w * 0.2, y * d * 0.2, h + 0.008, plain(0x3a3b3e, 0.5), 0.08, 24);
  },
  tall: (k, f, w, d, h) => {
    const m = plain(UNIT[f.finish ?? 'white'] ?? UNIT.white, 0.5);
    k.box(w - 0.004, d - 0.08, 0.1, 0, -0.04, 0, dark());
    cabinet(new KitAt(k, 0.1), w - 0.004, d - 0.03, h - 0.1, m, 2, 1);
  },
  fridge: (k, _f, w, d, h) => cabinet(k, w, d, h, steel(), 2, 1),
  island: (k, f, w, d, h) => {
    const m = plain(UNIT[f.finish ?? 'white'] ?? UNIT.white, 0.5);
    // Units on the back side, an overhanging top for stools at the front.
    const body = d - 0.3;
    k.box(w - 0.004, body - 0.08, 0.1, 0, -d / 2 + body / 2, 0, dark());
    k.box(w - 0.004, body, h - 0.14, 0, -d / 2 + body / 2, 0.1, m);
    k.box(w, d, 0.04, 0, 0, h - 0.04, worktop());
  },

  bath: (k, _f, w, d, h) => {
    const c = ceramic();
    const t = 0.06;
    k.box(w, t, h, 0, -d / 2 + t / 2, 0, c);
    k.box(w, t, h, 0, d / 2 - t / 2, 0, c);
    k.box(t, d, h, -w / 2 + t / 2, 0, 0, c);
    k.box(t, d, h, w / 2 - t / 2, 0, 0, c);
    k.box(w - 2 * t, d - 2 * t, 0.12, 0, 0, 0, c);
    k.cyl(0.015, 0.15, -w / 2 + 0.03, 0, h, chrome());
  },
  shower: (k, _f, w, d, h) => {
    k.box(w, d, 0.05, 0, 0, 0, ceramic());
    k.box(w, 0.008, h - 0.05, 0, d / 2 - 0.004, 0.05, glass());
    k.box(0.008, d, h - 0.05, w / 2 - 0.004, 0, 0.05, glass());
    k.cyl(0.012, h - 0.2, -w / 2 + 0.1, -d / 2 + 0.05, 0.05, chrome());
    k.cyl(0.1, 0.02, -w / 2 + 0.1, -d / 2 + 0.15, h - 0.15, chrome());
  },
  wc: (k, _f, w, d, h) => {
    const c = ceramic();
    k.box(w, 0.18, h, 0, -d / 2 + 0.09, 0, c);
    const bowl = k.cyl(w * 0.45, 0.4, 0, 0.08, 0, c, w * 0.5, 24);
    bowl.scale.set(1, 1, (d - 0.2) / w);
  },
  basin: (k, _f, w, d, h) => {
    const c = ceramic();
    k.cyl(0.08, h - 0.15, 0, -0.05, 0, c, 0.1);
    k.box(w, d, 0.15, 0, 0, h - 0.15, c);
    k.box(w - 0.1, d - 0.12, 0.01, 0, 0.02, h - 0.003, plain(0xdadfe3, 0.2));
    k.cyl(0.015, 0.14, 0, -d / 2 + 0.05, h, chrome());
  },

  gardenset: (k, f, w, d, h) => {
    const m = wood(f.finish);
    const r = Math.min(w, d) / 2 - 0.4;
    k.cyl(r, 0.03, 0, 0, h - 0.03, m, r, 32);
    k.legs(r * 1.2, r * 1.2, h - 0.03, 0, 0, 0.025, m, 0.03);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      chair(k, Math.cos(a) * (r + 0.15), Math.sin(a) * (r + 0.15), facingCentre(a), m);
    }
  },
  lounger: (k, f, w, d) => {
    const m = wood(f.finish);
    k.legs(w, d, 0.3, 0, 0, 0.025, m, 0.05);
    k.box(w, d * 0.7, 0.05, 0, d * 0.15, 0.3, m);
    k.box(w - 0.06, d * 0.68, 0.06, 0, d * 0.15, 0.35, plain(0xe8e2d0, 0.95));
    // The back rest, raised about its hinge.
    const L = d * 0.34;
    const tilt = 0.9;
    const hingeY = -d / 2 + d * 0.3;
    const back = k.box(w - 0.06, L, 0.06, 0, hingeY - (Math.cos(tilt) * L) / 2, 0, plain(0xe8e2d0, 0.95));
    back.position.y = 0.38 + (Math.sin(tilt) * L) / 2;
    back.rotation.x = tilt;
  },
  bench: (k, f, w, d, h) => {
    const m = wood(f.finish);
    for (const s of [-1, 1]) {
      k.box(0.05, d, 0.45, s * (w / 2 - 0.025), 0, 0, m);
      k.box(0.05, d * 0.8, 0.04, s * (w / 2 - 0.025), 0.05, 0.62, m); // arms
      k.box(0.05, 0.05, 0.2, s * (w / 2 - 0.025), d / 2 - 0.1, 0.45, m);
    }
    for (let i = 0; i < 4; i++) k.box(w - 0.1, d / 5, 0.03, 0, -d / 2 + (d / 4) * (i + 0.5), 0.43, m);
    for (let i = 0; i < 3; i++) k.box(w - 0.1, 0.02, 0.1, 0, -d / 2 + 0.05, 0.5 + i * 0.12, m);
    void h;
  },
  parasol: (k, f, w, _d, h) => {
    const c = FABRIC[f.finish ?? 'cream'] ?? FABRIC.cream;
    k.box(0.5, 0.5, 0.06, 0, 0, 0, dark());
    k.cyl(0.02, h, 0, 0, 0.06, wood('oak'));
    k.cyl(w / 2, 0.45, 0, 0, h - 0.45, mat(`canvas${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, side: THREE.DoubleSide })), 0.02, 8);
  },
  bbq: (k, _f, w, d, h) => {
    const m = dark();
    k.legs(w * 0.55, d, 0.75, 0, 0, 0.02, m, 0.04);
    k.box(w * 0.55, d, 0.25, 0, 0, 0.7, m);
    const hood = k.cyl(d / 2, w * 0.55, 0, 0, 0, m, d / 2, 16);
    hood.rotation.z = Math.PI / 2;
    hood.position.set(0, 0.95, 0);
    for (const s of [-1, 1]) k.box(w * 0.2, d * 0.9, 0.03, s * (w / 2 - w * 0.1), 0, 0.85, steel());
    void h;
  },
  planter: (k, _f, w, d, h) => {
    k.box(w, d, 0.45, 0, 0, 0, plain(0x6f6a64, 0.9));
    const bush = k.sphere(Math.min(w, d) * 0.55, 0, 0, 0.45 + (h - 0.45) * 0.5, mat('bush', () => new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.9, flatShading: true })));
    bush.scale.y = (h - 0.45) / (Math.min(w, d) * 1.1);
  },
};

/** The outer (treble side, largest x) edge of a case outline at depth y. */
function rimEdgeAt(ring: Vec2[], y: number): number {
  let best = -Infinity;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) return;
    const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
    best = Math.max(best, x);
  });
  return best;
}

/** The angle that turns a chair standing in direction `a` from the centre to face the centre. */
function facingCentre(a: number): number {
  return Math.atan2(Math.cos(a), -Math.sin(a));
}

/** A kit that adds its parts to another, raised by dz. */
class KitAt extends Kit {
  constructor(parent: Kit, dz: number) {
    super();
    this.g.position.y = dz;
    parent.g.add(this.g);
  }
}

/** A closed ring moved inwards by `by` (a plain miter offset, good for convex-ish outlines). */
function insetRing(ring: Vec2[], by: number): Vec2[] {
  const n = ring.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  const sgn = area > 0 ? 1 : -1;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n];
    const c = ring[i];
    const q = ring[(i + 1) % n];
    const n1 = normalOf(p, c, sgn);
    const n2 = normalOf(c, q, sgn);
    const m = { x: n1.x + n2.x, y: n1.y + n2.y };
    const len = Math.hypot(m.x, m.y) || 1;
    const k = by / Math.max(0.3, (m.x * n1.x + m.y * n1.y) / len);
    out.push({ x: c.x + (m.x / len) * k, y: c.y + (m.y / len) * k });
  }
  return out;
}

/** Inward unit normal of edge a-b, for a ring of the given orientation. */
function normalOf(a: Vec2, b: Vec2, sgn: number): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: (-dy / l) * sgn, y: (dx / l) * sgn };
}
