import { describe, expect, it } from 'vitest';
import { PROGRESSIONS } from '@/content/progressions';
import {
  checkNumeral,
  MAX_BARS,
  parseProgressionText,
  progressionIssues,
  progressionToText,
} from './progressionText';

describe('parseProgressionText', () => {
  it('reads one bar per word, with commas splitting a bar', () => {
    const out = parseProgressionText('I | vi\nii7, V7  ♭VII', 'major');
    expect(out.issues).toEqual([]);
    expect(out.bars).toEqual([['I'], ['vi'], ['ii7', 'V7'], ['bVII']]);
    expect(out.steps).toEqual([
      { numeral: 'I', beats: 4 },
      { numeral: 'vi', beats: 4 },
      { numeral: 'ii7', beats: 2 },
      { numeral: 'V7', beats: 2 },
      { numeral: 'bVII', beats: 4 },
    ]);
  });

  it('splits a bar into four', () => {
    const out = parseProgressionText('I,vi,ii,V', 'major');
    expect(out.issues).toEqual([]);
    expect(out.steps.map((s) => s.beats)).toEqual([1, 1, 1, 1]);
  });

  it('names the bar of each problem', () => {
    const out = parseProgressionText('I vix ii,V,I IV,', 'major');
    expect(out.issues.map((i) => i.bar)).toEqual([2, 3, 4]);
    expect(out.issues[0]!.message).toMatch(/Bar 2: "vix" isn't a numeral/);
    expect(out.issues[1]!.message).toMatch(/split a bar into 2 or 4/);
    expect(out.issues[2]!.message).toMatch(/empty slot/);
  });

  it('asks for at least one chord and caps the length', () => {
    expect(parseProgressionText('  | ', 'major').issues[0]!.message).toMatch(/at least one/);
    const long = parseProgressionText(
      Array(MAX_BARS + 1)
        .fill('I')
        .join(' '),
      'major',
    );
    expect(long.issues[0]!.message).toMatch(/limit is 32/);
    expect(long.bars).toHaveLength(MAX_BARS);
  });

  it('accepts the usual numeral spellings', () => {
    for (const n of ['vii°', 'viio', 'iiø7', 'Imaj7', 'V7/V', 'V7sus4', '#iv°', 'bIII+', 'IVadd9'])
      expect(checkNumeral(n, 'major')).toBeNull();
    for (const n of ['i', 'iv7', 'bVI', 'bVII', 'V7', 'iiø7'])
      expect(checkNumeral(n, 'minor')).toBeNull();
    expect(checkNumeral('Q', 'major')).not.toBeNull();
    expect(checkNumeral('Ixyz', 'major')).not.toBeNull();
  });
});

describe('progressionToText', () => {
  it('round-trips every built-in progression', () => {
    for (const p of PROGRESSIONS) {
      const back = parseProgressionText(progressionToText(p.steps), p.mode);
      expect(back.issues, p.id).toEqual([]);
      expect(back.steps, p.id).toEqual(p.steps);
    }
  });
});

describe('progressionIssues', () => {
  const good = {
    id: 'mine-x',
    name: 'Mine',
    mode: 'major',
    meter: { beats: 4, unit: 4 },
    steps: [{ numeral: 'I', beats: 4 }],
  };

  it('passes a well-formed progression', () => {
    expect(progressionIssues(good)).toEqual([]);
  });

  it('rejects malformed ones', () => {
    expect(progressionIssues(null)).toEqual(['Not a progression.']);
    expect(progressionIssues({ ...good, name: ' ' })).toContain('Missing name.');
    expect(progressionIssues({ ...good, mode: 'dorian' })).toContain(
      'Mode should be major or minor.',
    );
    expect(progressionIssues({ ...good, meter: { beats: 3, unit: 4 } })).toContain(
      'Meter should be 4/4.',
    );
    expect(progressionIssues({ ...good, steps: [] })).toContain('No chords.');
    expect(progressionIssues({ ...good, steps: [{ numeral: 'I', beats: 3 }] })[0]).toMatch(
      /1, 2 or 4/,
    );
    expect(progressionIssues({ ...good, steps: [{ numeral: '<b>', beats: 4 }] })[0]).toMatch(
      /Bar 1/,
    );
    // Uneven bars: 2 + 4 beats can't fill a bar.
    expect(
      progressionIssues({
        ...good,
        steps: [
          { numeral: 'I', beats: 2 },
          { numeral: 'V', beats: 4 },
          { numeral: 'I', beats: 2 },
        ],
      })[0],
    ).toMatch(/filled evenly/);
  });
});
