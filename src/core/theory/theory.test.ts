import { describe, expect, it } from 'vitest';
import {
  CHORD_QUALITIES,
  chordToRoman,
  explicitVoicing,
  inversionCount,
  movementCost,
  nearestVoicing,
  parseChord,
  placeAtOrAbove,
  romanToChord,
  spellAt,
  voiceChord,
  voiceLeadProgression,
} from '.';

const names = (xs: { name: string }[]) => xs.map((x) => x.name).join(' ');

describe('pitch spelling', () => {
  it('spells across the octave boundary', () => {
    expect(spellAt('B#', 60).name).toBe('B#3');
    expect(spellAt('Cb', 59).name).toBe('Cb4');
    expect(placeAtOrAbove('F#', 60).name).toBe('F#4');
    expect(placeAtOrAbove('C', 60).name).toBe('C4');
  });
});

describe('parseChord', () => {
  it('parses every library quality on every root without throwing', () => {
    for (const root of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
      for (const q of CHORD_QUALITIES) {
        expect(() => parseChord(`${root}${q.suffix}`)).not.toThrow();
      }
    }
  });

  it('gives formula and interval names', () => {
    const c = parseChord('Cmaj7');
    expect(c.tones).toEqual(['C', 'E', 'G', 'B']);
    expect(c.formula).toEqual(['1', '3', '5', '7']);
    expect(c.intervalNames).toEqual(['root', 'major third', 'perfect fifth', 'major seventh']);
    expect(parseChord('Bm7b5').formula).toEqual(['1', '♭3', '♭5', '♭7']);
    expect(parseChord('Cdim7').formula).toEqual(['1', '♭3', '♭5', '𝄫7']);
    expect(parseChord('Caug').formula).toEqual(['1', '3', '♯5']);
    expect(parseChord('C13').formula).toContain('13');
  });

  it('parses slash chords and unicode accidentals', () => {
    const c = parseChord('A/C♯');
    expect(c.root).toBe('A');
    expect(c.bass).toBe('C#');
    expect(c.tones).toEqual(['A', 'C#', 'E']);
    expect(parseChord('F♯m7').symbol).toBe('F#m7');
  });

  it('rejects nonsense', () => {
    expect(() => parseChord('H7')).toThrow();
    expect(() => parseChord('Cfoo')).toThrow();
  });
});

describe('voiceChord', () => {
  it('builds close root position and inversions above the floor', () => {
    expect(names(voiceChord('C', { floor: 'C4' }))).toBe('C4 E4 G4');
    expect(names(voiceChord('C', { floor: 'C4', inversion: 1 }))).toBe('E4 G4 C5');
    expect(names(voiceChord('C', { floor: 'C4', inversion: 2 }))).toBe('G4 C5 E5');
    expect(names(voiceChord('Cmaj7', { floor: 'C3', inversion: 3 }))).toBe('B3 C4 E4 G4');
    expect(inversionCount('Cmaj7')).toBe(4);
  });

  it('keeps key spelling', () => {
    expect(names(voiceChord('Ebmaj7', { floor: 'C4' }))).toBe('Eb4 G4 Bb4 D5');
    expect(names(voiceChord('F#m7', { floor: 'C4' }))).toBe('F#4 A4 C#5 E5');
  });

  it('builds open, drop 2, shell and rootless voicings', () => {
    expect(names(voiceChord('C', { style: 'open', floor: 'C3' }))).toBe('C3 G3 E4');
    expect(names(voiceChord('Cmaj7', { style: 'open', floor: 'C3' }))).toBe('C3 G3 B3 E4');
    expect(names(voiceChord('Cmaj7', { style: 'drop2', floor: 'C3' }))).toBe('G3 C4 E4 B4');
    expect(names(voiceChord('Cmaj7', { style: 'drop2', floor: 'G2', inversion: 0 }))).toBe(
      'G2 C3 E3 B3',
    );
    expect(names(voiceChord('G7', { style: 'shell', floor: 'C3' }))).toBe('G3 B3 F4');
    expect(names(voiceChord('Dm7', { style: 'rootless', floor: 'C3' }))).toBe('F3 A3 C4 E4');
    expect(names(voiceChord('Cdim7', { style: 'rootless', floor: 'C3' }))).toBe('Eb3 Gb3 Bbb3');
    expect(names(voiceChord('C', { style: 'shell', floor: 'C3' }))).toBe('C3 E3 G3');
  });

  it('puts slash bass at the bottom', () => {
    expect(names(voiceChord('A/C#', { floor: 'C3' }))).toBe('C#3 E3 A3');
    expect(names(voiceChord('C/D', { floor: 'C4' }))).toBe('D3 C4 E4 G4');
  });

  it('parses explicit voicings', () => {
    expect(explicitVoicing('D2 A2 D3 F#3').map((n) => n.midi)).toEqual([38, 45, 50, 54]);
  });
});

describe('Roman numerals', () => {
  it('converts numerals to chords in any key', () => {
    expect(['I', 'V', 'vi', 'IV'].map((n) => romanToChord(n, 'C'))).toEqual(['C', 'G', 'Am', 'F']);
    expect(['ii7', 'V7', 'Imaj7'].map((n) => romanToChord(n, 'Bb'))).toEqual([
      'Cm7',
      'F7',
      'Bbmaj7',
    ]);
    expect(['i', '♭VII', '♭VI', 'V'].map((n) => romanToChord(n, 'A', 'minor'))).toEqual([
      'Am',
      'G',
      'F',
      'E',
    ]);
    expect(romanToChord('viiø7', 'C')).toBe('Bm7b5');
    expect(romanToChord('vii°', 'D')).toBe('C#dim');
    expect(romanToChord('V7/V', 'C')).toBe('D7');
    expect(romanToChord('V7sus4', 'D')).toBe('A7sus4');
    expect(romanToChord('#iv°7', 'C')).toBe('F#dim7');
  });

  it('displays chords as numerals', () => {
    expect(chordToRoman('Dmaj7', 'D')).toBe('Imaj7');
    expect(chordToRoman('Bm7', 'D')).toBe('vi7');
    expect(chordToRoman('A7sus4', 'D')).toBe('V7sus4');
    expect(chordToRoman('A/C#', 'D')).toBe('V⁶');
    expect(chordToRoman('Bm7b5', 'C')).toBe('viiø7');
    expect(chordToRoman('Bb', 'C')).toBe('♭VII');
    expect(chordToRoman('G7/B', 'C')).toBe('V⁶₅');
    expect(chordToRoman('C/D', 'C')).toBe('I/2');
  });

  it('round-trips the common progressions in every key', () => {
    const numerals = ['I', 'ii7', 'iii', 'IV', 'V7', 'vi', 'viiø7', '♭VII', '♭VI'];
    for (const key of ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db']) {
      for (const n of numerals) {
        expect(chordToRoman(romanToChord(n, key), key)).toBe(n.replace('b', '♭'));
      }
    }
  });
});

describe('voice leading', () => {
  it('scores common tones as free', () => {
    expect(movementCost([60, 64, 67], [60, 64, 67])).toBe(0);
    expect(movementCost([60, 64, 67], [60, 65, 69])).toBeGreaterThan(0);
  });

  it('picks the nearest inversion', () => {
    // C (C4 E4 G4) → F: nearest is C4 F4 A4 (second inversion)
    const f = nearestVoicing([60, 64, 67], 'F', { range: [48, 76] });
    expect(names(f)).toBe('C4 F4 A4');
    // → G: nearest is B3 D4 G4 (first inversion)
    expect(names(nearestVoicing([60, 64, 67], 'G', { range: [48, 76] }))).toBe('B3 D4 G4');
  });

  it('keeps a ii–V–I within range and moving little', () => {
    const vs = voiceLeadProgression(['Dm7', 'G7', 'Cmaj7'], { range: [48, 72] });
    for (const v of vs) for (const n of v) expect(n.midi).toBeGreaterThanOrEqual(48);
    for (let i = 1; i < vs.length; i++) {
      const cost = movementCost(
        vs[i - 1]!.map((n) => n.midi),
        vs[i]!.map((n) => n.midi),
      );
      expect(cost).toBeLessThanOrEqual(4);
    }
  });
});
