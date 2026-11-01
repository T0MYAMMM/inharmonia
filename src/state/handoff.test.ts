import { describe, expect, it } from 'vitest';
import { parseBars } from '@/core/charts';
import type { Handoff } from '@/core/handoff';
import { memoryStore } from '@/core/persistence/storage';
import { arrive, leave, markUsed } from './handoff';

const chords: Handoff = {
  kind: 'chords',
  from: { to: '/progressions/ii-v-i?key=G', label: 'ii–V–I' },
  meter: { beats: 4, unit: 4 },
  bars: parseBars('Am7 D7 Gmaj7 Gmaj7', 4).bars,
  what: 'ii–V–I in G major',
};

describe('handoffs between rooms', () => {
  it('arrives as it left, under the id the address carries', () => {
    const store = memoryStore();
    const id = leave(chords, store);
    expect(id).toMatch(/^[a-z0-9]{6}$/);
    expect(arrive('chords', id, store)).toEqual({ status: 'ok', handoff: chords, used: false });
  });

  it('is nothing without an id, and gone under another id or after a newer one', () => {
    const store = memoryStore();
    expect(arrive('chords', null, store)).toEqual({ status: 'none' });
    expect(arrive('chords', 'abc123', store)).toEqual({ status: 'gone' });
    const first = leave(chords, store);
    const second = leave({ ...chords, what: 'ii–V–I in D major' }, store);
    expect(arrive('chords', first, store)).toEqual({ status: 'gone' });
    expect(arrive('chords', second, store).status).toBe('ok');
    // One of each kind: a chart handoff doesn't replace it.
    expect(arrive('chart', second, store)).toEqual({ status: 'gone' });
  });

  it('says so when what is there cannot be read', () => {
    const store = memoryStore();
    const id = leave(chords, store);
    const doc = JSON.parse(store.get('handoff:chords')!);
    doc.state.handoff.bars = 'none';
    store.set('handoff:chords', JSON.stringify(doc));
    expect(arrive('chords', id, store)).toEqual({ status: 'unreadable' });
    store.set('handoff:chords', '{not json');
    expect(arrive('chords', id, store)).toEqual({ status: 'gone' });
  });

  it('once used, keeps the way back and says it was used', () => {
    const store = memoryStore();
    const id = leave(chords, store);
    markUsed('chords', 'other1', store);
    expect(arrive('chords', id, store)).toMatchObject({ used: false });
    markUsed('chords', id, store);
    expect(arrive('chords', id, store)).toEqual({ status: 'ok', handoff: chords, used: true });
  });
});
