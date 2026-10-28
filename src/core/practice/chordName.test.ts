import { describe, expect, it } from 'vitest';
import { nameChord, PlayedChord } from './chordName';

describe('naming held notes', () => {
  it('names a chord in any octave and any inversion', () => {
    expect(nameChord([60, 64, 67])).toBe('C');
    expect(nameChord([64, 67, 72])).toBe('C'); // first inversion
    expect(nameChord([43, 64, 72, 79])).toBe('C'); // spread, doubled
    expect(nameChord([57, 60, 64])).toBe('Am');
    expect(nameChord([62, 65, 69, 72])).toBe('Dm7');
    expect(nameChord([55, 59, 62, 65])).toBe('G7');
    expect(nameChord([60, 64, 67, 71])).toBe('Cmaj7');
  });

  it('lets the lowest note decide between chords of the same notes', () => {
    expect(nameChord([60, 64, 67, 69])).toBe('C6');
    expect(nameChord([57, 60, 64, 67])).toBe('Am7');
    // Neither root at the bottom: the plainer quality.
    expect(nameChord([64, 67, 69, 72])).toBe('C6');
    expect(nameChord([60, 63, 66, 69])).toBe('Cdim7');
    expect(nameChord([57, 60, 63, 66])).toBe('Adim7');
    expect(nameChord([60, 62, 67])).toBe('Csus2');
    expect(nameChord([55, 60, 62])).toBe('Gsus4');
  });

  it('spells roots as the chord builder does', () => {
    expect(nameChord([63, 67, 70])).toBe('Eb');
    expect(nameChord([66, 70, 73])).toBe('F#');
    expect(nameChord([58, 61, 65])).toBe('Bbm');
  });

  it('names extended chords when every tone is there', () => {
    expect(nameChord([48, 52, 55, 58, 62])).toBe('C9');
    expect(nameChord([48, 52, 55, 59, 62])).toBe('Cmaj9');
    expect(nameChord([48, 52, 55, 62])).toBe('Cadd9');
  });

  it('names nothing below three notes, or what no quality is', () => {
    expect(nameChord([])).toBeNull();
    expect(nameChord([60])).toBeNull();
    expect(nameChord([60, 67])).toBeNull();
    expect(nameChord([60, 72, 84])).toBeNull(); // one note in three octaves
    expect(nameChord([60, 61, 62])).toBeNull();
    expect(nameChord([60, 64, 67, 66])).toBeNull(); // C with a stray F♯
  });
});

describe('the chord of a gesture', () => {
  it('is the most notes held at once, kept after letting go', () => {
    const p = new PlayedChord();
    expect(p.current).toBeNull();
    p.update([60]);
    p.update([60, 64]);
    p.update([60, 64, 67]); // rolled in
    expect(p.current).toEqual({ symbol: 'C', notes: [60, 64, 67] });
    p.update([60, 64, 67, 70]);
    p.update([60, 64, 67]); // let go a note at a time
    p.update([60]);
    p.update([]);
    expect(p.current).toEqual({ symbol: 'C7', notes: [60, 64, 67, 70] });
  });

  it('is replaced by the next gesture, chord or not', () => {
    const p = new PlayedChord();
    p.update([57, 60, 64]);
    p.update([]);
    expect(p.current?.symbol).toBe('Am');
    p.update([62]);
    expect(p.current).toEqual({ symbol: null, notes: [62] });
    p.update([]);
    expect(p.current).toEqual({ symbol: null, notes: [62] });
  });
});
