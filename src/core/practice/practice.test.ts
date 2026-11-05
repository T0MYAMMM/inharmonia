import { describe, expect, it } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { getSong } from '@/content/lessons';
import { compileLesson } from '../content/compile';
import { TIES_LESSON } from '../content/tieFixture';
import { barAt, chordAt, rhNoteAt } from './songView';
import { WaitSession } from './waitSession';

// Ode to Joy, Medium: D major, 24 bars of 4/4, a chord change within most bars.
const ode = compileLesson(getSong('ode-to-joy-medium')!, PATTERNS);
// Advanced keeps the written slash chords, for the inversion check.
const odeAdvanced = compileLesson(getSong('ode-to-joy-advanced')!, PATTERNS);

describe('song view lookups', () => {
  it('finds the bar, chord and melody note at a beat', () => {
    expect(barAt(ode, 0)).toBe(0);
    expect(barAt(ode, 13.9)).toBe(3);
    expect(chordAt(ode, 12)!.symbol).toBe('D');
    expect(chordAt(ode, 13)!.symbol).toBe('A');
    expect(rhNoteAt(ode, 2.5)!.note!.name).toBe('G4');
    expect(rhNoteAt(ode, 96)).toBeNull();
    expect(rhNoteAt(ode, -1)).toBeNull();
  });
});

describe('WaitSession on Ode to Joy', () => {
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
    const s = new WaitSession(ode);
    expect(noteName(s)).toBe('F#4');
    const miss = s.press(60);
    expect(miss.kind).toBe('miss');
    expect(s.index).toBe(0);
    expect(s.misses).toBe(1);
    const hit = s.press(midiOf(s));
    expect(hit).toMatchObject({ kind: 'hit' });
    expect(s.hits).toBe(1);
    expect(noteName(s)).toBe('G4');
  });

  it('rolls a chord only when the target starts a new chord segment', () => {
    const s = new WaitSession(ode);
    const rolls: (string | null)[] = [];
    // Bars 1-2: D D | G D Em, with a melody note on every chord but bar 1's second D.
    while (s.target && s.target.barIndex < 2) {
      const r = s.press(midiOf(s));
      if (r.kind === 'hit') rolls.push(r.roll?.symbol ?? null);
    }
    // F#4 G4 A4 | A4 G4 F#4 E4: bar 1's G4 starts the second D, then bar 2 changes twice.
    expect(rolls).toEqual(['D', 'D', null, 'G', null, 'D', 'Em']);
  });

  it('finishes with the counts and resets to the start', () => {
    const s = new WaitSession(ode);
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
    const s = new WaitSession(ode);
    s.press(1);
    s.goToBar(8);
    expect(s.target!.barIndex).toBe(8);
    expect(noteName(s)).toBe('E4');
    expect(s.misses).toBe(1);
    s.goToBeat(13.5);
    expect(s.target!.barIndex).toBe(3);
    expect(s.target!.startBeat).toBe(12);
  });
});

describe('WaitSession, left hand', () => {
  it('targets each chord segment and recognises it from held notes', () => {
    const s = new WaitSession(ode, 'lh');
    expect(s.targets.map((t) => t.kind)).toEqual(Array(ode.chords.length).fill('chord'));
    s.goToBar(1);
    // G (G B D): build it one note at a time, in any octave.
    expect(s.press(55, [55])).toMatchObject({ kind: 'progress', missing: 2, need: 'chord' });
    expect(s.press(59, [55, 59])).toMatchObject({ kind: 'progress', missing: 1, need: 'chord' });
    const hit = s.press(74, [55, 59, 74]);
    expect(hit).toMatchObject({ kind: 'hit', segment: { symbol: 'G' }, roll: null });
    expect(s.target).toMatchObject({ kind: 'chord', chord: { symbol: 'D' } });
  });

  it('counts a non-chord tone as a miss', () => {
    const s = new WaitSession(ode, 'lh');
    expect(s.press(51, [51]).kind).toBe('miss'); // D# is not in D
    expect(s.misses).toBe(1);
  });

  it('respects inversion strictness (A/C# needs C# in the bass)', () => {
    const s = new WaitSession(odeAdvanced, 'lh', 'inversion');
    s.goToBar(9);
    expect(s.target).toMatchObject({ chord: { symbol: 'A/C#' } });
    expect(s.press(64, [57, 61, 64]).kind).toBe('progress'); // A in the bass
    expect(s.press(64, [49, 57, 64]).kind).toBe('hit');
  });
});

describe('WaitSession, both hands', () => {
  it('needs the chord held with the melody note when a new chord starts', () => {
    const s = new WaitSession(ode, 'both');
    // F#4 over D: the melody note alone is not enough.
    expect(s.press(66, [66])).toMatchObject({ kind: 'progress', missing: 2, need: 'chord' });
    expect(s.misses).toBe(0);
    // Chord tones are fine to add (left hand).
    expect(s.press(50, [50, 66])).toMatchObject({ kind: 'progress', missing: 1, need: 'chord' });
    expect(s.press(57, [50, 57, 66]).kind).toBe('hit');
    // G4 starts bar 1's second D, so the chord is held with it again.
    expect(s.press(67, [50, 57, 67]).kind).toBe('progress');
    expect(s.press(54, [50, 54, 57, 67]).kind).toBe('hit');
    // A4 on the same chord: the melody note alone is enough.
    expect(s.press(69, [69]).kind).toBe('hit');
  });

  it('says when the chord is there but the melody note is not', () => {
    const s = new WaitSession(ode, 'both');
    // The chord's D and A without F#4: a chord tone, so not a miss, and the melody is what is missing.
    expect(s.press(50, [50])).toMatchObject({ kind: 'progress', missing: 1, need: 'melody' });
    expect(s.press(57, [50, 57])).toMatchObject({ kind: 'progress', missing: 1, need: 'melody' });
    expect(s.misses).toBe(0);
  });

  it('a note in neither hand is a miss', () => {
    const s = new WaitSession(ode, 'both');
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
