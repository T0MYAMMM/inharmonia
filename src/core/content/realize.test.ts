import { describe, expect, it } from 'vitest';
import { PATTERNS, PATTERN_LIST, WALTZ, STRIDE, BLOCK } from '@/content/patterns';
import { PROGRESSIONS, getProgression } from '@/content/progressions';
import { movementCost } from '../theory';
import { bassNotes, compileLesson, validateLesson } from './compile';
import { MAJOR_KEYS, MINOR_KEYS, PROGRESSION_RANGE, realizeProgression } from './realize';

const opts = { key: 'C', style: 'close' as const, voiceLeading: false, pattern: BLOCK };

describe('realizeProgression', () => {
  it('turns numerals into chords in the key', () => {
    const l = realizeProgression(getProgression('i-v-vi-iv')!, { ...opts, key: 'D' });
    expect(l.bars.map((b) => b.chords.map((c) => c.symbol))).toEqual([['D'], ['A'], ['Bm'], ['G']]);
    expect(l.bars[2]!.chords[0]!.numeral).toBe('vi');
    expect(l.key).toEqual({ tonic: 'D', mode: 'major' });
  });

  it('handles minor progressions against the tonic', () => {
    const l = realizeProgression(getProgression('minor-descent')!, { ...opts, key: 'A' });
    expect(l.bars.map((b) => b.chords[0]!.symbol)).toEqual(['Am', 'G', 'F', 'E7']);
  });

  it('splits a shared bar 2 + 2', () => {
    const l = realizeProgression(getProgression('ballad-turnaround')!, opts);
    const shared = l.bars.find((b) => b.chords.length === 2)!;
    expect(shared.chords.map((c) => [c.symbol, c.beats])).toEqual([
      ['G7sus4', 2],
      ['G7', 2],
    ]);
  });

  it('voice-leads smoothly within range when asked', () => {
    const p = getProgression('circle-of-fifths')!;
    const plain = compileLesson(realizeProgression(p, opts), PATTERNS);
    const led = compileLesson(realizeProgression(p, { ...opts, voiceLeading: true }), PATTERNS);
    const total = (c: typeof plain) =>
      c.chords.slice(1).reduce(
        (s, ch, i) =>
          s +
          movementCost(
            c.chords[i]!.voicing.map((n) => n.midi),
            ch.voicing.map((n) => n.midi),
          ),
        0,
      );
    expect(total(led)).toBeLessThan(total(plain));
    for (const ch of led.chords) {
      for (const n of ch.voicing) {
        expect(n.midi).toBeGreaterThanOrEqual(PROGRESSION_RANGE[0]);
        expect(n.midi).toBeLessThanOrEqual(PROGRESSION_RANGE[1]);
      }
    }
  });

  it('a waltz pattern makes 3/4 bars', () => {
    const l = realizeProgression(getProgression('ii-v-i')!, { ...opts, pattern: WALTZ });
    expect(l.meter.beats).toBe(3);
    expect(l.bars.every((b) => b.chords.reduce((s, c) => s + c.beats, 0) === 3)).toBe(true);
    expect(validateLesson(l)).toEqual([]);
  });

  // Every progression × 12 keys × every pattern: real work that grows with the content, so
  // it gets more than the default 5 s when the whole suite runs in parallel.
  it(
    'every progression realizes and compiles in every key with every pattern',
    { timeout: 30_000 },
    () => {
      for (const p of PROGRESSIONS) {
        const keys = p.mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
        for (const key of keys) {
          for (const pattern of PATTERN_LIST) {
            const l = realizeProgression(p, { key, style: 'close', voiceLeading: true, pattern });
            expect(validateLesson(l), `${p.id} in ${key} with ${pattern.id}`).toEqual([]);
            const c = compileLesson(l, PATTERNS);
            expect(c.events.length).toBeGreaterThan(0);
            // One assertion per lesson: an expect per event is most of this test's time.
            const bad = c.events.filter(
              (e) => e.midi < 28 || e.beat + e.dur > c.lengthBeats + 1e-9,
            );
            expect(bad, `${p.id} in ${key} with ${pattern.id}`).toEqual([]);
          }
        }
      }
    },
  );
});

describe('pattern bass notes', () => {
  it('put the root and fifth below the voicing', () => {
    const c = compileLesson(
      realizeProgression(getProgression('ii-v-i')!, { ...opts, pattern: STRIDE }),
      PATTERNS,
    );
    const dm7 = c.chords[0]!;
    const { root, fifth } = bassNotes(dm7);
    expect(root.name.startsWith('D')).toBe(true);
    expect(fifth.name.startsWith('A')).toBe(true);
    expect(root.midi).toBeLessThan(dm7.voicing[0]!.midi);
    expect(fifth.midi).toBeGreaterThan(root.midi);
    // Stride: bass, chord, bass, chord.
    const bar1 = c.events
      .filter((e) => e.beat < 4)
      .sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    expect(bar1.filter((e) => e.beat === 0).map((e) => e.midi)).toEqual([root.midi]);
    expect(bar1.filter((e) => e.beat === 1).map((e) => e.midi)).toEqual(
      dm7.voicing.map((n) => n.midi),
    );
    expect(bar1.filter((e) => e.beat === 2).map((e) => e.midi)).toEqual([fifth.midi]);
  });

  it('slash chords use the slash bass', () => {
    const chord = {
      id: 'x',
      symbol: 'A/C#',
      barIndex: 0,
      startBeat: 0,
      beats: 4,
      voicing: [] as never[],
    };
    expect(
      bassNotes({ ...chord, voicing: [{ name: 'A3', midi: 57 }] } as never).root.name.startsWith(
        'C#',
      ),
    ).toBe(true);
  });
});
