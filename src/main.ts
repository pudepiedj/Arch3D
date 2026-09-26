import { addLevelOnTop, migrate } from './model/building';
import { demoBuilding } from './model/demo';
import type { Building } from './model/types';
import { View3D, type ViewMode } from './three/view3d';
import { Editor2D, type Tool } from './ui/editor2d';
import { Panel } from './ui/panel';
import { Store } from './ui/store';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const $$ = (sel: string) => [...document.querySelectorAll<HTMLButtonElement>(sel)];

const store = new Store(Store.loadSaved() ?? demoBuilding());
const editor = new Editor2D($('#planPane'), store);
const view = new View3D($('#viewPane'));
const panel = new Panel($('#panel'), editor, store);

// Rebuild the 3D model at most once per frame while things are being dragged.
let rebuildQueued = false;
const rebuild = () => {
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => {
    rebuildQueued = false;
    view.setBuilding(store.building, store.activeId);
  });
};
store.subscribe(rebuild);
store.subscribe(syncToolbar);
store.subscribe(renderLevels);
view.setBuilding(store.building, store.activeId);

editor.shortcutsEnabled = () => !(view.mode === 'walk' && layout !== 'plan');
editor.onSelectionChange = () => panel.render();
editor.onToolChange = () => {
  syncToolbar();
  if (!editor.selection) panel.render();
};
panel.render();

// ---------------------------------------------------------------- toolbar

for (const b of $$('#tools button')) b.addEventListener('click', () => editor.setTool(b.dataset.tool as Tool));
for (const b of $$('#wallType button')) {
  b.addEventListener('click', () => {
    editor.wallProps.thickness = parseFloat(b.dataset.thickness!);
    editor.setTool('wall');
    panel.render();
  });
}
for (const b of $$('#roofMode button')) {
  b.addEventListener('click', () => {
    editor.setTool('roof');
    editor.roofMode = b.dataset.roofmode as 'edit' | 'draw';
    syncToolbar();
  });
}
for (const b of $$('#patioSurface button')) {
  b.addEventListener('click', () => {
    editor.patioSurface = b.dataset.surface as typeof editor.patioSurface;
    editor.setTool('patio');
  });
}
for (const b of $$('#stairShape button')) {
  b.addEventListener('click', () => {
    editor.stairShape = b.dataset.shape as typeof editor.stairShape;
    syncToolbar();
  });
}
$('#ortho').addEventListener('click', () => {
  editor.ortho = !editor.ortho;
  syncToolbar();
});
$('#finish').addEventListener('click', () => editor.finishChain());
$('#undo').addEventListener('click', () => store.undo());
$('#redo').addEventListener('click', () => store.redo());

type Layout = 'plan' | 'split' | '3d';
let layout: Layout = window.innerWidth < 700 ? 'plan' : 'split';
function setLayout(l: Layout) {
  layout = l;
  $('#work').dataset.layout = l;
  if (l === 'plan' && view.mode === 'walk') view.setMode('orbit');
  syncToolbar();
}
for (const b of $$('#layout button')) b.addEventListener('click', () => setLayout(b.dataset.layout as Layout));
for (const b of $$('#mode button')) {
  b.addEventListener('click', () => {
    const m = b.dataset.mode as ViewMode;
    if (layout === 'plan') setLayout(window.innerWidth < 700 ? '3d' : 'split');
    view.setMode(m);
  });
}
view.onModeChange = syncToolbar;
// Walking up or down the stairs takes the plan to the floor you arrive on.
view.onWalkLevelChange = (id) => {
  editor.select(null);
  store.setActive(id);
};
$('#cutaway').addEventListener('click', () => {
  view.setCutaway(!view.cutaway);
  syncToolbar();
});

// ---------------------------------------------------------------- floors

function setLevel(id: string) {
  if (editor.drawing) editor.finishChain();
  editor.select(null);
  store.setActive(id);
}

function renderLevels() {
  const nav = $('#levels');
  nav.replaceChildren();
  const add = document.createElement('button');
  add.textContent = '+ Floor';
  add.title = 'Add a floor on top, starting with a copy of the outside walls below';
  add.addEventListener('click', () => {
    const level = addLevelOnTop(store.building, true);
    store.commit();
    setLevel(level.id);
  });
  nav.append(add);
  for (const level of [...store.building.levels].reverse()) {
    const b = document.createElement('button');
    b.textContent = level.name;
    const active = level.id === store.activeId;
    b.classList.toggle('on', active);
    b.title = active ? 'Floor settings' : `Edit ${level.name}`;
    b.addEventListener('click', () => {
      if (active) editor.select({ kind: 'level', id: level.id });
      else setLevel(level.id);
    });
    nav.append(b);
  }
  // Floor height, roof type, pitch and overhang live in the floor settings panel.
  const settings = document.createElement('button');
  settings.className = 'settings';
  settings.textContent = 'Floor & roof…';
  settings.title = 'Height, floor depth and roof of the floor you are editing';
  settings.addEventListener('click', () => editor.select({ kind: 'level', id: store.activeId }));
  nav.append(settings);
}
renderLevels();

// Page Up / Page Down move between floors.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
  const levels = store.building.levels;
  const i = levels.findIndex((l) => l.id === store.activeId) + (e.key === 'PageUp' ? 1 : -1);
  if (levels[i]) {
    e.preventDefault();
    setLevel(levels[i].id);
  }
});
view.onLockChange = syncToolbar;

// File menu.
const menu = $('details.menu') as HTMLDetailsElement;
const closeMenu = () => menu.removeAttribute('open');
const load = (b: Building) => {
  editor.select(null);
  store.replace(b);
  editor.zoomToFit();
  view.frame();
  closeMenu();
};
$('#new').addEventListener('click', () => {
  if (confirm('Start a new empty building? (You can undo this.)')) {
    store.reset();
    editor.select(null);
    closeMenu();
  }
});
$('#demo').addEventListener('click', () => load(demoBuilding()));
// Drawings kept on the computer running the app, shared by every device that uses it.
// Each save is a new file; nothing is overwritten.
const thisDevice = () =>
  /iPad|iPhone/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
    ? 'iPad'
    : /Android/.test(navigator.userAgent)
      ? 'tablet'
      : 'computer';
const sharedUnavailable = () =>
  alert('Saving to the computer only works while the app is running from "npm run dev" (or "npm run preview") on it.');

$('#saveShared').addEventListener('click', async () => {
  closeMenu();
  const when = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const name = prompt('Name for this saved drawing:', `House, ${when}`);
  if (name === null) return;
  try {
    const res = await fetch('/api/drawings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || 'Drawing', device: thisDevice(), building: store.building }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const saved = await res.json();
    alert(`Saved as a new drawing on the computer:\n${saved.file}`);
  } catch {
    sharedUnavailable();
  }
});

$('#openShared').addEventListener('click', async () => {
  closeMenu();
  let items: { file: string; name: string; device: string; savedAt: string }[];
  try {
    const res = await fetch('/api/drawings', { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status}`);
    items = await res.json();
  } catch {
    return sharedUnavailable();
  }
  const dialog = $('#drawingsDialog') as HTMLDialogElement;
  const list = $('#drawingsList');
  list.replaceChildren();
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'note';
    li.textContent = 'Nothing saved yet: use File → Save to computer… first.';
    list.append(li);
  }
  for (const d of items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    const title = document.createElement('strong');
    title.textContent = d.name;
    const meta = document.createElement('span');
    meta.textContent = `${new Date(d.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })}${d.device ? ` · from ${d.device}` : ''}`;
    b.append(title, meta);
    b.addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/drawings/${encodeURIComponent(d.file)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${res.status}`);
        const record = await res.json();
        dialog.close();
        load(migrate(record.building));
      } catch (err) {
        alert(`Could not open that drawing: ${(err as Error).message}`);
      }
    });
    li.append(b);
    list.append(li);
  }
  dialog.showModal();
});

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(store.building, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plan.arch3d.json';
  a.click();
  URL.revokeObjectURL(a.href);
  closeMenu();
});
$('#import').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    load(migrate(JSON.parse(await f.text())));
  } catch (err) {
    alert(`Could not import: ${(err as Error).message}`);
  }
});
document.addEventListener('pointerdown', (e) => {
  if (!menu.contains(e.target as Node)) closeMenu();
});

const HINTS: Record<Tool, string> = {
  select: 'Drag joints to reshape · drag a wall to move it · drag doors/windows along walls · Delete removes',
  wall: 'Click to start a wall, click again for each corner · type a length + Enter · click the start, double-click or Esc to finish',
  door: 'Click on a wall to place a door',
  window: 'Click on a wall to place a window',
  split: 'Click on a wall to add a joint you can drag',
  paste: 'Click on walls to place exact copies · Esc when done',
  stair: 'Click where the stair starts (its bottom step), then click in the direction it goes up',
  roof: 'Click a roof to select it · click an edge of the selected roof to switch eave / gable end',
  garage: 'Click on a wall to place a garage roller door (2.5 m wide; change it in the panel)',
  pillar: 'Click to place a pillar; it rises to the roof above it',
  chimney: 'Click on the roof to place a chimney stack (on the floor whose roof it goes through)',
  solar: 'Click on a roof slope to lay a solar array on it (on the floor the roof belongs to)',
  rooflight: 'Click on a roof: a flat roof gets a rooflight box, a sloping roof a window in the slope',
  patio: 'Click the corners of the patio (snaps to walls; the house is cut out) · click the first corner, double-click or Enter to finish',
};

function syncToolbar() {
  for (const b of $$('#tools button')) b.classList.toggle('on', b.dataset.tool === editor.tool);
  for (const b of $$('#wallType button')) {
    b.classList.toggle('on', Math.abs(parseFloat(b.dataset.thickness!) - editor.wallProps.thickness) < 1e-6);
  }
  $('#wallType').hidden = editor.tool !== 'wall';
  $('#ortho').hidden = editor.tool !== 'wall' && editor.tool !== 'stair' && editor.tool !== 'patio';
  $('#patioSurface').hidden = editor.tool !== 'patio';
  for (const b of $$('#patioSurface button')) b.classList.toggle('on', b.dataset.surface === editor.patioSurface);
  $('#stairShape').hidden = editor.tool !== 'stair';
  $('#roofMode').hidden = editor.tool !== 'roof';
  for (const b of $$('#roofMode button')) b.classList.toggle('on', b.dataset.roofmode === editor.roofMode);
  for (const b of $$('#stairShape button')) b.classList.toggle('on', b.dataset.shape === editor.stairShape);
  $('#ortho').classList.toggle('on', editor.ortho);
  $('#finish').hidden = !editor.drawing;
  ($('#undo') as HTMLButtonElement).disabled = !store.canUndo;
  ($('#redo') as HTMLButtonElement).disabled = !store.canRedo;
  for (const b of $$('#layout button')) b.classList.toggle('on', b.dataset.layout === layout);
  for (const b of $$('#mode button')) b.classList.toggle('on', b.dataset.mode === view.mode);
  $('#cutaway').classList.toggle('on', view.cutaway);
  $('#cutaway').hidden = store.building.levels.length < 2 || view.mode === 'walk';
  const clip = editor.clipboard;
  $('#pasteTool').hidden = !clip;
  if (clip) $('#pasteTool').textContent = `Paste ${clip.kind} ${Math.round(clip.width * 100)}×${Math.round(clip.height * 100)}`;
  $('#hint').textContent =
    editor.tool === 'roof' && editor.roofMode === 'draw'
      ? 'Click the corners of the new roof (snaps to walls) · click the first corner, double-click or Enter to finish'
      : HINTS[editor.tool];

  const walkHint = $('#walkHint');
  walkHint.hidden = view.mode !== 'walk';
  const touch = matchMedia('(pointer: coarse)').matches;
  walkHint.textContent = touch
    ? 'Left thumb: move · Right thumb: look around'
    : document.pointerLockElement
      ? 'W A S D to walk · mouse to look · Shift to hurry · Esc to release the mouse'
      : 'Click the view to look around with the mouse · W A S D or arrow keys to walk';
}

setLayout(layout);
requestAnimationFrame(() => editor.zoomToFit());

// Handy for poking at the model from the browser console.
Object.assign(window, { arch3d: { store, editor, view } });
