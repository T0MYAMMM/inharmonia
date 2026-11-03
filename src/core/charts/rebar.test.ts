import { describe, expect, it } from 'vitest';
import { LIMITS, NO_CHORD, rebar, type ChartBar, type TimedChord } from '.';

const t = (symbol: string, beats: number): TimedChord => ({ symbol, beats });
/** Bars as `C:4 | G:2 D:2` for short expectations. */
const show = (bars: ChartBar[]) =>
  bars.map((b) => b.chords.map((c) => `${c.symbol}:${c.beats}`).join(' ')).join(' | ');

describe('rebar', () => {
  it('puts a whole-bar chord in each bar (4+4)', () => {
    expect(show(rebar([t('C', 4), t('G', 4)], 4))).toBe('C:4 | G:4');
  });

  it('shares a bar between two chords (2+2)', () => {
    expect(show(rebar([t('C', 2), t('G', 2)], 4))).toBe('C:2 G:2');
  });

  it('keeps an uneven split (3+1)', () => {
    expect(show(rebar([t('Am', 3), t('E7', 1), t('Am', 4)], 4))).toBe('Am:3 E7:1 | Am:4');
  });

  it('splits a 6-beat chord across the barline in 4/4, writing it again', () => {
    expect(show(rebar([t('F', 6), t('G', 2)], 4))).toBe('F:4 | F:2 G:2');
    expect(show(rebar([t('C', 2), t('F', 6)], 4))).toBe('C:2 F:2 | F:4');
  });

  it('packs 3/4', () => {
    expect(show(rebar([t('C', 3), t('G', 2), t('G7', 1), t('C', 3)], 3))).toBe(
      'C:3 | G:2 G7:1 | C:3',
    );
    expect(show(rebar([t('D', 4), t('A', 2)], 3))).toBe('D:3 | D:1 A:2');
    expect(show(rebar([t('D', 1), t('E', 1), t('F', 1)], 3))).toBe('D:1 E:1 F:1');
  });

  it('fills a short last bar by lengthening its last chord', () => {
    expect(show(rebar([t('C', 4), t('G', 1)], 4))).toBe('C:4 | G:4');
    expect(show(rebar([t('C', 4), t('F', 1), t('G', 1)], 4))).toBe('C:4 | F:1 G:3');
    expect(show(rebar([t('C', 5)], 3))).toBe('C:3 | C:3');
  });

  it('keeps N.C. as a chord of its own', () => {
    expect(show(rebar([t(NO_CHORD, 2), t('C', 6)], 4))).toBe('N.C.:2 C:2 | C:4');
  });

  it('keeps symbols exactly and in order', () => {
    const chords = [t('Ebadd11', 3), t('B7sus2', 3), t('C/E', 2), t('G7(b9)', 4)];
    const bars = rebar(chords, 4);
    const symbols = bars.flatMap((b) => b.chords.map((c) => c.symbol));
    expect([...new Set(symbols)]).toEqual(['Ebadd11', 'B7sus2', 'C/E', 'G7(b9)']);
  });

  it('makes every bar add up, within the chords a bar may hold', () => {
    const chords = [1, 1, 1, 1, 1, 7, 2, 1, 3, 1].map((b, i) => t(`C${i}`, b));
    for (const per of [3, 4]) {
      for (const bar of rebar(chords, per)) {
        expect(bar.chords.reduce((s, c) => s + c.beats, 0)).toBe(per);
        expect(bar.chords.length).toBeLessThanOrEqual(Math.min(per, LIMITS.chordsPerBar));
      }
    }
  });

  it('reads beats as whole beats of at least 1', () => {
    expect(show(rebar([t('C', 0), t('G', 2.6), t('F', Number.NaN)], 4))).toBe('C:1 G:3 | F:4');
  });

  it('has no bars for no chords', () => {
    expect(rebar([], 4)).toEqual([]);
  });
});
