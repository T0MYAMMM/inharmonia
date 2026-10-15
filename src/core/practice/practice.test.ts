import { describe, expect, it } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { SENJA_DI_TERAS } from '@/content/songs/senjaDiTeras';
import { compileLesson } from '../content/compile';
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
  const midiOf = (s: WaitSession) => s.target!.note!.midi;

  it('starts on the first melody note and counts hits and misses', () => {
    const s = new WaitSession(senja);
    expect(s.target!.note!.name).toBe('A4');
    const miss = s.press(60);
    expect(miss.kind).toBe('miss');
    expect(s.index).toBe(0);
    expect(s.misses).toBe(1);
    const hit = s.press(midiOf(s));
    expect(hit).toMatchObject({ kind: 'hit' });
    expect(s.hits).toBe(1);
    expect(s.target!.note!.name).toBe('F#4');
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
    expect(s.target!.note!.name).toBe('D5');
    expect(s.misses).toBe(1);
    s.goToBeat(13.5);
    expect(s.target!.barIndex).toBe(3);
    expect(s.target!.indexInBar).toBe(0);
  });
});
