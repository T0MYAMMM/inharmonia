import { describe, expect, it } from 'vitest';
import { BUILT_IN_ENTRIES } from '@/content/builtInIndex';
import { parseIndex } from '@/core/library/catalogue';
import CATALOGUE from '../../../public/library/index.json?raw';
import { describeExercise, nextNew, songLookup, starterExercises } from './catalog';

describe('exercise catalog', () => {
  it('names every kind of progress id', () => {
    expect(describeExercise('ode-to-joy-medium')).toMatchObject({
      title: 'Ode to Joy, Medium',
      kind: 'Song',
      href: '/songs/ode-to-joy-medium',
    });
    expect(describeExercise('chord-drill')).toMatchObject({ title: 'Chord drill' });
    expect(describeExercise('progression:ii-v-i')).toMatchObject({
      title: 'ii–V–I',
      kind: 'Progression',
    });
    expect(describeExercise('progression:ii-v-i:play-along')).toMatchObject({
      kind: 'Progression, play-along',
    });
    expect(describeExercise('fill:enclosure:speed')).toMatchObject({
      title: 'Enclosure',
      kind: 'Fill, speed-up',
      href: '/fills/enclosure',
    });
    expect(describeExercise('ear:progressions:pop')).toMatchObject({
      title: 'Progressions: Add vi',
      href: '/ear?exercise=progressions&level=pop',
    });
    expect(describeExercise('ear:notes:all')).toMatchObject({
      title: 'Note names: All twelve',
      href: '/ear?exercise=notes&level=all',
    });
  });

  it('finds your own progressions and drops what no longer exists', () => {
    const mine = [
      {
        id: 'mine-loop-0000',
        schemaVersion: 1,
        name: 'Loop',
        mode: 'major' as const,
        meter: { beats: 4, unit: 4 },
        steps: [{ numeral: 'I', beats: 4 }],
        source: { kind: 'user' as const },
      },
    ];
    expect(describeExercise('progression:mine-loop-0000', mine)).toMatchObject({ title: 'Loop' });
    expect(describeExercise('progression:mine-gone')).toBeNull();
    expect(describeExercise('fill:nope')).toBeNull();
    expect(describeExercise('ear:chords:nope')).toBeNull();
    expect(describeExercise('whatever')).toBeNull();
    // The original pieces left in this version; their progress stays hidden.
    expect(describeExercise('senja-di-teras')).toBeNull();
    expect(describeExercise('window-light-easy')).toBeNull();
  });

  it('names a catalogue song on this device, or offers it when it is not', () => {
    const catalogue = parseIndex(CATALOGUE)!;
    const minuet = catalogue.find((e) => e.piece === 'minuet-in-g')!;
    // Home knows only the songs on this device.
    expect(describeExercise('minuet-in-g-easy')).toBeNull();
    const removed = songLookup(BUILT_IN_ENTRIES, catalogue);
    expect(describeExercise('minuet-in-g-easy', [], removed)).toEqual({
      id: 'minuet-in-g-easy',
      title: 'Minuet in G, Easy',
      kind: 'Song, not downloaded',
      href: '/songs/minuet-in-g-easy',
    });
    const kept = songLookup([...BUILT_IN_ENTRIES, minuet], catalogue);
    expect(describeExercise('minuet-in-g-advanced', [], kept)).toMatchObject({
      title: 'Minuet in G, Advanced',
      kind: 'Song',
    });
    expect(describeExercise('ode-to-joy-easy', [], removed)).toMatchObject({ kind: 'Song' });
    expect(describeExercise('window-light-easy', [], removed)).toBeNull();
  });

  it('suggests starters that all resolve, skipping what was tried', () => {
    for (const s of starterExercises()) expect(describeExercise(s.id), s.id).not.toBeNull();
    expect(nextNew(() => false)!.id).toBe('twinkle-twinkle-easy');
    expect(nextNew((id) => id === 'twinkle-twinkle-easy')!.id).toBe('chord-drill');
    expect(nextNew(() => true)).toBeNull();
  });
});
