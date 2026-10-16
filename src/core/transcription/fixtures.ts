import { midiToHz } from './frames';
import type { MonoAudio, NoteEvent, TakeTiming } from './types';

/**
 * Synthesized takes for tests and the evaluation script. Every melody here is
 * a scale, arpeggio or short original figure written for these tests; nothing
 * comes from existing songs.
 */

/** Small seeded PRNG (mulberry32), so fixtures are identical on every run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FixtureNote {
  /** MIDI note number, or null for a rest. */
  midi: number | null;
  /** Length in beats. */
  beats: number;
}

export interface FixtureSpec {
  id: string;
  /** What the fixture exercises, one line. */
  about: string;
  notes: FixtureNote[];
  tempo: number;
  beatsPerBar?: number;
  /** Key the melody is in, for key-detection checks. */
  key: { tonic: string; mode: 'major' | 'minor' };
  wave?: 'sine' | 'saw' | 'voice';
  /** Vibrato depth in semitones (peak) and rate in Hz. */
  vibrato?: { depth: number; rate: number };
  /** Seconds of pitch glide into each note from the previous one. */
  glide?: number;
  /** Noise level relative to the tone, in dB (e.g. -20 = 20 dB below). */
  noiseDb?: number;
  /** Tempo multiplier reached by the end of the take (1.04 = drifts 4% slower). */
  drift?: number;
  /** Random onset jitter, ± seconds. */
  jitter?: number;
  /** Fraction of each note that sounds before a breath (0.85 = slightly detached). */
  articulation?: number;
  /** Seconds of silence before beat 0 (count-in), default one bar. */
  leadIn?: number;
  sampleRate?: number;
  seed?: number;
}

export interface Fixture {
  spec: FixtureSpec;
  audio: MonoAudio;
  timing: TakeTiming;
  /** Where each sung note really starts and ends, after drift and jitter. */
  truth: NoteEvent[];
  /** The intended grid position of each sung note. */
  grid: { startBeat: number; beats: number; midi: number }[];
}

/** Render a fixture: tone with an envelope, optional vibrato, glides, noise and timing drift. */
export function synthesize(spec: FixtureSpec): Fixture {
  const sr = spec.sampleRate ?? 22050;
  const beatsPerBar = spec.beatsPerBar ?? 4;
  const spb = 60 / spec.tempo;
  const leadIn = spec.leadIn ?? beatsPerBar * spb;
  const rand = seeded(spec.seed ?? 1);
  const totalBeats = spec.notes.reduce((s, n) => s + n.beats, 0);
  const drift = spec.drift ?? 1;
  // Beat → seconds with a tempo that slows linearly to `drift` × the period.
  const beatTime = (b: number) => leadIn + spb * (b + ((drift - 1) * b * b) / (2 * totalBeats));

  const truth: NoteEvent[] = [];
  const grid: Fixture['grid'] = [];
  let beat = 0;
  for (const n of spec.notes) {
    if (n.midi !== null) {
      const jitter = spec.jitter ? (rand() * 2 - 1) * spec.jitter : 0;
      const start = beatTime(beat) + jitter;
      const fullEnd = beatTime(beat + n.beats);
      const end = start + (fullEnd - start) * (spec.articulation ?? 0.9);
      truth.push({ start, end, pitch: n.midi, confidence: 1 });
      grid.push({ startBeat: beat, beats: n.beats, midi: n.midi });
    }
    beat += n.beats;
  }
  const duration = beatTime(totalBeats) + 0.5;
  const samples = new Float32Array(Math.ceil(duration * sr));

  const wave = spec.wave ?? 'sine';
  const harmonics =
    wave === 'sine'
      ? [1]
      : wave === 'saw'
        ? [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6]
        : [1, 0.6, 0.35, 0.15, 0.08];
  const attack = 0.02;
  const release = 0.03;
  let phase = 0;
  truth.forEach((t, i) => {
    const prev = truth[i - 1];
    const glideFrom = spec.glide && prev && t.start - prev.end < 0.05 ? prev.pitch : null;
    const next = truth[i + 1];
    // Legato: the release stops where the next note takes over, as a voice would.
    const releaseEnd = next && next.start < t.end + release ? next.start : t.end + release;
    const from = Math.floor(t.start * sr);
    const to = Math.min(samples.length, Math.ceil(releaseEnd * sr));
    for (let s = from; s < to; s++) {
      const time = s / sr;
      const local = time - t.start;
      let midi = t.pitch;
      if (glideFrom !== null && local < spec.glide!)
        midi = glideFrom + (t.pitch - glideFrom) * (local / spec.glide!);
      if (spec.vibrato && local > 0.15)
        midi += spec.vibrato.depth * Math.sin(2 * Math.PI * spec.vibrato.rate * local);
      phase += (2 * Math.PI * midiToHz(midi)) / sr;
      let v = 0;
      harmonics.forEach((a, h) => (v += a * Math.sin((h + 1) * phase)));
      const env =
        local < attack
          ? local / attack
          : time > t.end
            ? Math.max(0, 1 - (time - t.end) / release)
            : 1;
      samples[s]! += 0.3 * env * v;
    }
  });
  if (spec.noiseDb !== undefined) {
    const amp = 0.3 * 10 ** (spec.noiseDb / 20);
    for (let s = 0; s < samples.length; s++) samples[s]! += amp * (rand() * 2 - 1) * Math.SQRT2;
  }
  return {
    spec,
    audio: { samples, sampleRate: sr },
    timing: {
      tempo: spec.tempo,
      meter: { beats: beatsPerBar, unit: 4 },
      beat0: leadIn,
      bars: Math.ceil(totalBeats / beatsPerBar),
    },
    truth,
    grid,
  };
}

const q = (midi: number | null, beats = 1): FixtureNote => ({ midi, beats });
const run = (midis: (number | null)[], beats = 1) => midis.map((m) => q(m, beats));

/** The evaluation set. */
export const FIXTURE_SPECS: readonly FixtureSpec[] = [
  {
    id: 'c-major-scale-sine',
    about: 'A C major scale up and down in quarters, pure sine.',
    tempo: 100,
    key: { tonic: 'C', mode: 'major' },
    notes: run([60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60, null]),
  },
  {
    id: 'g-major-arpeggio-saw',
    about: 'G major arpeggios in eighths, bright sawtooth.',
    tempo: 92,
    wave: 'saw',
    key: { tonic: 'G', mode: 'major' },
    notes: [
      ...run([67, 71, 74, 79, 74, 71, 67, 62], 0.5),
      ...run([66, 69, 74, 72], 1),
      ...run([71, null], 2),
    ],
  },
  {
    id: 'vibrato',
    about: 'Long notes with a 5.5 Hz vibrato of ±0.4 semitone.',
    tempo: 80,
    wave: 'voice',
    vibrato: { depth: 0.4, rate: 5.5 },
    key: { tonic: 'F', mode: 'major' },
    notes: [q(65, 2), q(69, 2), q(72, 2), q(70, 1), q(69, 1), q(67, 2), q(65, 2), q(null, 4)],
  },
  {
    id: 'glides',
    about: 'Legato line with 80 ms slides between notes.',
    tempo: 88,
    wave: 'voice',
    glide: 0.08,
    articulation: 1,
    key: { tonic: 'D', mode: 'major' },
    notes: [...run([62, 66, 69, 71, 69, 66, 64, 62]), q(null, 4)],
  },
  {
    id: 'repeated-notes',
    about: 'The same pitch sung four times in a row, split only by the breath between.',
    tempo: 96,
    wave: 'voice',
    articulation: 0.8,
    key: { tonic: 'A', mode: 'minor' },
    notes: [...run([69, 69, 69, 69, 72, 72, 71, 71]), ...run([69, 69], 2)],
  },
  {
    id: 'rests',
    about: 'Phrases separated by rests of a beat and a half.',
    tempo: 104,
    wave: 'voice',
    key: { tonic: 'E', mode: 'minor' },
    notes: [
      q(64),
      q(67),
      q(71, 1.5),
      q(null, 1.5),
      q(69),
      q(67),
      q(66, 2),
      q(null, 2),
      q(64, 2),
      q(null, 2),
    ],
  },
  {
    id: 'noisy',
    about: 'A plain tune with noise 18 dB below the voice.',
    tempo: 90,
    wave: 'voice',
    noiseDb: -18,
    key: { tonic: 'Bb', mode: 'major' },
    notes: [...run([70, 72, 74, 75, 77, 75, 74, 72, 70]), q(null, 3)],
  },
  {
    id: 'drift',
    about: 'Gets 5% slower across the take, with ±25 ms onset jitter.',
    tempo: 100,
    wave: 'voice',
    drift: 1.05,
    jitter: 0.025,
    seed: 7,
    key: { tonic: 'C', mode: 'major' },
    notes: [...run([64, 65, 67, 72, 71, 67, 69, 65, 64, 62, 60, 62, 64, 67, 64, 60]), q(null, 4)],
  },
  {
    id: 'low-voice',
    about: 'A low tune, G2 to D4, which should move up an octave or two for the piano.',
    tempo: 84,
    wave: 'voice',
    key: { tonic: 'G', mode: 'major' },
    notes: [...run([43, 47, 50, 55, 54, 52, 50, 47]), q(43, 2), q(null, 2)],
  },
  {
    id: 'triplet-feel',
    about: 'A slow 12/8-style line in 4/4 with triplet eighths.',
    tempo: 66,
    wave: 'voice',
    key: { tonic: 'Eb', mode: 'major' },
    notes: [
      ...run([63, 65, 67, 70, 67, 65], 1 / 3),
      q(63, 2),
      ...run([68, 67, 65, 63, 65, 67], 1 / 3),
      q(70, 2),
      q(null, 4),
    ],
  },
  {
    id: 'sixteenths',
    about: 'Quick sixteenth-note turns at 76 bpm.',
    tempo: 76,
    wave: 'saw',
    articulation: 0.85,
    key: { tonic: 'D', mode: 'minor' },
    notes: [
      ...run([62, 64, 65, 64, 62, 61, 62, 64], 0.25),
      q(65, 1),
      q(69, 1),
      ...run([67, 65, 64, 65], 0.25),
      q(62, 2),
      q(null, 2),
    ],
  },
  {
    id: 'repeated-legato',
    about: 'Repeated pitches with almost no gap: only the loudness dip separates them.',
    tempo: 100,
    wave: 'voice',
    articulation: 0.97,
    key: { tonic: 'F', mode: 'major' },
    notes: [...run([65, 65, 65, 67, 69, 69, 69, 70]), q(72, 2), q(null, 2)],
  },
  {
    id: 'wide-vibrato',
    about: 'A wide, slow vibrato of ±0.8 semitone at 4.5 Hz on long notes.',
    tempo: 72,
    wave: 'voice',
    vibrato: { depth: 0.8, rate: 4.5 },
    key: { tonic: 'A', mode: 'major' },
    notes: [q(69, 2), q(73, 2), q(76, 3), q(74, 1), q(73, 2), q(71, 2), q(69, 4)],
  },
  {
    id: 'very-noisy',
    about: 'Noise only 10 dB below the voice.',
    tempo: 90,
    wave: 'voice',
    noiseDb: -10,
    seed: 3,
    key: { tonic: 'G', mode: 'major' },
    notes: [...run([67, 69, 71, 72, 74, 72, 71, 69, 67]), q(null, 3)],
  },
  {
    id: 'slow-glides',
    about: 'Slides of 150 ms into every note.',
    tempo: 76,
    wave: 'voice',
    glide: 0.15,
    articulation: 1,
    key: { tonic: 'C', mode: 'minor' },
    notes: [...run([60, 63, 67, 68, 67, 65, 63, 62]), q(60, 2), q(null, 2)],
  },
  {
    id: 'loose-timing',
    about: '8% slower by the end, with ±40 ms jitter.',
    tempo: 96,
    wave: 'voice',
    drift: 1.08,
    jitter: 0.04,
    seed: 11,
    key: { tonic: 'E', mode: 'major' },
    notes: [
      ...run([64, 66, 68, 71, 73, 71, 68, 66], 0.5),
      ...run([64, 68, 71, 76, 75, 71, 68, 64]),
      q(66, 2),
      q(64, 2),
      q(null, 4),
    ],
  },
];
