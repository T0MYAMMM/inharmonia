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

/**
 * Web storage that never throws. A copy is kept in memory, so what was
 * written reads back for the life of the page even when the browser refused
 * to store it, rather than an older value it still holds.
 */
class SafeWebStorage implements KeyValueStore {
  private memory = new Map<string, string>();
  /** Keys whose last write the browser refused: memory holds the newer value. */
  private refused = new Set<string>();

  constructor(private readonly area: 'localStorage' | 'sessionStorage') {}

  private get ls(): Storage | null {
    try {
      return typeof window !== 'undefined' ? window[this.area] : null;
    } catch {
      return null;
    }
  }

  get(key: string): string | null {
    if (!this.refused.has(key))
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
      this.refused.delete(key);
      return true;
    } catch {
      this.refused.add(key);
      return false;
    }
  }

  remove(key: string): void {
    this.memory.delete(key);
    this.refused.delete(key);
    try {
      this.ls?.removeItem(NAMESPACE + key);
    } catch {
      /* ignore */
    }
  }
}

export const storage: KeyValueStore = new SafeWebStorage('localStorage');

/** The same for this tab only: kept through a reload, gone with the tab. */
export const sessionStore: KeyValueStore = new SafeWebStorage('sessionStorage');

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
