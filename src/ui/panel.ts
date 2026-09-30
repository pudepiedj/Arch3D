// Properties panel for the current selection. Every change goes through the model's
// clean-up (normalize), so e.g. thickening a wall re-mitres its corners and re-fits its openings.

import { addLevelBelow, addLevelOnTop, ceilingHeight, deleteLevel, getLevel, levelAbove, levelElevation, setLevelHeight } from '../model/building';
import { DEFAULT_ROOF, clearAreaRoof, defaultRoof, parapetHeight, roofAreaRings, setAreaRoof } from '../model/roof';
import { pointInPolygon } from '../model/geom';
import { addPillar, pillarHeight, pillarsForSection } from '../model/pillars';
import { PATIO_DEFAULTS, patioArea, setPatioSurface } from '../model/patios';
import { SPECIES, TREE_DEFAULTS, TREE_ORDER, speciesOf } from '../model/trees';
import { forget, remember, remembered } from './sizes';
import { MAX_LEAF, gateLeaves, isGate } from '../model/gates';
import { HEDGE_DEFAULTS, HEDGE_NAMES, hedgeClosed, hedgeLength } from '../model/hedges';
import { GRAND_MODELS, TANK_STAND, catalogueItem, tankLitres } from '../model/furniture';
import { stretchSummary } from '../model/stretch';
import { DEFAULT_INVERT, DEFAULT_TANK, FITTING_NAMES, deleteDrainNode, pipeFall, pipeLength, tankVolume } from '../model/drains';
import { PANEL_LONG, PANEL_SHORT, chimneyGeometry, rooflightGeometry, solarGeometry } from '../model/roofitems';
import { reachesFloorAbove, stairGeometry, stairRise } from '../model/stairs';
import { computeFootprints } from '../model/joints';
import { FLOOR_FINISHES, ROOF_COVERINGS, WALL_FINISHES, faceSides, materialsOf } from '../model/materials';
import { clamp, freeGaps, moveOpening } from '../model/openings';
import { deleteNode, deleteOpening, deleteWall, finishNodeMove, moveNode, normalize, setWallLength, splitWallAt } from '../model/plan';
import { DEFAULTS, type OpeningKind, type DrainFitting, type DrainKind, type FloorFinish, type FrameColour, type GlazedStyle, type PatioSurface, type Pillar, type RailStyle, type TreeKind, type HedgeKind, type Roof, type RoofCovering, type RoofKind, type Stair, type StairShape, type StairStyle, type WallFinish } from '../model/types';
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

  /** When Apply was last pressed, to show that it was. */
  private appliedAt = -Infinity;

  render() {
    this.renderBody();
    this.addApply();
  }

  /**
   * Every panel with fields gets an Apply button, first in its row of buttons. Changes are
   * applied as they are made (a number when you leave its box), so Apply finishes whatever
   * is being typed and shows that it has been applied: clear on an iPad with no Enter key.
   */
  private addApply() {
    if (this.el.hidden || (this.editor.tool === 'stretch' && !this.editor.selection)) return;
    if (!this.el.querySelector('input, select')) return;
    let row = [...this.el.querySelectorAll<HTMLElement>('.buttons')].at(-1);
    if (!row) {
      row = document.createElement('div');
      row.className = 'buttons';
      this.el.append(row);
    }
    const b = document.createElement('button');
    b.className = 'apply on';
    const recent = performance.now() - this.appliedAt < 1500;
    b.textContent = recent ? 'Applied ✓' : 'Apply';
    b.title = 'Apply what you have typed (changes also apply as you go)';
    // On the press, not the click: pressing it would otherwise take the focus from the box
    // being typed in, which applies it and redraws the panel before the click arrives.
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.appliedAt = performance.now();
      const a = document.activeElement as HTMLElement | null;
      // Leaving the box applies what was typed, and redraws the panel.
      if (a && this.el.contains(a)) a.blur();
      if (b.isConnected) this.render();
      setTimeout(() => {
        const now = this.el.querySelector<HTMLButtonElement>('button.apply');
        if (now) now.textContent = 'Apply';
      }, 1500);
    });
    row.prepend(b);
  }

  private renderBody() {
    const sel = this.editor.selection;
    const plan = this.store.plan;
    this.el.replaceChildren();
    // Only show the panel when there is something to edit, so it doesn't cover the plan.
    this.el.hidden = !sel && this.editor.tool !== 'wall' && this.editor.tool !== 'stretch' && this.editor.tool !== 'paint';
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
      {
        const where = faceSides(plan).get(w.id);
        const m = materialsOf(this.store.building);
        if (where) {
          const [a, c] = (['left', 'right'] as const).map((s) => ({ where: where[s], finish: w.faces?.[s] ?? m[where[s]], painted: !!w.faces?.[s] }));
          const say = (f: typeof a) => `${WALL_FINISHES[f.finish].name.toLowerCase()} ${f.where}${f.painted ? ' (painted)' : ''}`;
          this.note(`Faces: ${say(a)}; ${say(c)}. Change them with Build → Paint materials.`);
        }
      }
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
    if (sel.kind === 'stair') return this.renderStair(sel.id);
    if (sel.kind === 'roof') return this.renderRoof(sel.id);
    if (sel.kind === 'pillar') return this.renderPillar(sel.id);
    if (sel.kind === 'chimney') return this.renderChimney(sel.id);
    if (sel.kind === 'solar') return this.renderSolar(sel.id);
    if (sel.kind === 'rooflight') return this.renderRooflight(sel.id);
    if (sel.kind === 'patio') return this.renderPatio(sel.id);
    if (sel.kind === 'tree') return this.renderTree(sel.id);
    if (sel.kind === 'hedge') return this.renderHedge(sel.id);
    if (sel.kind === 'furniture') return this.renderFurniture(sel.id);
    if (sel.kind === 'drainNode') return this.renderDrainNode(sel.id);
    if (sel.kind === 'drainPipe') return this.renderDrainPipe(sel.id);

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
    this.title(o.kind === 'door' ? 'Door' : o.kind === 'garage' ? 'Garage door' : o.kind === 'glazed' ? 'Glass doors' : 'Window');
    this.select('Type', o.kind, [
      ['door', 'Door'],
      ['window', 'Window'],
      ['glazed', 'Glass doors'],
      ['garage', 'Garage roller door'],
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
    if (o.kind === 'glazed') {
      this.select('Style', o.style ?? 'french', [
        ['french', 'French doors'],
        ['sliding', 'Sliding doors'],
        ['bifold', 'Bi-fold doors'],
      ], (v) => {
        o.style = v as GlazedStyle;
        this.done();
      });
    }
    if (o.kind === 'window' || o.kind === 'glazed') {
      this.select('Frame', o.frameColour ?? (o.kind === 'glazed' ? 'anthracite' : 'white'), [
        ['white', 'White'],
        ['anthracite', 'Anthracite grey'],
        ['black', 'Black'],
        ['oak', 'Oak'],
      ], (v) => {
        o.frameColour = v as FrameColour;
        this.done();
      });
    }
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
    if (o.kind === 'garage') {
      btns.push([o.open ? 'Show shut' : 'Show open', () => {
        o.open = !o.open;
        this.done();
      }]);
      btns.push(['Casing to other side', () => {
        o.swingFlip = !o.swingFlip;
        this.done();
      }]);
    }
    if (o.kind === 'glazed') {
      btns.push([o.open ? 'Show shut' : 'Show open', () => {
        o.open = !o.open || undefined;
        this.done();
      }]);
      const ceiling = ceilingHeight(this.store.building, plan);
      if (Math.abs(o.sill + o.height - ceiling) > 0.005) {
        btns.push(['Full height', () => {
          o.sill = 0;
          o.height = ceiling;
          this.done();
        }]);
      }
      btns.push([(o.style ?? 'french') === 'sliding' ? 'Slide other way' : 'Open to other side', () => {
        if ((o.style ?? 'french') === 'sliding') o.hingeFlip = !o.hingeFlip || undefined;
        else o.swingFlip = !o.swingFlip || undefined;
        this.done();
      }]);
      if (o.style === 'bifold') {
        btns.push(['Fold to other end', () => {
          o.hingeFlip = !o.hingeFlip || undefined;
          this.done();
        }]);
      }
    }
    if (o.kind === 'door') {
      btns.push([o.shut ? 'Show open' : 'Show shut', () => {
        o.shut = !o.shut || undefined;
        this.done();
      }]);
      const doors = Object.values(plan.openings).filter((d) => d.kind === 'door');
      const allShut = doors.every((d) => d.shut);
      btns.push([allShut ? 'Open all doors' : 'Shut all doors', () => {
        for (const d of doors) d.shut = !allShut || undefined;
        this.done();
      }]);
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
    const z = levelElevation(b, id);
    if (!isGround) {
      this.number('Floor level', z, 0.05, -20, 100, (v) => {
        level.base = v;
        this.done();
      }, 'm', 'Height of this floor above the ground: e.g. 0.6 for a house on a plinth, -1.5 for one half below ground. Floors on top of it follow.');
    }
    this.note(
      `Floor level ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(2)} m · ceiling height ${ceilingHeight(b, level).toFixed(2)} m` +
        (!isGround && level.base !== undefined ? ' · set for this floor (floors on top of it follow it)' : ''),
    );

    // Default roof for the parts of this floor with nothing above them.
    const roof = defaultRoof(b, level) ?? { ...DEFAULT_ROOF, kind: 'none' as const };
    this.roofFields('Default roof', roof, (change) => {
      level.roof = { ...roof, ...change };
      this.done();
    }, true);
    this.note('Applies wherever this floor has nothing built above it. Use the Roof tool to set particular areas or edges differently, or to add roof sections.');
    this.buttons([
      ['Add floor above', () => this.addFloor(true)],
      ['Add empty floor', () => this.addFloor(false)],
      ['Add floor below', () => {
        const below = addLevelBelow(b, level);
        this.store.commit();
        this.editor.select(null);
        this.store.setActive(below.id);
      }],
      ['Delete floor', () => {
        if (!confirm(`Delete ${level.name} and everything on it? (You can undo this.)`)) return;
        deleteLevel(b, id);
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
    if (b.levels.length === 1) (this.el.querySelector('button.danger') as HTMLButtonElement).disabled = true;
  }

  private renderStair(id: string) {
    const level = this.store.plan;
    const st = level.stairs?.[id];
    if (!st) return;
    const rise = stairRise(st, level);
    const g = stairGeometry(st, rise);
    this.title(st.rise !== undefined && st.rise < level.height - 0.05 ? 'Steps' : 'Stair');
    this.number('Rises', rise, 0.05, 0.1, 20, (v) => {
      st.rise = Math.abs(v - level.height) < 1e-6 ? undefined : v;
      this.done();
    }, 'm', `How high it climbs: the ${level.height} m to the next floor, or less for steps up to a plinth or terrace, or more for an outside stair to an upper door`);
    this.select('Style', st.style ?? 'solid', [
      ['solid', 'Solid, timber treads'],
      ['stone', 'Stone steps (solid)'],
      ['cantilever', 'Stone treads cantilevered from the wall'],
    ], (v) => {
      st.style = v === 'solid' ? undefined : (v as StairStyle);
      this.done();
    });
    this.select('Handrail', st.rail ?? 'timber', [
      ['timber', 'Timber, with balusters'],
      ['iron', 'Wrought iron'],
      ['glass', 'Glass panels'],
      ['none', 'None'],
    ], (v) => {
      st.rail = v === 'timber' ? undefined : (v as RailStyle);
      this.done();
    });
    this.select('Shape', st.shape, [
      ['straight', 'Straight'],
      ['L', 'L-shape (quarter turn)'],
      ['U', 'U-shape (half turn)'],
    ], (v) => {
      st.shape = v as StairShape;
      this.done();
    });
    if (st.shape !== 'straight') {
      this.select('Turns', st.turn, [
        ['left', 'Left'],
        ['right', 'Right'],
      ], (v) => {
        st.turn = v as Stair['turn'];
        this.done();
      });
    }
    this.number('Width', st.width, 0.05, 0.6, 3, (v) => {
      st.width = v;
      this.done();
    }, 'm');
    this.number('Tread depth', st.going, 0.01, 0.2, 0.4, (v) => {
      st.going = v;
      this.done();
    }, 'm', 'How deep each step is (the "going")');
    this.note(
      `${g.risers} risers of ${(g.rise * 100).toFixed(1)} cm climb ${rise.toFixed(2)} m${reachesFloorAbove(st, level) && st.rise === undefined ? ' to the next floor' : ''}.` +
        (st.shape === 'straight' ? ` Length ${(g.treads.length * st.going).toFixed(2)} m.` : '') +
        (st.style === 'cantilever' ? ' Set one side against a wall: the treads are built into it, with nothing underneath.' : '') +
        (reachesFloorAbove(st, level) && !levelAbove(this.store.building, level.id) ? ' There is no floor above yet: add one to use the stair.' : ''),
    );
    this.buttons([
      ['Rotate 90°', () => {
        st.angle += Math.PI / 2;
        this.done();
      }],
      ['Delete', () => {
        delete level.stairs[id];
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
  }

  private renderRoof(id: string) {
    const level = this.store.plan;
    const b = this.store.building;
    const isSection = id.startsWith('section:');
    const found = this.editor.roofs().find((r) => r.id === id);
    const ring = found?.ring ?? roofAreaRings(b, level)[Number(id.slice(5))];
    if (!ring) return;
    const roof = found?.roof ?? { ...(defaultRoof(b, level) ?? DEFAULT_ROOF), kind: 'none' as const };
    this.title(isSection ? 'Roof section' : 'Roof');
    this.roofFields('Type', roof, (change) => {
      const next = { ...roof, ...change };
      if (isSection) level.roofSections![id.slice(8)].roof = next;
      else setAreaRoof(level, ring, next);
      this.done();
    }, !isSection);
    if (isSection) {
      const sec = level.roofSections![id.slice(8)];
      this.number('Eaves height', sec.base ?? level.height, 0.05, 0.5, 20, (v) => {
        sec.base = v;
        this.done();
      }, 'm', 'Height above this floor where the roof starts (e.g. lower for a porch canopy)');
    }
    if (found && roof.kind === 'flat' && parapetHeight(roof) > 0) {
      const open = (roof.edges ?? []).filter((e) => e.type === 'open').length;
      this.note(
        'Click an edge of this roof on the plan to take its parapet off, or put it back' +
          (open ? ` (${open} edge${open === 1 ? '' : 's'} without one now).` : '.') +
          ' Where it joins another flat roof there is none anyway.',
      );
    }
    if (found && roof.kind !== 'flat' && roof.kind !== 'none') {
      const gables = found.roles.filter((r) => r === 'gable').length;
      const walls = found.roles.filter((r) => r === 'wall').length;
      this.note(
        `${gables} gable end${gables === 1 ? '' : 's'}` +
          (walls ? `, ${walls} edge${walls === 1 ? '' : 's'} against a taller wall` : '') +
          '. Click an edge of this roof on the plan to switch it between a sloping eave and a gable end.',
      );
    }
    const btns: [string, () => void, boolean?][] = [];
    if (isSection) {
      btns.push(['Add pillars', () => {
        const spots = pillarsForSection(level, id.slice(8));
        if (!spots.length) return alert('This roof already rests on walls or pillars at all its corners.');
        for (const p of spots) addPillar(level, p);
        this.store.commit();
        this.render();
      }]);
      btns.push(['Delete section', () => {
        delete level.roofSections![id.slice(8)];
        this.editor.select(null);
        this.store.commit();
      }, true]);
    } else if ((level.roofAreas ?? []).some((s) => pointInPolygon(s, ring))) {
      btns.push(['Use floor default', () => {
        clearAreaRoof(level, ring);
        this.done();
      }]);
    }
    if (btns.length) this.buttons(btns);
  }

  private renderChimney(id: string) {
    const level = this.store.plan;
    const c = level.chimneys?.[id];
    if (!c) return;
    const geo = chimneyGeometry(this.store.building, level, c);
    this.title('Chimney stack');
    this.position(c);
    this.select('Pots', String(c.pots), [
      ['1', '1 pot'],
      ['2', '2 pots'],
      ['3', '3 pots'],
    ], (v) => {
      c.pots = Number(v) as 1 | 2 | 3;
      this.done();
    });
    this.number('Width', c.width, 0.05, 0.3, 3, (v) => {
      c.width = v;
      this.done();
    }, 'm');
    this.number('Depth', c.depth, 0.05, 0.3, 3, (v) => {
      c.depth = v;
      this.done();
    }, 'm');
    this.number('Above roof', c.above, 0.05, 0, 5, (v) => {
      c.above = v;
      this.done();
    }, 'm', 'How far the brickwork rises above the highest point of the roof it passes through');
    this.note(
      geo.onRoof
        ? `Top of stack ${geo.top.toFixed(2)} m above this floor. Drag to move; it re-fits to the roof.`
        : 'There is no roof under this chimney on this floor: place it on the floor whose roof it goes through.',
    );
    this.buttons([
      ['Rotate 90°', () => {
        c.angle += Math.PI / 2;
        this.done();
      }],
      ['Delete', () => {
        delete level.chimneys![id];
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
  }

  private renderFurniture(id: string) {
    const level = this.store.plan;
    const f = level.furniture?.[id];
    if (!f) return;
    const c = catalogueItem(f.kind);
    const key = `furniture:${f.kind}`;
    // Sizes and finish you set are kept for the next piece of this kind (until Reset size).
    const keep = () => remember(key, { width: f.width, depth: f.depth, height: f.height, ...(f.finish ? { finish: f.finish } : {}) });
    this.title(c?.name ?? 'Furniture');
    if (f.kind === 'grand') {
      const model = GRAND_MODELS.find((m) => Math.abs(m.depth - f.depth) < 0.005 && Math.abs(m.width - f.width) < 0.005);
      this.select('Size', model?.name ?? 'custom', [
        ...GRAND_MODELS.map((m): [string, string] => [m.name, m.name]),
        ...(model ? [] : [['custom', 'Custom size'] as [string, string]]),
      ], (v) => {
        const m = GRAND_MODELS.find((g) => g.name === v);
        if (!m) return;
        f.width = m.width;
        f.depth = m.depth;
        keep();
        this.done();
      });
    }
    if (c?.finishes) {
      // For the clothes dryer the "finish" is whether the washing is out.
      const names: Record<string, string> = f.kind === 'rotary' ? { empty: 'None (empty lines)', washing: 'Hung out' } : {};
      this.select(f.kind === 'rotary' ? 'Washing' : 'Finish', f.finish ?? c.finishes[0], c.finishes.map((v): [string, string] => [v, names[v] ?? v[0].toUpperCase() + v.slice(1)]), (v) => {
        f.finish = v;
        keep();
        this.done();
      });
    }
    this.number(c?.labels?.width ?? 'Width', f.width, 0.01, 0.2, 6, (v) => {
      f.width = v;
      keep();
      this.done();
    }, 'm');
    this.number(c?.labels?.depth ?? (f.kind === 'grand' ? 'Length' : 'Depth'), f.depth, 0.01, 0.2, 6, (v) => {
      f.depth = v;
      // A tank's height is its diameter on its stand.
      if (f.kind === 'oiltank') f.height = v + TANK_STAND;
      keep();
      this.done();
    }, 'm');
    if (f.kind === 'oiltank') this.note(`Holds about ${Math.round(tankLitres(f.width, f.depth) / 100) * 100} litres (brim-full).`);
    if (!c?.flat && f.kind !== 'grand' && !c?.fixedHeight) {
      this.number(c?.labels?.height ?? 'Height', f.height, 0.01, 0.2, 3, (v) => {
        f.height = v;
        keep();
        this.done();
      }, 'm');
    }
    const deg = ((Math.round((f.angle * 180) / Math.PI) % 360) + 360) % 360;
    this.number('Turned', deg, 5, 0, 359, (v) => {
      f.angle = (v * Math.PI) / 180;
      this.done();
    }, '°');
    this.note(
      f.kind === 'grand'
        ? 'The keyboard end is the front. The dashed box in front is the stool. Drag to move; [ and ] turn it.'
        : isGate(f.kind)
          ? `Set on a hedge or fence, it sits in its line and makes its own gap; drag it along. ${f.kind === 'gate5' ? `Wider than ${MAX_LEAF + 0.3} m it becomes a pair of gates. ` : ''}Turn 180° to make it open the other way. Open, you can walk through it.`
          : f.kind === 'rotary'
            ? 'Open or folded, with or without washing (Finish): with the Sun study on, see where its shadow falls and when the lines are in sun through the day.'
            : f.kind === 'oiltank'
              ? 'A horizontal tank on its stand. Set its length and diameter; its height follows. Regulations want it on a base extending 300 mm all round, and away from boundaries and buildings.'
              : 'Drag to move; it keeps tight to a wall it is square to. [ and ] turn it; Ctrl/⌘+D puts a copy alongside.',
    );
    const btns: [string, () => void, boolean?][] = [];
    if (f.kind === 'rotary') {
      btns.push([f.open ? 'Fold it up' : 'Open it out', () => {
        f.open = !f.open || undefined;
        this.done();
      }]);
    }
    if (isGate(f.kind)) {
      btns.push([f.open ? 'Shut gate' : 'Open gate', () => {
        f.open = !f.open || undefined;
        this.done();
      }]);
      if (gateLeaves(f).length === 1) {
        btns.push(['Hang on other post', () => {
          f.flip = !f.flip || undefined;
          this.done();
        }]);
      }
    }
    if (f.kind === 'grand') {
      btns.push([f.open ? 'Close lid' : 'Open lid', () => {
        f.open = !f.open;
        this.done();
      }]);
      btns.push([f.stool ? 'No stool' : 'Stool', () => {
        f.stool = !f.stool;
        this.done();
      }]);
    }
    btns.push(['Turn 90°', () => {
      f.angle = (f.angle + Math.PI / 2) % (Math.PI * 2);
      this.done();
    }]);
    btns.push(['Duplicate', () => this.editor.duplicateSelection()]);
    if (c) {
      btns.push(['Reset size', () => {
        f.width = c.width;
        f.depth = c.depth;
        f.height = c.height;
        if (c.finishes) f.finish = c.finishes[0];
        forget(key);
        this.done();
      }]);
    }
    btns.push(['Delete', () => {
      delete level.furniture![id];
      this.editor.select(null);
      this.store.commit();
    }, true]);
    this.buttons(btns);
  }

  private renderDrainNode(id: string) {
    const b = this.store.building;
    const d = b.drains;
    const n = d?.nodes[id];
    if (!d || !n) return;
    this.title(FITTING_NAMES[n.fitting]);
    this.select('Fitting', n.fitting, (Object.keys(FITTING_NAMES) as DrainFitting[]).map((f): [string, string] => [f, FITTING_NAMES[f]]), (v) => {
      const was = n.fitting;
      n.fitting = v as DrainFitting;
      // A fresh soakaway or sewer connection takes its usual depth.
      if ((n.fitting === 'soakaway' || n.fitting === 'sewer') && n.invert < DEFAULT_INVERT[n.fitting] && was !== n.fitting) n.invert = DEFAULT_INVERT[n.fitting];
      if (n.fitting === 'treatment') n.tank ??= { ...DEFAULT_TANK };
      this.store.commit();
      this.render();
    });
    this.number('Invert depth', n.invert, 0.01, 0.1, 6, (v) => {
      n.invert = v;
      this.store.commit();
      this.render();
    }, 'm', n.fitting === 'treatment' ? 'Depth of the inlet pipe below the ground' : 'Depth of the inside bottom of the pipe below the ground here');
    if (n.fitting === 'chamber') {
      this.select('Shape', n.round ? 'round' : 'square', [
        ['square', 'Square'],
        ['round', 'Round'],
      ], (v) => {
        n.round = v === 'round' || undefined;
        this.store.commit();
        this.render();
      });
    }
    if (n.fitting === 'treatment') {
      const t = (n.tank ??= { ...DEFAULT_TANK });
      this.select('Tank', t.shape, [
        ['round', 'Round'],
        ['box', 'Rectangular'],
      ], (v) => {
        t.shape = v as 'round' | 'box';
        this.store.commit();
        this.render();
      });
      this.number(t.shape === 'round' ? 'Diameter' : 'Width', t.width, 0.05, 0.5, 5, (v) => {
        t.width = v;
        this.store.commit();
        this.render();
      }, 'm');
      this.number('Tank depth', t.depth, 0.05, 0.5, 5, (v) => {
        t.depth = v;
        this.store.commit();
        this.render();
      }, 'm');
      this.note(`About ${tankVolume(t).toFixed(1)} m³. Shown with three access lids (for pump-out and desludging) and the blower kiosk; draw the treated outflow on to a soakaway, drainage field or ditch.`);
    }
    const pipes = Object.values(d.pipes).filter((p) => p.a === id || p.b === id);
    const bad = pipes.map((p) => pipeFall(d, p)).filter((f) => f.verdict !== 'ok');
    this.note(
      `${pipes.length} pipe${pipes.length === 1 ? '' : 's'} connected.` +
        (bad.length ? ` ${bad.length} of them ${bad.some((f) => f.verdict === 'backfall') ? 'run uphill (backfall) or are' : 'are'} outside the usual falls: select a pipe for details.` : '') +
        ' Drag to move it.',
    );
    this.buttons([
      ['Delete', () => {
        deleteDrainNode(b, id);
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
  }

  private renderDrainPipe(id: string) {
    const d = this.store.building.drains;
    const p = d?.pipes[id];
    if (!d || !p) return;
    this.title('Drain pipe');
    this.select('Carries', p.kind, [
      ['foul', 'Foul water'],
      ['surface', 'Surface water'],
    ], (v) => {
      p.kind = v as DrainKind;
      this.store.commit();
      this.render();
    });
    this.select('Bore', String(p.diameter), [
      ['100', '100 mm'],
      ['150', '150 mm'],
      ['225', '225 mm'],
    ], (v) => {
      p.diameter = Number(v);
      this.store.commit();
      this.render();
    });
    const f = pipeFall(d, p);
    const a = d.nodes[p.a];
    const c = d.nodes[p.b];
    const fall = f.oneIn ? `1 in ${Math.round(f.oneIn)}` : 'level';
    const verdict = {
      ok: 'within the usual range.',
      flat: `flatter than usual (aim for 1 in 40 to 1 in ${p.diameter >= 150 ? 150 : 80}, 1 in 110 at most for 100 mm with a WC on it).`,
      steep: 'steeper than 1 in 40: fine for short runs, but solids can be left behind.',
      backfall: 'it runs UPHILL (backfall): make the lower end deeper, or reverse the flow.',
      level: 'it is level: water will not flow.',
    }[f.verdict];
    this.note(`${pipeLength(d, p).toFixed(2)} m long, from ${a.invert.toFixed(2)} m to ${c.invert.toFixed(2)} m deep: a fall of ${fall}, ${verdict}`);
    this.buttons([
      ['Reverse flow', () => {
        [p.a, p.b] = [p.b, p.a];
        this.store.commit();
        this.render();
      }],
      ['Delete', () => {
        delete d.pipes[id];
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
  }

  /** The Stretch tool: what it will move, and moving by an exact amount. */
  private renderStretch() {
    const ed = this.editor;
    this.title('Stretch');
    if (!ed.stretchBox) {
      this.note('Drag a box round the part of the house to move: everything inside it moves, and walls crossing its edge stretch or shrink. E.g. to take 1 m out of the middle, box the whole of one end.');
    } else {
      const b = ed.stretchBox;
      const c = stretchSummary(this.store.building, b, ed.stretchAll ? undefined : this.store.activeId);
      const parts = [
        `${c.joints} joint${c.joints === 1 ? '' : 's'}`,
        c.openings && `${c.openings} door${c.openings === 1 ? '' : 's'}/window${c.openings === 1 ? '' : 's'}`,
        c.furniture && `${c.furniture} piece${c.furniture === 1 ? '' : 's'} of furniture`,
        c.other && `${c.other} other item${c.other === 1 ? '' : 's'}`,
        c.drains && `${c.drains} drain point${c.drains === 1 ? '' : 's'}`,
      ].filter(Boolean);
      this.note(
        ed.stretchPicked
          ? 'Stretched. The box has moved with what it moved: type another amount (or drag again) to move the same things further, or draw a new box.'
          : `Inside the box (${ed.stretchAll ? 'all floors' : 'this floor'}): ${parts.join(', ')}. Drag inside it, or type how far to move them:`,
      );
      const move = { x: 0, y: 0 };
      this.number('Across (X)', 0, 0.01, -100, 100, (v) => (move.x = v), 'm', 'Positive moves right on the plan, negative left');
      this.number('Up/down (Y)', 0, 0.01, -100, 100, (v) => (move.y = v), 'm', 'Positive moves down the plan, negative up');
      this.buttons([
        ['Stretch', () => {
          ed.applyStretch(move);
          this.render();
        }],
        ['Clear box', () => {
          ed.setStretchBox(null);
          this.render();
        }],
      ]);
    }
    this.select('Floors', ed.stretchAll ? 'all' : 'this', [
      ['all', 'All floors'],
      ['this', 'This floor only'],
    ], (v) => {
      ed.stretchAll = v === 'all';
      this.render();
    });
  }

  private renderTree(id: string) {
    const level = this.store.plan;
    const t = level.trees?.[id];
    if (!t) return;
    const sp = speciesOf(t);
    const key = () => `tree:${t.kind}`;
    // What you set is kept for the next one of this kind (until Reset size).
    const keep = () => remember(key(), { height: t.height, spread: t.spread });
    this.title(sp.shape === 'bush' ? 'Bush' : 'Tree');
    this.select('Kind', t.kind, TREE_ORDER.map((k): [string, string] => [k, SPECIES[k].name]), (v) => {
      t.kind = v as TreeKind;
      Object.assign(t, TREE_DEFAULTS[t.kind], remembered(key()) ?? {});
      this.done();
    });
    this.number('Height', t.height, 0.5, 0.3, 40, (v) => {
      t.height = v;
      keep();
      this.done();
    }, 'm');
    this.number(sp.shape === 'bush' ? 'Spread' : 'Crown spread', t.spread, 0.5, 0.3, 30, (v) => {
      t.spread = v;
      keep();
      this.done();
    }, 'm', 'Diameter of the crown');
    this.number('Lean', t.lean ?? 0, 1, 0, 30, (v) => {
      t.lean = v || undefined;
      this.done();
    }, '°', 'How far it leans from upright');
    if (t.lean) {
      const points: [string, string][] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((p, i) => [String(i * 45), p]);
      const to = Math.round((((t.leanTo ?? 0) % 360) + 360) % 360 / 45) * 45 % 360;
      this.select('Leans towards', String(to), points, (v) => {
        t.leanTo = Number(v);
        this.done();
      });
    }
    this.note(`${sp.note} The Sun study shows it as it is on the chosen date. Drag it to move it. A size you set is used for the next ${sp.name.toLowerCase()} too.`);
    this.buttons([
      ['Reset size', () => {
        Object.assign(t, TREE_DEFAULTS[t.kind]);
        forget(key());
        this.done();
      }],
      ['Delete', () => {
        delete level.trees![id];
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
  }

  private renderHedge(id: string) {
    const level = this.store.plan;
    const h = level.hedges?.[id];
    if (!h) return;
    this.title(HEDGE_NAMES[h.kind]);
    const key = () => `hedge:${h.kind}`;
    const keep = () => remember(key(), { height: h.height, width: h.width });
    this.select('Kind', h.kind, (Object.keys(HEDGE_NAMES) as HedgeKind[]).map((k): [string, string] => [k, HEDGE_NAMES[k]]), (v) => {
      h.kind = v as HedgeKind;
      Object.assign(h, HEDGE_DEFAULTS[h.kind], remembered(key()) ?? {});
      this.done();
    });
    this.number(h.kind === 'ditch' ? 'Depth' : 'Height', h.height, 0.1, 0.2, 8, (v) => {
      h.height = v;
      keep();
      this.done();
    }, 'm');
    if (h.kind === 'wall') {
      this.select('Finish', h.finish ?? 'stone', Object.entries(WALL_FINISHES).map(([k, v]): [string, string] => [k, v.name]), (v) => {
        h.finish = v === 'stone' ? undefined : (v as WallFinish);
        this.done();
      });
    }
    if (h.kind !== 'fence') {
      this.number(h.kind === 'ditch' ? 'Width at top' : 'Thickness', h.width, 0.05, 0.2, 6, (v) => {
        h.width = v;
        keep();
        this.done();
      }, 'm', h.kind === 'ditch' ? 'Across the ditch from bank to bank' : 'Through the hedge, face to face');
    }
    const season = {
      privet: 'Evergreen (semi-evergreen in a hard winter).',
      hawthorn: 'In leaf from May to October; twiggy and bare in winter.',
      beech: 'Fresh green in summer, copper in autumn, and it keeps its brown leaves through the winter.',
      fence: 'Timber posts at most 1.8 m apart, a gravel board, and featheredge boards.',
      wall: 'A free-standing wall with a coping along the top, e.g. a boundary wall. Gates can stand in it.',
      ditch: 'An open drainage ditch dug into the ground, with water in the bottom. Run surface-water drains to it with an "Outfall into a ditch" fitting.',
    }[h.kind];
    this.note(`${hedgeLength(h).toFixed(1)} m long${hedgeClosed(h) ? ', all the way round' : ''}. ${season} Drag it to move it; drag a corner to reshape it, a circle to add a corner; double-click a corner to remove it.`);
    this.buttons([
      ['Reset size', () => {
        Object.assign(h, HEDGE_DEFAULTS[h.kind]);
        forget(key());
        this.done();
      }],
      ['Delete', () => {
        delete level.hedges![id];
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
  }

  private renderPatio(id: string) {
    const level = this.store.plan;
    const pt = level.patios?.[id];
    if (!pt) return;
    const names: Record<PatioSurface, string> = { paving: 'Patio', decking: 'Deck', gravel: 'Gravel', rubber: 'Rubber floor', lawn: 'Lawn', pool: 'Swimming pool' };
    const pool = pt.surface === 'pool';
    this.title(names[pt.surface]);
    this.select('Surface', pt.surface, [
      ['paving', 'Paving'],
      ['decking', 'Decking'],
      ['gravel', 'Gravel'],
      ['rubber', 'Rubber tiles'],
      ['lawn', 'Lawn'],
      ['pool', 'Swimming pool'],
    ], (v) => {
      setPatioSurface(pt, v as PatioSurface);
      this.done();
    });
    if (pool) {
      this.number('Depth', -pt.height, 0.05, 0.3, 5, (v) => {
        pt.height = -v;
        this.done();
      }, 'm', 'From the edge to the bottom of the pool');
    } else {
      this.number('Height', pt.height, 0.01, -10, 10, (v) => {
        pt.height = v;
        this.done();
      }, 'm', 'Height of the top above this floor (the ground, for the ground floor): higher than a step for a plinth or terrace (stone sides), below 0 for a sunken area, dug out of the ground with retaining walls round it');
    }
    this.select('Railing', pt.guard ?? 'none', [
      ['none', 'None'],
      ['glass', 'Glass panels'],
      ['iron', 'Wrought iron'],
      ['timber', 'Timber'],
    ], (v) => {
      pt.guard = v === 'none' ? undefined : (v as NonNullable<typeof pt.guard>);
      this.done();
    });
    if (pt.surface !== 'gravel' && !pool) {
      const slab = pt.surface === 'paving' || pt.surface === 'rubber';
      const lawn = pt.surface === 'lawn';
      const [label, lo, hi] = lawn ? ['Stripe width', 0.3, 3] : slab ? [pt.surface === 'rubber' ? 'Tile size' : 'Slab size', 0.2, 1.2] : ['Board width', 0.08, 0.3];
      this.number(label, pt.module, 0.005, lo, hi, (v) => {
        pt.module = v;
        this.done();
      }, 'm');
      this.number(lawn ? 'Stripes run' : slab ? 'Direction' : 'Boards run', ((((Math.round((pt.angle * 180) / Math.PI) % 360) + 540) % 360) - 180), 5, -180, 180, (v) => {
        pt.angle = (v * Math.PI) / 180;
        this.done();
      }, '°', 'Direction of the courses, boards or mowing stripes, from left-right on the plan');
    }
    const std = PATIO_DEFAULTS[pt.surface].height;
    this.note(
      `${patioArea(level, pt).toFixed(1)} m². ` +
        (pool
          ? `About ${Math.round(patioArea(level, pt) * (-pt.height - 0.15))} m³ of water (${Math.round(patioArea(level, pt) * (-pt.height - 0.15) * 1000).toLocaleString('en-GB')} litres). Mosaic-lined, with a stone coping round the edge; a railing stands at the outside of the coping.`
          : pt.height < 0
          ? `Sunken ${(-pt.height).toFixed(2)} m: the ground is dug away, with retaining walls round it in the outside wall finish.`
          : pt.height > std + 0.2
          ? 'Raised: more than a step up, so it needs steps to walk onto; its sides are in the outside wall finish (stone for a plinth).'
          : 'Drag to move. Where it meets the house it stops at the walls; drawn inside a room, it covers the floor up to them.'),
    );
    this.buttons([
      ['Turn 90°', () => {
        pt.angle += Math.PI / 2;
        this.done();
      }],
      ['Delete', () => {
        delete level.patios![id];
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
  }

  private renderRooflight(id: string) {
    const level = this.store.plan;
    const r = level.rooflights?.[id];
    if (!r) return;
    const geo = rooflightGeometry(this.store.building, level, r);
    this.title(geo?.kind === 'kerb' ? 'Rooflight box' : 'Roof window');
    this.position(r);
    this.number('Windows', r.count, 1, 1, 12, (v) => {
      r.count = Math.round(v);
      this.done();
    }, '', 'Windows side by side');
    this.number('Window width', r.width, 0.01, 0.4, 2, (v) => {
      r.width = v;
      this.done();
    }, 'm');
    this.number('Window length', r.length, 0.01, 0.4, 2.5, (v) => {
      r.length = v;
      this.done();
    }, 'm', 'Up the slope');
    if (geo?.kind === 'kerb') {
      this.number('Box slope', r.pitch, 1, 3, 45, (v) => {
        r.pitch = v;
        this.done();
      }, '°', 'Slope of the top of the box');
      this.number('Kerb height', r.kerb, 0.01, 0.05, 1, (v) => {
        r.kerb = v;
        this.done();
      }, 'm', 'Height of the box above the flat roof at its low side');
    }
    this.note(
      !geo
        ? 'Not on a roof of this floor any more: drag it back onto one.'
        : geo.kind === 'kerb'
          ? 'On a flat roof: a raised box with a light well down into the room below. Drag to move.'
          : 'In a sloping roof: lies in the slope. Drag to move.',
    );
    const btns: [string, () => void, boolean?][] = [
      [r.open ? 'Show shut' : 'Show open', () => {
        r.open = !r.open;
        this.done();
      }],
      [r.blinds ? 'Blinds up' : 'Blinds down', () => {
        r.blinds = !r.blinds;
        this.done();
      }],
      [r.solarMotor ? 'No solar motor' : 'Solar motor', () => {
        r.solarMotor = !r.solarMotor;
        this.done();
      }],
    ];
    if (geo?.kind === 'kerb') {
      btns.push(['Rotate 90°', () => {
        r.angle += Math.PI / 2;
        this.done();
      }]);
    }
    btns.push(['Delete', () => {
      delete level.rooflights![id];
      this.editor.select(null);
      this.store.commit();
    }, true]);
    this.buttons(btns);
  }

  private renderSolar(id: string) {
    const level = this.store.plan;
    const sa = level.solar?.[id];
    if (!sa) return;
    const geo = solarGeometry(this.store.building, level, sa);
    this.title('Solar panels');
    this.position(sa);
    this.number('Rows', sa.rows, 1, 1, 20, (v) => {
      sa.rows = Math.round(v);
      this.done();
    }, '', 'Rows of panels up the slope');
    this.number('Columns', sa.cols, 1, 1, 40, (v) => {
      sa.cols = Math.round(v);
      this.done();
    }, '', 'Panels across the slope');
    this.select('Panels', sa.portrait ? 'portrait' : 'landscape', [
      ['portrait', 'Portrait'],
      ['landscape', 'Landscape'],
    ], (v) => {
      sa.portrait = v === 'portrait';
      this.done();
    });
    const n = sa.rows * sa.cols;
    this.note(
      !geo
        ? 'This array is not on a roof of this floor any more: drag it back onto one.'
        : `${n} panels (${PANEL_LONG} × ${PANEL_SHORT} m), about ${(n * 0.4).toFixed(1)} kWp at 400 W each.` +
            (geo.overhangs ? ' Some panels hang off this roof slope: make the array smaller or move it.' : ' Drag to move; it lines up with the slope it is on.'),
    );
    this.buttons([
      ['Delete', () => {
        delete level.solar![id];
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
  }

  private renderPillar(id: string) {
    const level = this.store.plan;
    const q = level.pillars?.[id];
    if (!q) return;
    this.title('Pillar');
    this.select('Shape', q.shape, [
      ['square', 'Square'],
      ['round', 'Round'],
    ], (v) => {
      q.shape = v as Pillar['shape'];
      this.done();
    });
    this.number(q.shape === 'round' ? 'Diameter' : 'Width', q.size, 0.01, 0.05, 1.5, (v) => {
      q.size = v;
      this.done();
    }, 'm');
    this.note(`${pillarHeight(this.store.building, level, q).toFixed(2)} m tall: it rises to the roof above it (or the wall height if there is none). Drag to move.`);
    this.buttons([
      ['Delete', () => {
        delete level.pillars![id];
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
  }

  /** Type, pitch and overhang fields for a roof. */
  private roofFields(label: string, roof: Roof, set: (change: Partial<Roof>) => void, allowNone: boolean) {
    const kinds: [string, string][] = [
      ['gable', 'Gable'],
      ['hip', 'Hipped'],
      ['flat', 'Flat'],
    ];
    if (allowNone) kinds.push(['none', 'None']);
    this.select(label, roof.kind, kinds, (v) => set({ kind: v as RoofKind }));
    if (roof.kind === 'gable' || roof.kind === 'hip') {
      this.number('Roof pitch', roof.pitch, 1, 5, 70, (v) => set({ pitch: v }), '°');
      this.select('Ceiling', roof.vaulted ? 'vaulted' : 'flat', [
        ['flat', 'Flat ceiling'],
        ['vaulted', 'Vaulted (open to the roof)'],
      ], (v) => set({ vaulted: v === 'vaulted' || undefined }));
      this.select('Covering', roof.covering ?? 'tiles', Object.entries(ROOF_COVERINGS).map(([k, v]): [string, string] => [k, v.name]), (v) => set({ covering: v === 'tiles' ? undefined : (v as RoofCovering) }));
      this.select('Gable ends', roof.glazedGables ? 'glazed' : 'wall', [
        ['wall', 'Solid wall'],
        ['glazed', 'Glazed (triangular window)'],
      ], (v) => set({ glazedGables: v === 'glazed' || undefined }));
    }
    if (roof.kind === 'flat') {
      this.number('Parapet', parapetHeight(roof), 0.05, 0, 1.2, (v) => set({ parapet: v }), 'm', 'Height of the low wall round the edge of the flat roof, above the roof; 0 for none (the roof overhangs the walls instead)');
    }
    if (roof.kind !== 'none' && !parapetHeight(roof)) {
      this.number('Overhang', roof.overhang, 0.05, 0, 1.5, (v) => set({ overhang: v }), 'm', 'How far the eaves project past the walls');
    }
  }

  private addFloor(copyOutline: boolean) {
    const level = addLevelOnTop(this.store.building, copyOutline, this.store.plan);
    this.store.commit();
    this.editor.select(null);
    this.store.setActive(level.id);
  }

  private renderDefaults() {
    const ed = this.editor;
    if (ed.tool === 'stretch') return this.renderStretch();
    if (ed.tool === 'paint') return this.renderMaterials();
    this.title('New wall');
    this.number('Thickness', ed.wallProps.thickness, 0.01, 0.05, 1, (v) => {
      ed.wallProps.thickness = v;
      ed.onToolChange?.();
    }, 'm');
    this.note(`Walls run the full ${this.store.plan.height} m floor-to-floor height of ${this.store.plan.name.toLowerCase()}.`);
  }

  /** The drawing's default finishes, and clearing what has been painted on this floor. */
  private renderMaterials() {
    const b = this.store.building;
    const m = materialsOf(b);
    const walls = Object.entries(WALL_FINISHES).map(([k, v]): [string, string] => [k, v.name]);
    this.title('Materials');
    this.select('Outside walls', m.outside, walls, (v) => {
      b.materials = { ...b.materials, outside: v as WallFinish };
      this.done();
    });
    this.select('Inside walls', m.inside, walls, (v) => {
      b.materials = { ...b.materials, inside: v as WallFinish };
      this.done();
    });
    this.select('Floors', m.floor, Object.entries(FLOOR_FINISHES).map(([k, v]): [string, string] => [k, v.name]), (v) => {
      b.materials = { ...b.materials, floor: v as FloorFinish };
      this.done();
    });
    this.note('These are the defaults for the whole drawing: every wall face looking into a room is an inside wall, every other face an outside one. Paint over them where something is different; roof coverings are in each roof\'s panel (Roof tool).');
    const level = this.store.plan;
    const painted = Object.values(level.walls).filter((w) => w.faces).length + (level.floorFinishes?.length ?? 0);
    if (painted) {
      this.buttons([
        ['Clear painting on this floor', () => {
          for (const w of Object.values(level.walls)) delete w.faces;
          delete level.floorFinishes;
          this.done();
        }, true],
      ]);
    }
  }

  /** X and Y of a roof item's centre: type the same number as another to line them up. */
  private position(item: { x: number; y: number }) {
    this.number('X (across)', item.x, 0.01, -1000, 1000, (v) => {
      item.x = v;
      this.done();
    }, 'm', 'Distance across the plan; give two items the same X to line them up');
    this.number('Y (up/down)', item.y, 0.01, -1000, 1000, (v) => {
      item.y = v;
      this.done();
    }, 'm', 'Distance down the plan; give two items the same Y to line them up');
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
    // The on-screen keyboard's key says "done", and finishes the entry.
    input.enterKeyHint = 'done';
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
    // − and + step it without the keyboard (the easy way on an iPad).
    const places = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    const stepper = (sign: number, text: string, what: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'step';
      b.textContent = text;
      b.title = `${what} by ${step} ${unit}`.trim();
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const cur = parseFloat(input.value);
        const base = Number.isFinite(cur) ? cur : value;
        const next = clamp(Math.round((base + sign * step) / step) * step, min, max);
        input.value = next.toFixed(places);
        onChange(Number(next.toFixed(places + 3)));
      });
      return b;
    };
    row.append(span, stepper(-1, '−', 'Less'), input, stepper(1, '+', 'More'), u);
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
    input.style.gridColumn = '2 / 6';
    input.enterKeyHint = 'done';
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
