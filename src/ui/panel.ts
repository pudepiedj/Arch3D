// Properties panel for the current selection. Every change goes through the model's
// clean-up (normalize), so e.g. thickening a wall re-mitres its corners and re-fits its openings.

import { addLevelOnTop, ceilingHeight, deleteLevel, getLevel, levelElevation, setLevelHeight } from '../model/building';
import { computeFootprints } from '../model/joints';
import { clamp, freeGaps, moveOpening } from '../model/openings';
import { deleteNode, deleteOpening, deleteWall, finishNodeMove, moveNode, normalize, setWallLength, splitWallAt } from '../model/plan';
import { DEFAULTS, type OpeningKind } from '../model/types';
import type { Editor2D } from './editor2d';
import type { Store } from './store';

export class Panel {
  constructor(
    private el: HTMLElement,
    private editor: Editor2D,
    private store: Store,
  ) {
    store.subscribe(() => {
      // Don't rebuild under the user's cursor while they are typing in a field.
      if (!el.contains(document.activeElement)) this.render();
    });
  }

  render() {
    const sel = this.editor.selection;
    const plan = this.store.plan;
    this.el.replaceChildren();
    // Only show the panel when there is something to edit, so it doesn't cover the plan.
    this.el.hidden = !sel && this.editor.tool !== 'wall';
    if (!sel) return this.renderDefaults();

    if (sel.kind === 'wall') {
      const w = plan.walls[sel.id];
      if (!w) return;
      const fp = computeFootprints(plan).get(w.id);
      this.title('Wall');
      this.number('Thickness', w.thickness, 0.01, 0.05, 1, (v) => {
        w.thickness = v;
        this.done();
      }, 'm');
      this.number('Height', w.height, 0.05, 0.5, 10, (v) => {
        w.height = v;
        this.done();
      }, 'm');
      this.number('Length', fp?.length ?? 0, 0.01, 0.1, 100, (v) => {
        setWallLength(plan, w.id, v);
        this.store.commit();
      }, 'm', 'Moves the end joint along the wall');
      this.buttons([
        ['Split in middle', () => {
          const id = splitWallAt(plan, w.id, (fp?.length ?? 0) / 2);
          this.store.commit();
          if (id) this.editor.select({ kind: 'node', id });
        }],
        ['Delete', () => {
          deleteWall(plan, w.id);
          this.editor.select(null);
          this.store.commit();
        }, true],
      ]);
      return;
    }

    if (sel.kind === 'level') return this.renderLevel(sel.id);

    if (sel.kind === 'node') {
      const n = plan.nodes[sel.id];
      if (!n) return;
      this.title('Joint');
      const move = (x: number, y: number) => {
        moveNode(plan, n.id, { x, y });
        finishNodeMove(plan, n.id);
        this.store.commit();
      };
      this.number('X', n.x, 0.01, -1000, 1000, (v) => move(v, n.y), 'm');
      this.number('Y', n.y, 0.01, -1000, 1000, (v) => move(n.x, v), 'm');
      this.note('Drag a joint onto another joint or wall to connect them.');
      this.buttons([
        ['Delete joint', () => {
          deleteNode(plan, n.id);
          this.editor.select(null);
          this.store.commit();
        }, true],
      ]);
      return;
    }

    const o = plan.openings[sel.id];
    if (!o) return;
    const fps = computeFootprints(plan);
    const fp = fps.get(o.wallId);
    this.title(o.kind === 'door' ? 'Door' : 'Window');
    this.select('Type', o.kind, [
      ['door', 'Door'],
      ['window', 'Window'],
    ], (v) => {
      const k = v as OpeningKind;
      o.kind = k;
      o.sill = DEFAULTS[k].sill;
      o.height = DEFAULTS[k].height;
      this.done();
    });
    // Width may only grow into the free wall on either side.
    const gap = fp ? freeGaps(plan, fp, o.id).find(([a, b]) => o.offset >= a && o.offset <= b) : undefined;
    this.number('Width', o.width, 0.01, 0.3, 10, (v) => {
      if (gap) {
        v = Math.min(v, gap[1] - gap[0]);
        o.width = v;
        o.offset = clamp(o.offset, gap[0] + v / 2, gap[1] - v / 2);
      } else o.width = v;
      this.done();
    }, 'm');
    this.number('Height', o.height, 0.01, 0.2, 10, (v) => {
      o.height = v;
      this.done();
    }, 'm');
    if (o.kind === 'window') {
      this.number('Sill height', o.sill, 0.01, 0, 10, (v) => {
        o.sill = v;
        this.done();
      }, 'm');
    }
    if (fp) {
      this.number('From corner', o.offset - o.width / 2 - fp.uMin, 0.01, 0, 100, (v) => {
        moveOpening(plan, o.id, o.wallId, fp.uMin + v + o.width / 2, fps);
        this.done();
      }, 'm', 'Distance from the inside of the corner at the wall start');
    }
    const btns: [string, () => void, boolean?][] = [
      ['Copy', () => {
        this.editor.copySelection();
        this.render();
      }],
      ['Duplicate', () => {
        if (!this.editor.duplicateSelection()) alert('No room on this wall for another one this size.');
      }],
    ];
    const clip = this.editor.clipboard;
    const same =
      clip &&
      clip.kind === o.kind &&
      Math.abs(clip.width - o.width) < 1e-6 &&
      Math.abs(clip.height - o.height) < 1e-6 &&
      Math.abs(clip.sill - o.sill) < 1e-6;
    if (clip && !same) {
      btns.push([`Match copied (${Math.round(clip.width * 100)}×${Math.round(clip.height * 100)})`, () => {
        if (!this.editor.matchSelection()) alert('The copied size does not fit here.');
      }]);
    }
    if (o.kind === 'door') {
      btns.push(['Flip hinge', () => {
        o.hingeFlip = !o.hingeFlip;
        this.done();
      }]);
      btns.push(['Flip swing', () => {
        o.swingFlip = !o.swingFlip;
        this.done();
      }]);
    }
    btns.push(['Delete', () => {
      deleteOpening(plan, o.id);
      this.editor.select(null);
      this.store.commit();
    }, true]);
    this.buttons(btns);
  }

  private renderLevel(id: string) {
    const b = this.store.building;
    const level = getLevel(b, id);
    if (!level) return;
    const isGround = b.levels[0].id === id;
    this.title('Floor');
    this.text('Name', level.name, (v) => {
      level.name = v || level.name;
      this.store.commit();
    });
    this.number('Floor to floor', level.height, 0.05, 2, 10, (v) => {
      setLevelHeight(level, v);
      this.done();
    }, 'm', 'Walls that ran the full height follow the new height');
    if (!isGround) {
      this.number('Floor depth', level.slab, 0.01, 0.1, 1, (v) => {
        level.slab = v;
        this.done();
      }, 'm', 'Thickness of this floor, which is also the ceiling structure of the floor below');
    }
    this.note(`Floor level +${levelElevation(b, id).toFixed(2)} m · ceiling height ${ceilingHeight(b, level).toFixed(2)} m`);
    this.buttons([
      ['Add floor above', () => this.addFloor(true)],
      ['Add empty floor', () => this.addFloor(false)],
      ['Delete floor', () => {
        if (!confirm(`Delete ${level.name} and everything on it? (You can undo this.)`)) return;
        deleteLevel(b, id);
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
    if (b.levels.length === 1) (this.el.querySelector('button.danger') as HTMLButtonElement).disabled = true;
  }

  private addFloor(copyOutline: boolean) {
    const level = addLevelOnTop(this.store.building, copyOutline);
    this.store.commit();
    this.editor.select(null);
    this.store.setActive(level.id);
  }

  private renderDefaults() {
    const ed = this.editor;
    this.title('New wall');
    this.number('Thickness', ed.wallProps.thickness, 0.01, 0.05, 1, (v) => {
      ed.wallProps.thickness = v;
      ed.onToolChange?.();
    }, 'm');
    this.note(`Walls run the full ${this.store.plan.height} m floor-to-floor height of ${this.store.plan.name.toLowerCase()}.`);
  }

  private done() {
    normalize(this.store.plan);
    this.store.commit();
    this.render();
  }

  // ---------------------------------------------------------------- tiny form builders

  private title(text: string) {
    const h = document.createElement('h2');
    h.textContent = text;
    this.el.append(h);
  }

  private note(text: string) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = text;
    this.el.append(p);
  }

  private number(
    label: string,
    value: number,
    step: number,
    min: number,
    max: number,
    onChange: (v: number) => void,
    unit: string,
    title?: string,
  ) {
    const row = document.createElement('label');
    row.className = 'field';
    if (title) row.title = title;
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'decimal';
    input.step = String(step);
    input.min = String(min);
    input.max = String(max);
    input.value = String(Math.round(value * 1000) / 1000);
    const u = document.createElement('em');
    u.textContent = unit;
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) onChange(clamp(v, min, max));
      input.blur();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      e.stopPropagation();
    });
    row.append(span, input, u);
    this.el.append(row);
  }

  private text(label: string, value: string, onChange: (v: string) => void) {
    const row = document.createElement('label');
    row.className = 'field';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.style.gridColumn = '2 / 4';
    input.addEventListener('change', () => {
      onChange(input.value.trim());
      input.blur();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      e.stopPropagation();
    });
    row.append(span, input);
    this.el.append(row);
  }

  private select(label: string, value: string, options: [string, string][], onChange: (v: string) => void) {
    const row = document.createElement('label');
    row.className = 'field';
    const span = document.createElement('span');
    span.textContent = label;
    const sel = document.createElement('select');
    for (const [v, t] of options) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      sel.append(o);
    }
    sel.value = value;
    sel.addEventListener('change', () => {
      onChange(sel.value);
      sel.blur();
    });
    row.append(span, sel);
    this.el.append(row);
  }

  private buttons(list: [string, () => void, boolean?][]) {
    const row = document.createElement('div');
    row.className = 'buttons';
    for (const [text, fn, danger] of list) {
      const b = document.createElement('button');
      b.textContent = text;
      if (danger) b.className = 'danger';
      b.addEventListener('click', fn);
      row.append(b);
    }
    this.el.append(row);
  }
}
