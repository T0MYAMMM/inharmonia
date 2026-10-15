import { romanToChord, voiceChord, voiceLeadProgression, type VoicingStyle } from '../theory';
import {
  DEFAULT_RULES,
  LESSON_SCHEMA_VERSION,
  type Bar,
  type ChordSpec,
  type Lesson,
  type PatternSpec,
  type Progression,
} from './types';

export const MAJOR_KEYS = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;
export const MINOR_KEYS = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'Bb',
  'B',
] as const;

export interface RealizeOptions {
  /** Tonic, e.g. "Eb". The progression's mode decides major or minor. */
  key: string;
  style: VoicingStyle;
  /** Pick each voicing nearest the last one instead of root position every time. */
  voiceLeading: boolean;
  pattern: PatternSpec;
  /** Play the progression this many times. Default 1. */
  repeats?: number;
  tempo?: number;
}

/** Lowest and highest notes voicings may use: around middle C, playable by either hand. */
export const PROGRESSION_RANGE: [number, number] = [48, 70];

/**
 * Turn a key-free progression into a playable lesson: numerals become chords in
 * the key, chords get voicings (voice-led or root position), and the pattern
 * decides the meter (a waltz pattern makes each 4/4 bar a 3/4 bar).
 */
export function realizeProgression(p: Progression, opts: RealizeOptions): Lesson {
  const beatsPerBar = opts.pattern.beatsPerBar ?? 4;
  const scale = beatsPerBar / p.meter.beats;
  const steps = Array.from({ length: opts.repeats ?? 1 }, () => p.steps).flat();
  const symbols = steps.map((s) => romanToChord(s.numeral, opts.key, p.mode));
  const voicings = opts.voiceLeading
    ? voiceLeadProgression(symbols, {
        style: opts.style,
        range: PROGRESSION_RANGE,
        start: voiceChord(symbols[0]!, { style: opts.style, floor: 'C3' }).map((n) => n.midi),
      })
    : symbols.map((s) => voiceChord(s, { style: opts.style, floor: 'C3' }));

  const bars: Bar[] = [];
  let current: ChordSpec[] = [];
  let filled = 0;
  steps.forEach((s, i) => {
    const beats = s.beats * scale;
    current.push({
      symbol: symbols[i]!,
      beats,
      numeral: s.numeral,
      voicing: { notes: voicings[i]!.map((n) => n.name) },
    });
    filled += beats;
    if (filled >= beatsPerBar - 1e-9) {
      bars.push({ chords: current });
      current = [];
      filled = 0;
    }
  });
  if (current.length) bars.push({ chords: current });

  return {
    id: `progression-${p.id}`,
    schemaVersion: LESSON_SCHEMA_VERSION,
    title: p.name,
    ...(p.description ? { summary: p.description } : {}),
    kind: 'progression',
    source: p.source,
    key: { tonic: opts.key, mode: p.mode },
    meter: { beats: beatsPerBar, unit: 4 },
    tempo: { default: opts.tempo ?? 84, min: 40, max: 160 },
    lhPattern: opts.pattern.id,
    rules: { ...DEFAULT_RULES, hands: ['lh'] },
    bars,
    ...(p.tags ? { tags: p.tags } : {}),
  };
}
