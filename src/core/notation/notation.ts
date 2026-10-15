import { Key, Note } from 'tonal';
import {
  chordToRoman,
  normalizeAccidentals,
  spellAt,
  transposePc,
  type Mode,
  type SpelledNote,
} from '../theory';

/**
 * Global label systems:
 * - letter: notes as letters (F♯4), chords as symbols (F♯m7)
 * - roman: notes as letters, chords as Roman numerals (iii7)
 * - angka: notes as Indonesian not angka (numbered notation, do-based), chords as symbols,
 *   the way Indonesian songbooks print them
 */
export type NotationSystem = 'letter' | 'roman' | 'angka';

/** How not angka shows chromatic notes: slash through the digit, or a ♯/♭ suffix. */
export type AccidentalStyle = 'slash' | 'suffix';

export interface KeyContext {
  tonic: string;
  mode: Mode;
}

export interface NoteLabel {
  /** Plain-text rendering, safe anywhere ("F♯4", "3", "4♯"). */
  text: string;
  /** Main glyph: the letter with accidental ("F♯") or the angka digit ("4"). */
  main: string;
  /** Not angka only: chromatic alteration, drawn as a slash overlay or a suffix. */
  alteration: 'raised' | 'lowered' | null;
  /** Letter: scientific octave. Angka: dots, positive above, negative below. */
  octave: number;
  ariaLabel: string;
}

export interface FormatOptions {
  system: NotationSystem;
  accidentalStyle?: AccidentalStyle;
  /** Letter names: include the octave number. Default false. */
  showOctave?: boolean;
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

export function prettyAccidentals(s: string): string {
  return s
    .replace(/##/g, '𝄪')
    .replace(/#/g, '♯')
    .replace(/(?<=[A-G♯])bb/g, '𝄫')
    .replace(/(?<=[A-G])b/g, '♭');
}

/** Chord symbol for display: "F#m7b5" → "F♯m7♭5", "Bb/D" → "B♭/D". */
export function prettyChord(symbol: string): string {
  return normalizeAccidentals(symbol)
    .replace(/([A-G])#/g, '$1♯')
    .replace(/([A-G])b/g, '$1♭')
    .replace(/([^A-G])b(\d)/g, '$1♭$2')
    .replace(/([^A-G])#(\d)/g, '$1♯$2');
}

/** The pitch class sung as "do": the tonic in major, the relative major in minor. */
export function doOf(key: KeyContext): string {
  const tonic = normalizeAccidentals(key.tonic);
  return key.mode === 'minor' ? Key.minorKey(tonic).relativeMajor : tonic;
}

/** The "do" that has no octave dots: the one nearest middle C, ties going up. */
export function undottedDo(key: KeyContext): SpelledNote {
  const pc = doOf(key);
  const c = Note.chroma(pc)!;
  const up = 60 + ((c + 12) % 12);
  const down = up - 12;
  const midi = up - 60 <= 60 - down ? up : down;
  return spellAt(pc, midi);
}

/**
 * Spell a MIDI note in a key. Diatonic notes use the key's spelling; chromatic
 * notes use the usual choices relative to do: ♭2 ♭3 ♯4 ♭6 ♭7 in major, and
 * ♯5 (the raised seventh of the minor) instead of ♭6 in minor.
 */
export function spellInKey(midi: number, key: KeyContext): SpelledNote {
  const doPc = doOf(key);
  const offset = (((midi - Note.chroma(doPc)!) % 12) + 12) % 12;
  const diatonic = MAJOR_STEPS.indexOf(offset);
  let degree: number;
  let alt: number;
  if (diatonic >= 0) {
    degree = diatonic;
    alt = 0;
  } else if (offset === 8 && key.mode === 'minor') {
    degree = 4;
    alt = 1;
  } else if (offset === 6) {
    degree = 3;
    alt = 1;
  } else {
    degree = MAJOR_STEPS.indexOf(offset + 1);
    alt = -1;
  }
  const iv = ['1P', '2M', '3M', '4P', '5P', '6M', '7M'][degree]!;
  let pc = transposePc(doPc, iv);
  if (alt !== 0) pc = transposePc(pc, alt > 0 ? '1A' : '-1A');
  return spellAt(pc, midi);
}

function letterIndex(name: string): { step: number; oct: number; alt: number } {
  const n = Note.get(normalizeAccidentals(name));
  if (n.empty || n.oct === undefined) throw new Error(`Need a note with octave: ${name}`);
  return { step: n.step, oct: n.oct, alt: n.alt };
}

const ACC_WORD = (alt: number) =>
  ({ '-2': ' double flat', '-1': ' flat', '0': '', '1': ' sharp', '2': ' double sharp' })[
    String(alt)
  ] ?? '';

const OCTAVE_WORDS = ['', 'one octave', 'two octaves', 'three octaves'];

export function formatNote(
  note: SpelledNote | number,
  key: KeyContext,
  opts: FormatOptions,
): NoteLabel {
  const spelledNote = typeof note === 'number' ? spellInKey(note, key) : note;
  if (opts.system !== 'angka') {
    const n = letterIndex(spelledNote.name);
    const pc = Note.pitchClass(normalizeAccidentals(spelledNote.name));
    const main = prettyAccidentals(pc);
    const text = opts.showOctave ? `${main}${n.oct}` : main;
    return {
      text,
      main,
      alteration: null,
      octave: n.oct,
      ariaLabel: `${LETTERS[n.step]}${ACC_WORD(n.alt)}${opts.showOctave ? ` ${n.oct}` : ''}`,
    };
  }

  const ref = undottedDo(key);
  const r = letterIndex(ref.name);
  const n = letterIndex(spelledNote.name);
  const steps = n.step + 7 * n.oct - (r.step + 7 * r.oct);
  const degree = ((steps % 7) + 7) % 7;
  const octave = Math.floor(steps / 7);
  const expected = (ref.midi + MAJOR_STEPS[degree]! + 12 * octave) % 12;
  let alt = (((spelledNote.midi % 12) - expected + 18) % 12) - 6;
  alt = Math.max(-1, Math.min(1, alt));
  const digit = String(degree + 1);
  const alteration = alt > 0 ? 'raised' : alt < 0 ? 'lowered' : null;
  const suffix = alt > 0 ? '♯' : alt < 0 ? '♭' : '';
  const octaveWords =
    octave === 0
      ? ''
      : `, ${OCTAVE_WORDS[Math.abs(octave)] ?? `${Math.abs(octave)} octaves`} ${octave > 0 ? 'up' : 'down'}`;
  return {
    text: `${digit}${suffix}`,
    main: digit,
    alteration,
    octave,
    ariaLabel: `${digit}${alteration ? ` ${alteration}` : ''}${octaveWords}`,
  };
}

/** Chord label in the current system. */
export function formatChord(symbol: string, key: KeyContext, system: NotationSystem): string {
  if (system === 'roman') return chordToRoman(symbol, key.tonic, key.mode);
  return prettyChord(symbol);
}

/** Header shown above a not angka score: "do = D". */
export function doHeader(key: KeyContext): string {
  return `do = ${prettyAccidentals(doOf(key))}`;
}

/** "D major", "F♯ minor". */
export function keyName(key: KeyContext): string {
  return `${prettyAccidentals(normalizeAccidentals(key.tonic))} ${key.mode}`;
}
