import { demoPlan } from './model/demo';
import { createPlan } from './model/plan';
import type { Plan } from './model/types';
import { View3D, type ViewMode } from './three/view3d';
import { Editor2D, type Tool } from './ui/editor2d';
import { Panel } from './ui/panel';
import { Store } from './ui/store';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const $$ = (sel: string) => [...document.querySelectorAll<HTMLButtonElement>(sel)];

const store = new Store(Store.loadSaved() ?? demoPlan());
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
    view.setPlan(store.plan);
  });
};
store.subscribe(rebuild);
store.subscribe(syncToolbar);
view.setPlan(store.plan);

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
view.onLockChange = syncToolbar;

// File menu.
const menu = $('details.menu') as HTMLDetailsElement;
const closeMenu = () => menu.removeAttribute('open');
const load = (p: Plan) => {
  editor.select(null);
  store.replace(p);
  editor.zoomToFit();
  view.frame();
  closeMenu();
};
$('#new').addEventListener('click', () => {
  if (confirm('Start a new empty plan? (You can undo this.)')) load(createPlan());
});
$('#demo').addEventListener('click', () => load(demoPlan()));
$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(store.plan, null, 2)], { type: 'application/json' });
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
    const p = JSON.parse(await f.text()) as Plan;
    if (p.version !== 1 || !p.nodes || !p.walls) throw new Error('not an Arch3D plan');
    p.openings ??= {};
    load(p);
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
};

function syncToolbar() {
  for (const b of $$('#tools button')) b.classList.toggle('on', b.dataset.tool === editor.tool);
  for (const b of $$('#wallType button')) {
    b.classList.toggle('on', Math.abs(parseFloat(b.dataset.thickness!) - editor.wallProps.thickness) < 1e-6);
  }
  $('#wallType').hidden = editor.tool !== 'wall';
  $('#ortho').hidden = editor.tool !== 'wall';
  $('#ortho').classList.toggle('on', editor.ortho);
  $('#finish').hidden = !editor.drawing;
  ($('#undo') as HTMLButtonElement).disabled = !store.canUndo;
  ($('#redo') as HTMLButtonElement).disabled = !store.canRedo;
  for (const b of $$('#layout button')) b.classList.toggle('on', b.dataset.layout === layout);
  for (const b of $$('#mode button')) b.classList.toggle('on', b.dataset.mode === view.mode);
  $('#hint').textContent = HINTS[editor.tool];

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
