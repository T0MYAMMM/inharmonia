import { describe, expect, it, vi } from 'vitest';
import { explicitVoicing, voiceChord } from '../theory';
import {
  belongsToChord,
  chordTarget,
  ChordRecognizer,
  matchChord,
  type Timers,
} from './chordMatch';

const cMaj = chordTarget(voiceChord('C', { floor: 'C4' })); // C4 E4 G4
const cMaj2nd = chordTarget(voiceChord('C', { floor: 'C4', inversion: 2 })); // G4 C5 E5

describe('matchChord', () => {
  it('pitch-class: any octave, any inversion, doublings allowed', () => {
    expect(matchChord([48, 64, 67], cMaj, 'pitch-class').status).toBe('match');
    expect(matchChord([55, 60, 64, 72], cMaj, 'pitch-class').status).toBe('match');
    expect(matchChord([60, 64], cMaj, 'pitch-class')).toMatchObject({
      status: 'partial',
      missing: [7],
    });
    expect(matchChord([60, 63, 67], cMaj, 'pitch-class')).toMatchObject({
      status: 'wrong',
      extra: [63],
    });
    expect(matchChord([], cMaj, 'pitch-class').status).toBe('idle');
  });

  it('inversion: the lowest note must be the written bass', () => {
    expect(matchChord([55, 60, 64], cMaj2nd, 'inversion').status).toBe('match');
    expect(matchChord([43, 64, 72], cMaj2nd, 'inversion').status).toBe('match'); // G anywhere at the bottom
    expect(matchChord([60, 64, 67], cMaj2nd, 'inversion').status).toBe('wrong-bass');
  });

  it('exact: exactly the written notes', () => {
    expect(matchChord([67, 72, 76], cMaj2nd, 'exact').status).toBe('match');
    expect(matchChord([55, 60, 64], cMaj2nd, 'exact').status).toBe('wrong');
    expect(matchChord([67, 72], cMaj2nd, 'exact')).toMatchObject({
      status: 'partial',
      missing: [76],
    });
  });

  it('flags a single wrong note', () => {
    expect(belongsToChord(76, cMaj, 'pitch-class')).toBe(true);
    expect(belongsToChord(62, cMaj, 'pitch-class')).toBe(false);
    expect(belongsToChord(76, cMaj, 'exact')).toBe(false);
  });

  it('handles a slash chord voicing', () => {
    const t = chordTarget(explicitVoicing('C#2 A2 C#3 E3')); // A/C#
    expect(t.bassChroma).toBe(1);
    expect(matchChord([49, 57, 64], t, 'inversion').status).toBe('match');
    expect(matchChord([57, 61, 64], t, 'inversion').status).toBe('wrong-bass');
  });
});

describe('ChordRecognizer', () => {
  function fakeTimers() {
    let now = 0;
    const queue: { at: number; fn: () => void; id: number }[] = [];
    let id = 0;
    const timers: Timers = {
      now: () => now,
      setTimeout: (fn, ms) => {
        queue.push({ at: now + ms, fn, id: ++id });
        return id;
      },
      clearTimeout: (x) => {
        const i = queue.findIndex((q) => q.id === x);
        if (i >= 0) queue.splice(i, 1);
      },
    };
    const advance = (ms: number) => {
      now += ms;
      for (const q of [...queue].sort((a, b) => a.at - b.at)) {
        if (q.at <= now) {
          queue.splice(queue.indexOf(q), 1);
          q.fn();
        }
      }
    };
    return { timers, advance, now: () => now };
  }

  it('fires once the chord holds steady for the settle time', () => {
    const t = fakeTimers();
    const onMatch = vi.fn();
    const r = new ChordRecognizer({ onMatch, settleMs: 60, timers: t.timers });
    r.update(
      [
        { midi: 60, at: 0 },
        { midi: 64, at: 10 },
      ],
      cMaj,
      'pitch-class',
    );
    r.update(
      [
        { midi: 60, at: 0 },
        { midi: 64, at: 10 },
        { midi: 67, at: 20 },
      ],
      cMaj,
      'pitch-class',
    );
    t.advance(59);
    expect(onMatch).not.toHaveBeenCalled();
    t.advance(2);
    expect(onMatch).toHaveBeenCalledTimes(1);
    // Holding the same shape does not fire again.
    r.update(
      [
        { midi: 60, at: 0 },
        { midi: 64, at: 10 },
        { midi: 67, at: 20 },
      ],
      cMaj,
      'pitch-class',
    );
    t.advance(100);
    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it('a wrong note added within the settle time cancels the match', () => {
    const t = fakeTimers();
    const onMatch = vi.fn();
    const r = new ChordRecognizer({ onMatch, settleMs: 60, timers: t.timers });
    const held = [
      { midi: 60, at: 0 },
      { midi: 64, at: 0 },
      { midi: 67, at: 0 },
    ];
    r.update(held, cMaj, 'pitch-class');
    t.advance(30);
    expect(r.update([...held, { midi: 62, at: 30 }], cMaj, 'pitch-class').status).toBe('wrong');
    t.advance(100);
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('in timed mode the tones must go down within the window', () => {
    const t = fakeTimers();
    const onMatch = vi.fn();
    const r = new ChordRecognizer({ onMatch, settleMs: 0, windowMs: 120, timers: t.timers });
    const slow = [
      { midi: 60, at: 0 },
      { midi: 64, at: 100 },
      { midi: 67, at: 400 },
    ];
    expect(r.update(slow, cMaj, 'pitch-class').status).toBe('partial');
    t.advance(1);
    expect(onMatch).not.toHaveBeenCalled();
    const together = slow.map((h) => ({ ...h, at: 1000 + h.at / 10 }));
    r.update(together, cMaj, 'pitch-class');
    t.advance(1);
    expect(onMatch).toHaveBeenCalledTimes(1);
  });
});
