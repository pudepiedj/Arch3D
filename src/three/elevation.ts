// Elevations for printing: the house seen square-on from each side, with no perspective
// (an orthographic camera), so every height and width is to scale. Drawn from the same 3D
// model as the view, on a white ground, with the edges of the surfaces inked in so it reads
// as a drawing, then the ground line and the floor levels added on top.

import * as THREE from 'three';
import { levelElevation } from '../model/building';
import { type Side, sideDirection } from '../model/print';
import { siteOf } from '../model/sun';
import type { Building } from '../model/types';
import { buildBuildingObject, createMaterials, disposeObject } from './build';

/** Where the camera looks from for one side, and how big the house is seen from there. */
interface SideView {
  /** Out of the house, towards the viewer (3D). */
  out: THREE.Vector3;
  /** The viewer's right (3D, horizontal). */
  right: THREE.Vector3;
  /** Along `right`: the house's extent, metres. */
  lo: number;
  hi: number;
  /** Height of the top of the house above the ground. */
  top: number;
}

export class ElevationRenderer {
  private scene = new THREE.Scene();
  private obj: THREE.Group;
  /** Every vertex of the house (not the patios on the ground), in world space. */
  private points: THREE.Vector3[] = [];
  private renderer: THREE.WebGLRenderer | null = null;

  constructor(
    private b: Building,
    opts: { trees: boolean },
  ) {
    const copy = structuredClone(b) as Building;
    if (!opts.trees) for (const l of copy.levels) l.trees = {};
    this.obj = buildBuildingObject(copy, createMaterials(), undefined, { leaf: 1, autumn: false });
    this.obj.updateMatrixWorld(true);
    this.scene.add(this.obj);
    this.scene.background = new THREE.Color(0xffffff);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 1.5), new THREE.AmbientLight(0xffffff, 0.7));
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    this.scene.add(this.sunLight, this.sunLight.target);

    // Ink the edges where surfaces meet at an angle, not the glass or the foliage.
    const ink = new THREE.LineBasicMaterial({ color: 0x2b2d31 });
    const meshes: THREE.Mesh[] = [];
    this.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) meshes.push(m);
    });
    const v = new THREE.Vector3();
    for (const m of meshes) {
      const mat = m.material as THREE.Material;
      const pos = m.geometry.getAttribute('position');
      if (!pos) continue;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (v.y > 0.2) this.points.push(v.clone());
      }
      if (mat.transparent || (mat as THREE.MeshStandardMaterial).flatShading || pos.count > 20000) continue;
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), ink));
    }
  }

  private sunLight: THREE.DirectionalLight;

  /** How the house looks from one side: which way is right, and its extent. */
  view(side: Side): SideView | null {
    const d = sideDirection(side, siteOf(this.b).north);
    const out = new THREE.Vector3(d.x, 0, d.y);
    const right = new THREE.Vector3(0, 1, 0).cross(out).normalize();
    let lo = Infinity;
    let hi = -Infinity;
    let top = 0;
    for (const p of this.points) {
      const u = p.dot(right);
      lo = Math.min(lo, u);
      hi = Math.max(hi, u);
      top = Math.max(top, p.y);
    }
    return Number.isFinite(lo) ? { out, right, lo, hi, top } : null;
  }

  /**
   * The part of the house within a plan area, seen from a side (or, for a section, from a
   * direction): along `right`, the area's width; along `out`, the depth to keep (from just
   * behind the area to just in front of it); and how tall what is in it stands.
   */
  areaView(out: THREE.Vector3, area: { x0: number; y0: number; x1: number; y1: number }, keep?: [number, number]) {
    const right = new THREE.Vector3(0, 1, 0).cross(out).normalize();
    const corners = [
      new THREE.Vector3(area.x0, 0, area.y0),
      new THREE.Vector3(area.x1, 0, area.y0),
      new THREE.Vector3(area.x1, 0, area.y1),
      new THREE.Vector3(area.x0, 0, area.y1),
    ];
    const us = corners.map((c) => c.dot(right));
    const as = corners.map((c) => c.dot(out));
    const lo = Math.min(...us);
    const hi = Math.max(...us);
    const depth: [number, number] = keep ?? [Math.min(...as) - 0.4, Math.max(...as) + 1.5];
    let top = 0;
    for (const p of this.points) {
      const u = p.dot(right);
      const a = p.dot(out);
      if (u >= lo && u <= hi && a >= depth[0] && a <= depth[1]) top = Math.max(top, p.y);
    }
    return { out, right, lo, hi, top, keep: depth };
  }

  /** The way out of the house on a side (3D). */
  outOf(side: Side): THREE.Vector3 {
    const d = sideDirection(side, siteOf(this.b).north);
    return new THREE.Vector3(d.x, 0, d.y);
  }

  /**
   * One elevation on a canvas `w` x `h` metres, at `pxPerM` CSS pixels to the metre and `dpr`
   * device pixels to each (reduced if the canvas would be too big for the graphics card),
   * the house centred across it and the ground `groundUp` metres above its bottom edge.
   */
  render(side: Side, w: number, h: number, groundUp: number, pxPerM: number, dpr: number): HTMLCanvasElement {
    const sv = this.view(side)!;
    return this.draw(sv.out, sv.right, (sv.lo + sv.hi) / 2, sv.hi, sv.top, w, h, groundUp, pxPerM, dpr);
  }

  /**
   * Looking at the house from `out` (towards -out), centred on `mid` along `right`, keeping
   * only what lies between `keep[0]` and `keep[1]` along `out` (everything if not given):
   * an elevation of part of the house, or with the near limit on a cut line, a section.
   */
  draw(
    out: THREE.Vector3,
    right: THREE.Vector3,
    mid: number,
    labelAt: number,
    top: number,
    w: number,
    h: number,
    groundUp: number,
    pxPerM: number,
    dpr: number,
    keep?: [number, number],
  ): HTMLCanvasElement {
    const maxPx = 4096;
    const k = Math.min(dpr, maxPx / (w * pxPerM), maxPx / (h * pxPerM));
    const W = Math.round(w * pxPerM * k);
    const H = Math.round(h * pxPerM * k);
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.setPixelRatio(1);
    }
    this.renderer.setSize(W, H, false);
    // Keep only a slab of the model: in front of the far limit, behind the near one.
    this.renderer.clippingPlanes = keep ? [new THREE.Plane(out.clone(), -keep[0]), new THREE.Plane(out.clone().negate(), keep[1])] : [];

    // Camera square-on, far enough out to see everything (an orthographic camera doesn't
    // mind how far).
    const centre = right.clone().multiplyScalar(mid);
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h - groundUp, -groundUp, 0.1, 1000);
    cam.position.copy(centre).addScaledVector(out, 300);
    cam.lookAt(centre);
    cam.updateMatrixWorld();

    // Light from over the viewer's left shoulder, so the planes step back from each other.
    this.sunLight.position.copy(centre).addScaledVector(out, 50).addScaledVector(right, -30).add(new THREE.Vector3(0, 60, 0));
    this.sunLight.target.position.copy(centre);
    this.sunLight.target.updateMatrixWorld();

    this.renderer.render(this.scene, cam);
    this.renderer.clippingPlanes = [];

    // Copy it to a plain canvas, and add the ground and the floor levels.
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(this.renderer.domElement, 0, 0);
    const s = pxPerM * k; // device pixels per metre
    const gy = H - groundUp * s;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, gy, W, H - gy);
    ctx.strokeStyle = '#2b2d31';
    ctx.lineWidth = 2.2 * k;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();

    // Floor levels, and the top of the roof, marked at the right-hand side.
    const x1 = Math.min(W - 150 * k, W / 2 + (labelAt - mid) * s + 10 * k);
    const marks: [number, string][] = this.b.levels.map((l) => [levelElevation(this.b, l.id), l.name]);
    marks.push([top, 'Top']);
    ctx.font = `${11 * k}px system-ui, sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 1 * k;
    for (const [y, name] of marks) {
      const py = gy - y * s;
      if (py < 0) continue;
      ctx.setLineDash([4 * k, 3 * k]);
      ctx.beginPath();
      ctx.moveTo(x1, py);
      ctx.lineTo(x1 + 14 * k, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1 + 14 * k, py);
      ctx.lineTo(x1 + 20 * k, py - 5 * k);
      ctx.lineTo(x1 + 26 * k, py);
      ctx.closePath();
      ctx.fillStyle = '#2b2d31';
      ctx.fill();
      ctx.fillText(`${name} +${y.toFixed(2)} m`, x1 + 30 * k, py - 1 * k);
    }
    return canvas;
  }

  dispose() {
    disposeObject(this.obj);
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}
