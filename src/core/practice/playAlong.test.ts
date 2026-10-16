import { describe, expect, it } from 'vitest';
import { BLOCK, PATTERNS } from '@/content/patterns';
import { getProgression } from '@/content/progressions';
import { compileLesson } from '../content/compile';
import { realizeProgression } from '../content/realize';
import { PlayAlongScorer } from './playAlong';

// ii7 V7 Imaj7 Imaj7 in C, one chord per bar (4 beats), at 60 bpm: 1 beat = 1000 ms.
const c = compileLesson(
  realizeProgression(getProgression('ii-v-i')!, {
    key: 'C',
    style: 'close',
    voiceLeading: false,
    pattern: BLOCK,
  }),
  PATTERNS,
);
const DM7 = [50, 53, 57, 60];
const G7 = [55, 59, 62, 65];
const CMAJ7 = [48, 52, 55, 59];

function play(s: PlayAlongScorer, midis: number[], beat: number) {
  for (const m of midis) s.noteOn(m, beat);
  return s.update(midis, beat, 60);
}

describe('PlayAlongScorer', () => {
  it('scores on time, late and early against the change', () => {
    const s = new PlayAlongScorer(c.chords, { hitWindowMs: 150 });
    expect(play(s, DM7, 0.1)).toEqual([{ chordId: 'chord-0-0', timing: 'on-time', offsetMs: 100 }]);
    expect(play(s, G7, 4.4)).toEqual([{ chordId: 'chord-1-0', timing: 'late', offsetMs: 400 }]);
    expect(play(s, CMAJ7, 7.7)).toEqual([
      { chordId: 'chord-2-0', timing: 'early', offsetMs: -300 },
    ]);
  });

  it('a chord held over into the same chord counts as on time', () => {
    const s = new PlayAlongScorer(c.chords);
    play(s, DM7, 0);
    play(s, G7, 4);
    play(s, CMAJ7, 8);
    // Bar 4 is Imaj7 again; keep holding.
    expect(s.update(CMAJ7, 12.2, 60)).toEqual([
      { chordId: 'chord-3-0', timing: 'on-time', offsetMs: null },
    ]);
    expect(s.summary()).toMatchObject({ total: 4, onTime: 4, missed: 0, accuracy: 1 });
  });

  it('marks a chord missed once its bar has passed', () => {
    const s = new PlayAlongScorer(c.chords);
    s.update([], 3.9, 60);
    expect(s.update([], 4.0, 60)).toEqual([
      { chordId: 'chord-0-0', timing: 'missed', offsetMs: null },
    ]);
    expect(s.summary()).toMatchObject({ missed: 4, accuracy: 0 }); // unscored ones count as missed
  });

  it('counts notes in neither the current nor the next chord as wrong', () => {
    const s = new PlayAlongScorer(c.chords);
    expect(s.noteOn(61, 1)).toBe(true); // C# is in neither Dm7 nor G7
    expect(s.noteOn(59, 3.8)).toBe(false); // B: in G7, played just before the change
    expect(s.wrongNotes).toBe(1);
  });

  it('does not score a later chord before the current one', () => {
    const s = new PlayAlongScorer(c.chords);
    // Playing G7 during bar 1 does not skip ahead.
    expect(play(s, G7, 1)).toEqual([]);
    expect(s.score('chord-1-0')).toBeUndefined();
  });
});
