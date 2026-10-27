import { MIX, type Mix } from '@config/mix';
import { midiEvents } from '../midi/adapters';
import type { TimelineEvent } from '../audio/timeline';
import {
  explicitVoicing,
  isValidChord,
  parseChord,
  placeBelow,
  spelled,
  transposeNote,
  transposePc,
  voiceChord,
  type SpelledNote,
} from '../theory';
import {
  NO_CHORD,
  type ChordSpec,
  type Hand,
  type Lesson,
  type NoteSpec,
  type PatternSpec,
  type PatternVoice,
  type VoicingSpec,
} from './types';

/** A chord as it sits on the timeline, with its resolved voicing. */
export interface CompiledChord {
  id: string;
  symbol: string;
  barIndex: number;
  startBeat: number;
  beats: number;
  voicing: SpelledNote[];
  /** Roman numeral, when the content was written in numerals. */
  numeral?: string;
  /** Left-hand bass kept from a slash chord the symbol no longer shows. */
  bass?: string;
  /** The chord as written, when shown simplified. */
  original?: string;
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
  /** Id of the note this one is tied to (it holds on into that note). */
  tiedTo?: string;
  /** Id of the note tied into this one: it is not struck again. */
  tiedFrom?: string;
}

/** A tied chain of written notes as it sounds: one strike, held for the whole chain. */
export interface SoundingSpan {
  first: CompiledNote;
  startBeat: number;
  /** Written length of the whole chain. */
  beats: number;
  /** Written length of its last note, which decides the release (legato). */
  lastBeats: number;
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
  /** Right-hand fills added between chords (see `withFills`), for lighting keys. */
  fills?: { beat: number; dur: number; midis: number[] }[];
}

const EPS = 1e-9;

export function resolveVoicing(symbol: string, spec: VoicingSpec | undefined): SpelledNote[] {
  if (symbol === NO_CHORD) return [];
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
  mix: Mix = MIX,
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
      const base =
        step.velocity ?? (step.accent ? mix.leftHand.accentVelocity : mix.leftHand.velocity);
      for (const { note, lowest } of resolveVoices(step.voices, chord)) {
        out.push({
          id: `${idPrefix}-${n++}`,
          hand: 'lh',
          barIndex: chord.barIndex,
          indexInBar: -1,
          startBeat: at,
          beats: dur,
          note,
          velocity: Math.min(1, lowest ? base * (pattern.rootAccent ?? 1) : base),
        });
      }
    }
  }
  return out;
}

/** Bass notes for patterns: the chord's bass (or root) below the voicing, kept between E1 and E3. */
export function bassNotes(chord: CompiledChord): { root: SpelledNote; fifth: SpelledNote } {
  const info = parseChord(chord.symbol);
  const lowest = chord.voicing[0]?.midi ?? 48;
  let root = placeBelow(chord.bass ?? info.bass ?? info.root, Math.min(lowest - 2, 53));
  if (root.midi < 28) root = transposeNote(root, 12);
  const fifth = placeBelow(transposePc(info.root, '5P'), root.midi + 12);
  return { root, fifth: fifth.midi > root.midi ? fifth : transposeNote(fifth, 12) };
}

function resolveVoices(
  voices: readonly PatternVoice[],
  chord: CompiledChord,
): { note: SpelledNote; lowest: boolean }[] {
  const v = chord.voicing;
  const out: { note: SpelledNote; lowest: boolean }[] = [];
  for (const raw of voices) {
    if (raw === 'all') out.push(...v.map((note, i) => ({ note, lowest: i === 0 })));
    else if (raw === 'root') out.push({ note: bassNotes(chord).root, lowest: true });
    else if (raw === 'fifth') out.push({ note: bassNotes(chord).fifth, lowest: true });
    else {
      const idx = raw < 0 ? v.length + raw : Math.min(raw, v.length - 1);
      out.push({ note: v[Math.max(0, idx)]!, lowest: Math.max(0, idx) === 0 });
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
  ties: Set<string>,
): CompiledNote[] {
  const out: CompiledNote[] = [];
  let t = barStart;
  (notes ?? []).forEach((n, i) => {
    const id = `${hand}-${barIndex}-${i}`;
    if (n.tie && n.note !== 'r') ties.add(id);
    out.push({
      id,
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
 * Link tied notes, in order through the bars: a tie joins a note to the next
 * written note of the same hand when that is the same pitch. Ties to a rest or
 * to another pitch are dropped (`validateLesson` reports them).
 */
function linkTies(notes: CompiledNote[], ties: ReadonlySet<string>): void {
  for (let i = 0; i < notes.length - 1; i++) {
    const a = notes[i]!;
    const b = notes[i + 1]!;
    if (!ties.has(a.id) || !a.note || !b.note || a.note.midi !== b.note.midi) continue;
    a.tiedTo = b.id;
    b.tiedFrom = a.id;
  }
}

/**
 * Notes as they sound: each tied chain becomes one span from its first note.
 * Only ties between notes that are both in `notes` are followed, so a slice of
 * a song (one chord's melody) restrikes a note tied in from before it.
 */
export function soundingSpans(notes: readonly CompiledNote[]): SoundingSpan[] {
  const out: SoundingSpan[] = [];
  let open: SoundingSpan | null = null;
  let lastId = '';
  for (const n of notes) {
    if (!n.note) {
      open = null;
      continue;
    }
    if (open && n.tiedFrom === lastId) {
      open.beats = n.startBeat + n.beats - open.startBeat;
      open.lastBeats = n.beats;
    } else {
      open = { first: n, startBeat: n.startBeat, beats: n.beats, lastBeats: n.beats };
      out.push(open);
    }
    lastId = n.id;
  }
  return out;
}

/** How long a span sounds, in beats, with the melody's legato applied to its last note. */
export function spanDuration(span: SoundingSpan, legato: number): number {
  return span.beats - span.lastBeats * (1 - legato);
}

/**
 * Turn lesson content into bars, chords and a flat transport timeline.
 * Pure: the same lesson and patterns always produce the same output.
 */
export function compileLesson(
  lesson: Lesson,
  patterns: Readonly<Record<string, PatternSpec>> = {},
  opts: { mix?: Mix } = {},
): CompiledLesson {
  const mix = opts.mix ?? MIX;
  const rhLegato = mix.melody.legato;
  const beatsPerBar = lesson.meter.beats;
  const pattern = lesson.lhFigure ?? (lesson.lhPattern ? patterns[lesson.lhPattern] : undefined);
  if (!lesson.lhFigure && lesson.lhPattern && !pattern)
    throw new Error(`Unknown left-hand pattern "${lesson.lhPattern}"`);

  const bars: CompiledBar[] = [];
  const chords: CompiledChord[] = [];
  const ties = new Set<string>();
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
        ...(c.numeral ? { numeral: c.numeral } : {}),
        ...(c.bass ? { bass: c.bass } : {}),
        ...(c.original ? { original: c.original } : {}),
      };
      t += c.beats;
      return compiled;
    });
    const lh = bar.lh
      ? compileNotes(bar.lh, 'lh', barIndex, startBeat, mix.leftHand.velocity, ties)
      : pattern
        ? barChords.flatMap((c) => applyPattern(pattern, c, `lh-${c.id}`, mix))
        : [];
    bars.push({
      index: barIndex,
      startBeat,
      beats: beatsPerBar,
      ...(bar.section ? { section: bar.section } : {}),
      chords: barChords,
      rh: compileNotes(bar.rh, 'rh', barIndex, startBeat, mix.melody.velocity, ties),
      lh,
    });
    chords.push(...barChords);
  });

  const events: TimelineEvent[] = [];
  for (const hand of ['rh', 'lh'] as const) {
    const notes = bars.flatMap((b) => b[hand]);
    linkTies(notes, ties);
    for (const span of soundingSpans(notes)) {
      const n = span.first;
      events.push({
        id: n.id,
        beat: span.startBeat,
        dur: hand === 'rh' ? spanDuration(span, rhLegato) : span.beats,
        midi: n.note!.midi,
        velocity: n.velocity,
        channel: hand,
      });
    }
  }
  events.sort(
    (a, b) => a.beat - b.beat || (a.channel === b.channel ? 0 : a.channel === 'rh' ? -1 : 1),
  );

  return {
    lesson,
    beatsPerBar,
    lengthBeats: bars.length * beatsPerBar,
    bars,
    chords,
    // Display the representative monophonic score, but HEAR every imported MIDI note.
    events: lesson.midi ? midiEvents(lesson.midi) : events,
  };
}

/** Problems that make a lesson wrong to play. Empty when the lesson is valid. */
/** Problems with a left-hand figure (a pattern written into a piece). */
export function figureIssues(f: PatternSpec): string[] {
  const out: string[] = [];
  if (!(f.cycleBeats > 0 && f.cycleBeats <= 64)) out.push('Figure: cycle must be 1 to 64 beats');
  if (f.steps.length < 1 || f.steps.length > 32) out.push('Figure: needs 1 to 32 steps');
  f.steps.forEach((s, i) => {
    const where = `Figure step ${i + 1}`;
    if (!(s.at >= 0 && s.at < f.cycleBeats)) out.push(`${where}: starts outside the cycle`);
    if (s.dur !== 'chord' && !(s.dur > 0 && s.dur <= f.cycleBeats))
      out.push(`${where}: length must be within the cycle, or "chord"`);
    if (s.voices.length === 0) out.push(`${where}: plays nothing`);
    for (const v of s.voices)
      if (!(
        v === 'all' ||
        v === 'root' ||
        v === 'fifth' ||
        (Number.isInteger(v) && Math.abs(v) <= 8)
      ))
        out.push(`${where}: unknown voice "${String(v)}"`);
  });
  return out;
}

export function validateLesson(lesson: Lesson): string[] {
  const issues: string[] = lesson.lhFigure ? figureIssues(lesson.lhFigure) : [];
  const len = lesson.meter.beats;
  const sum = (xs: { beats: number }[]) => xs.reduce((s, x) => s + x.beats, 0);
  lesson.bars.forEach((bar, i) => {
    const where = `Bar ${i + 1}`;
    if (Math.abs(sum(bar.chords) - len) > EPS)
      issues.push(`${where}: chords last ${sum(bar.chords)} beats, not ${len}`);
    for (const c of bar.chords) {
      if (c.symbol !== NO_CHORD && !isValidChord(c.symbol))
        issues.push(`${where}: unknown chord "${c.symbol}"`);
      if (c.bass !== undefined && !/^[A-G](?:##|bb|#|b)?$/.test(c.bass))
        issues.push(`${where}: unknown bass note "${c.bass}"`);
    }
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
  for (const [hand, key] of [
    ['right hand', 'rh'],
    ['left hand', 'lh'],
  ] as const) {
    const notes = lesson.bars.flatMap((bar, i) => (bar[key] ?? []).map((n) => ({ n, bar: i })));
    notes.forEach(({ n, bar }, i) => {
      if (!n.tie) return;
      const where = `Bar ${bar + 1}`;
      const next = notes[i + 1]?.n;
      if (n.note === 'r') issues.push(`${where}: ${hand} has a tie on a rest`);
      else if (!next) issues.push(`${where}: ${hand} tie from "${n.note}" has no note to join`);
      else if (next.note === 'r' || !samePitch(n.note, next.note))
        issues.push(
          `${where}: ${hand} tie from "${n.note}" needs the same note next, not "${next.note}"`,
        );
    });
  }
  return issues;
}

function samePitch(a: string, b: string): boolean {
  try {
    return spelled(a).midi === spelled(b).midi;
  } catch {
    return false;
  }
}
