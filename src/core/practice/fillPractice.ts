import type { RealizedHit } from '../content/fills';
import { chroma } from '../theory';

/** Any octave (the default), or the written octave only. */
export type FillMatch = 'any-octave' | 'exact';

const same = (a: number, b: number, match: FillMatch) =>
  match === 'exact' ? a === b : chroma(a) === chroma(b);

export type FillPress =
  | {
      kind: 'hit';
      target: RealizedHit;
      index: number;
      finished: { hits: number; misses: number } | null;
    }
  | { kind: 'miss'; expected: RealizedHit }
  /** Part of a double stop; waiting for the rest. */
  | { kind: 'progress' }
  | { kind: 'idle' };

/**
 * "Wait for it" over a fill: each hit (a note or a double stop) waits until
 * every note of it has been played since the last hit, together or one after
 * the other (so a mouse or one finger can manage a double stop). Notes still
 * held from the previous hit don't count towards the next one. After the last
 * hit the round's counts are reported and the fill starts again.
 */
export class FillWaitSession {
  private i = 0;
  private _hits = 0;
  private _misses = 0;
  private fresh = new Set<number>();

  constructor(
    readonly targets: readonly RealizedHit[],
    readonly match: FillMatch = 'any-octave',
  ) {}

  get index(): number {
    return this.i;
  }

  get target(): RealizedHit | null {
    return this.targets[this.i] ?? null;
  }

  get hits(): number {
    return this._hits;
  }

  get misses(): number {
    return this._misses;
  }

  press(midi: number): FillPress {
    const target = this.target;
    if (!target) return { kind: 'idle' };
    if (!target.notes.some((n) => same(midi, n.midi, this.match))) {
      this._misses++;
      return { kind: 'miss', expected: target };
    }
    this.fresh.add(midi);
    const done = target.notes.every((n) =>
      [...this.fresh].some((m) => same(m, n.midi, this.match)),
    );
    if (!done) return { kind: 'progress' };
    const index = this.i;
    this.i++;
    this._hits++;
    this.fresh.clear();
    let finished = null;
    if (this.i >= this.targets.length) {
      finished = { hits: this._hits, misses: this._misses };
      this.reset();
    }
    return { kind: 'hit', target, index, finished };
  }

  reset(): void {
    this.i = 0;
    this._hits = 0;
    this._misses = 0;
    this.fresh.clear();
  }
}

export interface RepResult {
  /** Every note on time and nothing extra. */
  clean: boolean;
  notes: number;
  onTime: number;
  missed: number;
  wrong: number;
}

/**
 * Scores one timed repetition of a fill. Each press is matched to the nearest
 * unplayed note of the same pitch within the window; anything else is wrong.
 */
export class FillRepScorer {
  private expected: { beat: number; midi: number; played: boolean }[];
  private wrong = 0;

  constructor(
    hits: readonly RealizedHit[],
    private readonly opts: { windowMs: number; match?: FillMatch },
  ) {
    this.expected = hits.flatMap((h) =>
      h.notes.map((n) => ({ beat: h.beat, midi: n.midi, played: false })),
    );
  }

  /** Window in beats at a tempo. */
  windowBeats(bpm: number): number {
    return (this.opts.windowMs / 1000) * (bpm / 60);
  }

  /** A press at a (heard) beat. Returns false when it was wrong. */
  noteOn(midi: number, beat: number, bpm: number): boolean {
    const w = this.windowBeats(bpm);
    let best: (typeof this.expected)[number] | null = null;
    for (const e of this.expected) {
      if (e.played || !same(midi, e.midi, this.opts.match ?? 'any-octave')) continue;
      const d = Math.abs(e.beat - beat);
      if (d <= w + 1e-9 && (!best || d < Math.abs(best.beat - beat))) best = e;
    }
    if (!best) {
      this.wrong++;
      return false;
    }
    best.played = true;
    return true;
  }

  /** Has a press already been matched for every note due before `beat`? */
  nextDue(beat: number, bpm: number): number | null {
    const w = this.windowBeats(bpm);
    const e = this.expected.find((x) => !x.played && x.beat + w > beat);
    return e ? e.beat : null;
  }

  result(): RepResult {
    const onTime = this.expected.filter((e) => e.played).length;
    const missed = this.expected.length - onTime;
    return {
      clean: missed === 0 && this.wrong === 0,
      notes: this.expected.length,
      onTime,
      missed,
      wrong: this.wrong,
    };
  }
}

export interface SpeedSettings {
  /** Tempo to start at, bpm. */
  start: number;
  /** Tempo to work up to, bpm. */
  goal: number;
  /** How much faster after each set of clean repetitions, bpm. */
  step: number;
  /** Clean repetitions in a row before speeding up. */
  needed: number;
}

export const DEFAULT_SPEED: SpeedSettings = { start: 60, goal: 100, step: 5, needed: 3 };

export type LadderEvent = 'clean' | 'reset' | 'up' | 'goal';

/** The auto speed-up: N clean repetitions in a row move the tempo up a step, to the goal. */
export class SpeedLadder {
  tempo: number;
  streak = 0;
  /** Highest tempo with a full set of clean repetitions. */
  best: number | null = null;
  clean = 0;
  reps = 0;

  constructor(readonly settings: SpeedSettings) {
    this.tempo = Math.min(settings.start, settings.goal);
  }

  rep(clean: boolean): LadderEvent {
    this.reps++;
    if (!clean) {
      this.streak = 0;
      return 'reset';
    }
    this.clean++;
    this.streak++;
    if (this.streak < this.settings.needed) return 'clean';
    this.streak = 0;
    this.best = Math.max(this.best ?? 0, this.tempo);
    if (this.tempo >= this.settings.goal) return 'goal';
    this.tempo = Math.min(this.settings.goal, this.tempo + this.settings.step);
    return 'up';
  }
}
