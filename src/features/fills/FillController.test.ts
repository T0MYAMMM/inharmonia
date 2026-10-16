import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFill } from '@/content/fills';
import { FakeClock, Transport } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import { compileFillExercise } from '@/core/content/fills';
import { NoteStream } from '@/core/input';
import { KeyLights } from '@/state/keyLights';
import { FillController } from './FillController';

const exercise = (id = 'step-up') =>
  compileFillExercise(getFill(id)!, {
    key: 'C',
    mode: 'major',
    change: { from: 'V7', to: 'I' },
  });

function setup() {
  const clock = new FakeClock();
  const audio = {
    unlock: vi.fn(async () => {}),
    now: () => clock.now(),
    outputLatency: () => 0,
    playAt: vi.fn(),
  };
  const transport = new Transport({
    clock,
    ticker: clock,
    sink: { note: () => {}, click: () => {}, silence: () => {} },
    startDelay: 0,
  });
  const lights = new KeyLights();
  const notes = new NoteStream();
  const onRound = vi.fn();
  const onSpeedSession = vi.fn();
  const ctrl = new FillController(exercise(), {
    transport,
    audio: audio as unknown as AudioEngine,
    lights,
    notes,
    onRound,
    onSpeedSession,
  });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  ctrl.attach();
  const press = (midi: number) => {
    notes.noteOn(midi, 0.8, 'keys');
    notes.noteOff(midi, 'keys');
  };
  /** Advance in small steps until the transport reaches `beat`, rendering frames. */
  const toBeat = (beat: number) => {
    for (let guard = 0; guard < 5000 && transport.beatAt() < beat; guard++) {
      clock.advance(0.005);
      ctrl.renderFrame();
    }
  };
  return { clock, audio, transport, lights, notes, ctrl, press, toBeat, onRound, onSpeedSession };
}

const lit = (lights: KeyLights, layer: 'rh' | 'lh' | 'target') => {
  const out: number[] = [];
  for (let m = 20; m < 100; m++) if (lights.has(m, layer)) out.push(m);
  return out;
};

describe('FillController', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it('listen: loops the two bars and lights the fill over the chord', () => {
    env.ctrl.setTempo(60);
    env.ctrl.playPause();
    env.toBeat(2.05);
    expect(lit(env.lights, 'rh')).toEqual([57]); // A3
    expect(lit(env.lights, 'lh')).toEqual([55, 59, 62, 65]); // G7
    env.toBeat(4.05);
    expect(lit(env.lights, 'rh')).toEqual([60]);
    expect(lit(env.lights, 'lh')).toEqual([48, 52, 55]); // C
    expect(env.ctrl.snapshot.chordIndex).toBe(1);
    expect(env.transport.isMuted('rh')).toBe(false);
  });

  it('practice: waits for each note, rolls the chords in, and counts rounds', () => {
    env.ctrl.setMode('practice');
    expect(lit(env.lights, 'target')).toEqual([57]);
    env.press(57);
    expect(env.audio.playAt).toHaveBeenCalled(); // G7 rolls in
    env.press(62);
    expect(env.ctrl.snapshot.misses).toBe(1);
    env.press(59);
    env.audio.playAt.mockClear();
    env.press(60);
    expect(env.audio.playAt.mock.calls.map((c) => c[0])).toEqual([48, 52, 55]); // C on landing
    expect(env.onRound).toHaveBeenCalledWith({ hits: 3, misses: 1 });
    expect(env.ctrl.snapshot.rounds).toBe(1);
    expect(lit(env.lights, 'target')).toEqual([57]);
  });

  it('speed-up: counts in, scores each time round, speeds up after clean runs', () => {
    env.ctrl.setSpeed({ start: 60, goal: 70, step: 5, needed: 2 });
    env.ctrl.setMode('speed');
    expect(env.transport.isMuted('rh')).toBe(true);
    env.ctrl.playPause();
    expect(env.transport.beatAt()).toBeLessThan(0); // count-in

    const rep = (skip?: number) => {
      for (const h of env.ctrl.exercise.hits) {
        env.toBeat(h.beat);
        if (h.notes[0]!.midi !== skip) for (const n of h.notes) env.press(n.midi);
      }
      env.toBeat(7.95);
      for (let i = 0; i < 40; i++) {
        env.clock.advance(0.005);
        env.ctrl.renderFrame();
      }
    };

    rep();
    expect(env.ctrl.snapshot).toMatchObject({ streak: 1, reps: 1, speedTempo: 60 });
    expect(env.ctrl.snapshot.lastRep).toMatchObject({ clean: true, onTime: 3 });
    rep();
    expect(env.ctrl.snapshot).toMatchObject({ streak: 0, reps: 2, speedTempo: 65, best: 60 });
    expect(env.transport.bpm).toBe(65);
    expect(env.ctrl.snapshot.announcement).toMatch(/Up to 65 bpm/);
    rep(59); // leave out B3
    expect(env.ctrl.snapshot.lastRep).toMatchObject({ clean: false, missed: 1 });
    expect(env.ctrl.snapshot.streak).toBe(0);

    env.ctrl.playPause();
    expect(env.onSpeedSession).toHaveBeenCalledWith({ clean: 2, reps: 3, best: 60 });
    expect(env.transport.state).toBe('stopped');
  });

  it('speed-up: a wrong note spoils the repetition', () => {
    env.ctrl.setSpeed({ start: 60, goal: 70, step: 5, needed: 2 });
    env.ctrl.setMode('speed');
    env.ctrl.playPause();
    env.toBeat(1);
    env.press(70);
    expect(env.lights.has(70, 'wrong')).toBe(true);
  });

  it('load keeps the mode and resets practice', () => {
    env.ctrl.setMode('practice');
    env.press(57);
    env.ctrl.load(exercise('enclosure'));
    expect(env.ctrl.snapshot.mode).toBe('practice');
    expect(lit(env.lights, 'target')).toEqual([62]); // D4
  });
});
