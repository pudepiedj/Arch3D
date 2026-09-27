// Keeping the drawing safe on the computer running the app.
//
// Every edit is kept in this browser straight away, but that copy is tied to the page's
// address and to this device. So while the computer is reachable, the drawing is also
// backed up there a few seconds after each change (one backup file per device, shown in
// File → Open from computer… as an automatic backup). The app checks every few seconds
// that the computer is still there, shows the state in the toolbar, and raises a banner
// the moment it goes away, so work is never done for hours on the false belief that it
// can be saved.

import type { Store } from './store';

export type SyncState = 'connected' | 'offline' | 'checking';

const CHECK_EVERY = 8000;
const BACKUP_AFTER = 3000;
const TIMEOUT = 4000;

export class Sync {
  state: SyncState = 'checking';
  /** When the drawing last reached the computer (a save or a backup). */
  lastBackup: Date | null = null;
  onChange?: () => void;
  private backedUp = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;

  constructor(
    private store: Store,
    private device: string,
  ) {
    // Nothing is assumed to be on the computer yet: a page just loaded (or reloaded when the
    // server came back) may hold edits made while it was away, so it backs up once it can.
    store.subscribe(() => this.scheduleBackup());
    void this.check();
    setInterval(() => void this.check(), CHECK_EVERY);
    // Coming back to the tab (an iPad waking up): check at once.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.check();
    });
    // Closing or reloading with changes the computer hasn't got: ask first.
    window.addEventListener('beforeunload', (e) => {
      if (!this.safe) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /** True if the computer has everything drawn so far. */
  get safe(): boolean {
    return this.snapshot() === this.backedUp;
  }

  /** Is the computer there? Updates the state (and backs up if it has just come back). */
  async check(): Promise<boolean> {
    const was = this.state;
    const ok = await reachable();
    this.state = ok ? 'connected' : 'offline';
    if (this.state !== was) this.onChange?.();
    if (ok && !this.safe) void this.backup();
    return ok;
  }

  /** Mark the drawing as being on the computer (after a successful save). */
  saved() {
    this.backedUp = this.snapshot();
    this.lastBackup = new Date();
    this.onChange?.();
  }

  private snapshot(): string {
    return JSON.stringify(this.store.building);
  }

  private scheduleBackup() {
    this.onChange?.();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.backup(), BACKUP_AFTER);
  }

  private async backup() {
    if (this.busy || this.state === 'offline') return;
    const snap = this.snapshot();
    if (snap === this.backedUp) return;
    this.busy = true;
    try {
      const res = await withTimeout(
        fetch('/api/drawings/autosave', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device: this.device, building: this.store.building }),
        }),
      );
      if (!res.ok) throw new Error(String(res.status));
      this.backedUp = snap;
      this.lastBackup = new Date();
      this.state = 'connected';
    } catch {
      this.state = 'offline';
    } finally {
      this.busy = false;
      this.onChange?.();
    }
  }
}

/** Whether the computer running the app answers. */
export async function reachable(): Promise<boolean> {
  try {
    const res = await withTimeout(fetch('/api/status', { cache: 'no-store' }));
    return res.ok;
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, fail) => setTimeout(() => fail(new Error('timeout')), TIMEOUT))]);
}
