import { describe, expect, it } from 'vitest';
import { ChordDrill, inversionName, NATURAL_ROOTS } from './chordDrill';

/** Deterministic RNG cycling through values. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('ChordDrill', () => {
  it('asks for a chord from the chosen qualities and roots', () => {
    const d = new ChordDrill({
      qualityIds: ['major'],
      roots: ['C'],
      inversions: false,
      strictness: 'pitch-class',
    });
    expect(d.current.symbol).toBe('C');
    expect(d.describe()).toEqual({ chord: 'C major', inversion: null, lowest: null });
  });

  it('names inversions and, in exact mode, the lowest note', () => {
    const d = new ChordDrill({
      qualityIds: ['maj7'],
      roots: ['Eb'],
      inversions: true,
      strictness: 'exact',
      rng: seq(0, 0, 0.6), // root 0, quality 0, inversion floor(0.6 * 4) = 2
    });
    expect(d.current.inversion).toBe(2);
    expect(d.describe()).toEqual({
      chord: 'E♭ major 7th',
      inversion: 'second inversion',
      lowest: d.current.voicing[0]!.name,
    });
    expect(d.current.voicing[0]!.name.startsWith('Bb')).toBe(true);
    expect(inversionName(0)).toBe('root position');
  });

  it('counts wrong presses, records clean answers and timing', () => {
    const d = new ChordDrill(
      {
        qualityIds: ['major', 'minor'],
        roots: NATURAL_ROOTS,
        inversions: false,
        strictness: 'pitch-class',
        roundLength: 2,
      },
      1000,
    );
    const first = d.current;
    const wrong = [...Array(12).keys()]
      .map((c) => 60 + c)
      .find((m) => !first.target.chromas.includes(m % 12))!;
    expect(d.press(wrong)).toBe(true);
    expect(d.press(first.target.midis[0]!)).toBe(false);
    const r = d.check(first.target.midis, 2500);
    expect(r.status).toBe('match');
    expect(r.result).toMatchObject({ clean: false, misses: 1, timeMs: 1500 });
    expect(d.current).not.toBe(first);
    d.skip(3000);
    expect(d.done).toBe(true);
    expect(d.summary()).toEqual({
      total: 2,
      clean: 0,
      skipped: 1,
      misses: 1,
      accuracy: 0,
      averageMs: 1500,
    });
    d.restart(4000);
    expect(d.results).toHaveLength(0);
  });

  it('does not repeat the same prompt twice in a row', () => {
    const d = new ChordDrill({
      qualityIds: ['major', 'minor'],
      roots: ['C', 'D'],
      inversions: false,
      strictness: 'pitch-class',
      rng: seq(0, 0, 0, 0, 0.9, 0.9),
    });
    const a = d.current.symbol;
    d.accept(100);
    expect(d.current.symbol).not.toBe(a);
  });

  it('keeps voicings playable and every quality in range', () => {
    const d = new ChordDrill({
      qualityIds: ['13', '11', 'maj9'],
      roots: ['B'],
      inversions: true,
      strictness: 'pitch-class',
      roundLength: 50,
    });
    for (let i = 0; i < 40; i++) {
      const v = d.current.voicing.map((n) => n.midi);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(48);
      expect(Math.max(...v)).toBeLessThanOrEqual(96);
      d.accept(i);
    }
  });

  it('rejects empty settings', () => {
    expect(
      () =>
        new ChordDrill({ qualityIds: [], roots: ['C'], inversions: false, strictness: 'exact' }),
    ).toThrow();
  });
});
