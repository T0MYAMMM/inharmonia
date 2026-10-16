import type { CompiledChord } from '../content/compile';
import type { Strictness } from '../content/types';
import { belongsToChord, chordTarget, matchChord, type ChordTarget } from './chordMatch';

export type Timing = 'on-time' | 'early' | 'late' | 'missed';

export interface ChordScore {
  chordId: string;
  timing: Timing;
  /** How far from the chord change the chord was complete, ms. Null when missed or held over. */
  offsetMs: number | null;
}

export interface PlayAlongSummary {
  total: number;
  onTime: number;
  early: number;
  late: number;
  missed: number;
  wrongNotes: number;
  /** Chords played (any timing) / total. */
  accuracy: number;
}

export interface PlayAlongOptions {
  strictness?: Strictness;
  /** A chord within this many ms of the change counts as on time. */
  hitWindowMs?: number;
  /** How early, in beats, a chord may be played and still count for the next change. */
  earlyBeats?: number;
}

interface Segment {
  chord: CompiledChord;
  target: ChordTarget;
  start: number;
  end: number;
}

/**
 * Scores chords played along with the transport. Feed it note-ons and the held
 * notes with the transport beat at which they were heard; it judges each chord
 * change as on time, early, late, or missed once its segment has passed.
 *
 * - Timing is measured from the note that completed the chord to the change.
 * - A chord held over from the previous identical chord counts as on time.
 * - A note that belongs to neither the current chord nor the next one is a wrong note.
 */
export class PlayAlongScorer {
  private readonly segments: Segment[];
  private readonly strictness: Strictness;
  private readonly windowMs: number;
  private readonly earlyBeats: number;
  private scores = new Map<string, ChordScore>();
  private lastNoteOnBeat = -Infinity;
  private wrong = 0;

  constructor(chords: readonly CompiledChord[], opts: PlayAlongOptions = {}) {
    // N.C. slots have nothing to play, so they are not scored.
    this.segments = chords
      .filter((c) => c.voicing.length > 0)
      .map((chord) => ({
        chord,
        target: chordTarget(chord.voicing),
        start: chord.startBeat,
        end: chord.startBeat + chord.beats,
      }));
    this.strictness = opts.strictness ?? 'pitch-class';
    this.windowMs = opts.hitWindowMs ?? 150;
    this.earlyBeats = opts.earlyBeats ?? 0.5;
  }

  get wrongNotes(): number {
    return this.wrong;
  }

  score(chordId: string): ChordScore | undefined {
    return this.scores.get(chordId);
  }

  get all(): readonly ChordScore[] {
    return [...this.scores.values()];
  }

  /** Index of the segment containing `beat`, or -1 outside the progression. */
  segmentAt(beat: number): number {
    return this.segments.findIndex((s) => beat >= s.start - 1e-9 && beat < s.end - 1e-9);
  }

  /** A key went down at `beat`. Returns true if it is a wrong note. */
  noteOn(midi: number, beat: number): boolean {
    this.lastNoteOnBeat = beat;
    const i = this.segmentAt(beat);
    const candidates = [this.segments[i], this.segments[i + 1]].filter(Boolean) as Segment[];
    if (i === -1 && beat < (this.segments[0]?.start ?? 0)) candidates.push(this.segments[0]!);
    if (candidates.length === 0) return false;
    const ok = candidates.some((s) => belongsToChord(midi, s.target, this.strictness));
    if (!ok) this.wrong++;
    return !ok;
  }

  /**
   * Call on every note change and every frame. Returns the chords scored by
   * this call (hits as they happen, misses once their segment has passed).
   */
  update(held: readonly number[], beat: number, bpm: number): ChordScore[] {
    const out: ChordScore[] = [];
    for (const s of this.segments) {
      if (this.scores.has(s.chord.id)) continue;
      if (beat >= s.end - 1e-9) {
        out.push(this.record(s, 'missed', null));
        continue;
      }
      if (beat < s.start - this.earlyBeats) break;
      if (held.length === 0 || matchChord(held, s.target, this.strictness).status !== 'match') {
        if (beat >= s.start) break; // later segments cannot be scored before this one
        continue;
      }
      const heldOver = this.lastNoteOnBeat < s.start - this.earlyBeats;
      if (heldOver) {
        out.push(this.record(s, 'on-time', null));
      } else {
        const offsetMs = ((this.lastNoteOnBeat - s.start) * 60000) / bpm;
        const timing: Timing =
          Math.abs(offsetMs) <= this.windowMs ? 'on-time' : offsetMs < 0 ? 'early' : 'late';
        out.push(this.record(s, timing, Math.round(offsetMs)));
      }
    }
    return out;
  }

  summary(): PlayAlongSummary {
    const all = this.all;
    const count = (t: Timing) => all.filter((s) => s.timing === t).length;
    const total = this.segments.length;
    const missed = count('missed') + (total - all.length);
    return {
      total,
      onTime: count('on-time'),
      early: count('early'),
      late: count('late'),
      missed,
      wrongNotes: this.wrong,
      accuracy: total ? (total - missed) / total : 0,
    };
  }

  private record(s: Segment, timing: Timing, offsetMs: number | null): ChordScore {
    const r = { chordId: s.chord.id, timing, offsetMs };
    this.scores.set(s.chord.id, r);
    return r;
  }
}
