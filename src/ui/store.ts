import { createBuilding, getLevel, migrate } from '../model/building';
import type { Building, Level } from '../model/types';

const STORAGE_KEY = 'arch3d.plan.v1';

/**
 * Holds the building plus undo/redo history as JSON snapshots, and which level is being
 * edited. Live edits (dragging) call `changed()`; finished operations call `commit()`.
 */
export class Store {
  building: Building;
  /** The level being edited. Not part of the undo history. */
  activeId: string;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private committed: string;
  private listeners = new Set<() => void>();

  constructor(initial: Building) {
    this.building = initial;
    this.activeId = initial.levels[0].id;
    this.committed = JSON.stringify(initial);
  }

  static loadSaved(): Building | null {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? migrate(JSON.parse(s)) : null;
    } catch {
      return null;
    }
  }

  /** The level being edited. */
  get plan(): Level {
    return getLevel(this.building, this.activeId) ?? this.building.levels[0];
  }

  setActive(id: string) {
    if (!getLevel(this.building, id) || id === this.activeId) return;
    this.activeId = id;
    this.emit();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The plan changed but the operation is still in progress. */
  changed() {
    this.emit();
  }

  /** The operation is complete: record it for undo and save. */
  commit() {
    const s = JSON.stringify(this.building);
    if (s !== this.committed) {
      this.undoStack.push(this.committed);
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
      this.committed = s;
      this.save();
    }
    this.fixActive();
    this.emit();
  }

  /** Abandon uncommitted live edits. */
  revert() {
    this.restore(this.committed);
  }

  replace(b: Building) {
    this.building = b;
    this.activeId = b.levels[0].id;
    this.commit();
  }

  reset() {
    this.replace(createBuilding());
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    const prev = this.undoStack.pop();
    if (prev === undefined) return;
    this.redoStack.push(this.committed);
    this.committed = prev;
    this.save();
    this.restore(prev);
  }

  redo() {
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(this.committed);
    this.committed = next;
    this.save();
    this.restore(next);
  }

  private restore(json: string) {
    this.building = JSON.parse(json);
    this.fixActive();
    this.emit();
  }

  /** Keep the active level valid when levels are added or removed (including by undo). */
  private fixActive() {
    if (!getLevel(this.building, this.activeId)) {
      this.activeId = this.building.levels[this.building.levels.length - 1].id;
    }
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, this.committed);
    } catch {
      // Storage unavailable (private mode etc.): the plan still works, it just isn't kept.
    }
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}
