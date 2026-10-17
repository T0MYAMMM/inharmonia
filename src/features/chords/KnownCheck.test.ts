import { describe, expect, it, vi } from 'vitest';
import { NoteStream } from '@/core/input';
import type { Timers } from '@/core/practice';
import { voiceChord } from '@/core/theory';
import { KeyLights } from '@/state/keyLights';
import { KnownCheck } from './KnownCheck';

function setup() {
  let now = 0;
  let id = 0;
  const queue: { at: number; fn: () => void; id: number }[] = [];
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
    const end = now + ms;
    for (;;) {
      queue.sort((a, b) => a.at - b.at);
      const next = queue[0];
      if (!next || next.at > end) break;
      queue.shift();
      now = next.at;
      next.fn();
    }
    now = end;
  };
  const notes = new NoteStream();
  const lights = new KeyLights();
  const onClean = vi.fn();
  const check = new KnownCheck({ notes, lights, onClean, timers });
  check.attach();
  check.setChord('Am', voiceChord('Am', { floor: 'C4' }));
  const play = (midis: number[]) => {
    midis.forEach((m) => notes.noteOn(m, 0.8, 'keys', now));
    advance(100);
  };
  const release = () => notes.releaseAll();
  return { check, lights, onClean, play, release };
}

describe('the "play it" check', () => {
  it('counts a clean play in any octave or inversion', () => {
    const e = setup();
    expect(e.check.snapshot.status).toBe('waiting');
    e.play([52, 57, 60]);
    expect(e.check.snapshot.status).toBe('clean');
    expect(e.onClean).toHaveBeenCalledWith('Am');
    e.release();
    expect(e.check.snapshot.status).toBe('clean');
    e.play([69, 72, 76]);
    expect(e.onClean).toHaveBeenCalledTimes(2);
  });

  it('does not count a try with a wrong note, even after letting go', () => {
    const e = setup();
    e.play([61]);
    expect(e.lights.has(61, 'wrong')).toBe(true);
    e.release();
    e.play([57, 60, 64]);
    expect(e.check.snapshot.status).toBe('slipped');
    e.release();
    expect(e.check.snapshot.status).toBe('slipped');
    e.play([57, 60]);
    expect(e.check.snapshot.status).toBe('building');
    e.play([64]);
    expect(e.check.snapshot.status).toBe('clean');
    e.release();
    e.play([57, 60, 63]);
    e.release();
    e.play([57, 60, 64, 65]);
    expect(e.onClean).toHaveBeenCalledTimes(1);
  });

  it('does not count a try after "Show me"', () => {
    const e = setup();
    e.check.showMe();
    expect(e.lights.has(69, 'chordTarget')).toBe(true);
    e.play([57, 60, 64]);
    expect(e.check.snapshot.status).toBe('helped');
    expect(e.onClean).not.toHaveBeenCalled();
    e.release();
    e.check.showMe();
    e.check.setChord('Am', voiceChord('Am', { floor: 'C4' }));
    e.play([57, 60, 64]);
    expect(e.onClean).toHaveBeenCalledTimes(1);
  });
});
