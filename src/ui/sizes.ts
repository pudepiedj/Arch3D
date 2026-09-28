// Sizes you last gave a kind of thing (a tree species, a hedge, a piece of furniture), kept
// on this device, so the next one you place comes out the same until you press Reset size.

const KEY = 'arch3d.sizes';

function all(): Record<string, Record<string, unknown>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function save(v: Record<string, Record<string, unknown>>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Not remembered: no matter.
  }
}

/** The sizes last used for this kind (e.g. "tree:oak"), if any. */
export function remembered<T extends object>(key: string): Partial<T> | undefined {
  return all()[key] as Partial<T> | undefined;
}

export function remember(key: string, value: Record<string, unknown>) {
  const v = all();
  v[key] = value;
  save(v);
}

export function forget(key: string) {
  const v = all();
  delete v[key];
  save(v);
}
