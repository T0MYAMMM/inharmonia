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

  // Not in the chord library, but chord sheets use them.
  it.each([
    ['Cadd11', 'C E G F', '1 3 5 11', 'major'],
    ['Cadd4', 'C E F G', '1 3 4 5', 'major'],
    ['Cmadd11', 'C Eb G F', '1 ♭3 5 11', 'minor'],
    ['Cmadd4', 'C Eb F G', '1 ♭3 4 5', 'minor'],
    ['C7sus2', 'C D G Bb', '1 2 5 ♭7', 'suspended'],
    ['C7sus4', 'C F G Bb', '1 4 5 ♭7', 'suspended'],
    ['C9sus4', 'C F G Bb D', '1 4 5 ♭7 9', 'suspended'],
    ['Ebadd11', 'Eb G Bb Ab', '1 3 5 11', 'major'],
    ['B7sus2', 'B C# F# A', '1 2 5 ♭7', 'suspended'],
  ])('reads %s as %s (%s)', (symbol, tones, formula, family) => {
    const c = parseChord(symbol);
    expect(c.tones.join(' ')).toBe(tones);
    expect(c.formula.join(' ')).toBe(formula);
    expect(c.family).toBe(family);
  });

  it('names the eleventh and the second', () => {
    expect(parseChord('Cadd11').intervalNames).toEqual([
      'root',
      'major third',
      'perfect fifth',
      'perfect eleventh',
    ]);
    expect(parseChord('C7sus2').intervalNames[1]).toBe('major second');
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

  it('voices add11 with the fourth on top, add4 inside the octave, and 7sus2 in every style', () => {
    expect(names(voiceChord('Ebadd11', { floor: 'C3' }))).toBe('Eb3 G3 Bb3 Ab4');
    expect(names(voiceChord('Ebadd4', { floor: 'C3' }))).toBe('Eb3 G3 Ab3 Bb3');
    expect(names(voiceChord('Amadd11', { floor: 'C3' }))).toBe('A3 C4 E4 D5');
    expect(names(voiceChord('B7sus2', { floor: 'C3' }))).toBe('B3 C#4 F#4 A4');
    expect(names(voiceChord('B7sus2', { style: 'shell', floor: 'C3' }))).toBe('B3 C#4 A4');
    expect(names(voiceChord('Cadd11/E', { floor: 'C3' }))).toBe('E3 G3 F4 C5');
    for (const symbol of ['Cadd11', 'Cadd4', 'Cmadd11', 'C7sus2'])
      for (const style of ['close', 'open', 'drop2', 'shell', 'rootless'] as const)
        expect(voiceChord(symbol, { style, floor: 'C3' }).length).toBeGreaterThanOrEqual(3);
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

  it('reads add11, add4 and 7sus2 as numerals, both ways', () => {
    expect(chordToRoman('Ebadd11', 'Eb')).toBe('Iadd11');
    expect(chordToRoman('Ebadd11', 'Bb')).toBe('IVadd11');
    expect(chordToRoman('Dadd4', 'G')).toBe('Vadd4');
    expect(chordToRoman('Amadd11', 'C')).toBe('viadd11');
    expect(chordToRoman('B7sus2', 'E')).toBe('V7sus2');
    expect(romanToChord('Iadd11', 'Eb')).toBe('Ebadd11');
    expect(romanToChord('viadd11', 'C')).toBe('Amadd11');
    expect(romanToChord('iiadd4', 'C')).toBe('Dmadd4');
    expect(romanToChord('V7sus2', 'E')).toBe('B7sus2');
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
