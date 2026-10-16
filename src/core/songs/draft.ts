import type { Lesson, Meter } from '../content/types';
import { spellInKey } from '../notation';
import type { Mode } from '../theory';
import { draftLesson } from '../transcription/draftLesson';
import type { HarmonyChord } from '../transcription/harmonize';
import type { ChordSegment } from '../transcription/interfaces';

/** A melody note in the editor: beats from bar 1, beat 1. */
export interface DraftNote {
  id: string;
  startBeat: number;
  beats: number;
  midi: number;
}

/** A chord in the editor's chord lane. */
export interface DraftChord {
  startBeat: number;
  beats: number;
  symbol: string;
  numeral?: string;
}

/**
 * The editable form of a user song: what the editor changes and what is saved.
 * The playable lesson is always rebuilt from it (`toLesson`).
 */
export interface SongDraft {
  title: string;
  key: { tonic: string; mode: Mode };
  tempo: number;
  meter: Meter;
  bars: number;
  /** One note at a time, sorted by start. */
  notes: DraftNote[];
  /** Cover every beat, sorted; each stays within one bar. */
  chords: DraftChord[];
  lhPattern: string;
  /** Ranked alternatives per harmony segment, from the harmonizer. */
  alternatives?: ChordSegment[];
}

export const MIN_NOTE_BEATS = 0.25;
const EPS = 1e-6;

export const lengthBeats = (d: Pick<SongDraft, 'bars' | 'meter'>) => d.bars * d.meter.beats;

export function fromHarmonization(input: {
  title: string;
  notes: readonly { startBeat: number; beats: number; midi: number }[];
  key: SongDraft['key'];
  tempo: number;
  meter: Meter;
  bars: number;
  chords: readonly HarmonyChord[];
  alternatives?: ChordSegment[];
  lhPattern: string;
}): SongDraft {
  return {
    title: input.title,
    key: input.key,
    tempo: input.tempo,
    meter: input.meter,
    bars: input.bars,
    notes: input.notes.map((n, i) => ({
      id: `n${i + 1}`,
      startBeat: n.startBeat,
      beats: n.beats,
      midi: n.midi,
    })),
    chords: input.chords.map((c) => ({
      startBeat: c.startBeat,
      beats: c.beats,
      symbol: c.symbol,
      numeral: c.numeral,
    })),
    lhPattern: input.lhPattern,
    ...(input.alternatives ? { alternatives: input.alternatives } : {}),
  };
}

/** The playable song for a draft: notes spelled in the key, tied over barlines. */
export function toLesson(d: SongDraft, id: string): Lesson {
  return draftLesson({
    id,
    title: d.title.trim() || 'Untitled',
    notes: d.notes.map((n) => ({
      startBeat: n.startBeat,
      beats: n.beats,
      midi: n.midi,
      note: spellInKey(n.midi, d.key),
      uncertain: false,
    })),
    timing: { tempo: d.tempo, meter: d.meter, bars: d.bars },
    key: d.key,
    chords: d.chords.map((c) => ({ ...c, numeral: c.numeral ?? '', why: '' })),
    lhPattern: d.lhPattern,
  });
}

function nextId(notes: readonly DraftNote[]): string {
  let max = 0;
  for (const n of notes) {
    const k = Number(n.id.slice(1));
    if (Number.isFinite(k)) max = Math.max(max, k);
  }
  return `n${max + 1}`;
}

/**
 * Keep the melody one note at a time within the song, giving way to `keep`:
 * notes it covers are removed, and notes it overlaps are trimmed.
 */
function settle(d: SongDraft, notes: DraftNote[], keepId: string | null): SongDraft {
  const end = lengthBeats(d);
  const keep = keepId ? notes.find((n) => n.id === keepId) : undefined;
  const out: DraftNote[] = [];
  for (const raw of notes) {
    let n = { ...raw };
    n.startBeat = Math.max(0, n.startBeat);
    n.beats = Math.min(n.beats, end - n.startBeat);
    if (keep && n.id !== keep.id) {
      const kEnd = keep.startBeat + keep.beats;
      const nEnd = n.startBeat + n.beats;
      if (n.startBeat < keep.startBeat - EPS && nEnd > keep.startBeat + EPS)
        n = { ...n, beats: keep.startBeat - n.startBeat };
      else if (n.startBeat >= keep.startBeat - EPS && n.startBeat < kEnd - EPS)
        n = nEnd > kEnd + EPS ? { ...n, startBeat: kEnd, beats: nEnd - kEnd } : { ...n, beats: 0 };
    }
    if (n.beats >= MIN_NOTE_BEATS / 2 - EPS && n.startBeat < end - EPS) out.push(n);
  }
  out.sort((a, b) => a.startBeat - b.startBeat);
  // Anything still overlapping (from older data) is trimmed to the next start.
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i]!;
    const b = out[i + 1]!;
    if (a.startBeat + a.beats > b.startBeat + EPS) a.beats = Math.max(0, b.startBeat - a.startBeat);
  }
  return { ...d, notes: out.filter((n) => n.beats > EPS) };
}

const clampMidi = (m: number) => Math.max(21, Math.min(108, Math.round(m)));

/** Change one note (start, length or pitch); its neighbours make room. */
export function updateNote(
  d: SongDraft,
  id: string,
  patch: Partial<Omit<DraftNote, 'id'>>,
): SongDraft {
  const end = lengthBeats(d);
  const notes = d.notes.map((n) => {
    if (n.id !== id) return n;
    const beats = Math.max(MIN_NOTE_BEATS, patch.beats ?? n.beats);
    const startBeat = Math.max(0, Math.min(end - MIN_NOTE_BEATS, patch.startBeat ?? n.startBeat));
    return { id, startBeat, beats, midi: clampMidi(patch.midi ?? n.midi) };
  });
  return settle(d, notes, id);
}

export function moveNote(d: SongDraft, id: string, dBeats: number): SongDraft {
  const n = d.notes.find((x) => x.id === id);
  return n ? updateNote(d, id, { startBeat: n.startBeat + dBeats }) : d;
}

export function transposeNote(d: SongDraft, id: string, semitones: number): SongDraft {
  const n = d.notes.find((x) => x.id === id);
  return n ? updateNote(d, id, { midi: n.midi + semitones }) : d;
}

export function resizeNote(d: SongDraft, id: string, dBeats: number): SongDraft {
  const n = d.notes.find((x) => x.id === id);
  return n ? updateNote(d, id, { beats: n.beats + dBeats }) : d;
}

export function deleteNote(d: SongDraft, id: string): SongDraft {
  return { ...d, notes: d.notes.filter((n) => n.id !== id) };
}

/** Add a note; it wins over whatever it overlaps. Returns the draft and the new id. */
export function addNote(
  d: SongDraft,
  note: Omit<DraftNote, 'id'>,
): { draft: SongDraft; id: string } {
  const id = nextId(d.notes);
  const n: DraftNote = {
    id,
    startBeat: Math.max(0, Math.min(lengthBeats(d) - MIN_NOTE_BEATS, note.startBeat)),
    beats: Math.max(MIN_NOTE_BEATS, note.beats),
    midi: clampMidi(note.midi),
  };
  return { draft: settle(d, [...d.notes, n], id), id };
}

/** Change the chord at `index` in the chord lane. */
export function setChord(d: SongDraft, index: number, symbol: string, numeral?: string): SongDraft {
  return {
    ...d,
    chords: d.chords.map((c, i) => {
      if (i !== index) return c;
      const { numeral: _old, ...rest } = c;
      return { ...rest, symbol, ...(numeral ? { numeral } : {}) };
    }),
  };
}

/** Move the whole melody by semitones (an octave is 12). */
export function transposeMelody(d: SongDraft, semitones: number): SongDraft {
  return { ...d, notes: d.notes.map((n) => ({ ...n, midi: clampMidi(n.midi + semitones) })) };
}

/** Undo history for any value. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

const HISTORY_LIMIT = 100;

export const historyOf = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export function commit<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past.at(-1);
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}
