/**
 * localStorage behind try/catch. Private windows, blocked site data and
 * quota errors all degrade to "nothing saved" instead of breaking the app.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

export const NAMESPACE = 'inharmonia:';

class SafeLocalStorage implements KeyValueStore {
  private memory = new Map<string, string>();

  private get ls(): Storage | null {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  }

  get(key: string): string | null {
    try {
      const v = this.ls?.getItem(NAMESPACE + key);
      if (v !== null && v !== undefined) return v;
    } catch {
      /* fall through to memory */
    }
    return this.memory.get(key) ?? null;
  }

  set(key: string, value: string): boolean {
    this.memory.set(key, value);
    try {
      this.ls?.setItem(NAMESPACE + key, value);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    this.memory.delete(key);
    try {
      this.ls?.removeItem(NAMESPACE + key);
    } catch {
      /* ignore */
    }
  }
}

export const storage: KeyValueStore = new SafeLocalStorage();

/** In-memory store for tests. */
export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => {
      m.set(k, v);
      return true;
    },
    remove: (k) => void m.delete(k),
  };
}

export interface Versioned<T> {
  version: number;
  state: T;
}

/**
 * Read a versioned JSON document, running migrations from older versions and
 * falling back to `fallback` when it is missing, unreadable or invalid.
 */
export function readVersioned<T>(
  store: KeyValueStore,
  key: string,
  opts: {
    version: number;
    fallback: T;
    migrate?: Record<number, (old: unknown) => unknown>;
    validate: (x: unknown) => x is T;
  },
): T {
  const raw = store.get(key);
  if (!raw) return opts.fallback;
  try {
    const doc = JSON.parse(raw) as Partial<Versioned<unknown>>;
    let state: unknown = doc.state;
    let v = typeof doc.version === 'number' ? doc.version : 0;
    while (v < opts.version) {
      const step = opts.migrate?.[v];
      if (!step) return opts.fallback;
      state = step(state);
      v++;
    }
    return opts.validate(state) ? state : opts.fallback;
  } catch {
    return opts.fallback;
  }
}

export function writeVersioned<T>(
  store: KeyValueStore,
  key: string,
  version: number,
  state: T,
): boolean {
  return store.set(key, JSON.stringify({ version, state } satisfies Versioned<T>));
}
