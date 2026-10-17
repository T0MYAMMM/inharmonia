import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore, readVersioned, type KeyValueStore } from '@/core/persistence/storage';
import {
  isKnownChord,
  knownChordsState,
  knownEntry,
  recordCleanPlay,
  resetKnownChordsForTests,
  setKnown,
  subscribeKnownChords,
} from './knownChords';

let store: KeyValueStore;
beforeEach(() => {
  store = memoryStore();
  resetKnownChordsForTests(store);
});

const day = (d: number) => new Date(2026, 0, d, 12);

describe('known chords profile', () => {
  it('learns a chord from 3 clean plays on 2 days, whatever its spelling', () => {
    recordCleanPlay('Bbm7', day(1));
    recordCleanPlay('A#m7', day(1));
    recordCleanPlay('Bbm7/Db', day(1));
    expect(isKnownChord('Bbm7')).toBe(false);
    recordCleanPlay('Bbm7', day(2));
    expect(isKnownChord('A#m7')).toBe(true);
    expect(knownEntry('Bbm7')!.plays).toEqual([
      '2026-01-01',
      '2026-01-01',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  it('lets a manual mark win, and clearing it hands back to the plays', () => {
    setKnown('F#', true);
    expect(isKnownChord('Gb')).toBe(true);
    for (const d of [1, 2, 3]) recordCleanPlay('Dm', day(d));
    setKnown('Dm', false);
    expect(isKnownChord('Dm')).toBe(false);
    setKnown('Dm', undefined);
    expect(isKnownChord('Dm')).toBe(true);
    setKnown('F#', undefined);
    expect(knownChordsState().chords['F#']).toBeUndefined();
  });

  it('is saved, reloads, and tells listeners', () => {
    const l = vi.fn();
    const off = subscribeKnownChords(l);
    setKnown('C', true);
    expect(l).toHaveBeenCalledTimes(1);
    off();
    resetKnownChordsForTests(store);
    expect(isKnownChord('C')).toBe(true);
    const saved = readVersioned(store, 'known-chords', {
      version: 1,
      fallback: null,
      validate: (_x): _x is unknown => true,
    });
    expect(saved).toEqual({ chords: { C: { manual: true, plays: [] } } });
  });

  it('ignores N.C. and unreadable symbols, and survives a broken store', () => {
    setKnown('N.C.', true);
    recordCleanPlay('Hx');
    expect(knownChordsState().chords).toEqual({});
    store.set('known-chords', '{"version":1,"state":{"chords":{"C":{"plays":"x"}}}}');
    resetKnownChordsForTests(store);
    expect(knownChordsState()).toEqual({ chords: {} });
  });
});
