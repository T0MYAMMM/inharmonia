import { describe, expect, it, vi } from 'vitest';
import { BLOCK, PATTERNS, STRIDE } from '@/content/patterns';
import { getProgression } from '@/content/progressions';
import { FakeClock, Transport } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import { compileLesson } from '@/core/content/compile';
import { realizeProgression } from '@/core/content/realize';
import { NoteStream } from '@/core/input';
import { KeyLights } from '@/state/keyLights';
import { SongController } from './SongController';

const lesson = (key = 'C', pattern = BLOCK) =>
  compileLesson(
    realizeProgression(getProgression('ii-v-i')!, {
      key,
      style: 'close',
      voiceLeading: false,
      pattern,
    }),
    PATTERNS,
  );

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
  const onPlayAlongDone = vi.fn();
  const ctrl = new SongController(lesson(), {
    transport,
    audio: audio as unknown as AudioEngine,
    lights,
    notes,
    onPlayAlongDone,
    initialHands: 'lh',
  });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  ctrl.attach();
  ctrl.setTempo(60); // 1 beat = 1 s
  const hold = (midis: number[]) => midis.forEach((m) => notes.noteOn(m, 0.8, 'keys'));
  const release = () => notes.releaseAll();
  /** Advance the clock and render a frame, like the rAF loop. */
  const tick = (s: number) => {
    clock.advance(s);
    ctrl.renderFrame();
  };
  return { clock, transport, lights, notes, ctrl, hold, release, tick, onPlayAlongDone };
}

const voicing = (ctrl: SongController, i: number) =>
  ctrl.compiled.chords[i]!.voicing.map((n) => n.midi);

describe('Play-along', () => {
  it('counts in one bar by default, no loop, backing muted', () => {
    const e = setup();
    e.ctrl.setMode('playalong');
    expect(e.ctrl.snapshot).toMatchObject({ mode: 'playalong', countInOn: true, backing: false });
    e.ctrl.playPause();
    expect(e.transport.state).toBe('playing');
    expect(e.transport.loopRegion).toBeNull();
    expect(e.transport.isMuted('lh')).toBe(true);
    e.tick(1);
    expect(e.ctrl.snapshot.countIn).toBe(3);
    expect(e.transport.beatAt()).toBeCloseTo(-3, 5);
  });

  it('scores each chord change and finishes with a summary at the tempo played', () => {
    const e = setup();
    e.ctrl.setMode('playalong');
    e.ctrl.playPause();
    e.tick(4.05); // beat 0.05: right on the change
    e.hold(voicing(e.ctrl, 0));
    expect(e.ctrl.snapshot.chordScores['chord-0-0']).toBe('on-time');
    e.release();
    e.tick(4.5); // beat 4.55: G7 late
    e.hold(voicing(e.ctrl, 1));
    expect(e.ctrl.snapshot.chordScores['chord-1-0']).toBe('late');
    e.release();
    // Skip Cmaj7 twice: both missed.
    for (let i = 0; i < 11; i++) e.tick(1); // through beat 16, the end
    e.tick(0.5);
    expect(e.transport.state).toBe('stopped');
    expect(e.ctrl.snapshot.playSummary).toMatchObject({ total: 4, onTime: 1, late: 1, missed: 2 });
    expect(e.onPlayAlongDone).toHaveBeenCalledWith(expect.objectContaining({ total: 4 }), 60);
    expect(e.ctrl.snapshot.chordScores['chord-3-0']).toBe('missed');
  });

  it('lights the chord to play and flashes wrong notes', () => {
    const e = setup();
    e.ctrl.setMode('playalong');
    e.ctrl.setCountIn(false);
    e.ctrl.playPause();
    e.tick(0.5);
    expect(voicing(e.ctrl, 0).every((m) => e.lights.has(m, 'chordTarget'))).toBe(true);
    e.hold([61]); // C# is in neither Dm7 nor G7
    expect(e.lights.has(61, 'wrong')).toBe(true);
  });

  it('backing plays the pattern; stop resets', () => {
    const e = setup();
    e.ctrl.setMode('playalong');
    e.ctrl.setBacking(true);
    expect(e.transport.isMuted('lh')).toBe(false);
    e.ctrl.playPause();
    e.ctrl.playPause();
    expect(e.transport.state).toBe('stopped');
    expect(e.ctrl.snapshot.playSummary).toBeNull();
  });

  it('leaving play-along restores loop and left-hand sound', () => {
    const e = setup();
    e.ctrl.setMode('playalong');
    e.ctrl.setMode('listen');
    expect(e.transport.loopRegion).toEqual({ start: 0, end: 16 });
    expect(e.transport.isMuted('lh')).toBe(false);
  });
});

describe('SongController.load', () => {
  it('swaps the lesson but keeps mode, tempo and hands', () => {
    const e = setup();
    e.ctrl.setMode('practice');
    e.ctrl.setTempo(72);
    e.ctrl.load(lesson('Eb', STRIDE));
    expect(e.ctrl.snapshot).toMatchObject({
      mode: 'practice',
      tempo: 72,
      hands: 'lh',
      chordSymbol: 'Fm7',
    });
    expect(e.ctrl.snapshot.targetChordId).toBe('chord-0-0');
    expect(e.ctrl.target).toMatchObject({ kind: 'chord', chord: { symbol: 'Fm7' } });
  });
});
