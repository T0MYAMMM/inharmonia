import type { CompiledChord, CompiledLesson, CompiledNote } from '../content/compile';
import type { Strictness } from '../content/types';
import { chroma } from '../theory';
import { belongsToChord, chordTarget, matchChord } from './chordMatch';
import { chordOf } from './songView';

export type PracticeHands = 'rh' | 'lh' | 'both';

/**
 * One thing to play. In right-hand and both-hands practice it is a melody note
 * (both hands also needs the chord held when the note starts a new chord). In
 * left-hand practice it is a chord.
 */
export type PracticeTarget =
  | {
      kind: 'note';
      id: string;
      barIndex: number;
      startBeat: number;
      note: CompiledNote;
      chord: CompiledChord | null;
      /** Both hands: the chord must be held together with this note. */
      needsChord: boolean;
    }
  | { kind: 'chord'; id: string; barIndex: number; startBeat: number; chord: CompiledChord };

export type PressResult =
  | {
      kind: 'hit';
      target: PracticeTarget;
      /** Right hand: the chord to roll in automatically, when the target starts a new chord. */
      roll: CompiledChord | null;
      /** Left hand: the chord segment just played, so its melody can play along. */
      segment: CompiledChord | null;
      finished: { hits: number; misses: number } | null;
    }
  | { kind: 'miss'; midi: number; expected: PracticeTarget }
  /** A right note, but the target is not complete yet (more chord tones to come). */
  | { kind: 'progress'; missing: number }
  | { kind: 'idle' };

/**
 * "Wait for it" practice over a compiled lesson. The score waits at each target
 * until it is played.
 *
 * - rh: melody notes. A hit on a note that starts a new chord reports the chord
 *   so the caller can roll the left hand.
 * - lh: chords, recognised from held notes with the given strictness. A hit
 *   reports the segment so the caller can play its melody.
 * - both: melody notes; on a note that starts a new chord, its chord must be held too.
 *
 * Notes that belong to neither the target note nor its chord count as misses.
 * After the last target the result carries the counts and the session resets.
 */
export class WaitSession {
  readonly targets: PracticeTarget[];
  private _index = 0;
  private _hits = 0;
  private _misses = 0;

  constructor(
    private readonly compiled: CompiledLesson,
    readonly hands: PracticeHands = 'rh',
    readonly strictness: Strictness = 'pitch-class',
  ) {
    this.targets =
      hands === 'lh' ? chordTargets(compiled) : noteTargets(compiled, hands === 'both');
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

  get target(): PracticeTarget | null {
    return this.targets[this._index] ?? null;
  }

  /** The chord the current target sits in (or is). */
  get targetChord(): CompiledChord | null {
    const t = this.target;
    return t ? t.chord : null;
  }

  /** Right-hand rule: does the target at `i` start a new chord segment? */
  startsChord(i: number): boolean {
    const t = this.targets[i];
    if (!t) return false;
    if (i === 0 || t.kind === 'chord') return true;
    return t.chord?.id !== this.targets[i - 1]!.chord?.id;
  }

  /** Move to the first target in a bar (or the next bar that has one). Counts are kept. */
  goToBar(barIndex: number): void {
    const i = this.targets.findIndex((t) => t.barIndex >= barIndex);
    this._index = i === -1 ? 0 : i;
  }

  /** Target the first target of the bar containing `beat`. */
  goToBeat(beat: number): void {
    this.goToBar(Math.max(0, Math.floor(beat / this.compiled.beatsPerBar)));
  }

  reset(): void {
    this._index = 0;
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * A key went down. `held` is every note held right now, including this one
   * (only needed for chord targets).
   */
  press(midi: number, held: readonly number[] = [midi]): PressResult {
    const t = this.target;
    if (!t) return { kind: 'idle' };

    if (t.kind === 'chord') {
      const target = chordTarget(t.chord.voicing);
      if (!belongsToChord(midi, target, this.strictness)) return this.miss(midi, t);
      const m = matchChord(held, target, this.strictness);
      if (m.status !== 'match') return { kind: 'progress', missing: m.missing.length };
      return this.hit(t, null, t.chord);
    }

    const noteMidi = t.note.note!.midi;
    const chordTones = t.chord ? new Set(t.chord.voicing.map((n) => chroma(n.midi))) : null;
    const isChordTone = this.hands === 'both' && chordTones?.has(chroma(midi));
    if (midi !== noteMidi && !isChordTone) return this.miss(midi, t);

    if (this.hands === 'rh') {
      return this.hit(t, this.startsChord(this._index) ? t.chord : null, null);
    }
    // Both hands: the melody note must be down, and the chord too when it starts here.
    if (!held.includes(noteMidi)) return { kind: 'progress', missing: 1 };
    if (t.needsChord && chordTones) {
      const heldChromas = new Set(
        held.filter((m) => m !== noteMidi || chordTones.has(chroma(m))).map(chroma),
      );
      const missing = [...chordTones].filter((c) => !heldChromas.has(c)).length;
      if (missing > 0) return { kind: 'progress', missing };
    }
    return this.hit(t, null, null);
  }

  private miss(midi: number, expected: PracticeTarget): PressResult {
    this._misses++;
    return { kind: 'miss', midi, expected };
  }

  private hit(
    target: PracticeTarget,
    roll: CompiledChord | null,
    segment: CompiledChord | null,
  ): PressResult {
    this._hits++;
    this._index++;
    let finished: { hits: number; misses: number } | null = null;
    if (this._index >= this.targets.length) {
      finished = { hits: this._hits, misses: this._misses };
      this.reset();
    }
    return { kind: 'hit', target, roll, segment, finished };
  }
}

/** Melody targets: every struck note. The held half of a tie is not played again, so it is skipped. */
function noteTargets(c: CompiledLesson, both: boolean): PracticeTarget[] {
  const notes = c.bars.flatMap((b) => b.rh.filter((n) => n.note !== null && !n.tiedFrom));
  return notes.map((note, i) => {
    const chord = chordOf(c, note);
    const prev = i > 0 ? chordOf(c, notes[i - 1]!) : null;
    return {
      kind: 'note' as const,
      id: note.id,
      barIndex: note.barIndex,
      startBeat: note.startBeat,
      note,
      chord,
      needsChord: both && (i === 0 || chord?.id !== prev?.id),
    };
  });
}

/** Chord targets: every chord that is played (N.C. slots are skipped). */
function chordTargets(c: CompiledLesson): PracticeTarget[] {
  return c.chords
    .filter((ch) => ch.voicing.length > 0)
    .map((chord) => ({
      kind: 'chord' as const,
      id: chord.id,
      barIndex: chord.barIndex,
      startBeat: chord.startBeat,
      chord,
    }));
}
