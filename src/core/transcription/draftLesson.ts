import {
  DEFAULT_RULES,
  LESSON_SCHEMA_VERSION,
  type Bar,
  type Lesson,
  type NoteSpec,
} from '../content/types';
import { voiceChord, voiceLeadProgression, type Mode } from '../theory';
import type { HarmonyChord } from './harmonize';
import type { GridNote, TakeTiming } from './types';

/** Left-hand voicings sit below middle C, clear of the melody. */
export const DRAFT_LH_RANGE: [number, number] = [40, 59];

export interface DraftLessonInput {
  id: string;
  title: string;
  notes: readonly GridNote[];
  timing: Pick<TakeTiming, 'tempo' | 'meter' | 'bars'>;
  key: { tonic: string; mode: Mode };
  chords: readonly HarmonyChord[];
  /** Left-hand pattern id (see content/patterns). */
  lhPattern: string;
}

const EPS = 1e-6;

/**
 * Write a melody into bars: rests fill the gaps, and a note that crosses a
 * barline is split there and tied, so every bar adds up to the meter.
 */
export function melodyBars(
  notes: readonly Pick<GridNote, 'startBeat' | 'beats' | 'note'>[],
  beatsPerBar: number,
  bars: number,
): NoteSpec[][] {
  const out: NoteSpec[][] = Array.from({ length: bars }, () => []);
  const end = beatsPerBar * bars;
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  let t = 0;
  const push = (bar: number, spec: NoteSpec) => out[bar]!.push(spec);
  const rest = (from: number, to: number) => {
    let at = from;
    while (to - at > EPS) {
      const bar = Math.floor(at / beatsPerBar + EPS);
      const stop = Math.min(to, (bar + 1) * beatsPerBar);
      push(bar, { note: 'r', beats: stop - at });
      at = stop;
    }
  };
  for (const n of sorted) {
    const start = Math.max(n.startBeat, t);
    const stop = Math.min(n.startBeat + n.beats, end);
    if (stop - start <= EPS) continue;
    rest(t, start);
    let at = start;
    while (stop - at > EPS) {
      const bar = Math.floor(at / beatsPerBar + EPS);
      const barEnd = (bar + 1) * beatsPerBar;
      const piece = Math.min(stop, barEnd);
      push(bar, {
        note: n.note.name,
        beats: piece - at,
        ...(stop - piece > EPS ? { tie: true } : {}),
      });
      at = piece;
    }
    t = stop;
  }
  rest(t, end);
  return out;
}

/**
 * A draft song from a take: the melody on the grid, the chosen chords with
 * smoothly led left-hand voicings, and a left-hand pattern. It is private to
 * the browser (`source: user`).
 */
export function draftLesson(input: DraftLessonInput): Lesson {
  const bpb = input.timing.meter.beats;
  const melody = melodyBars(input.notes, bpb, input.timing.bars);
  const symbols = input.chords.map((c) => c.symbol);
  const voicings = symbols.length
    ? voiceLeadProgression(symbols, {
        style: 'close',
        range: DRAFT_LH_RANGE,
        start: voiceChord(symbols[0]!, { style: 'close', floor: 'G2' }).map((n) => n.midi),
      })
    : [];
  const bars: Bar[] = melody.map((rh) => ({ chords: [], rh }));
  input.chords.forEach((c, i) => {
    const bar = bars[Math.floor(c.startBeat / bpb + EPS)];
    bar?.chords.push({
      symbol: c.symbol,
      beats: c.beats,
      numeral: c.numeral,
      voicing: { notes: voicings[i]!.map((n) => n.name) },
    });
  });
  const tempo = input.timing.tempo;
  return {
    id: input.id,
    schemaVersion: LESSON_SCHEMA_VERSION,
    title: input.title,
    kind: 'song',
    source: { kind: 'user' },
    key: input.key,
    meter: { beats: bpb, unit: input.timing.meter.unit },
    tempo: { default: tempo, min: Math.min(40, tempo), max: Math.max(160, tempo) },
    lhPattern: input.lhPattern,
    rules: DEFAULT_RULES,
    bars,
  };
}
