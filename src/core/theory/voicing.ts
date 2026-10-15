import { Interval } from 'tonal';
import { bassToneIndex, parseChord, type ChordInfo } from './chord';
import {
  chroma,
  noteToMidi,
  placeAtOrAbove,
  placeBelow,
  sortByPitch,
  spelled,
  transposeNote,
  transposePc,
  type SpelledNote,
} from './pitch';

export type VoicingStyle = 'close' | 'open' | 'drop2' | 'shell' | 'rootless';

export const VOICING_STYLES: readonly { id: VoicingStyle; name: string }[] = [
  { id: 'close', name: 'Close' },
  { id: 'open', name: 'Open' },
  { id: 'drop2', name: 'Drop 2' },
  { id: 'shell', name: 'Shell' },
  { id: 'rootless', name: 'Rootless' },
];

export interface VoiceOptions {
  style?: VoicingStyle;
  /** 0 = root position; n = the n-th voicing tone in the bass. Wraps around. */
  inversion?: number;
  /** The lowest note is placed at or above this note. Default "C3". */
  floor?: string | number;
}

/**
 * The tones a voicing style uses, as pitch classes in stacking order (root position).
 * - close, open, drop2: all chord tones
 * - shell: root, 3rd (or sus tone), 7th (or 6th); triads fall back to all tones
 * - rootless: chord tones without the root; seventh chords gain a 9th if missing
 */
export function voicingTones(info: ChordInfo, style: VoicingStyle): string[] {
  const iv = info.intervals;
  const byIv = (pred: (i: string) => boolean) =>
    iv.flatMap((i, idx) => (pred(i) ? [info.tones[idx]!] : []));
  const seventh = iv.find((i) => /^7/.test(i) || i === '6M');
  if (style === 'shell') {
    if (!seventh) return [...info.tones];
    const third = iv.find((i) => /^3/.test(i)) ?? iv.find((i) => i === '4P' || i === '2M');
    return [info.root, ...byIv((i) => i === third), ...byIv((i) => i === seventh)];
  }
  if (style === 'rootless') {
    if (info.tones.length < 4) return [...info.tones];
    const rest = info.tones.slice(1);
    const hasNinth = iv.some((i) => /^9/.test(i) || /^2/.test(i));
    const isDim7 = iv.includes('7d');
    if (seventh && !hasNinth && !isDim7) rest.push(transposePc(info.root, '2M'));
    // Rootless voicings are stacked with ninths folded into the octave.
    return rest;
  }
  return [...info.tones];
}

function stackAscending(pcs: string[], floorMidi: number): SpelledNote[] {
  const out: SpelledNote[] = [];
  let min = floorMidi;
  for (const pc of pcs) {
    const n = placeAtOrAbove(pc, min);
    out.push(n);
    min = n.midi + 1;
  }
  return out;
}

function rotate<T>(arr: T[], n: number): T[] {
  if (arr.length === 0) return arr;
  const k = ((n % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

function floorMidiOf(floor: VoiceOptions['floor']): number {
  if (floor === undefined) return noteToMidi('C3');
  return typeof floor === 'number' ? floor : noteToMidi(floor);
}

/** Number of distinct inversions for a chord in a style. */
export function inversionCount(symbol: string, style: VoicingStyle = 'close'): number {
  return voicingTones(parseChord(symbol), style).length;
}

/**
 * Voice a chord symbol as concrete notes, lowest first.
 * Slash chords put the bass at the bottom: as an inversion when the bass is a
 * chord tone, or as an added bass note below the voicing when it is not.
 */
export function voiceChord(symbol: string, opts: VoiceOptions = {}): SpelledNote[] {
  const info = parseChord(symbol);
  const style = opts.style ?? 'close';
  const floor = floorMidiOf(opts.floor);
  const tones = voicingTones(info, style);
  const bassIdx = bassToneIndex(info);

  let inversion = opts.inversion ?? 0;
  if (bassIdx !== null && bassIdx >= 0 && opts.inversion === undefined) {
    const idx = tones.findIndex((t) => chroma(t) === chroma(info.tones[bassIdx]!));
    if (idx >= 0) inversion = idx;
  }

  let notes = stackAscending(rotate(tones, inversion), floor);

  if (style === 'open' && notes.length >= 3) {
    notes = sortByPitch(notes.map((n, i) => (i === 1 ? transposeNote(n, 12) : n)));
  } else if (style === 'drop2' && notes.length >= 3) {
    const k = notes.length - 2;
    notes = notes.map((n, i) => (i === k ? transposeNote(n, -12) : n));
    // Keep the voicing above the floor: lift everything if the dropped note fell below it.
    if (Math.min(...notes.map((n) => n.midi)) < floor)
      notes = notes.map((n) => transposeNote(n, 12));
    notes = sortByPitch(notes);
  }

  if (info.bass && (bassIdx === -1 || !tones.some((t) => chroma(t) === chroma(info.bass!)))) {
    const lowest = notes[0]!.midi;
    notes = [placeBelow(info.bass, lowest), ...notes];
  }
  return notes;
}

/** Parse an explicit voicing such as "A1 E2 A2 C#3" into spelled notes, lowest first. */
export function explicitVoicing(names: string | readonly string[]): SpelledNote[] {
  const list = typeof names === 'string' ? names.trim().split(/\s+/) : names;
  return sortByPitch(list.map(spelled));
}

/** Semitone distance of an interval name, handy for tests and pattern code. */
export function semitones(interval: string): number {
  return Interval.semitones(interval) ?? 0;
}
