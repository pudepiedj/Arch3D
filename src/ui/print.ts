// Printing: the Print dialog, the pages it makes (floor plans and elevations to scale, each
// on a sheet with a frame and a title block), a preview of them, and the browser's print.
// Pages are sized in millimetres, so printed at 100% ("Actual size") the scale is exact.

import {
  type Drawing,
  type Orientation,
  type Paper,
  SIDE_NAMES,
  type Side,
  fitScale,
  fitsAt,
  mmOnPaper,
  planExtent,
  scaleBarLength,
  sheetLayout,
} from '../model/print';
import { siteOf } from '../model/sun';
import { ElevationRenderer } from '../three/elevation';
import type { View3D } from '../three/view3d';
import type { Editor2D } from './editor2d';
import type { Store } from './store';

const KEY = 'arch3d.print';
/**
 * Drawing pixels to a millimetre on paper: the plan's 12 px labels come out 2.4 mm high and
 * its 1 px lines 0.2 mm, as on a drawing board.
 */
const PX_PER_MM = 5;

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
}

/** One page: what it shows, and how. */
interface Page {
  title: string;
  /** 1:n, or 0 for not to scale. */
  scale: number;
  image: string;
  north?: number;
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
      if (this.dialog.returnValue === 'go') void this.make(this.read());
    });
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
    this.dialog.returnValue = '';
    this.dialog.showModal();
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
    const sheet = sheetLayout(o.paper, o.orientation);
    const area = sheet.area;
    const floors = b.levels.filter((l) => o.floors.includes(l.id));
    // One frame for every floor, so the plans lie over one another.
    const ext = planExtent(b.levels, o.garden);
    const er = o.sides.length ? new ElevationRenderer(b, { trees: o.trees }) : null;
    const views = o.sides.map((side) => ({ side, v: er!.view(side) })).filter((s) => s.v);

    const drawings: { title: string; d: Drawing }[] = [];
    if (ext) for (const l of floors) drawings.push({ title: `${l.name} plan`, d: { w: ext.x1 - ext.x0, h: ext.y1 - ext.y0, bx: 12, by: 12 } });
    for (const { side, v } of views) drawings.push({ title: `${SIDE_NAMES[side]} elevation`, d: { w: v!.hi - v!.lo, h: v!.top, bx: 40, by: 8 } });
    const n = o.scale || fitScale(drawings.map((x) => x.d), area);
    const tooBig = drawings.filter((x) => !fitsAt(x.d, area, n)).map((x) => x.title);

    const pxPerM = mmOnPaper(1, n) * PX_PER_MM;
    const dpr = o.paper === 'A3' ? 2.2 : 3;
    // The drawing area in metres at this scale.
    const aw = (area.w * n) / 1000;
    const ah = (area.h * n) / 1000;
    const pages: Page[] = [];
    try {
      if (ext) {
        const cx = (ext.x0 + ext.x1) / 2;
        const cy = (ext.y0 + ext.y1) / 2;
        const box = { x0: cx - aw / 2, y0: cy - ah / 2, x1: cx + aw / 2, y1: cy + ah / 2 };
        for (const l of floors) {
          const canvas = this.editor.printFloor(l.id, box, pxPerM, { dpr, dims: o.dims, furniture: o.furniture, garden: o.garden, drains: o.drains && l === b.levels[0] });
          pages.push({ title: `${l.name} plan`, scale: n, image: await this.url(canvas), north: siteOf(b).north });
        }
      }
      for (const { side, v } of views) {
        const groundUp = Math.max((ah - v!.top) / 2, (8 * n) / 1000);
        const canvas = er!.render(side, aw, ah, groundUp, pxPerM, dpr);
        pages.push({ title: `${SIDE_NAMES[side]} elevation`, scale: n, image: await this.url(canvas) });
      }
    } finally {
      er?.dispose();
    }
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
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
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
