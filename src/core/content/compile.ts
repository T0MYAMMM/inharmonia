import type { TimelineEvent } from '../audio/timeline';
import { explicitVoicing, isValidChord, spelled, voiceChord, type SpelledNote } from '../theory';
import type { ChordSpec, Hand, Lesson, NoteSpec, PatternSpec, VoicingSpec } from './types';

/** A chord as it sits on the timeline, with its resolved voicing. */
export interface CompiledChord {
  id: string;
  symbol: string;
  barIndex: number;
  startBeat: number;
  beats: number;
  voicing: SpelledNote[];
}

/** A written note (or rest) as it sits on the timeline. */
export interface CompiledNote {
  id: string;
  hand: Hand;
  barIndex: number;
  indexInBar: number;
  startBeat: number;
  beats: number;
  /** null for a rest. */
  note: SpelledNote | null;
  velocity: number;
}

export interface CompiledBar {
  index: number;
  startBeat: number;
  beats: number;
  section?: string;
  chords: CompiledChord[];
  rh: CompiledNote[];
  lh: CompiledNote[];
}

export interface CompiledLesson {
  lesson: Lesson;
  beatsPerBar: number;
  lengthBeats: number;
  bars: CompiledBar[];
  chords: CompiledChord[];
  /** Everything the transport plays, both hands, in straight beats. */
  events: TimelineEvent[];
}

export const DEFAULT_RH_VELOCITY = 0.4;
export const DEFAULT_LH_VELOCITY = 0.13;
/** Melody notes sound for this fraction of their written length, so repeated notes re-strike cleanly. */
export const DEFAULT_RH_LEGATO = 0.95;
const EPS = 1e-9;

export function resolveVoicing(symbol: string, spec: VoicingSpec | undefined): SpelledNote[] {
  if (spec && 'notes' in spec) return explicitVoicing(spec.notes);
  return voiceChord(symbol, {
    style: spec?.style ?? 'close',
    ...(spec?.inversion !== undefined ? { inversion: spec.inversion } : {}),
    floor: spec?.floor ?? 'C3',
  });
}

/**
 * Apply a left-hand pattern over one chord segment. The pattern restarts at the
 * start of each chord and is cut off where the chord ends; 'chord' durations
 * sustain to the chord change. The lowest voice gets the root accent.
 */
export function applyPattern(
  pattern: PatternSpec,
  chord: CompiledChord,
  idPrefix: string,
): CompiledNote[] {
  const out: CompiledNote[] = [];
  const end = chord.startBeat + chord.beats;
  const v = chord.voicing;
  if (v.length === 0) return out;
  let n = 0;
  for (let cycle = chord.startBeat; cycle < end - EPS; cycle += pattern.cycleBeats) {
    for (const step of pattern.steps) {
      const at = cycle + step.at;
      if (at >= end - EPS) break;
      const dur = step.dur === 'chord' ? end - at : Math.min(step.dur, end - at);
      for (const raw of step.voices) {
        const idx = raw < 0 ? v.length + raw : Math.min(raw, v.length - 1);
        const note = v[Math.max(0, idx)]!;
        const base = step.velocity ?? DEFAULT_LH_VELOCITY;
        out.push({
          id: `${idPrefix}-${n++}`,
          hand: 'lh',
          barIndex: chord.barIndex,
          indexInBar: -1,
          startBeat: at,
          beats: dur,
          note,
          velocity: Math.min(1, idx === 0 ? base * (pattern.rootAccent ?? 1) : base),
        });
      }
    }
  }
  return out;
}

function compileNotes(
  notes: readonly NoteSpec[] | undefined,
  hand: Hand,
  barIndex: number,
  barStart: number,
  defaultVelocity: number,
): CompiledNote[] {
  const out: CompiledNote[] = [];
  let t = barStart;
  (notes ?? []).forEach((n, i) => {
    out.push({
      id: `${hand}-${barIndex}-${i}`,
      hand,
      barIndex,
      indexInBar: i,
      startBeat: t,
      beats: n.beats,
      note: n.note === 'r' ? null : spelled(n.note),
      velocity: n.velocity ?? defaultVelocity,
    });
    t += n.beats;
  });
  return out;
}

/**
 * Turn lesson content into bars, chords and a flat transport timeline.
 * Pure: the same lesson and patterns always produce the same output.
 */
export function compileLesson(
  lesson: Lesson,
  patterns: Readonly<Record<string, PatternSpec>> = {},
  opts: { rhLegato?: number } = {},
): CompiledLesson {
  const rhLegato = opts.rhLegato ?? DEFAULT_RH_LEGATO;
  const beatsPerBar = lesson.meter.beats;
  const pattern = lesson.lhPattern ? patterns[lesson.lhPattern] : undefined;
  if (lesson.lhPattern && !pattern)
    throw new Error(`Unknown left-hand pattern "${lesson.lhPattern}"`);

  const bars: CompiledBar[] = [];
  const chords: CompiledChord[] = [];
  lesson.bars.forEach((bar, barIndex) => {
    const startBeat = barIndex * beatsPerBar;
    let t = startBeat;
    const barChords = bar.chords.map((c: ChordSpec, ci) => {
      const compiled: CompiledChord = {
        id: `chord-${barIndex}-${ci}`,
        symbol: c.symbol,
        barIndex,
        startBeat: t,
        beats: c.beats,
        voicing: resolveVoicing(c.symbol, c.voicing),
      };
      t += c.beats;
      return compiled;
    });
    const lh = bar.lh
      ? compileNotes(bar.lh, 'lh', barIndex, startBeat, DEFAULT_LH_VELOCITY)
      : pattern
        ? barChords.flatMap((c) => applyPattern(pattern, c, `lh-${c.id}`))
        : [];
    bars.push({
      index: barIndex,
      startBeat,
      beats: beatsPerBar,
      ...(bar.section ? { section: bar.section } : {}),
      chords: barChords,
      rh: compileNotes(bar.rh, 'rh', barIndex, startBeat, DEFAULT_RH_VELOCITY),
      lh,
    });
    chords.push(...barChords);
  });

  const events: TimelineEvent[] = bars.flatMap((b) =>
    [...b.rh, ...b.lh].flatMap((n) =>
      n.note
        ? [
            {
              id: n.id,
              beat: n.startBeat,
              dur: n.hand === 'rh' ? n.beats * rhLegato : n.beats,
              midi: n.note.midi,
              velocity: n.velocity,
              channel: n.hand,
            },
          ]
        : [],
    ),
  );

  return { lesson, beatsPerBar, lengthBeats: bars.length * beatsPerBar, bars, chords, events };
}

/** Problems that make a lesson wrong to play. Empty when the lesson is valid. */
export function validateLesson(lesson: Lesson): string[] {
  const issues: string[] = [];
  const len = lesson.meter.beats;
  const sum = (xs: { beats: number }[]) => xs.reduce((s, x) => s + x.beats, 0);
  lesson.bars.forEach((bar, i) => {
    const where = `Bar ${i + 1}`;
    if (Math.abs(sum(bar.chords) - len) > EPS)
      issues.push(`${where}: chords last ${sum(bar.chords)} beats, not ${len}`);
    for (const c of bar.chords)
      if (!isValidChord(c.symbol)) issues.push(`${where}: unknown chord "${c.symbol}"`);
    for (const [hand, notes] of [
      ['right hand', bar.rh],
      ['left hand', bar.lh],
    ] as const) {
      if (!notes) continue;
      if (Math.abs(sum(notes) - len) > EPS)
        issues.push(`${where}: ${hand} lasts ${sum(notes)} beats, not ${len}`);
      for (const n of notes) {
        if (n.note === 'r') continue;
        try {
          spelled(n.note);
        } catch {
          issues.push(`${where}: ${hand} note "${n.note}" is not a note`);
        }
      }
    }
  });
  return issues;
}
