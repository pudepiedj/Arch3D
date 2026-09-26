// Properties panel for the current selection. Every change goes through the model's
// clean-up (normalize), so e.g. thickening a wall re-mitres its corners and re-fits its openings.

import { addLevelOnTop, ceilingHeight, deleteLevel, getLevel, levelAbove, levelElevation, setLevelHeight } from '../model/building';
import { DEFAULT_ROOF, clearAreaRoof, defaultRoof, roofAreaRings, setAreaRoof } from '../model/roof';
import { pointInPolygon } from '../model/geom';
import { addPillar, pillarHeight, pillarsForSection } from '../model/pillars';
import { PATIO_DEFAULTS, patioArea, setPatioSurface } from '../model/patios';
import { TREE_DEFAULTS } from '../model/trees';
import { GRAND_MODELS, catalogueItem } from '../model/furniture';
import { PANEL_LONG, PANEL_SHORT, chimneyGeometry, rooflightGeometry, solarGeometry } from '../model/roofitems';
import { stairGeometry } from '../model/stairs';
import { computeFootprints } from '../model/joints';
import { clamp, freeGaps, moveOpening } from '../model/openings';
import { deleteNode, deleteOpening, deleteWall, finishNodeMove, moveNode, normalize, setWallLength, splitWallAt } from '../model/plan';
import { DEFAULTS, type OpeningKind, type PatioSurface, type Pillar, type TreeKind, type Roof, type RoofKind, type Stair, type StairShape } from '../model/types';
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
    if (sel.kind === 'stair') return this.renderStair(sel.id);
    if (sel.kind === 'roof') return this.renderRoof(sel.id);
    if (sel.kind === 'pillar') return this.renderPillar(sel.id);
    if (sel.kind === 'chimney') return this.renderChimney(sel.id);
    if (sel.kind === 'solar') return this.renderSolar(sel.id);
    if (sel.kind === 'rooflight') return this.renderRooflight(sel.id);
    if (sel.kind === 'patio') return this.renderPatio(sel.id);
    if (sel.kind === 'tree') return this.renderTree(sel.id);
    if (sel.kind === 'furniture') return this.renderFurniture(sel.id);

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
    this.title(o.kind === 'door' ? 'Door' : o.kind === 'garage' ? 'Garage door' : 'Window');
    this.select('Type', o.kind, [
      ['door', 'Door'],
      ['window', 'Window'],
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
    this.note(`Floor level +${levelElevation(b, id).toFixed(2)} m · ceiling height ${ceilingHeight(b, level).toFixed(2)} m`);

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
    const g = stairGeometry(st, level.height);
    this.title('Stair');
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
      `${g.risers} risers of ${(g.rise * 100).toFixed(1)} cm climb the ${level.height} m to the next floor.` +
        (st.shape === 'straight' ? ` Length ${(g.treads.length * st.going).toFixed(2)} m.` : '') +
        (levelAbove(this.store.building, level.id) ? '' : ' There is no floor above yet: add one to use the stair.'),
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
        this.done();
      });
    }
    if (c?.finishes) {
      this.select('Finish', f.finish ?? c.finishes[0], c.finishes.map((v): [string, string] => [v, v[0].toUpperCase() + v.slice(1)]), (v) => {
        f.finish = v;
        this.done();
      });
    }
    this.number('Width', f.width, 0.01, 0.2, 6, (v) => {
      f.width = v;
      this.done();
    }, 'm');
    this.number(f.kind === 'grand' ? 'Length' : 'Depth', f.depth, 0.01, 0.2, 6, (v) => {
      f.depth = v;
      this.done();
    }, 'm');
    if (!c?.flat && f.kind !== 'grand') {
      this.number('Height', f.height, 0.01, 0.2, 3, (v) => {
        f.height = v;
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
        : 'Drag to move; it keeps tight to a wall it is square to. [ and ] turn it; Ctrl/⌘+D puts a copy alongside.',
    );
    const btns: [string, () => void, boolean?][] = [];
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
    btns.push(['Delete', () => {
      delete level.furniture![id];
      this.editor.select(null);
      this.store.commit();
    }, true]);
    this.buttons(btns);
  }

  private renderTree(id: string) {
    const level = this.store.plan;
    const t = level.trees?.[id];
    if (!t) return;
    this.title('Tree');
    this.select('Kind', t.kind, [
      ['deciduous', 'Broad-leaved'],
      ['conifer', 'Conifer (evergreen)'],
    ], (v) => {
      t.kind = v as TreeKind;
      Object.assign(t, TREE_DEFAULTS[t.kind]);
      this.done();
    });
    this.number('Height', t.height, 0.5, 1, 40, (v) => {
      t.height = v;
      this.done();
    }, 'm');
    this.number('Crown spread', t.spread, 0.5, 0.5, 30, (v) => {
      t.spread = v;
      this.done();
    }, 'm', 'Diameter of the crown');
    this.note(
      t.kind === 'deciduous'
        ? 'In leaf from May to October, bare in winter: the Sun study shows it as it is on the chosen date. Drag the trunk to move it.'
        : 'Evergreen: the same shade all year. Drag the trunk to move it.',
    );
    this.buttons([
      ['Delete', () => {
        delete level.trees![id];
        this.editor.select(null);
        this.store.commit();
      }, true],
    ]);
  }

  private renderPatio(id: string) {
    const level = this.store.plan;
    const pt = level.patios?.[id];
    if (!pt) return;
    const names: Record<PatioSurface, string> = { paving: 'Patio', decking: 'Deck', gravel: 'Gravel' };
    this.title(names[pt.surface]);
    this.select('Surface', pt.surface, [
      ['paving', 'Paving'],
      ['decking', 'Decking'],
      ['gravel', 'Gravel'],
    ], (v) => {
      setPatioSurface(pt, v as PatioSurface);
      this.done();
    });
    this.number('Height', pt.height, 0.01, 0, 6, (v) => {
      pt.height = v;
      this.done();
    }, 'm', 'Height of the top above this floor (the ground, for the ground floor)');
    if (pt.surface !== 'gravel') {
      const slab = pt.surface === 'paving';
      this.number(slab ? 'Slab size' : 'Board width', pt.module, 0.005, slab ? 0.2 : 0.08, slab ? 1.2 : 0.3, (v) => {
        pt.module = v;
        this.done();
      }, 'm');
      this.number(slab ? 'Direction' : 'Boards run', ((((Math.round((pt.angle * 180) / Math.PI) % 360) + 540) % 360) - 180), 5, -180, 180, (v) => {
        pt.angle = (v * Math.PI) / 180;
        this.done();
      }, '°', 'Direction of the courses or boards, from left-right on the plan');
    }
    const std = PATIO_DEFAULTS[pt.surface].height;
    this.note(
      `${patioArea(level, pt).toFixed(1)} m². ` +
        (pt.height > std + 0.2
          ? 'Raised: more than a step up, so it needs steps to walk onto.'
          : 'Drag to move. Where it meets the house it stops at the walls.'),
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
    }
    if (roof.kind !== 'none') {
      this.number('Overhang', roof.overhang, 0.05, 0, 1.5, (v) => set({ overhang: v }), 'm', 'How far the eaves project past the walls');
    }
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
