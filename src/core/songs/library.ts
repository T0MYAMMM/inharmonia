import { MAJOR_KEYS, MINOR_KEYS } from '../content/realize';
import type { Lesson } from '../content/types';
import { isValidChord } from '../theory';
import { MIN_NOTE_BEATS, toLesson, type SongDraft } from './draft';

export const USER_SONG_VERSION = 1;
export const MAX_BARS = 32;
export const MAX_TITLE = 80;

/** A song you made, as stored on this device. Private: never uploaded or shared. */
export interface UserSong {
  id: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  draft: SongDraft;
  /** Rebuilt from the draft on every save and import. */
  lesson: Lesson;
}

/** A kept recording of a song's take, with its pitch trace for the editor. */
export interface UserRecording {
  songId: string;
  sampleRate: number;
  /** Mono, 16-bit, starting at the take's first sample. */
  samples: Int16Array;
  /** Seconds into the recording where beat 0 falls. */
  beat0: number;
  /** Pitch trace: fractional MIDI every `traceHop` seconds from `traceStart`, NaN when unvoiced. */
  trace: Float32Array;
  traceStart: number;
  traceHop: number;
  /** Semitones the melody was moved from the sung pitch (octaves for the piano). */
  traceShift: number;
}

export function recordingBytes(r: Pick<UserRecording, 'samples' | 'trace'>): number {
  return r.samples.byteLength + r.trace.byteLength;
}

/** A new song record for a draft. */
export function makeUserSong(id: string, draft: SongDraft, now: number): UserSong {
  return {
    id,
    version: USER_SONG_VERSION,
    createdAt: now,
    updatedAt: now,
    draft,
    lesson: toLesson(draft, id),
  };
}

export function updateUserSong(song: UserSong, draft: SongDraft, now: number): UserSong {
  return { ...song, updatedAt: now, draft, lesson: toLesson(draft, song.id) };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isNum = (x: unknown, lo: number, hi: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;

/**
 * Check a draft from outside (an imported file) and return a clean copy, or
 * the reason it was rejected. Unknown left-hand patterns fall back to `fallbackPattern`.
 */
export function cleanDraft(
  raw: unknown,
  patterns: ReadonlySet<string>,
  fallbackPattern: string,
): SongDraft | string {
  if (!isObj(raw)) return 'not a song';
  const { title, key, tempo, meter, bars, notes, chords, lhPattern } = raw;
  if (typeof title !== 'string') return 'no title';
  if (!isObj(key) || (key.mode !== 'major' && key.mode !== 'minor')) return 'no key';
  const tonics: readonly string[] = key.mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
  if (typeof key.tonic !== 'string' || !tonics.includes(key.tonic)) return 'unknown key';
  if (!isNum(tempo, 30, 240)) return 'tempo out of range';
  if (!isObj(meter) || ![2, 3, 4].includes(meter.beats as number) || meter.unit !== 4)
    return 'unsupported meter';
  if (!isNum(bars, 1, MAX_BARS) || !Number.isInteger(bars)) return 'too many bars';
  const length = bars * (meter.beats as number);
  if (!Array.isArray(notes) || notes.length > 2000) return 'bad notes';
  const cleanNotes = [];
  for (const [i, n] of notes.entries()) {
    if (
      !isObj(n) ||
      !isNum(n.startBeat, 0, length - MIN_NOTE_BEATS / 2) ||
      !isNum(n.beats, MIN_NOTE_BEATS / 2, length) ||
      !isNum(n.midi, 21, 108)
    )
      return `bad note ${i + 1}`;
    cleanNotes.push({
      id: typeof n.id === 'string' && /^n\d+$/.test(n.id) ? n.id : `n${i + 1}`,
      startBeat: n.startBeat,
      beats: n.beats,
      midi: Math.round(n.midi),
    });
  }
  if (!Array.isArray(chords) || chords.length === 0 || chords.length > MAX_BARS * 4)
    return 'bad chords';
  const cleanChords = [];
  for (const [i, c] of chords.entries()) {
    if (
      !isObj(c) ||
      typeof c.symbol !== 'string' ||
      !isValidChord(c.symbol) ||
      !isNum(c.startBeat, 0, length) ||
      !isNum(c.beats, 0.5, length)
    )
      return `bad chord ${i + 1}`;
    cleanChords.push({
      startBeat: c.startBeat,
      beats: c.beats,
      symbol: c.symbol,
      ...(typeof c.numeral === 'string' ? { numeral: c.numeral } : {}),
    });
  }
  return {
    title: title.slice(0, MAX_TITLE),
    key: { tonic: key.tonic, mode: key.mode },
    tempo,
    meter: { beats: meter.beats as number, unit: 4 },
    bars,
    notes: cleanNotes,
    chords: cleanChords,
    lhPattern:
      typeof lhPattern === 'string' && patterns.has(lhPattern) ? lhPattern : fallbackPattern,
  };
}
