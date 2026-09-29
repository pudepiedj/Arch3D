import { addLevelOnTop, migrate } from './model/building';
import { demoBuilding } from './model/demo';
import type { Building } from './model/types';
import { View3D, type ViewMode } from './three/view3d';
import { Editor2D, type Tool } from './ui/editor2d';
import { Panel } from './ui/panel';
import { SunPanel } from './ui/sunpanel';
import { Sync, reachable } from './ui/sync';
import { CATALOGUE, CATEGORIES } from './model/furniture';
import { SPECIES, TREE_ORDER } from './model/trees';
import { HEDGE_NAMES } from './model/hedges';
import type { HedgeKind, TreeKind } from './model/types';
import { Store } from './ui/store';
import { Printer } from './ui/print';
import { Estimator } from './ui/estimate';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const $$ = (sel: string) => [...document.querySelectorAll<HTMLButtonElement>(sel)];

declare const __APP_VERSION__: string;
const store = new Store(Store.loadSaved() ?? demoBuilding());
document.querySelector('#version')!.textContent = `Version ${__APP_VERSION__}`;
const editor = new Editor2D($('#planPane'), store);
const view = new View3D($('#viewPane'));
const panel = new Panel($('#panel'), editor, store);
const sunPanel = new SunPanel($('#sunPanel'), view, store);

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

editor.shortcutsEnabled = () =>
  !(view.mode === 'walk' && layout !== 'plan') && !document.querySelector('dialog[open]') && document.querySelector<HTMLElement>('#printPreview')!.hidden &&
  document.querySelector<HTMLElement>('#estimate')!.hidden;
editor.onSelectionChange = () => panel.render();
editor.onToolChange = () => {
  syncToolbar();
  if (!editor.selection) panel.render();
};
panel.render();

// ---------------------------------------------------------------- toolbar

for (const b of $$('#tools button[data-tool]')) b.addEventListener('click', () => editor.setTool(b.dataset.tool as Tool));

// Drop-down menus (tools, View, File): one open at a time, each opening under its button.
const menus = [...document.querySelectorAll<HTMLDetailsElement>('details.menu')];
for (const m of menus) {
  m.addEventListener('toggle', () => {
    if (!m.open) return;
    for (const other of menus) if (other !== m) other.open = false;
    const items = m.querySelector<HTMLElement>('.menu-items')!;
    const r = m.querySelector('summary')!.getBoundingClientRect();
    items.style.top = `${r.bottom + 6}px`;
    if (m.classList.contains('filemenu')) return;
    // Keep it on screen.
    items.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - items.offsetWidth - 8))}px`;
    items.style.right = 'auto';
  });
  // Choosing a tool closes its menu; the View menu stays open for another toggle.
  if (m.classList.contains('toolmenu')) for (const b of m.querySelectorAll('button')) b.addEventListener('click', () => (m.open = false));
}
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
// The furniture catalogue: pick a piece, then place it on the plan.
const catalogue = $<HTMLDialogElement>('#catalogueDialog');
for (const cat of CATEGORIES) {
  const h = document.createElement('h3');
  h.textContent = cat;
  const grid = document.createElement('div');
  grid.className = 'items';
  for (const c of CATALOGUE.filter((c) => c.category === cat)) {
    const b = document.createElement('button');
    b.type = 'button';
    const name = document.createElement('strong');
    name.textContent = c.kind === 'grand' ? 'Grand piano (Blüthner Model 6)' : c.name;
    const size = document.createElement('span');
    size.textContent = `${Math.round(c.width * 100)} × ${Math.round(c.depth * 100)} cm`;
    b.append(name, size);
    b.addEventListener('click', () => {
      editor.furnitureKind = c.kind;
      editor.furnitureAngle = 0;
      editor.setTool('furniture');
      catalogue.close();
    });
    grid.append(b);
  }
  $('#catalogueList').append(h, grid);
}
const openCatalogue = () => catalogue.showModal();
$('#furnitureBtn').addEventListener('click', openCatalogue);
editor.onOpenCatalogue = openCatalogue;
for (const b of $$('#drainKind button')) {
  b.addEventListener('click', () => {
    editor.drainKind = b.dataset.kind as typeof editor.drainKind;
    editor.setTool('drain');
  });
}
$('#underground').addEventListener('click', () => {
  view.setUnderground(!view.underground);
  if (view.underground && layout === 'plan') setLayout('split');
  syncToolbar();
});
// Trees and bushes to plant, and hedges, fences and ditches to draw, chosen from two lists
// shown with either tool.
const treeSelect = $<HTMLSelectElement>('#treeSelect');
const hedgeSelect = $<HTMLSelectElement>('#hedgeSelect');
treeSelect.replaceChildren(...TREE_ORDER.map((k) => new Option(SPECIES[k].name, k)));
hedgeSelect.replaceChildren(...(Object.keys(HEDGE_NAMES) as HedgeKind[]).map((k) => new Option(HEDGE_NAMES[k], k)));
treeSelect.addEventListener('change', () => {
  editor.treeKind = treeSelect.value as TreeKind;
  editor.setTool('tree');
});
hedgeSelect.addEventListener('change', () => {
  editor.hedgeKind = hedgeSelect.value as HedgeKind;
  editor.setTool('hedge');
});
// Picking the kind already shown still switches tool.
treeSelect.addEventListener('focus', () => editor.tool !== 'tree' && editor.setTool('tree'));
hedgeSelect.addEventListener('focus', () => editor.tool !== 'hedge' && editor.setTool('hedge'));
$('#sun').addEventListener('click', () => {
  sunPanel.show(!sunPanel.open);
  // The sun needs the 3D view.
  if (sunPanel.open && layout === 'plan') setLayout('split');
  syncToolbar();
});
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
// Tapping anywhere else finishes typing in a panel field (and so applies it): on an iPad
// the plan and 3D view take the touch, so the field would otherwise keep the keyboard.
document.addEventListener(
  'pointerdown',
  (e) => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !(a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement)) return;
    // Not for the panel's Apply button: that applies it itself, and says so.
    if (a.contains(e.target as Node) || (e.target as HTMLElement).closest?.('dialog, button.apply')) return;
    a.blur();
  },
  true,
);

// The 3D graphics lost (a crash or out of memory): say so, and offer a restart (a reload:
// the drawing is kept in the browser and backed up, so nothing is lost).
view.onContextLost = (lost) => {
  $('#glcrash').hidden = !lost;
};
$('#glRestart').addEventListener('click', () => location.reload());

// While something is drawn a point at a time: Done, Back and Cancel, for when there is no
// keyboard (an iPad) and a double-click is awkward.
$('#drawDone').addEventListener('click', () => editor.finishCurrent());
$('#drawBack').addEventListener('click', () => editor.backOne());
$('#drawCancel').addEventListener('click', () => editor.cancelCurrent());
const DRAWING: Record<string, string> = {
  wall: 'Drawing walls',
  outline: 'Drawing',
  drain: 'Laying a drain run',
  stair: 'Placing a stair: tap the way it goes up',
};
editor.onRender = () => {
  const what = editor.inProgress;
  const bar = $('#drawbar');
  bar.hidden = !what;
  $('#planPane').classList.toggle('drawing', !!what);
  if (!what) return;
  const label = what === 'outline' ? (editor.tool === 'hedge' ? 'Drawing a hedge' : editor.tool === 'patio' ? 'Drawing a patio' : 'Drawing a roof section') : DRAWING[what];
  if ($('#drawbarText').textContent !== label) $('#drawbarText').textContent = label;
  $('#drawBack').hidden = what !== 'outline';
  $('#drawDone').hidden = what === 'stair';
};
try {
  editor.showDims = localStorage.getItem('arch3d.dims') === '1';
} catch {
  // No storage (private browsing): dimensions start hidden.
}
editor.onDimsChange = () => {
  try {
    localStorage.setItem('arch3d.dims', editor.showDims ? '1' : '0');
  } catch {
    // Not remembered; no matter.
  }
  syncToolbar();
};
$('#dims').addEventListener('click', () => editor.toggleDims());
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
// Cutaway starts off (the whole house), and each device remembers the choice.
try {
  if (localStorage.getItem('arch3d.cutaway') === '1') view.setCutaway(true);
} catch {
  // No storage (private browsing): it stays off.
}
$('#cutaway').addEventListener('click', () => {
  view.setCutaway(!view.cutaway);
  try {
    localStorage.setItem('arch3d.cutaway', view.cutaway ? '1' : '0');
  } catch {
    // Not remembered; no matter.
  }
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
const menu = $('details.filemenu') as HTMLDetailsElement;
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
  alert('Can\'t reach the computer running the app: opening from it only works while "npm run dev" (or "npm run preview") is running on it.');

// Backs the drawing up to the computer as it changes, and shows whether it can.
const sync = new Sync(store, thisDevice());
const renderSync = () => {
  const el = $('#sync');
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (sync.state === 'offline') {
    el.dataset.state = 'offline';
    el.textContent = 'Not connected';
  } else if (sync.state === 'checking') {
    el.dataset.state = 'checking';
    el.textContent = 'Checking…';
  } else if (!sync.safe) {
    el.dataset.state = 'pending';
    el.textContent = 'Saving…';
  } else {
    el.dataset.state = 'connected';
    // Short, to keep the toolbar short: the tooltip says the rest.
    el.textContent = sync.lastBackup ? time(sync.lastBackup) : 'Connected';
    el.title = sync.lastBackup
      ? `Connected to the computer running the app; this drawing was backed up to it at ${time(sync.lastBackup)}. Click to check again.`
      : 'Connected to the computer running the app. Click to check again.';
  }
  $('#offline').hidden = sync.state !== 'offline';
};
sync.onChange = renderSync;
renderSync();
$('#sync').addEventListener('click', () => void sync.check());
$('#offlineExport').addEventListener('click', () => void exportCopy());

$('#saveShared').addEventListener('click', async () => {
  closeMenu();
  // Check the computer is there before asking for a name, and say plainly if it is not.
  if (!(await reachable())) {
    await sync.check();
    if (confirm('NOT SAVED: the computer running the app isn\'t answering (has "npm run dev" stopped?).\n\nDownload a copy of the drawing to this device instead?')) void exportCopy();
    return;
  }
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
    sync.saved();
    alert(`Saved as a new drawing on the computer, in the project's drawings folder:\n${saved.path ?? saved.file}`);
  } catch {
    await sync.check();
    if (confirm('NOT SAVED: the computer stopped answering while saving.\n\nDownload a copy of the drawing to this device instead?')) void exportCopy();
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

/** Save the drawing as a file on this device. */
async function exportCopy() {
  closeMenu();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  await saveFile(new Blob([JSON.stringify(store.building, null, 2)], { type: 'application/json' }), `house-${stamp}.arch3d.json`, 'Arch3D drawing', '.json');
}

/**
 * Save a file on this device. Where the browser can (Chrome, Edge) this asks where to put
 * it; otherwise (Safari) it goes to the Downloads folder, as browsers insist.
 */
async function saveFile(blob: Blob, suggested: string, description: string, ext: string) {
  const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }> }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: suggested, types: [{ description, accept: { [blob.type || 'application/octet-stream']: [ext] } }] });
      const out = await handle.createWritable();
      await out.write(blob as unknown as string);
      await out.close();
      return;
    } catch (err) {
      // Cancelled: nothing to do. Any other failure: fall back to a download.
      if ((err as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggested;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#export').addEventListener('click', () => void exportCopy());

// A short movie circling the house, to send to people.
$('#movie').addEventListener('click', async () => {
  closeMenu();
  if (layout === 'plan') setLayout('split');
  const note = $('#recording');
  note.hidden = false;
  note.textContent = 'Recording the orbit movie… keep this window in front';
  try {
    const { blob, ext } = await view.recordOrbit(12, (f) => (note.textContent = `● Recording orbit movie ${Math.round(f * 100)}%`));
    note.textContent = 'Saving the movie…';
    const stamp = new Date().toISOString().slice(0, 10);
    await saveFile(blob, `house-orbit-${stamp}.${ext}`, 'Video', `.${ext}`);
  } catch (err) {
    alert(`Could not make the movie: ${(err as Error).message}`);
  } finally {
    note.hidden = true;
    syncToolbar();
  }
});
const printer = new Printer(store, editor, view);
$('#print').addEventListener('click', () => {
  closeMenu();
  printer.open();
});
const estimator = new Estimator(store, editor);
$('#estimateBtn').addEventListener('click', () => {
  closeMenu();
  estimator.open();
});
// Ctrl/⌘+P makes the pages; once they are showing it prints them.
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && !printer.showing && !estimator.showing) {
    e.preventDefault();
    printer.open();
  }
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
  for (const m of menus) if (m.open && !m.contains(e.target as Node)) m.open = false;
});

const HINTS: Record<Tool, string> = {
  select: 'Drag joints to reshape · drag a wall to move it · drag doors/windows along walls · click again to pick what is underneath · Delete removes',
  wall: 'Click to start a wall, click again for each corner · type a length + Enter · click the start, double-click or Esc to finish',
  door: 'Click on a wall to place a door',
  window: 'Click on a wall to place a window',
  split: 'Click on a wall to add a joint you can drag',
  paste: 'Click on walls to place exact copies · Esc when done',
  copyArea: 'Drag a box round what to copy (walls crossing the box are cut off at it) · Esc to cancel',
  pasteArea: 'Click where the copy goes (the pointer is its middle; joints landing on joints join up) · Esc to cancel',
  stair: 'Click where the stair starts (its bottom step), then click in the direction it goes up',
  roof: 'Click a roof to select it · click an edge of the selected roof to switch eave / gable end, or (flat roof) to take its parapet off or put it back',
  garage: 'Click on a wall to place a garage roller door (2.5 m wide; change it in the panel)',
  glazed: 'Click on a wall to place floor-to-ceiling glass doors (French, sliding or bi-fold: choose in the panel)',
  pillar: 'Click to place a pillar; it rises to the roof above it',
  chimney: 'Click on the roof to place a chimney stack (on the floor whose roof it goes through)',
  solar: 'Click on a roof slope to lay a solar array on it (on the floor the roof belongs to)',
  rooflight: 'Click on a roof: a flat roof gets a rooflight box, a sloping roof a window in the slope',
  drain: 'Click to lay a pipe run (it falls at 1 in 60 as it goes) · click a chamber or pipe to join it · double-click, Enter or Esc to finish · set fittings and depths in the panel',
  stretch: 'Drag a box round the part to move · then drag inside it (straight; Shift for any direction), or type the distance in the panel · Esc clears the box',
  furniture: 'Click to place it (near a wall it backs onto the wall) · [ and ] turn it · Esc when done',
  tree: 'Click to plant a tree; drag it to move it, set its size in the panel',
  hedge: 'Click along the line of the hedge, fence or ditch · click its start to go all the way round · double-click, Enter or Esc to finish',
  patio: 'Click the corners of the patio (snaps to walls; the house is cut out) · click the first corner, double-click or Enter to finish',
};

function syncToolbar() {
  for (const b of $$('#tools button[data-tool]')) b.classList.toggle('on', b.dataset.tool === editor.tool);
  // A tool menu shows the tool in use from it.
  for (const m of document.querySelectorAll<HTMLDetailsElement>('details.toolmenu')) {
    const active = m.querySelector<HTMLButtonElement>(`button[data-tool="${editor.tool}"]`);
    const summary = m.querySelector('summary')!;
    summary.textContent = active ? active.firstChild!.textContent!.trim() : m.dataset.label!;
    summary.classList.toggle('on', !!active);
  }
  for (const b of $$('#wallType button')) {
    b.classList.toggle('on', Math.abs(parseFloat(b.dataset.thickness!) - editor.wallProps.thickness) < 1e-6);
  }
  $('#wallType').hidden = editor.tool !== 'wall';
  $('#ortho').hidden = editor.tool !== 'wall' && editor.tool !== 'stair' && editor.tool !== 'patio';
  $('#patioSurface').hidden = editor.tool !== 'patio';
  $('#treeKind').hidden = editor.tool !== 'tree' && editor.tool !== 'hedge';
  treeSelect.value = editor.treeKind;
  hedgeSelect.value = editor.hedgeKind;
  treeSelect.parentElement!.classList.toggle('on', editor.tool === 'tree');
  hedgeSelect.parentElement!.classList.toggle('on', editor.tool === 'hedge');
  $('#drainKind').hidden = editor.tool !== 'drain';
  for (const b of $$('#drainKind button')) b.classList.toggle('on', b.dataset.kind === editor.drainKind);
  $('#underground').classList.toggle('on', view.underground);
  $('#sun').classList.toggle('on', sunPanel.open);
  $('#dims').classList.toggle('on', editor.showDims);
  $('#furnitureBtn').classList.toggle('on', editor.tool === 'furniture');
  for (const b of $$('#patioSurface button')) b.classList.toggle('on', b.dataset.surface === editor.patioSurface);
  $('#stairShape').hidden = editor.tool !== 'stair';
  $('#roofMode').hidden = editor.tool !== 'roof';
  for (const b of $$('#roofMode button')) b.classList.toggle('on', b.dataset.roofmode === editor.roofMode);
  for (const b of $$('#stairShape button')) b.classList.toggle('on', b.dataset.shape === editor.stairShape);
  $('#ortho').classList.toggle('on', editor.ortho);
  ($('#undo') as HTMLButtonElement).disabled = !store.canUndo;
  ($('#redo') as HTMLButtonElement).disabled = !store.canRedo;
  for (const b of $$('#layout button')) b.classList.toggle('on', b.dataset.layout === layout);
  for (const b of $$('#mode button')) b.classList.toggle('on', b.dataset.mode === view.mode);
  $('#cutaway').classList.toggle('on', view.cutaway);
  $('#cutaway').hidden = store.building.levels.length < 2 || view.mode === 'walk';
  const clip = editor.clipboard;
  $('#pasteTool').hidden = !clip;
  $<HTMLButtonElement>('#pasteAreaBtn').disabled = !editor.areaClip;
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
