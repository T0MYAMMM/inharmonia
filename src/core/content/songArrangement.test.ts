import { describe, expect, it } from 'vitest';
import { getSong } from '@/content/lessons';
import { PATTERNS } from '@/content/patterns';
import { compileLesson } from './compile';
import { compileSongArrangement, DEFAULT_SONG_ARRANGEMENT } from './songArrangement';

const song = getSong('morning-ferry-easy')!;

describe('compileSongArrangement', () => {
  it('preserves the original lesson and playback by default', () => {
    const original = compileLesson(song, PATTERNS);
    const arranged = compileSongArrangement(song, DEFAULT_SONG_ARRANGEMENT);
    expect(arranged.events).toEqual(original.events);
    expect(arranged.chords).toEqual(original.chords);
    expect(song.lhPattern).toBe('bass-held');
  });

  it('moves the chord voicing without transposing the melody', () => {
    const normal = compileSongArrangement(song, DEFAULT_SONG_ARRANGEMENT);
    const higher = compileSongArrangement(song, { ...DEFAULT_SONG_ARRANGEMENT, chordOctave: 1 });
    expect(higher.bars[0]!.rh).toEqual(normal.bars[0]!.rh);
    expect(higher.chords[0]!.voicing.map((n) => n.midi)).toEqual(
      normal.chords[0]!.voicing.map((n) => n.midi + 12),
    );
  });

  it('replaces the assigned bass pattern with block chords', () => {
    const original = compileSongArrangement(song, DEFAULT_SONG_ARRANGEMENT);
    const block = compileSongArrangement(song, { ...DEFAULT_SONG_ARRANGEMENT, pattern: 'block' });
    expect(block.bars[0]!.rh).toEqual(original.bars[0]!.rh);
    expect(block.bars[0]!.lh.length).toBeGreaterThan(original.bars[0]!.lh.length);
    expect(song.lhPattern).toBe('bass-held');
  });

  it('changes inversions without changing chord labels', () => {
    const root = compileSongArrangement(song, { ...DEFAULT_SONG_ARRANGEMENT, inversion: 0 });
    const first = compileSongArrangement(song, { ...DEFAULT_SONG_ARRANGEMENT, inversion: 1 });
    expect(first.chords[0]!.symbol).toBe(root.chords[0]!.symbol);
    expect(first.chords[0]!.voicing[0]!.midi).not.toBe(root.chords[0]!.voicing[0]!.midi);
  });

  it('rejects a pattern for a different meter', () => {
    const baseline = compileSongArrangement(song, DEFAULT_SONG_ARRANGEMENT);
    const wrongMeter = compileSongArrangement(song, {
      ...DEFAULT_SONG_ARRANGEMENT,
      pattern: 'waltz',
    });
    expect(wrongMeter.events).toEqual(baseline.events);
  });
});
