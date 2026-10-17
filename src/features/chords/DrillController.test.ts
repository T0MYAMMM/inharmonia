import { describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '@/core/audio/engine';
import { NoteStream } from '@/core/input';
import type { Timers } from '@/core/practice';
import { KeyLights } from '@/state/keyLights';
import { DrillController } from './DrillController';

function fakeTimers() {
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
  return { timers, advance };
}

function setup() {
  const t = fakeTimers();
  const notes = new NoteStream();
  const lights = new KeyLights();
  const audio = { unlock: vi.fn(async () => {}), now: () => 0, playAt: vi.fn() };
  const onRoundDone = vi.fn();
  const onCleanChord = vi.fn();
  const ctrl = new DrillController({
    audio: audio as unknown as AudioEngine,
    lights,
    notes,
    onRoundDone,
    onCleanChord,
    timers: t.timers,
  });
  ctrl.attach();
  const hold = (midis: number[]) =>
    midis.forEach((m) => notes.noteOn(m, 0.8, 'keys', t.timers.now()));
  const release = () => notes.releaseAll();
  return { t, notes, lights, audio, ctrl, hold, release, onRoundDone, onCleanChord };
}

const settings = {
  qualityIds: ['major'],
  naturalsOnly: true,
  inversions: false,
  strictness: 'pitch-class' as const,
};
const C_MAJOR = () => 0; // rng: always the first root (C) and quality

describe('DrillController', () => {
  it('prompts, recognises the held chord after it settles, then moves on', () => {
    const e = setup();
    e.ctrl.start(settings, C_MAJOR);
    expect(e.ctrl.snapshot.prompt).toEqual({ chord: 'C major', inversion: null, lowest: null });
    expect(e.ctrl.snapshot.range).toEqual([60, 67]);
    e.hold([48, 52]);
    expect(e.ctrl.snapshot.hint).toBe('One more note.');
    e.hold([67]);
    e.t.advance(100);
    expect(e.ctrl.snapshot).toMatchObject({ correct: true, clean: 1 });
    e.release();
    e.t.advance(700);
    expect(e.ctrl.snapshot).toMatchObject({ correct: false, index: 1 });
  });

  it('flashes a wrong note and the answer is no longer clean', () => {
    const e = setup();
    e.ctrl.start(settings, C_MAJOR);
    e.hold([61]);
    expect(e.lights.has(61, 'wrong')).toBe(true);
    expect(e.ctrl.snapshot.hint).toBe('That note is not in the chord.');
    e.release();
    e.hold([60, 64, 67]);
    e.t.advance(100);
    expect(e.ctrl.snapshot).toMatchObject({ correct: true, clean: 0 });
  });

  it('with right-bass strictness, asks for the bass note', () => {
    const e = setup();
    e.ctrl.start({ ...settings, inversions: true, strictness: 'inversion' }, () => 0.5); // second inversion of D? rng 0.5
    const lowest = e.ctrl['drill']!.current.voicing[0]!.name.replace(/\d+$/, '');
    const tones = e.ctrl['drill']!.current.target.chromas;
    const wrongBass = tones.map((c) => 60 + c).sort((a, b) => a - b);
    // Put a tone that is not the written bass at the bottom.
    const bottom = wrongBass.find((m) => m % 12 !== e.ctrl['drill']!.current.target.bassChroma)!;
    e.hold([bottom - 12, ...wrongBass]);
    expect(e.ctrl.snapshot.hint).toBe(`Right notes. Now put ${lowest} at the bottom.`);
  });

  it('show me reveals the chord, skip moves on', () => {
    const e = setup();
    e.ctrl.start(settings, C_MAJOR);
    e.ctrl.showMe();
    expect(e.ctrl.snapshot.showing).toBe(true);
    expect([
      ...e.ctrl['drill']!.current.voicing.map((n) => e.lights.has(n.midi, 'chordTarget')),
    ]).toEqual([true, true, true]);
    e.ctrl.skip();
    expect(e.ctrl.snapshot).toMatchObject({ index: 1, showing: false });
  });

  it('reports a clean chord for the known-chords profile, but not after a slip or help', () => {
    const e = setup();
    e.ctrl.start(settings, C_MAJOR);
    e.hold([60, 64, 67]);
    e.t.advance(100);
    expect(e.onCleanChord).toHaveBeenCalledWith('C');
    e.release();
    e.t.advance(700);
    e.hold([61]);
    e.release();
    e.hold([60, 64, 67]);
    e.t.advance(100);
    e.release();
    e.t.advance(700);
    e.ctrl.showMe();
    e.hold([60, 64, 67]);
    e.t.advance(100);
    expect(e.onCleanChord).toHaveBeenCalledTimes(1);
  });

  it('ends the round with a summary', () => {
    const e = setup();
    e.ctrl.start(settings);
    for (let i = 0; i < 10; i++) e.ctrl.skip();
    expect(e.ctrl.snapshot.summary).toMatchObject({ total: 10, skipped: 10, clean: 0 });
    expect(e.onRoundDone).toHaveBeenCalledTimes(1);
    e.ctrl.again();
    expect(e.ctrl.snapshot).toMatchObject({ summary: null, index: 0 });
  });

  it('hear it plays the voicing', () => {
    const e = setup();
    e.ctrl.start(settings, C_MAJOR);
    e.ctrl.hearIt();
    expect(e.audio.playAt).toHaveBeenCalledTimes(3);
  });
});
