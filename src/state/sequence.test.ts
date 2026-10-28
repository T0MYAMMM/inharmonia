import { describe, expect, it } from 'vitest';
import { barOf, EMPTY_SEQUENCE, type ChordSequence } from '@/core/charts';
import { memoryStore, NAMESPACE } from '@/core/persistence/storage';
import { loadSequence, saveSequence } from './sequence';

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
