import type { Strictness } from '../content/types';
import {
  CHORD_QUALITIES,
  inversionCount,
  parseChord,
  voiceChord,
  type ChordQuality,
  type SpelledNote,
} from '../theory';
import {
  chordTarget,
  matchChord,
  belongsToChord,
  type ChordMatch,
  type ChordTarget,
} from './chordMatch';

export const ALL_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export const NATURAL_ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

const INVERSION_NAMES = [
  'root position',
  'first inversion',
  'second inversion',
  'third inversion',
  'fourth inversion',
  'fifth inversion',
];

export function inversionName(n: number): string {
  return INVERSION_NAMES[n] ?? `inversion ${n}`;
}

export interface DrillItem {
  root: string;
  quality: ChordQuality;
  inversion: number;
  symbol: string;
  voicing: SpelledNote[];
  target: ChordTarget;
}

export interface DrillResult {
  item: DrillItem;
  /** Played without any wrong note first. */
  clean: boolean;
  /** Time from the prompt to the chord, ms; null if skipped. */
  timeMs: number | null;
  misses: number;
  skipped: boolean;
}

export interface DrillOptions {
  qualityIds: readonly string[];
  roots: readonly string[];
  inversions: boolean;
  strictness: Strictness;
  roundLength?: number;
  rng?: () => number;
}

export interface DrillSummary {
  total: number;
  clean: number;
  skipped: number;
  misses: number;
  /** Clean answers / prompts. */
  accuracy: number;
  /** Mean time over answered prompts, ms. */
  averageMs: number | null;
}

/**
 * "Play C major, second inversion": a round of chord prompts answered on the
 * keyboard. Plain TypeScript; the page feeds it note events and held notes.
 */
export class ChordDrill {
  readonly roundLength: number;
  private rng: () => number;
  private _current: DrillItem;
  private startedAt = 0;
  private currentMisses = 0;
  private _results: DrillResult[] = [];

  constructor(
    private readonly opts: DrillOptions,
    now = 0,
  ) {
    if (opts.qualityIds.length === 0) throw new Error('Pick at least one chord quality');
    if (opts.roots.length === 0) throw new Error('Pick at least one root');
    this.roundLength = opts.roundLength ?? 10;
    this.rng = opts.rng ?? Math.random;
    this._current = this.pick(null);
    this.startedAt = now;
  }

  get current(): DrillItem {
    return this._current;
  }

  get results(): readonly DrillResult[] {
    return this._results;
  }

  get strictness(): Strictness {
    return this.opts.strictness;
  }

  get done(): boolean {
    return this._results.length >= this.roundLength;
  }

  get currentMissCount(): number {
    return this.currentMisses;
  }

  /** "C major seventh, second inversion" */
  describe(item = this._current): {
    chord: string;
    inversion: string | null;
    lowest: string | null;
  } {
    const showInversion = this.opts.inversions || this.opts.strictness !== 'pitch-class';
    return {
      chord: `${prettyRoot(item.root)} ${item.quality.name.toLowerCase()}`,
      inversion: showInversion ? inversionName(item.inversion) : null,
      lowest: this.opts.strictness === 'exact' ? item.voicing[0]!.name : null,
    };
  }

  /** A key went down. Returns true when it is a wrong note (counted as a miss). */
  press(midi: number): boolean {
    if (this.done || belongsToChord(midi, this._current.target, this.opts.strictness)) return false;
    this.currentMisses++;
    return true;
  }

  /** Check the held notes. On a match, records the result and moves on. */
  check(held: readonly number[], now: number): ChordMatch & { result?: DrillResult } {
    const m = matchChord(held, this._current.target, this.opts.strictness);
    if (m.status !== 'match' || this.done) return m;
    return { ...m, result: this.record(false, now) };
  }

  /** Called by a ChordRecognizer once a match has settled. */
  accept(now: number): DrillResult | null {
    if (this.done) return null;
    return this.record(false, now);
  }

  skip(now: number): DrillResult | null {
    if (this.done) return null;
    return this.record(true, now);
  }

  restart(now: number): void {
    this._results = [];
    this.currentMisses = 0;
    this._current = this.pick(null);
    this.startedAt = now;
  }

  summary(): DrillSummary {
    const r = this._results;
    const answered = r.filter((x) => !x.skipped && x.timeMs !== null);
    const clean = r.filter((x) => x.clean).length;
    return {
      total: r.length,
      clean,
      skipped: r.filter((x) => x.skipped).length,
      misses: r.reduce((s, x) => s + x.misses, 0),
      accuracy: r.length ? clean / r.length : 0,
      averageMs: answered.length
        ? answered.reduce((s, x) => s + x.timeMs!, 0) / answered.length
        : null,
    };
  }

  private record(skipped: boolean, now: number): DrillResult {
    const result: DrillResult = {
      item: this._current,
      clean: !skipped && this.currentMisses === 0,
      timeMs: skipped ? null : Math.max(0, now - this.startedAt),
      misses: this.currentMisses,
      skipped,
    };
    this._results.push(result);
    this.currentMisses = 0;
    if (!this.done) {
      this._current = this.pick(this._current);
      this.startedAt = now;
    }
    return result;
  }

  private pick(previous: DrillItem | null): DrillItem {
    const qualities = CHORD_QUALITIES.filter((q) => this.opts.qualityIds.includes(q.id));
    for (let attempt = 0; attempt < 20; attempt++) {
      const root = this.opts.roots[Math.floor(this.rng() * this.opts.roots.length)]!;
      const quality = qualities[Math.floor(this.rng() * qualities.length)]!;
      const symbol = `${root}${quality.suffix}`;
      const count = inversionCount(symbol);
      const inversion = this.opts.inversions ? Math.floor(this.rng() * count) : 0;
      if (
        previous &&
        previous.symbol === symbol &&
        previous.inversion === inversion &&
        attempt < 19
      )
        continue;
      const voicing = voiceChord(symbol, { inversion, floor: floorFor(symbol, inversion) });
      return { root, quality, inversion, symbol, voicing, target: chordTarget(voicing) };
    }
    throw new Error('unreachable');
  }
}

/** Keep drill voicings around middle C: big chords start lower so they stay in reach. */
function floorFor(symbol: string, inversion: number): string {
  const size = parseChord(symbol).tones.length;
  if (size >= 5) return 'C3';
  return inversion >= 2 ? 'C3' : 'G3';
}

function prettyRoot(root: string): string {
  return root.replace('#', '♯').replace(/(?<=[A-G])b/, '♭');
}
