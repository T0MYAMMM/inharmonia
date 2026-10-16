import { describe, expect, it } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { SENJA_DI_TERAS } from '@/content/songs/senjaDiTeras';
import { compileLesson } from '../content/compile';
import { TIES_LESSON } from '../content/tieFixture';
import { barAt, chordAt, rhNoteAt } from './songView';
import { WaitSession } from './waitSession';

const senja = compileLesson(SENJA_DI_TERAS, PATTERNS);

describe('song view lookups', () => {
  it('finds the bar, chord and melody note at a beat', () => {
    expect(barAt(senja, 0)).toBe(0);
    expect(barAt(senja, 13.9)).toBe(3);
    expect(chordAt(senja, 12)!.symbol).toBe('A7sus4');
    expect(chordAt(senja, 14)!.symbol).toBe('A7');
    expect(rhNoteAt(senja, 1.2)!.note!.name).toBe('F#4');
    expect(rhNoteAt(senja, 64)).toBeNull();
    expect(rhNoteAt(senja, -1)).toBeNull();
  });
});

describe('WaitSession on Senja di Teras', () => {
  const midiOf = (s: WaitSession) => {
    const t = s.target!;
    if (t.kind !== 'note') throw new Error('expected a note target');
    return t.note.note!.midi;
  };
  const noteName = (s: WaitSession) => {
    const t = s.target!;
    return t.kind === 'note' ? t.note.note!.name : null;
  };

  it('starts on the first melody note and counts hits and misses', () => {
    const s = new WaitSession(senja);
    expect(noteName(s)).toBe('A4');
    const miss = s.press(60);
    expect(miss.kind).toBe('miss');
    expect(s.index).toBe(0);
    expect(s.misses).toBe(1);
    const hit = s.press(midiOf(s));
    expect(hit).toMatchObject({ kind: 'hit' });
    expect(s.hits).toBe(1);
    expect(noteName(s)).toBe('F#4');
  });

  it('rolls a chord only when the target starts a new chord segment', () => {
    const s = new WaitSession(senja);
    const rolls: (string | null)[] = [];
    // Bars 1-4: Dmaj7 | Bm7 | Em7 | A7sus4 A7
    while (s.target && s.target.barIndex < 4) {
      const r = s.press(midiOf(s));
      if (r.kind === 'hit') rolls.push(r.roll?.symbol ?? null);
    }
    expect(rolls.filter(Boolean)).toEqual(['Dmaj7', 'Bm7', 'Em7', 'A7sus4', 'A7']);
    // The first note of each bar rolls; bar 4's E4 at beat 14 rolls A7 mid-bar.
    expect(rolls[0]).toBe('Dmaj7');
    expect(rolls[1]).toBeNull();
  });

  it('finishes with the counts and resets to the start', () => {
    const s = new WaitSession(senja);
    s.press(1); // one miss
    let last;
    while (s.target) {
      last = s.press(midiOf(s));
      if (last.kind === 'hit' && last.finished) break;
    }
    expect(last).toMatchObject({ kind: 'hit', finished: { hits: s.targets.length, misses: 1 } });
    expect(s.index).toBe(0);
    expect(s.hits).toBe(0);
    expect(s.misses).toBe(0);
  });

  it('jumps to a bar without resetting counts', () => {
    const s = new WaitSession(senja);
    s.press(1);
    s.goToBar(8);
    expect(s.target!.barIndex).toBe(8);
    expect(noteName(s)).toBe('D5');
    expect(s.misses).toBe(1);
    s.goToBeat(13.5);
    expect(s.target!.barIndex).toBe(3);
    expect(s.target!.startBeat).toBe(12);
  });
});

describe('WaitSession, left hand', () => {
  it('targets each chord segment and recognises it from held notes', () => {
    const s = new WaitSession(senja, 'lh');
    expect(s.targets.map((t) => t.kind)).toEqual(Array(senja.chords.length).fill('chord'));
    // Dmaj7 (D F# A C#): build it one note at a time, in any octave.
    expect(s.press(50, [50])).toMatchObject({ kind: 'progress', missing: 3 });
    expect(s.press(54, [50, 54])).toMatchObject({ kind: 'progress', missing: 2 });
    expect(s.press(57, [50, 54, 57])).toMatchObject({ kind: 'progress', missing: 1 });
    const hit = s.press(73, [50, 54, 57, 73]);
    expect(hit).toMatchObject({ kind: 'hit', segment: { symbol: 'Dmaj7' }, roll: null });
    expect(s.target).toMatchObject({ kind: 'chord', chord: { symbol: 'Bm7' } });
  });

  it('counts a non-chord tone as a miss', () => {
    const s = new WaitSession(senja, 'lh');
    expect(s.press(51, [51]).kind).toBe('miss'); // D# is not in Dmaj7
    expect(s.misses).toBe(1);
  });

  it('respects inversion strictness (A/C# needs C# in the bass)', () => {
    const s = new WaitSession(senja, 'lh', 'inversion');
    s.goToBar(13);
    expect(s.target).toMatchObject({ chord: { symbol: 'A/C#' } });
    expect(s.press(64, [57, 61, 64]).kind).toBe('progress'); // A in the bass
    expect(s.press(64, [49, 57, 64]).kind).toBe('hit');
  });
});

describe('WaitSession, both hands', () => {
  it('needs the chord held with the melody note when a new chord starts', () => {
    const s = new WaitSession(senja, 'both');
    // A4 over Dmaj7: the melody note alone is not enough.
    expect(s.press(69, [69])).toMatchObject({ kind: 'progress' });
    expect(s.misses).toBe(0);
    // Chord tones are fine to add (left hand).
    expect(s.press(50, [50, 69]).kind).toBe('progress');
    expect(s.press(54, [50, 54, 69]).kind).toBe('progress');
    expect(s.press(61, [50, 54, 61, 69]).kind).toBe('hit');
    // F#4 on the same chord: the melody note alone is enough.
    expect(s.press(66, [50, 54, 61, 66]).kind).toBe('hit');
  });

  it('a note in neither hand is a miss', () => {
    const s = new WaitSession(senja, 'both');
    expect(s.press(63, [63]).kind).toBe('miss');
  });
});

describe('WaitSession with ties', () => {
  const ties = compileLesson(TIES_LESSON);
  const names = (s: WaitSession) =>
    s.targets.map((t) => (t.kind === 'note' ? t.note.note!.name : t.chord.symbol));

  it('skips the held half of a tie, across the barline and into a chord change', () => {
    expect(names(new WaitSession(ties))).toEqual(['C4', 'E4', 'G4', 'A4', 'B4', 'C5']);
  });

  it('rolls the chord that starts under a tied note with the next note played', () => {
    const s = new WaitSession(ties);
    const rolls: (string | null)[] = [];
    while (s.target) {
      const t = s.target;
      if (t.kind !== 'note') break;
      const r = s.press(t.note.note!.midi);
      if (r.kind !== 'hit') break;
      rolls.push(r.roll?.symbol ?? null);
      if (r.finished) break;
    }
    // G4 is held over the change to F; A4 is held over the change to G.
    expect(rolls).toEqual(['C', null, null, 'F', 'G', 'C']);
  });

  it('asks for the new chord with the next note in both hands', () => {
    const s = new WaitSession(ties, 'both');
    expect(
      s.targets.map((t) => (t.kind === 'note' ? [t.note.note!.name, t.needsChord] : null)),
    ).toEqual([
      ['C4', true],
      ['E4', false],
      ['G4', false],
      ['A4', true],
      ['B4', true],
      ['C5', true],
    ]);
  });

  it('still asks for every chord in left-hand practice', () => {
    expect(names(new WaitSession(ties, 'lh'))).toEqual(['C', 'F', 'G', 'C']);
  });
});
