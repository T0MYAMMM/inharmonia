import type { CompiledChord, CompiledLesson, CompiledNote } from '../content/compile';
import { chordOf } from './songView';

export type PressResult =
  | {
      kind: 'hit';
      note: CompiledNote;
      roll: CompiledChord | null;
      finished: { hits: number; misses: number } | null;
    }
  | { kind: 'miss'; midi: number; expected: CompiledNote }
  | { kind: 'idle' };

/**
 * "Wait for the note" practice over a compiled lesson's right-hand line.
 * The score waits at each target until the right key is pressed.
 *
 * - A correct press counts a hit and advances. If the target starts a new chord
 *   segment (the first target, or its chord differs from the previous target's),
 *   the result carries that chord so the caller can roll the left hand.
 * - A wrong press counts a miss and the target stays.
 * - After the last note the result carries the final counts, and the session
 *   resets to the start.
 *
 * Plain TypeScript: no audio or DOM, so it is fully unit-tested.
 */
export class WaitSession {
  readonly targets: CompiledNote[];
  private _index = 0;
  private _hits = 0;
  private _misses = 0;

  constructor(private readonly compiled: CompiledLesson) {
    this.targets = compiled.bars.flatMap((b) => b.rh.filter((n) => n.note !== null));
  }

  get index(): number {
    return this._index;
  }

  get hits(): number {
    return this._hits;
  }

  get misses(): number {
    return this._misses;
  }

  get target(): CompiledNote | null {
    return this.targets[this._index] ?? null;
  }

  /** The chord the current target sits in. */
  get targetChord(): CompiledChord | null {
    const t = this.target;
    return t ? chordOf(this.compiled, t) : null;
  }

  /** Does the target at `i` start a new chord segment? */
  startsChord(i: number): boolean {
    const t = this.targets[i];
    if (!t) return false;
    if (i === 0) return true;
    const prev = this.targets[i - 1]!;
    return chordOf(this.compiled, t)?.id !== chordOf(this.compiled, prev)?.id;
  }

  /** Move the target to the first note of a bar (or the next bar that has one). Counts are kept. */
  goToBar(barIndex: number): void {
    const i = this.targets.findIndex((t) => t.barIndex >= barIndex);
    this._index = i === -1 ? 0 : i;
  }

  /** Target the first note of the bar containing `beat`. */
  goToBeat(beat: number): void {
    this.goToBar(Math.max(0, Math.floor(beat / this.compiled.beatsPerBar)));
  }

  reset(): void {
    this._index = 0;
    this._hits = 0;
    this._misses = 0;
  }

  press(midi: number): PressResult {
    const target = this.target;
    if (!target?.note) return { kind: 'idle' };
    if (midi !== target.note.midi) {
      this._misses++;
      return { kind: 'miss', midi, expected: target };
    }
    this._hits++;
    const roll = this.startsChord(this._index) ? chordOf(this.compiled, target) : null;
    this._index++;
    let finished: { hits: number; misses: number } | null = null;
    if (this._index >= this.targets.length) {
      finished = { hits: this._hits, misses: this._misses };
      this.reset();
    }
    return { kind: 'hit', note: target, roll, finished };
  }
}
