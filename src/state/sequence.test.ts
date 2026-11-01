import { describe, expect, it } from 'vitest';
import { barOf, EMPTY_SEQUENCE, type ChordSequence } from '@/core/charts';
import { memoryStore, NAMESPACE } from '@/core/persistence/storage';
import { clearBackup, loadBackup, loadSequence, saveBackup, saveSequence } from './sequence';

const seq: ChordSequence = {
  meter: { beats: 3, unit: 4 },
  bars: [barOf(['C'], 3), barOf(['Am', 'F'], 3)],
  tempo: 112,
  style: 'arpeggio-8ths',
  loop: false,
  showFunction: true,
};

describe('the saved chord sequence', () => {
  it('comes back as it was saved, settings included', () => {
    const store = memoryStore();
    saveSequence(seq, store);
    expect(loadSequence(store)).toEqual(seq);
  });

  it('is empty when nothing was saved, or what was saved cannot be read', () => {
    expect(loadSequence(memoryStore())).toEqual(EMPTY_SEQUENCE);
    for (const raw of ['{not json', '{"version":1,"state":null}', '{"version":1,"state":{}}']) {
      const store = memoryStore();
      store.set('chord-sequence', raw);
      expect(loadSequence(store), raw).toEqual(EMPTY_SEQUENCE);
    }
  });

  it('keeps the bars that play when some do not', () => {
    const store = memoryStore();
    store.set(
      'chord-sequence',
      JSON.stringify({
        version: 1,
        state: { ...seq, bars: [...seq.bars, { chords: [{ symbol: 'Hx', beats: 3 }] }] },
      }),
    );
    expect(loadSequence(store)).toEqual(seq);
  });

  it('is kept in this browser under the app namespace', () => {
    expect(NAMESPACE).toBe('inharmonia:');
    const store = memoryStore();
    saveSequence(seq, store);
    expect(JSON.parse(store.get('chord-sequence')!)).toEqual({ version: 1, state: seq });
  });
});

describe('the sequence kept from before a replace', () => {
  it('keeps the chords and meter, and comes back with them', () => {
    const store = memoryStore();
    expect(loadBackup(store)).toBeNull();
    saveBackup(seq, store);
    expect(loadBackup(store)).toEqual({ meter: seq.meter, bars: seq.bars });
    expect(JSON.parse(store.get('chord-sequence-before')!).state).toEqual({
      meter: seq.meter,
      bars: seq.bars,
    });
  });

  it('is one: a newer replace takes its place, and it can be put aside', () => {
    const store = memoryStore();
    saveBackup(seq, store);
    saveBackup({ meter: { beats: 4, unit: 4 }, bars: [barOf(['G'], 4)] }, store);
    expect(loadBackup(store)?.bars).toEqual([barOf(['G'], 4)]);
    clearBackup(store);
    expect(loadBackup(store)).toBeNull();
  });

  it('is cleaned on reading: no bars that do not play, none at all when nothing is left', () => {
    const store = memoryStore();
    const odd = { chords: [{ symbol: 'Hx', beats: 4 }] };
    store.set(
      'chord-sequence-before',
      JSON.stringify({ version: 1, state: { meter: { beats: 4 }, bars: [barOf(['C'], 4), odd] } }),
    );
    expect(loadBackup(store)).toEqual({ meter: { beats: 4, unit: 4 }, bars: [barOf(['C'], 4)] });
    store.set('chord-sequence-before', JSON.stringify({ version: 1, state: { bars: [odd] } }));
    expect(loadBackup(store)).toBeNull();
    store.set('chord-sequence-before', '{not json');
    expect(loadBackup(store)).toBeNull();
  });
});
