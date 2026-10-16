import { validateLesson } from '../content/compile';
import { MAJOR_KEYS, MINOR_KEYS } from '../content/realize';
import type { Lesson } from '../content/types';
import { isValidChord } from '../theory';
import { MIN_NOTE_BEATS, toLesson, type SongDraft } from './draft';

export const USER_SONG_VERSION = 1;
export const EXPORT_FORMAT = 'inharmonia-songs';
export const EXPORT_VERSION = 1;
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

export interface SongExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  songs: UserSong[];
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

export function buildExport(songs: readonly UserSong[], now: Date): SongExport {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    songs: [...songs],
  };
}

export interface ParsedImport {
  songs: UserSong[];
  /** Songs left out, with why. */
  skipped: { title: string; reason: string }[];
}

/**
 * Read an export file. Only drafts are trusted, after checking; each lesson is
 * rebuilt from its draft and must validate, and every song is marked as yours.
 */
export function parseExport(
  text: string,
  patterns: ReadonlySet<string>,
  fallbackPattern: string,
): ParsedImport | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'This file is not an Inharmonia export.' };
  }
  if (!isObj(data) || data.format !== EXPORT_FORMAT || !Array.isArray(data.songs))
    return { error: 'This file is not an Inharmonia export.' };
  if (typeof data.version !== 'number' || data.version > EXPORT_VERSION)
    return {
      error: 'This export comes from a newer version of Inharmonia. Update, then try again.',
    };
  const out: ParsedImport = { songs: [], skipped: [] };
  for (const raw of data.songs as unknown[]) {
    const title =
      isObj(raw) && isObj(raw.draft) && typeof raw.draft.title === 'string'
        ? raw.draft.title
        : 'A song';
    if (!isObj(raw) || typeof raw.id !== 'string' || !/^user-[a-z0-9-]{1,40}$/.test(raw.id)) {
      out.skipped.push({ title, reason: 'no id' });
      continue;
    }
    const draft = cleanDraft(raw.draft, patterns, fallbackPattern);
    if (typeof draft === 'string') {
      out.skipped.push({ title, reason: draft });
      continue;
    }
    const lesson = toLesson(draft, raw.id);
    const issues = validateLesson(lesson);
    if (issues.length) {
      out.skipped.push({ title, reason: issues[0]! });
      continue;
    }
    const createdAt = isNum(raw.createdAt, 0, 1e15) ? raw.createdAt : Date.now();
    const updatedAt = isNum(raw.updatedAt, 0, 1e15) ? raw.updatedAt : createdAt;
    out.songs.push({ id: raw.id, version: USER_SONG_VERSION, createdAt, updatedAt, draft, lesson });
  }
  return out;
}
