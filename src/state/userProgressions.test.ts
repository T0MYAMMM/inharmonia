import { describe, expect, it } from 'vitest';
import { memoryStore } from '@/core/persistence/storage';
import { createUserProgressionsStore, loadUserProgressions, MAX_SAVED } from './userProgressions';

const draft = {
  name: 'Sunday loop',
  mode: 'major' as const,
  steps: [
    { numeral: 'I', beats: 4 },
    { numeral: 'vi', beats: 4 },
  ],
};

let seed = 0;
const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

describe('user progressions', () => {
  it('saves, reloads, edits and deletes', () => {
    const store = memoryStore();
    const a = createUserProgressionsStore(store, random);
    const saved = a.getState().save({ ...draft, description: '  For warming up.  ' });
    expect(saved.id).toMatch(/^mine-sunday-loop-[a-z0-9]{4}$/);
    expect(saved).toMatchObject({ source: { kind: 'user' }, description: 'For warming up.' });

    const b = createUserProgressionsStore(store, random);
    expect(b.getState().items).toEqual([saved]);

    b.getState().save({ ...draft, name: 'Sunday loop, slower' }, saved.id);
    expect(b.getState().items).toHaveLength(1);
    expect(b.getState().get(saved.id)!.name).toBe('Sunday loop, slower');

    b.getState().remove(saved.id);
    expect(loadUserProgressions(store)).toEqual([]);
  });

  it('refuses to save something invalid and leaves storage alone', () => {
    const store = memoryStore();
    const s = createUserProgressionsStore(store, random);
    expect(() => s.getState().save({ ...draft, steps: [{ numeral: 'vix', beats: 4 }] })).toThrow(
      /isn't a numeral/,
    );
    expect(() => s.getState().save({ ...draft, name: '' })).toThrow(/Missing name/);
    expect(store.get('user-progressions')).toBeNull();
  });

  it('drops tampered entries on load but keeps the good ones', () => {
    const store = memoryStore();
    const good = createUserProgressionsStore(store, random).getState().save(draft);
    const doc = JSON.parse(store.get('user-progressions')!);
    doc.state.push(
      { ...good, id: 'mine-bad', steps: [{ numeral: 'alert(1)', beats: 4 }] },
      { ...good, id: 'i-v-vi-iv' }, // not a user id
      { ...good }, // duplicate id
      'junk',
    );
    store.set('user-progressions', JSON.stringify(doc));
    expect(loadUserProgressions(store)).toEqual([good]);
    store.set('user-progressions', '{nope');
    expect(loadUserProgressions(store)).toEqual([]);
  });

  it('caps how many can be saved', () => {
    const s = createUserProgressionsStore(memoryStore(), random);
    for (let i = 0; i < MAX_SAVED; i++) s.getState().save({ ...draft, name: `Loop ${i}` });
    expect(() => s.getState().save(draft)).toThrow(/up to 100/);
  });

  it('puts a whole progression under its own id, keeping its source', () => {
    const s = createUserProgressionsStore(memoryStore(), random);
    const p = {
      id: 'mine-progression-pop-loop',
      schemaVersion: 1,
      name: 'Pop loop',
      mode: 'major' as const,
      meter: { beats: 4, unit: 4 },
      steps: [
        { numeral: 'I', beats: 4 },
        { numeral: 'V', beats: 4 },
      ],
      source: { kind: 'generic' as const },
    };
    expect(s.getState().put(p)).toBe(true);
    expect(s.getState().put({ ...p, name: 'Pop loop again' })).toBe(true);
    expect(s.getState().items).toEqual([{ ...p, name: 'Pop loop again' }]);
    expect(s.getState().put({ ...p, id: 'pop-loop' })).toBe(false);
    expect(s.getState().put({ ...p, steps: [{ numeral: 'Z', beats: 4 }] })).toBe(false);
  });
});
