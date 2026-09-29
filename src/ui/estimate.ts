// The Estimate screen: the rough bill of quantities for the whole house or a chosen area,
// with rough prices that can be changed, lines that can be left out, and a total with or
// without labour and VAT. Printable, and exportable as CSV for a spreadsheet.

import {
  type Assumptions,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_PRICES,
  GROUPS,
  type Line,
  estimate,
  totalOf,
} from '../model/estimate';
import type { Extent } from '../model/print';
import type { Editor2D } from './editor2d';
import type { Store } from './store';

const KEY = 'arch3d.estimate';

interface Saved {
  /** Prices changed from the defaults. */
  prices: Record<string, number>;
  /** Lines left out, by id. */
  left: string[];
  assumptions: Assumptions;
  /** Labour and overheads, as a percentage of the materials. */
  labour: number;
  /** Contingency for the unforeseen, as a percentage of materials and labour. */
  contingency: number;
  vat: boolean;
  scope: 'all' | 'area';
}

const fresh = (): Saved => ({ prices: {}, left: [], assumptions: { ...DEFAULT_ASSUMPTIONS }, labour: 0, contingency: 10, vat: false, scope: 'all' });

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n < 10 ? n.toFixed(2) : n.toFixed(1));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Estimator {
  private root = document.querySelector<HTMLElement>('#estimate')!;
  private body = document.querySelector<HTMLElement>('#estBody')!;
  private s: Saved = fresh();
  private lines: Line[] = [];

  constructor(
    private store: Store,
    private editor: Editor2D,
  ) {
    document.querySelector('#estClose')!.addEventListener('click', () => this.close());
    document.querySelector('#estPrint')!.addEventListener('click', () => window.print());
    document.querySelector('#estCsv')!.addEventListener('click', () => this.csv());
    document.querySelector('#estReset')!.addEventListener('click', () => {
      if (!confirm('Put every price back to the rough guide, and every line back in?')) return;
      this.s.prices = {};
      this.s.left = [];
      this.save();
      this.render();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.showing) this.close();
    });
    // Everything in the page works through these two: a change re-works the totals, and a
    // change of scope or assumption re-measures the drawing.
    this.body.addEventListener('input', (e) => this.onInput(e.target as HTMLInputElement));
    this.body.addEventListener('change', (e) => this.onChange(e.target as HTMLInputElement | HTMLSelectElement));
    this.body.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'estPick') this.pickArea();
    });
  }

  get showing() {
    return !this.root.hidden;
  }

  open() {
    this.s = this.load();
    this.root.hidden = false;
    this.render();
  }

  close() {
    this.root.hidden = true;
    this.editor.showPrintArea = false;
    this.editor.requestRender();
  }

  private load(): Saved {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (v) return { ...fresh(), ...v, assumptions: { ...DEFAULT_ASSUMPTIONS, ...v.assumptions } };
    } catch {
      /* start again */
    }
    return fresh();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      /* not remembered, no matter */
    }
  }

  private price(key: string) {
    return this.s.prices[key] ?? DEFAULT_PRICES[key] ?? 0;
  }

  private get prices() {
    return { ...DEFAULT_PRICES, ...this.s.prices };
  }

  private get area(): Extent | null {
    return this.s.scope === 'area' ? this.editor.printArea : null;
  }

  /** Let an area be dragged out on the plan, then come back. */
  private pickArea() {
    this.root.hidden = true;
    const hint = document.querySelector<HTMLElement>('#hint')!;
    const was = hint.textContent;
    hint.textContent = 'Drag a box round what to cost (from the house wall out to the end of the extension, say) · Esc to cancel';
    this.editor.pickArea((b) => {
      hint.textContent = was;
      if (b) {
        this.editor.printArea = b;
        this.s.scope = 'area';
        this.save();
      }
      this.open();
    });
  }

  private render() {
    const a = this.s.assumptions;
    if (this.s.scope === 'area' && !this.editor.printArea) this.s.scope = 'all';
    const area = this.area;
    this.editor.showPrintArea = !!area;
    this.editor.requestRender();
    this.lines = estimate(this.store.building, area, a);
    const left = new Set(this.s.left);
    let project = '';
    try {
      project = JSON.parse(localStorage.getItem('arch3d.print') ?? '{}').project ?? '';
    } catch {
      /* no name */
    }
    const opt = (v: string, label: string, cur: string) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
    const box = area;
    const scopeText = box ? `the chosen area, ${(box.x1 - box.x0).toFixed(2)} × ${(box.y1 - box.y0).toFixed(2)} m` : 'the whole house and garden';

    const groups = GROUPS.map((g) => {
      const ls = this.lines.filter((l) => l.group === g);
      if (!ls.length) return '';
      const all = ls.every((l) => !left.has(l.id));
      const rows = ls
        .map((l) => {
          const out = left.has(l.id);
          return `<tr class="${out ? 'out' : ''}${l.key ? ' key' : ''}" data-id="${esc(l.id)}">
            <td class="inc"><input type="checkbox" data-line="${esc(l.id)}"${out ? '' : ' checked'} aria-label="Include" /></td>
            <td class="item">${esc(l.item)}${l.detail ? `<small>${esc(l.detail)}</small>` : ''}</td>
            <td class="num">${qtyText(l.qty)} ${esc(l.unit)}</td>
            <td class="num rate">£<input type="number" inputmode="decimal" min="0" step="any" data-price="${esc(l.price)}" value="${this.price(l.price)}" aria-label="Price a ${esc(l.unit)}" /><span class="per">/${esc(l.unit)}</span></td>
            <td class="num total" data-total="${esc(l.id)}"></td>
          </tr>`;
        })
        .join('');
      return `<tbody data-group="${esc(g)}">
        <tr class="est-group"><td class="inc"><input type="checkbox" data-group="${esc(g)}"${all ? ' checked' : ''} aria-label="Include the whole group" /></td>
          <th colspan="3">${esc(g)}</th><td class="num" data-subtotal="${esc(g)}"></td></tr>
        ${rows}</tbody>`;
    }).join('');

    this.body.innerHTML = `<div class="est-page">
      <header class="est-head">
        <div><small>${esc(project || 'Project')}</small><h2>Rough estimate of materials</h2></div>
        <div class="est-date">${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}<br />${esc(scopeText)}</div>
      </header>
      <div class="est-options">
        <label>Cost <select name="scope">${opt('all', 'the whole house and garden', this.s.scope)}${this.editor.printArea ? opt('area', 'the chosen area', this.s.scope) : ''}</select></label>
        <button type="button" id="estPick">${this.editor.printArea ? 'Choose another area…' : 'Choose an area on the plan…'}</button>
        <label>Outside walls <select name="wall">${opt('cavity', 'Brick and block cavity', a.wall)}${opt('block', 'Rendered block', a.wall)}</select></label>
        <label>Roof <select name="covering">${opt('interlocking', 'Interlocking concrete tiles', a.covering)}${opt('plain', 'Plain clay tiles', a.covering)}${opt('slate', 'Natural slate', a.covering)}</select></label>
        <label>Foundations <select name="foundationDepth">${[0.75, 1, 1.2, 1.5].map((d) => opt(String(d), `${d.toFixed(2)} m deep`, String(a.foundationDepth))).join('')}</select></label>
        <label><input type="checkbox" name="ufh"${a.ufh ? ' checked' : ''} /> Underfloor heating</label>
        <label>Labour and overheads <input type="number" name="labour" inputmode="decimal" min="0" max="300" step="5" value="${this.s.labour}" /> %</label>
        <label title="For the unforeseen: 10% is usual, 15–20% for work on an old house">Contingency <input type="number" name="contingency" inputmode="decimal" min="0" max="100" step="5" value="${this.s.contingency}" /> %</label>
        <label><input type="checkbox" name="vat"${this.s.vat ? ' checked' : ''} /> Add VAT (20%)</label>
      </div>
      <p class="est-note">A rough guide for judging whether it is affordable: UK supply prices for 2025, materials only unless labour is added, measured from the drawing. Steel and timber sizes are first guesses by the usual hand methods — <strong>a structural engineer must design them</strong>, and Building Control approve them. Change any price: it changes every line priced the same way. Untick what you don't need.</p>
      <div class="est-summary" id="estSummary"></div>
      <table class="est-table">
        <thead><tr><th class="inc"></th><th>Item</th><th class="num">Quantity</th><th class="num">Price</th><th class="num">Total</th></tr></thead>
        ${groups}
        <tfoot id="estFoot"></tfoot>
      </table>
    </div>`;
    this.totals();
  }

  /** Line totals, group subtotals and the grand total, from the current prices and ticks. */
  private totals() {
    const left = new Set(this.s.left);
    for (const l of this.lines) {
      const cell = this.body.querySelector(`[data-total="${CSS.escape(l.id)}"]`);
      if (cell) cell.textContent = money(l.qty * this.price(l.price));
    }
    for (const g of GROUPS) {
      const cell = this.body.querySelector(`[data-subtotal="${CSS.escape(g)}"]`);
      if (cell) cell.textContent = money(totalOf(this.lines.filter((l) => l.group === g), this.prices, left));
    }
    const { materials, labour, contingency, vat, all } = this.sums();
    const foot = [`<tr><th colspan="4">Materials</th><td class="num">${money(materials)}</td></tr>`];
    if (this.s.labour) foot.push(`<tr><th colspan="4">Labour and overheads, ${this.s.labour}%</th><td class="num">${money(labour)}</td></tr>`);
    if (this.s.contingency) foot.push(`<tr><th colspan="4">Contingency, ${this.s.contingency}%</th><td class="num">${money(contingency)}</td></tr>`);
    if (this.s.vat) foot.push(`<tr><th colspan="4">VAT, 20%</th><td class="num">${money(vat)}</td></tr>`);
    foot.push(`<tr class="grand"><th colspan="4">Total</th><td class="num">${money(all)}</td></tr>`);
    this.body.querySelector('#estFoot')!.innerHTML = foot.join('');
    this.body.querySelector('#estSummary')!.innerHTML = `
      <div><span>Total${this.s.labour ? '' : ', materials only'}${this.s.contingency ? `, ${this.s.contingency}% contingency` : ''}${this.s.vat ? ', with VAT' : ''}</span><strong>${money(all)}</strong></div>
      <div><span>Structure: steel, posts and lintels</span><strong>${money(totalOf(this.lines.filter((l) => l.group === 'Structure'), this.prices, left))}</strong></div>
      <div><span>Glazing, doors and windows</span><strong>${money(totalOf(this.lines.filter((l) => l.group === 'Glazing, doors and windows'), this.prices, left))}</strong></div>`;
  }

  /** Materials, then labour on them, contingency on both, and VAT on the lot. */
  private sums() {
    const materials = totalOf(this.lines, this.prices, new Set(this.s.left));
    const labour = (materials * this.s.labour) / 100;
    const contingency = ((materials + labour) * this.s.contingency) / 100;
    const vat = this.s.vat ? (materials + labour + contingency) * 0.2 : 0;
    return { materials, labour, contingency, vat, all: materials + labour + contingency + vat };
  }

  private onInput(t: HTMLInputElement) {
    if (t.dataset.price) {
      const v = parseFloat(t.value);
      if (!Number.isFinite(v) || v < 0) return;
      const key = t.dataset.price;
      if (v === DEFAULT_PRICES[key]) delete this.s.prices[key];
      else this.s.prices[key] = v;
      // Every line priced the same way shows the new price.
      for (const other of this.body.querySelectorAll<HTMLInputElement>(`input[data-price="${CSS.escape(key)}"]`)) if (other !== t) other.value = String(v);
      this.save();
      this.totals();
    } else if (t.name === 'labour' || t.name === 'contingency') {
      const v = parseFloat(t.value);
      this.s[t.name] = Number.isFinite(v) && v >= 0 ? v : 0;
      this.save();
      this.totals();
    }
  }

  private onChange(t: HTMLInputElement | HTMLSelectElement) {
    const box = t as HTMLInputElement;
    if (box.dataset.line) {
      this.leave([box.dataset.line], !box.checked);
      box.closest('tr')!.classList.toggle('out', !box.checked);
      this.syncGroupBoxes();
      this.totals();
      return;
    }
    if (box.dataset.group) {
      const ids = this.lines.filter((l) => l.group === box.dataset.group).map((l) => l.id);
      this.leave(ids, !box.checked);
      for (const id of ids) {
        const row = this.body.querySelector(`tr[data-id="${CSS.escape(id)}"]`)!;
        row.classList.toggle('out', !box.checked);
        row.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked = box.checked;
      }
      this.totals();
      return;
    }
    if (t.dataset.price || t.name === 'labour' || t.name === 'contingency') {
      // Tidy what was typed once the box is left.
      if (t.dataset.price) t.value = String(this.price(t.dataset.price));
      else t.value = String(this.s[t.name as 'labour' | 'contingency']);
      return;
    }
    const a = this.s.assumptions;
    switch (t.name) {
      case 'scope':
        this.s.scope = t.value as Saved['scope'];
        break;
      case 'wall':
        a.wall = t.value as Assumptions['wall'];
        break;
      case 'covering':
        a.covering = t.value as Assumptions['covering'];
        break;
      case 'foundationDepth':
        a.foundationDepth = parseFloat(t.value);
        break;
      case 'ufh':
        a.ufh = box.checked;
        break;
      case 'vat':
        this.s.vat = box.checked;
        this.save();
        this.totals();
        return;
      default:
        return;
    }
    this.save();
    this.render();
  }

  private leave(ids: string[], out: boolean) {
    const left = new Set(this.s.left);
    for (const id of ids) {
      if (out) left.add(id);
      else left.delete(id);
    }
    this.s.left = [...left];
    this.save();
  }

  private syncGroupBoxes() {
    const left = new Set(this.s.left);
    for (const box of this.body.querySelectorAll<HTMLInputElement>('input[data-group]')) {
      box.checked = this.lines.filter((l) => l.group === box.dataset.group).every((l) => !left.has(l.id));
    }
  }

  /** The estimate as a spreadsheet file. */
  private csv() {
    const left = new Set(this.s.left);
    const cell = (v: string | number) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : `"${v.replace(/"/g, '""')}"`);
    const rows: (string | number)[][] = [['Group', 'Item', 'Detail', 'Quantity', 'Unit', 'Price (£)', 'Total (£)', 'Included']];
    for (const l of this.lines) {
      const p = this.price(l.price);
      rows.push([l.group, l.item, l.detail ?? '', l.qty, l.unit, p, l.qty * p, left.has(l.id) ? 'no' : 'yes']);
    }
    const { materials, labour, contingency, vat, all } = this.sums();
    rows.push([], ['', 'Materials', '', '', '', '', materials]);
    if (this.s.labour) rows.push(['', `Labour and overheads, ${this.s.labour}%`, '', '', '', '', labour]);
    if (this.s.contingency) rows.push(['', `Contingency, ${this.s.contingency}%`, '', '', '', '', contingency]);
    if (this.s.vat) rows.push(['', 'VAT, 20%', '', '', '', '', vat]);
    rows.push(['', 'Total', '', '', '', '', all]);
    const text = rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `estimate-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
