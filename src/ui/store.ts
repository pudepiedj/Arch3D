import type { Plan } from '../model/types';

const STORAGE_KEY = 'arch3d.plan.v1';

/**
 * Holds the current plan plus undo/redo history as JSON snapshots.
 * Live edits (dragging) call `changed()`; finished operations call `commit()`.
 */
export class Store {
  plan: Plan;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private committed: string;
  private listeners = new Set<() => void>();

  constructor(initial: Plan) {
    this.plan = initial;
    this.committed = JSON.stringify(initial);
  }

  static loadSaved(): Plan | null {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? (JSON.parse(s) as Plan) : null;
    } catch {
      return null;
    }
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
    const s = JSON.stringify(this.plan);
    if (s !== this.committed) {
      this.undoStack.push(this.committed);
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
      this.committed = s;
      this.save();
    }
    this.emit();
  }

  /** Abandon uncommitted live edits. */
  revert() {
    this.plan = JSON.parse(this.committed);
    this.emit();
  }

  replace(plan: Plan) {
    this.plan = plan;
    this.commit();
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
    this.plan = JSON.parse(prev);
    this.save();
    this.emit();
  }

  redo() {
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(this.committed);
    this.committed = next;
    this.plan = JSON.parse(next);
    this.save();
    this.emit();
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
