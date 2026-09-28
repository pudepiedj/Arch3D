// Printing: the Print dialog, the pages it makes (floor plans and elevations to scale, each
// on a sheet with a frame and a title block), a preview of them, and the browser's print.
// Pages are sized in millimetres, so printed at 100% ("Actual size") the scale is exact.

import * as THREE from 'three';
import {
  CAPTION_H,
  type Drawing,
  type Extent,
  MARGIN,
  type Orientation,
  PAD,
  type Paper,
  ROLL_AREA_W,
  type SectionWay,
  ROLL_WIDTH,
  SIDE_NAMES,
  type Side,
  TITLE_H,
  fitScale,
  fitsAt,
  grow,
  paperWidth,
  SCALES,
  mmOnPaper,
  planExtent,
  rollLayout,
  rollScale,
  scaleBarLength,
  sectionLine,
  sheetLayout,
} from '../model/print';
import { siteOf } from '../model/sun';
import { ElevationRenderer } from '../three/elevation';
import type { View3D } from '../three/view3d';
import type { Editor2D } from './editor2d';
import type { Store } from './store';

const KEY = 'arch3d.print';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The section line on a printed plan: long dashes across the area, with arrows at each end
 * pointing the way it is looked at, and A at each end.
 */
function sectionMarks(canvas: HTMLCanvasElement, cut: { a: { x: number; y: number }; b: { x: number; y: number } }, box: Extent, pxPerDevM: number) {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const P = (p: { x: number; y: number }) => ({ x: (p.x - box.x0) * pxPerDevM, y: (p.y - box.y0) * pxPerDevM });
  const a = P(cut.a);
  const b = P(cut.b);
  const k = canvas.width / 1000;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  // The way it is looked at (the arrows point that way): away from the section's viewer.
  const look = { x: d.y, y: -d.x };
  ctx.save();
  ctx.strokeStyle = '#c2413a';
  ctx.fillStyle = '#c2413a';
  ctx.lineWidth = Math.max(2, 3 * k);
  ctx.setLineDash([24 * k, 8 * k, 4 * k, 8 * k]);
  ctx.beginPath();
  ctx.moveTo(a.x - d.x * 20 * k, a.y - d.y * 20 * k);
  ctx.lineTo(b.x + d.x * 20 * k, b.y + d.y * 20 * k);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `600 ${Math.max(14, 28 * k)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of [{ x: a.x - d.x * 20 * k, y: a.y - d.y * 20 * k }, { x: b.x + d.x * 20 * k, y: b.y + d.y * 20 * k }]) {
    const tip = { x: e.x + look.x * 30 * k, y: e.y + look.y * 30 * k };
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tip.x + look.x * 12 * k, tip.y + look.y * 12 * k);
    ctx.lineTo(tip.x + d.x * 9 * k, tip.y + d.y * 9 * k);
    ctx.lineTo(tip.x - d.x * 9 * k, tip.y - d.y * 9 * k);
    ctx.closePath();
    ctx.fill();
    ctx.fillText('A', e.x - look.x * 22 * k, e.y - look.y * 22 * k);
  }
  ctx.restore();
}
/**
 * Drawing pixels to a millimetre on paper: the plan's 12 px labels come out 2.4 mm high and
 * its 1 px lines 0.2 mm, as on a drawing board.
 */
const PX_PER_MM = 5;
/** Room on paper to the right of an elevation or section for its floor-level labels (mm). */
const LABELS = 34;

interface Options {
  paper: Paper;
  orientation: Orientation;
  /** 1:n, or 0 for the largest that fits. */
  scale: number;
  floors: string[];
  sides: Side[];
  view3d: boolean;
  dims: boolean;
  furniture: boolean;
  garden: boolean;
  drains: boolean;
  trees: boolean;
  project: string;
  author: string;
  /** Print the whole house, or just an area of the plan (the extension, say). */
  scope?: 'all' | 'area';
  area?: Extent | null;
  section?: 'none' | SectionWay;
}

/** One page: what it shows, and how. */
interface Page {
  title: string;
  /** 1:n, or 0 for not to scale. */
  scale: number;
  image: string;
  north?: number;
}

/**
 * One drawing to print: its size in metres (plus a border in mm on paper round it), and how
 * to draw it on a canvas `w` x `h` metres at a given scale.
 */
interface Item {
  title: string;
  d: Drawing;
  north?: number;
  draw: (w: number, h: number, pxPerM: number, dpr: number) => HTMLCanvasElement;
}

export class Printer {
  private dialog = document.querySelector<HTMLDialogElement>('#printDialog')!;
  private preview = document.querySelector<HTMLElement>('#printPreview')!;
  private sheets = document.querySelector<HTMLElement>('#printSheets')!;
  private note = document.querySelector<HTMLElement>('#printNote')!;
  private urls: string[] = [];

  constructor(
    private store: Store,
    private editor: Editor2D,
    private view: View3D,
  ) {
    this.dialog.addEventListener('close', () => {
      this.editor.showPrintArea = false;
      this.editor.requestRender();
      if (this.dialog.returnValue === 'go') void this.make(this.read());
    });
    document.querySelector('#printPickArea')!.addEventListener('click', () => this.pickArea());
    this.form.addEventListener('change', () => this.syncForm());
    document.querySelector('#printGo')!.addEventListener('click', () => window.print());
    document.querySelector('#printClose')!.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.preview.hidden) this.close();
    });
  }

  get showing() {
    return !this.preview.hidden;
  }

  /** Open the Print dialog, as it was last time. */
  open() {
    const f = this.form;
    const saved = this.saved();
    const floors = document.querySelector('#printFloors')!;
    floors.replaceChildren(
      ...this.store.building.levels.map((l) => {
        const label = document.createElement('label');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.name = 'floor';
        box.value = l.id;
        box.checked = saved?.floors ? saved.floors.includes(l.id) : true;
        label.append(box, ` ${l.name} plan`);
        return label;
      }),
    );
    if (saved) {
      (f.elements.namedItem('paper') as HTMLSelectElement).value = saved.paper;
      (f.elements.namedItem('orientation') as HTMLSelectElement).value = saved.orientation;
      (f.elements.namedItem('scale') as HTMLSelectElement).value = String(saved.scale);
      for (const box of f.querySelectorAll<HTMLInputElement>('input[name=side]')) box.checked = saved.sides.includes(box.value as Side);
      for (const k of ['view3d', 'dims', 'furniture', 'garden', 'drains', 'trees'] as const) this.check(k).checked = saved[k];
      (f.elements.namedItem('project') as HTMLInputElement).value = saved.project;
      (f.elements.namedItem('author') as HTMLInputElement).value = saved.author;
    }
    const scope = saved?.scope ?? 'all';
    for (const r of f.querySelectorAll<HTMLInputElement>('input[name=scope]')) r.checked = r.value === scope;
    (f.elements.namedItem('section') as HTMLSelectElement).value = saved?.section ?? 'none';
    this.area = this.editor.printArea ?? saved?.area ?? null;
    this.syncForm();
    this.dialog.returnValue = '';
    this.dialog.showModal();
  }

  /** The area chosen for printing (plan metres). */
  private area: Extent | null = null;

  /** Show what goes with the choices: the area, and orientation only for sheets. */
  private syncForm() {
    const f = this.form;
    const paper = (f.elements.namedItem('paper') as HTMLSelectElement).value;
    document.querySelector<HTMLElement>('#printOrientation')!.hidden = paper === 'roll';
    const a = this.area;
    document.querySelector('#printAreaText')!.textContent = a ? `Area chosen: ${(a.x1 - a.x0).toFixed(2)} × ${(a.y1 - a.y0).toFixed(2)} m.` : 'No area chosen yet.';
    this.editor.printArea = a;
    this.editor.showPrintArea = !!a && (f.querySelector<HTMLInputElement>('input[name=scope][value=area]')!.checked);
    this.editor.requestRender();
  }

  /** Close the dialog, let an area be dragged out on the plan, then come back to it. */
  private pickArea() {
    const saved = this.read();
    this.dialog.close();
    const hint = document.querySelector<HTMLElement>('#hint')!;
    const was = hint.textContent;
    hint.textContent = 'Drag a box round what to print (from the house wall out to the end of the extension, say) · Esc to cancel';
    this.editor.pickArea((b) => {
      hint.textContent = was;
      if (b) {
        this.area = b;
        this.editor.printArea = b;
        localStorage.setItem(KEY, JSON.stringify({ ...saved, scope: 'area', area: b }));
      }
      this.open();
      if (b) for (const r of this.form.querySelectorAll<HTMLInputElement>('input[name=scope]')) r.checked = r.value === 'area';
      this.syncForm();
    });
  }

  private get form() {
    return this.dialog.querySelector('form')!;
  }

  private check(name: string) {
    return this.form.elements.namedItem(name) as HTMLInputElement;
  }

  private saved(): Options | null {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Options | null;
    } catch {
      return null;
    }
  }

  private read(): Options {
    const f = this.form;
    const ticked = (name: string) => [...f.querySelectorAll<HTMLInputElement>(`input[name=${name}]`)].filter((b) => b.checked).map((b) => b.value);
    const o: Options = {
      paper: (f.elements.namedItem('paper') as HTMLSelectElement).value as Paper,
      orientation: (f.elements.namedItem('orientation') as HTMLSelectElement).value as Orientation,
      scale: Number((f.elements.namedItem('scale') as HTMLSelectElement).value),
      floors: ticked('floor'),
      sides: ticked('side') as Side[],
      view3d: this.check('view3d').checked,
      dims: this.check('dims').checked,
      furniture: this.check('furniture').checked,
      garden: this.check('garden').checked,
      drains: this.check('drains').checked,
      trees: this.check('trees').checked,
      project: (f.elements.namedItem('project') as HTMLInputElement).value.trim(),
      author: (f.elements.namedItem('author') as HTMLInputElement).value.trim(),
      scope: f.querySelector<HTMLInputElement>('input[name=scope]:checked')?.value === 'area' ? 'area' : 'all',
      area: this.area,
      section: (f.elements.namedItem('section') as HTMLSelectElement).value as Options['section'],
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(o));
    } catch {
      // Not remembered: no matter.
    }
    return o;
  }

  /** Draw the pages and show them. */
  private async make(o: Options) {
    this.clear();
    this.preview.hidden = false;
    this.note.textContent = 'Drawing the pages…';
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

    const b = this.store.building;
    const north = siteOf(b).north;
    const floors = b.levels.filter((l) => o.floors.includes(l.id));
    const area = o.scope === 'area' && o.area ? o.area : null;
    if (o.scope === 'area' && !area) {
      this.note.textContent = 'Choose the area to print first (Choose the area on the plan… in the Print dialog).';
      return;
    }
    // One frame for every floor, so the plans lie over one another: the area chosen (with a
    // little round it), or the whole house.
    const ext = area ? grow(area, 0.1) : planExtent(b.levels, o.garden);
    const er = o.sides.length || (area && o.section !== 'none') ? new ElevationRenderer(b, { trees: o.trees }) : null;
    const items: Item[] = [];
    // (A section saved under the old names is cut left to right.)
    const way: SectionWay | null = !area || !o.section || o.section === 'none' ? null : o.section === 'updown' ? 'updown' : 'leftright';
    const cut = way ? sectionLine(area!, way) : null;

    if (ext) {
      for (const l of floors) {
        items.push({
          title: `${l.name} plan`,
          d: { w: ext.x1 - ext.x0, h: ext.y1 - ext.y0, bx: area ? 8 : 12, by: area ? 10 : 12 },
          north,
          draw: (w, h, pxPerM, dpr) => {
            const cx = (ext.x0 + ext.x1) / 2;
            const cy = (ext.y0 + ext.y1) / 2;
            const box = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
            const canvas = this.editor.printFloor(l.id, box, pxPerM, { dpr, dims: o.dims, furniture: o.furniture, garden: o.garden, drains: o.drains && l === b.levels[0] });
            if (cut) sectionMarks(canvas, cut, box, pxPerM * dpr);
            return canvas;
          },
        });
      }
    }
    for (const side of o.sides) {
      const out = er!.outOf(side);
      const v = area ? er!.areaView(out, area) : er!.view(side);
      if (!v) continue;
      const keep = area ? er!.areaView(out, area).keep : undefined;
      items.push({
        title: `${SIDE_NAMES[side]} elevation${area ? ' (the area)' : ''}`,
        d: { w: v.hi - v.lo, h: v.top, bx: 8, by: 8, right: LABELS },
        draw: (w, h, pxPerM, dpr) => {
          // The ground 8 mm on paper up from the bottom, or the drawing centred if there's room;
          // the drawing moved left of centre to leave the floor-level labels room on the right.
          const mmPerM = pxPerM / PX_PER_MM;
          const groundUp = Math.max((h - v.top) / 2, 8 / mmPerM);
          const shift = LABELS / 2 / mmPerM;
          return er!.draw(v.out, v.right, (v.lo + v.hi) / 2 + shift, v.hi, v.top, w, h, groundUp, pxPerM, dpr, keep);
        },
      });
    }
    if (cut && area) {
      // Look at the cut from its left, keeping what lies beyond it.
      const d = { x: cut.b.x - cut.a.x, y: cut.b.y - cut.a.y };
      const len = Math.hypot(d.x, d.y) || 1;
      const out = new THREE.Vector3(-d.y / len, 0, d.x / len);
      const at = new THREE.Vector3(cut.a.x, 0, cut.a.y).dot(out);
      const whole = er!.areaView(out, area);
      const v = er!.areaView(out, area, [whole.keep[0], at]);
      items.push({
        title: 'Section A–A',
        d: { w: v.hi - v.lo, h: v.top, bx: 8, by: 8, right: LABELS },
        draw: (w, h, pxPerM, dpr) => {
          const mmPerM = pxPerM / PX_PER_MM;
          const groundUp = Math.max((h - v.top) / 2, 8 / mmPerM);
          const shift = LABELS / 2 / mmPerM;
          return er!.draw(v.out, v.right, (v.lo + v.hi) / 2 + shift, v.hi, v.top, w, h, groundUp, pxPerM, dpr, v.keep);
        },
      });
    }

    try {
      if (o.paper === 'roll') await this.makeRoll(o, items);
      else await this.makeSheets(o, items);
    } finally {
      er?.dispose();
    }
  }

  /** A4 or A3: a sheet for each drawing, all at one scale. */
  private async makeSheets(o: Options, items: Item[]) {
    const sheet = sheetLayout(o.paper as 'A4' | 'A3', o.orientation);
    const area = sheet.area;
    const n = o.scale || fitScale(items.map((x) => x.d), area);
    const tooBig = items.filter((x) => !fitsAt(x.d, area, n)).map((x) => x.title);
    const pxPerM = mmOnPaper(1, n) * PX_PER_MM;
    const dpr = o.paper === 'A3' ? 2.2 : 3;
    const aw = (area.w * n) / 1000;
    const ah = (area.h * n) / 1000;
    const pages: Page[] = [];
    for (const it of items) pages.push({ title: it.title, scale: n, image: await this.url(it.draw(aw, ah, pxPerM, dpr)), north: it.north });
    if (o.view3d) pages.push({ title: '3D view', scale: 0, image: this.view.snapshot() });
    if (!pages.length) {
      this.note.textContent = 'Nothing to print: tick at least one page.';
      return;
    }
    this.pageSize(sheet.w, sheet.h);
    pages.forEach((p, i) => this.sheets.append(this.sheet(p, i + 1, pages.length, o, sheet)));
    const fit = tooBig.length
      ? `<span class="warn">At 1:${n} ${tooBig.join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} bigger than the paper and cut off: choose “Largest that fits”, a smaller scale, or A3.</span> `
      : '';
    this.note.innerHTML = `${fit}${pages.length} page${pages.length === 1 ? '' : 's'}, ${o.paper} ${o.orientation}, 1:${n}. In the print dialog choose <b>Actual size / 100%</b> (not “Fit to page”) and margins <b>None</b>, so the scale is exact; <b>Save as PDF</b> keeps a copy.`;
  }

  /**
   * Roll paper (the SC-P800's 17-inch roll): every drawing down one long sheet, each under
   * its caption, at one scale chosen to fit across the roll, with the title block at the end.
   */
  private async makeRoll(o: Options, items: Item[]) {
    if (!items.length) {
      this.note.textContent = 'Nothing to print: tick at least one drawing.';
      return;
    }
    const n = o.scale || rollScale(items.map((x) => x.d));
    const mm = (m: number) => mmOnPaper(m, n);
    const pxPerM = mm(1) * PX_PER_MM;
    const dpr = 2.4;
    const aw = (ROLL_AREA_W * n) / 1000;
    const heights = items.map((it) => mm(it.d.h) + 2 * it.d.by);
    const { tops, length } = rollLayout(heights);
    const tooWide = items.filter((it) => paperWidth(it.d, n) > ROLL_AREA_W + 1e-6).map((it) => it.title);
    // Say what stopped it being bigger: the drawings that would not fit across at the next scale up.
    const bigger = SCALES[SCALES.indexOf(n) - 1];
    const why =
      !o.scale && bigger
        ? items
            .filter((it) => paperWidth(it.d, bigger) > ROLL_AREA_W + 1e-6)
            .map((it) => `${it.title} would need ${Math.round(paperWidth(it.d, bigger))} mm across at 1:${bigger}`)
        : [];

    const el = document.createElement('div');
    el.className = 'sheet';
    el.style.width = `${ROLL_WIDTH}mm`;
    el.style.height = `${length - 0.3}mm`;
    const frame = document.createElement('div');
    frame.className = 'frame';
    Object.assign(frame.style, { left: `${MARGIN}mm`, top: `${MARGIN}mm`, width: `${ROLL_WIDTH - 2 * MARGIN}mm`, height: `${length - 2 * MARGIN}mm` });
    el.append(frame);
    const x = MARGIN + PAD;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const h = heights[i];
      const canvas = it.draw(aw, (h * n) / 1000, pxPerM, dpr);
      const img = document.createElement('img');
      img.src = await this.url(canvas);
      img.alt = it.title;
      Object.assign(img.style, { left: `${x}mm`, top: `${tops[i]}mm`, width: `${ROLL_AREA_W}mm`, height: `${h}mm` });
      const cap = document.createElement('div');
      cap.className = 'caption';
      Object.assign(cap.style, { left: `${x}mm`, top: `${tops[i] - CAPTION_H + 1}mm` });
      cap.innerHTML = `${esc(it.title)}<small>1:${n}</small>`;
      el.append(img, cap);
      if (it.north !== undefined) el.append(this.northArrow(it.north, x + ROLL_AREA_W - 14, tops[i] + 2));
    }
    const title = document.createElement('div');
    title.className = 'title';
    Object.assign(title.style, { left: `${MARGIN}mm`, top: `${length - MARGIN - TITLE_H}mm`, width: `${ROLL_WIDTH - 2 * MARGIN}mm`, height: `${TITLE_H}mm` });
    const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    title.innerHTML = `
      <div><small>${esc(o.project || 'Project')}</small><div class="name">${esc(o.scope === 'area' ? 'Plans, elevations and section of the area' : 'Plans and elevations')}</div></div>
      <div><small>Scale</small>1:${n} on 17 in roll${this.scaleBar(n)}</div>
      <div><small>Date</small>${esc(date)}${o.author ? `<small style="margin-top:1mm">Drawn by</small>${esc(o.author)}` : ''}</div>
      <div><small>Length</small><div class="name">${Math.ceil(length)} mm</div></div>`;
    el.append(title);
    this.pageSize(ROLL_WIDTH, length);
    this.sheets.append(el);
    const warn = tooWide.length ? `<span class="warn">At 1:${n} ${tooWide.join(', ')} ${tooWide.length === 1 ? 'is' : 'are'} wider than the roll and cut off: choose “Largest that fits” or a smaller scale.</span> ` : '';
    const reason = why.length ? ` Not 1:${bigger} because the ${why.join(', and the ')} (the roll takes ${Math.round(ROLL_AREA_W)} mm).` : '';
    this.note.innerHTML = `${warn}One sheet 431.8 mm wide × ${Math.ceil(length)} mm long, 1:${n}.${esc(reason)} Choose <b>Save as PDF</b>, then print the PDF from Preview (or Epson Print Layout) on <b>Roll Paper 17 in</b> at <b>100%</b> (not “Scale to fit”), so the scale is exact.`;
  }

  private async url(canvas: HTMLCanvasElement): Promise<string> {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return canvas.toDataURL('image/png');
    const u = URL.createObjectURL(blob);
    this.urls.push(u);
    return u;
  }

  /** The paper size for the printer. */
  private pageSize(w: number, h: number) {
    let style = document.querySelector<HTMLStyleElement>('#pageSize');
    if (!style) {
      style = document.createElement('style');
      style.id = 'pageSize';
      document.head.append(style);
    }
    style.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`;
  }

  /** One sheet: the drawing, its frame, and the title block. */
  private sheet(p: Page, index: number, count: number, o: Options, s: ReturnType<typeof sheetLayout>): HTMLElement {
    const mm = (v: number) => `${v}mm`;
    const el = document.createElement('div');
    el.className = 'sheet';
    el.style.width = mm(s.w);
    // A hair short of the paper, so rounding never spills a blank page.
    el.style.height = mm(s.h - 0.3);

    const frame = document.createElement('div');
    frame.className = 'frame';
    Object.assign(frame.style, { left: mm(10), top: mm(10), width: mm(s.w - 20), height: mm(s.h - 20) });

    const img = document.createElement('img');
    img.src = p.image;
    img.alt = p.title;
    const a = s.area;
    if (p.scale) {
      Object.assign(img.style, { left: mm(a.x), top: mm(a.y), width: mm(a.w), height: mm(a.h) });
    } else {
      Object.assign(img.style, { left: mm(a.x), top: mm(a.y), width: mm(a.w), height: mm(a.h), objectFit: 'contain' });
    }
    el.append(img, frame);

    if (p.north !== undefined) el.append(this.northArrow(p.north, a.x + a.w - 14, a.y + 2));

    const title = document.createElement('div');
    title.className = 'title';
    Object.assign(title.style, { left: mm(10), top: mm(s.h - 10 - 18), width: mm(s.w - 20), height: mm(18) });
    const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    title.innerHTML = `
      <div><small>${esc(o.project || 'Project')}</small><div class="name">${esc(p.title)}</div></div>
      <div><small>Scale</small>${p.scale ? `1:${p.scale} at ${o.paper}${this.scaleBar(p.scale)}` : 'Not to scale'}</div>
      <div><small>Date</small>${esc(date)}${o.author ? `<small style="margin-top:1mm">Drawn by</small>${esc(o.author)}` : ''}</div>
      <div><small>Sheet</small><div class="name">${index}/${count}</div></div>`;
    el.append(title);
    return el;
  }

  /** A scale bar in millimetres on paper, black and white in quarters. */
  private scaleBar(n: number): string {
    const L = scaleBarLength(n, 40);
    const len = mmOnPaper(L, n);
    const q = len / 4;
    const cells = [0, 1, 2, 3].map((i) => `<rect x="${1 + i * q}" y="1" width="${q}" height="1.4" fill="${i % 2 ? '#fff' : '#1f2124'}" stroke="#1f2124" stroke-width="0.2"/>`).join('');
    const w = len + 12;
    return `<svg width="${w}mm" height="5mm" viewBox="0 0 ${w} 5">${cells}<text x="1" y="4.6" font-size="1.8">0</text><text x="${1 + len}" y="4.6" font-size="1.8" text-anchor="middle">${L} m</text></svg>`;
  }

  private northArrow(north: number, x: number, y: number): HTMLElement {
    const box = document.createElement('div');
    Object.assign(box.style, { left: `${x}mm`, top: `${y}mm`, width: '12mm', height: '14mm' });
    box.innerHTML = `<svg width="12mm" height="14mm" viewBox="-6 -8 12 14">
      <circle r="4.6" fill="none" stroke="#1f2124" stroke-width="0.25"/>
      <g transform="rotate(${-north})"><path d="M0 -4 2.2 3 0 1.6 -2.2 3Z" fill="#1f2124"/>
      <text x="0" y="-5.4" font-size="2.4" font-weight="600" text-anchor="middle">N</text></g></svg>`;
    return box;
  }

  private clear() {
    this.sheets.replaceChildren();
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
  }

  close() {
    this.preview.hidden = true;
    this.clear();
  }
}
