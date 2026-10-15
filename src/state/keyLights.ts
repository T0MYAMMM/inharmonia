/**
 * Fine-grained key highlight state for the on-screen keyboard.
 *
 * Each key has a set of layers. The keyboard subscribes per key and toggles CSS
 * classes directly, so a note lighting up never re-renders React, let alone the
 * whole keyboard.
 *
 * Colour meaning: `rh` and `target` are amber (right hand / what to play),
 * `lh` is dusk blue (left hand / chord tones), `chordTarget` is a chord to play
 * (dusk with a ring), `wrong` flashes red.
 */
export type KeyLayer = 'held' | 'press' | 'rh' | 'lh' | 'target' | 'chordTarget' | 'wrong';

type KeyListener = (layers: ReadonlySet<KeyLayer>) => void;

export const PRESS_FLASH_MS = 160;
export const WRONG_FLASH_MS = 260;

export class KeyLights {
  private layers = new Map<number, Set<KeyLayer>>();
  private listeners = new Map<number, Set<KeyListener>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  get(midi: number): ReadonlySet<KeyLayer> {
    return this.layers.get(midi) ?? EMPTY;
  }

  has(midi: number, layer: KeyLayer): boolean {
    return this.layers.get(midi)?.has(layer) ?? false;
  }

  set(midi: number, layer: KeyLayer, on: boolean): void {
    let set = this.layers.get(midi);
    if (on) {
      if (set?.has(layer)) return;
      if (!set) this.layers.set(midi, (set = new Set()));
      set.add(layer);
    } else {
      if (!set?.delete(layer)) return;
      if (set.size === 0) this.layers.delete(midi);
    }
    this.notify(midi);
  }

  /** Light a layer briefly (press flash, wrong-note flash). Re-flashing restarts the timer. */
  flash(midi: number, layer: KeyLayer, ms: number): void {
    const id = `${midi}:${layer}`;
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.set(midi, layer, true);
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.set(midi, layer, false);
      }, ms),
    );
  }

  /** Make `layer` lit on exactly `midis`. */
  setExactly(layer: KeyLayer, midis: Iterable<number>): void {
    const want = new Set(midis);
    for (const [midi, set] of [...this.layers])
      if (set.has(layer) && !want.has(midi)) this.set(midi, layer, false);
    for (const m of want) this.set(m, layer, true);
  }

  clear(layer?: KeyLayer): void {
    for (const [midi, set] of [...this.layers]) {
      if (layer) this.set(midi, layer, false);
      else for (const l of [...set]) this.set(midi, l, false);
    }
  }

  subscribe(midi: number, l: KeyListener): () => void {
    let set = this.listeners.get(midi);
    if (!set) this.listeners.set(midi, (set = new Set()));
    set.add(l);
    return () => set.delete(l);
  }

  private notify(midi: number): void {
    const ls = this.listeners.get(midi);
    if (!ls) return;
    const layers = this.get(midi);
    for (const l of ls) l(layers);
  }
}

const EMPTY: ReadonlySet<KeyLayer> = new Set();
