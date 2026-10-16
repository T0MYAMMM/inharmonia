import { describe, expect, it } from 'vitest';
import { estimateLatency, detectOnsets } from './calibrate';
import { scoreFixture, matchOnsets } from './eval';
import { FIXTURE_SPECS, seeded, synthesize } from './fixtures';
import { hzToMidi, midiToHz, trackPitch } from './frames';
import { detectKey } from './key';
import { PitchyTracker, windowSizeFor } from './pitchyTracker';
import { bestOctaveShift, gridPoints, quantize } from './quantize';
import { segmentNotes } from './segment';
import type { MonoAudio, NoteEvent, TakeTiming } from './types';
import { draftMelody, VoiceTranscriber } from './voice';

const tone = (hz: number, sec: number, sr = 22050, wave: 'sine' | 'saw' = 'sine'): MonoAudio => {
  const samples = new Float32Array(Math.round(sec * sr));
  for (let i = 0; i < samples.length; i++) {
    const ph = (2 * Math.PI * hz * i) / sr;
    samples[i] =
      wave === 'sine'
        ? 0.3 * Math.sin(ph)
        : 0.3 * [1, 2, 3, 4, 5].reduce((s, h) => s + Math.sin(h * ph) / h, 0);
  }
  return { samples, sampleRate: sr };
};

describe('pitch tracking', () => {
  it('finds sine and sawtooth pitches within 20 cents across the voice range', () => {
    for (const midi of [45, 52, 57, 64, 69, 76, 81]) {
      for (const wave of ['sine', 'saw'] as const) {
        const audio = tone(midiToHz(midi), 0.5, 22050, wave);
        const frames = trackPitch(audio, new PitchyTracker(windowSizeFor(22050)));
        const mid = frames.slice(10, -10).filter((f) => f.midi !== null);
        expect(mid.length, `${midi} ${wave}`).toBeGreaterThan(20);
        for (const f of mid) expect(Math.abs(f.midi! - midi) * 100).toBeLessThan(20);
      }
    }
  });

  it('converts between Hz and MIDI', () => {
    expect(hzToMidi(440)).toBe(69);
    expect(midiToHz(60)).toBeCloseTo(261.63, 2);
  });

  it('reports silence as unpitched', () => {
    const frames = trackPitch(
      { samples: new Float32Array(22050), sampleRate: 22050 },
      new PitchyTracker(1024),
    );
    expect(frames.every((f) => f.midi === null && f.rms === 0)).toBe(true);
  });
});

describe('segmentation, on every fixture', () => {
  const transcriber = new VoiceTranscriber();
  for (const spec of FIXTURE_SPECS) {
    it(`${spec.id}: ${spec.about}`, () => {
      const fx = synthesize(spec);
      const notes = transcriber.transcribeFrames(transcriber.frames(fx.audio));
      const matches = matchOnsets(fx.truth, notes, 0.05);
      expect(notes).toHaveLength(fx.truth.length);
      expect(matches).toHaveLength(fx.truth.length);
      for (const m of matches)
        expect(Math.abs(notes[m.d]!.pitch - fx.truth[m.t]!.pitch)).toBeLessThan(0.5);
    });
  }

  it('drops frames that are too short to be notes', () => {
    const frames = Array.from({ length: 40 }, (_, i) => ({
      time: i * 0.01,
      f0: 440,
      midi: i >= 10 && i < 15 ? 69 : null,
      clarity: 0.99,
      rms: 0.2,
      rmsShort: 0.2,
    }));
    expect(segmentNotes(frames)).toEqual([]);
  });
});

describe('key detection', () => {
  const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0];
  const MINOR = [0, 2, 3, 5, 7, 8, 10, 12, 10, 8, 7, 5, 3, 2, 0];
  const tonics = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  it('names the key of a scale with a long tonic, in all 24 keys', () => {
    tonics.forEach((tonic, t) => {
      for (const [mode, steps] of [
        ['major', MAJOR],
        ['minor', MINOR],
      ] as const) {
        const notes = steps.map((s, i) => ({
          midi: 60 + t + s,
          weight: i === 0 || i === steps.length - 1 ? 3 : 1,
        }));
        const best = detectKey(notes)[0]!;
        expect(best.mode, `${tonic} ${mode}`).toBe(mode);
        expect(
          best.tonic === tonic || (mode === 'minor' && ['Db', 'Ab'].includes(tonic)),
          `${tonic} ${mode} → ${best.tonic}`,
        ).toBe(true);
      }
    });
  });
});

describe('quantization', () => {
  const timing: TakeTiming = { tempo: 120, meter: { beats: 4, unit: 4 }, beat0: 1, bars: 2 };
  const C = { tonic: 'C', mode: 'major' as const };
  const ev = (startBeat: number, beats: number, pitch: number, lateSec = 0): NoteEvent => ({
    start: 1 + startBeat * 0.5 + lateSec,
    end: 1 + (startBeat + beats * 0.92) * 0.5 + lateSec,
    pitch,
    confidence: 1,
  });

  it('snaps onsets and ends, closes small breaths, and spells for the key', () => {
    const { notes } = quantize(
      [ev(0, 1, 60.2, 0.03), ev(1, 0.5, 61.9, -0.04), ev(1.5, 0.5, 66), ev(2, 2, 67)],
      timing,
      C,
    );
    expect(notes.map((n) => [n.startBeat, n.beats, n.note.name])).toEqual([
      [0, 1, 'C4'],
      [1, 0.5, 'D4'],
      [1.5, 0.5, 'F#4'],
      [2, 2, 'G4'],
    ]);
  });

  it('flags onsets far from the grid as uncertain', () => {
    const { notes } = quantize([ev(0.22, 1, 60)], timing, C, {
      step: 0.5,
      triplets: false,
      tolerance: 0.35,
    });
    expect(notes[0]).toMatchObject({ startBeat: 0, uncertain: true });
  });

  it('uses triplet positions when asked', () => {
    expect(gridPoints({ step: 0.5, triplets: true })).toEqual([0, 0.333333, 0.5, 0.666667]);
    const evs = [0, 1 / 3, 2 / 3, 1].map((b) => ev(b, 1 / 3, 64));
    const { notes } = quantize(evs, timing, C, { step: 0.5, triplets: true, tolerance: 0.35 });
    expect(notes.map((n) => +n.startBeat.toFixed(3))).toEqual([0, 0.333, 0.667, 1]);
  });

  it('follows a take that slowly gets later', () => {
    // 16 eighth notes, each 12 ms later than the last: 180 ms behind by the end.
    const evs = Array.from({ length: 16 }, (_, i) => ev(i * 0.5, 0.5, 60 + (i % 5), i * 0.012));
    const { notes, drift } = quantize(evs, { ...timing, bars: 3 }, C);
    expect(notes.map((n) => n.startBeat)).toEqual(Array.from({ length: 16 }, (_, i) => i * 0.5));
    expect(drift).toBeGreaterThan(0.2);
  });

  it('keeps one note at a time', () => {
    const { notes } = quantize(
      [
        { start: 1, end: 2, pitch: 60, confidence: 1 },
        { start: 1.5, end: 2, pitch: 64, confidence: 1 },
      ],
      timing,
      C,
    );
    expect(notes.map((n) => [n.startBeat, n.beats])).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it('moves a low melody up into the comfort range', () => {
    expect(bestOctaveShift([43, 47, 50, 55], [60, 84])).toBe(2);
    expect(bestOctaveShift([60, 64, 67], [60, 84])).toBe(0);
    expect(bestOctaveShift([], [60, 84])).toBe(0);
  });
});

describe('draft melody', () => {
  it('lifts a low voice and lines notes up with the grid', () => {
    const fx = synthesize(FIXTURE_SPECS.find((s) => s.id === 'low-voice')!);
    const t = new VoiceTranscriber();
    const draft = draftMelody(t.transcribeFrames(t.frames(fx.audio)), fx.timing);
    expect(draft.octaveShift).toBe(2);
    expect(draft.key).toEqual({ tonic: 'G', mode: 'major' });
    expect(draft.grid.notes.map((n) => n.note.name).slice(0, 4)).toEqual(['G4', 'B4', 'D5', 'G5']);
  });

  it('every fixture scores well end to end', () => {
    for (const spec of FIXTURE_SPECS) {
      const s = scoreFixture(synthesize(spec));
      expect(s.f1, spec.id).toBeGreaterThanOrEqual(0.95);
      expect(s.pitchAccuracy, spec.id).toBeGreaterThanOrEqual(0.95);
      expect(s.gridAccuracy, spec.id).toBeGreaterThanOrEqual(0.9);
      expect(s.keyTop2, spec.id).toBe(true);
    }
  });
});

describe('latency calibration', () => {
  /** Claps 85 ms after each click, ±5 ms, over quiet noise. */
  const claps = (latency: number, jitter: number, sr = 22050) => {
    const rand = seeded(5);
    const clicks = Array.from({ length: 8 }, (_, i) => 0.5 + i * 0.6);
    const samples = new Float32Array(Math.round(6 * sr));
    for (let i = 0; i < samples.length; i++) samples[i] = 0.002 * (rand() * 2 - 1);
    for (const c of clicks) {
      const at = Math.round((c + latency + (rand() * 2 - 1) * jitter) * sr);
      for (let j = 0; j < 400; j++) samples[at + j]! += 0.6 * (rand() * 2 - 1) * Math.exp(-j / 80);
    }
    return { clicks, audio: { samples, sampleRate: sr } };
  };

  it('measures a steady round trip', () => {
    const { clicks, audio } = claps(0.085, 0.005);
    const onsets = detectOnsets(audio);
    expect(onsets).toHaveLength(8);
    const est = estimateLatency(clicks, onsets);
    expect(est.ok).toBe(true);
    expect(est.latencyMs).toBeGreaterThan(78);
    expect(est.latencyMs).toBeLessThan(92);
  });

  it('refuses scattered claps', () => {
    const clicks = Array.from({ length: 8 }, (_, i) => i * 0.6);
    const delays = [0.02, 0.3, 0.1, 0.25, 0.05, 0.35, 0.15, 0];
    const est = estimateLatency(
      clicks,
      clicks.map((c, i) => c + delays[i]!),
    );
    expect(est.matched).toBe(8);
    expect(est.ok).toBe(false);
  });

  it('refuses too few claps', () => {
    expect(estimateLatency([0, 1, 2, 3, 4, 5], [0.08, 1.08]).ok).toBe(false);
  });
});
