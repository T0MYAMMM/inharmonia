import type { NoteStream } from './noteStream';

/**
 * Computer-keyboard layout, matching the prototype: home row is white keys
 * from C4, the row above is black keys. Keyed by KeyboardEvent.code so it works
 * on any keyboard layout (AZERTY, Dvorak) by physical position.
 */
export const KEY_CODE_OFFSETS: Readonly<Record<string, number>> = {
  KeyA: 0, // C
  KeyW: 1, // C#
  KeyS: 2, // D
  KeyE: 3, // D#
  KeyD: 4, // E
  KeyF: 5, // F
  KeyT: 6, // F#
  KeyG: 7, // G
  KeyY: 8, // G#
  KeyH: 9, // A
  KeyU: 10, // A#
  KeyJ: 11, // B
  KeyK: 12, // C
  KeyO: 13, // C#
  KeyL: 14, // D
  KeyP: 15, // D#
  Semicolon: 16, // E
  Quote: 17, // F
};

/** Label shown on the on-screen key for each offset. */
export const KEY_HINTS: Readonly<Record<number, string>> = {
  0: 'A',
  1: 'W',
  2: 'S',
  3: 'E',
  4: 'D',
  5: 'F',
  6: 'T',
  7: 'G',
  8: 'Y',
  9: 'H',
  10: 'U',
  11: 'J',
  12: 'K',
  13: 'O',
  14: 'L',
  15: 'P',
  16: ';',
  17: "'",
};

export const BASE_MIDI = 60; // C4

export interface ComputerKeysOptions {
  velocity?: number;
  /** Octave shift limits, in octaves relative to C4. */
  minShift?: number;
  maxShift?: number;
  onShift?: (octaves: number) => void;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLInputElement) {
    return !['range', 'checkbox', 'radio', 'button', 'submit'].includes(t.type);
  }
  return false;
}

/**
 * Plays notes from the computer keyboard. Z / X shift down / up an octave.
 * Ignores auto-repeat, modifier chords and typing in text fields; releases
 * everything when the window loses focus so notes never get stuck.
 */
export class ComputerKeys {
  private shift = 0;
  /** Which MIDI note each physical key started, so shifting while holding releases correctly. */
  private down = new Map<string, number>();
  private shiftListeners = new Set<(octaves: number) => void>();
  private readonly opts: Required<Omit<ComputerKeysOptions, 'onShift'>> & ComputerKeysOptions;

  constructor(
    private readonly stream: NoteStream,
    opts: ComputerKeysOptions = {},
  ) {
    this.opts = { velocity: 0.75, minShift: -3, maxShift: 2, ...opts };
  }

  get octaveShift(): number {
    return this.shift;
  }

  setOctaveShift(octaves: number): void {
    const next = Math.max(this.opts.minShift, Math.min(this.opts.maxShift, octaves));
    if (next === this.shift) return;
    this.shift = next;
    this.opts.onShift?.(next);
    for (const l of this.shiftListeners) l(next);
  }

  onShiftChange(l: (octaves: number) => void): () => void {
    this.shiftListeners.add(l);
    return () => this.shiftListeners.delete(l);
  }

  /** MIDI note a key code plays at the current shift, or null. */
  midiFor(code: string): number | null {
    const off = KEY_CODE_OFFSETS[code];
    return off === undefined ? null : BASE_MIDI + off + 12 * this.shift;
  }

  handleKeyDown = (e: KeyboardEvent): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return false;
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      if (!e.repeat) this.setOctaveShift(this.shift + (e.code === 'KeyZ' ? -1 : 1));
      e.preventDefault();
      return true;
    }
    const midi = this.midiFor(e.code);
    if (midi === null) return false;
    e.preventDefault();
    if (e.repeat || this.down.has(e.code)) return true;
    this.down.set(e.code, midi);
    this.stream.noteOn(midi, this.opts.velocity, 'keys');
    return true;
  };

  handleKeyUp = (e: KeyboardEvent): boolean => {
    const midi = this.down.get(e.code);
    if (midi === undefined) return false;
    this.down.delete(e.code);
    this.stream.noteOff(midi, 'keys');
    return true;
  };

  releaseAll = (): void => {
    for (const midi of this.down.values()) this.stream.noteOff(midi, 'keys');
    this.down.clear();
  };

  attach(target: Window = window): () => void {
    const down = (e: KeyboardEvent) => void this.handleKeyDown(e);
    const up = (e: KeyboardEvent) => void this.handleKeyUp(e);
    const visibility = () => {
      if (document.visibilityState === 'hidden') this.releaseAll();
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      this.releaseAll();
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', this.releaseAll);
      document.removeEventListener('visibilitychange', visibility);
    };
  }
}
