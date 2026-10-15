import { describe, expect, it } from 'vitest';
import { spelled } from '../theory';
import {
  doHeader,
  formatChord,
  formatNote,
  prettyChord,
  spellInKey,
  undottedDo,
  type KeyContext,
} from '.';

const D: KeyContext = { tonic: 'D', mode: 'major' };
const F: KeyContext = { tonic: 'F', mode: 'major' };
const Am: KeyContext = { tonic: 'A', mode: 'minor' };
const angka = { system: 'angka' as const };

describe('letter names', () => {
  it('spells with the key signature', () => {
    expect(spellInKey(66, D).name).toBe('F#4');
    expect(spellInKey(70, F).name).toBe('Bb4');
    expect(spellInKey(61, D).name).toBe('C#4');
  });

  it('spells chromatic notes relative to the key', () => {
    expect(spellInKey(68, { tonic: 'C', mode: 'major' }).name).toBe('Ab4'); // ♭6
    expect(spellInKey(66, { tonic: 'C', mode: 'major' }).name).toBe('F#4'); // ♯4
    expect(spellInKey(70, { tonic: 'C', mode: 'major' }).name).toBe('Bb4'); // ♭7
    expect(spellInKey(68, Am).name).toBe('G#4'); // raised 7th of A minor
  });

  it('formats with ♯/♭ glyphs and accessible names', () => {
    const l = formatNote(66, D, { system: 'letter', showOctave: true });
    expect(l.text).toBe('F♯4');
    expect(l.ariaLabel).toBe('F sharp 4');
    expect(formatNote(70, F, { system: 'letter' }).text).toBe('B♭');
  });
});

describe('not angka', () => {
  it('numbers D major from do = D with D4–C#5 undotted', () => {
    expect(undottedDo(D).name).toBe('D4');
    const labels = ['D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5'].map(
      (n) => formatNote(spelled(n), D, angka).text,
    );
    expect(labels).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    for (const n of ['D4', 'C#5']) expect(formatNote(spelled(n), D, angka).octave).toBe(0);
    expect(formatNote(spelled('D5'), D, angka).octave).toBe(1);
    expect(formatNote(spelled('E5'), D, angka).octave).toBe(1);
    expect(formatNote(spelled('A3'), D, angka).octave).toBe(-1);
    expect(formatNote(spelled('A1'), D, angka).octave).toBe(-3);
  });

  it('picks the do nearest middle C, ties going up', () => {
    expect(undottedDo({ tonic: 'G', mode: 'major' }).name).toBe('G3');
    expect(undottedDo({ tonic: 'F#', mode: 'major' }).name).toBe('F#4');
    expect(undottedDo({ tonic: 'F', mode: 'major' }).name).toBe('F4');
    expect(undottedDo({ tonic: 'C', mode: 'major' }).name).toBe('C4');
  });

  it('is do-based in minor keys', () => {
    expect(doHeader(Am)).toBe('do = C');
    expect(formatNote(spelled('A4'), Am, angka).text).toBe('6');
    expect(formatNote(spelled('C5'), Am, angka).text).toBe('1');
    expect(formatNote(spelled('A3'), Am, angka).octave).toBe(-1);
    const gs = formatNote(spelled('G#4'), Am, angka);
    expect(gs.main).toBe('5');
    expect(gs.alteration).toBe('raised');
  });

  it('marks chromatic notes raised or lowered, with aria labels', () => {
    const gs = formatNote(spelled('G#4'), D, angka);
    expect(gs).toMatchObject({ main: '4', alteration: 'raised', text: '4♯' });
    expect(gs.ariaLabel).toBe('4 raised');
    const c = formatNote(spelled('C5'), D, angka);
    expect(c).toMatchObject({ main: '7', alteration: 'lowered', text: '7♭' });
    expect(formatNote(spelled('E5'), D, angka).ariaLabel).toBe('2, one octave up');
    expect(formatNote(60, D, angka)).toMatchObject({
      main: '7',
      alteration: 'lowered',
      octave: -1,
    });
  });

  it('shows the header', () => {
    expect(doHeader(D)).toBe('do = D');
    expect(doHeader({ tonic: 'Bb', mode: 'major' })).toBe('do = B♭');
  });
});

describe('chord labels', () => {
  it('prettifies symbols', () => {
    expect(prettyChord('F#m7b5')).toBe('F♯m7♭5');
    expect(prettyChord('Bb/D')).toBe('B♭/D');
    expect(prettyChord('C7#9')).toBe('C7♯9');
  });

  it('formats per system', () => {
    expect(formatChord('F#m7', D, 'letter')).toBe('F♯m7');
    expect(formatChord('F#m7', D, 'angka')).toBe('F♯m7');
    expect(formatChord('F#m7', D, 'roman')).toBe('iii7');
  });
});
