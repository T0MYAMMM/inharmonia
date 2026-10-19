import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { SENJA_DI_TERAS } from '@/content/songs/senjaDiTeras';
import { FakeClock, Transport } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import { compileLesson } from '@/core/content/compile';
import { compileSongArrangement, DEFAULT_SONG_ARRANGEMENT } from '@/core/content/songArrangement';
import { NoteStream } from '@/core/input';
import { KeyLights } from '@/state/keyLights';
import { SongController } from './SongController';

const compiled = compileLesson(SENJA_DI_TERAS, PATTERNS);

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
  const onFinished = vi.fn();
  const ctrl = new SongController(compiled, {
    transport,
    audio: audio as unknown as AudioEngine,
    lights,
    notes,
    onFinished,
  });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  ctrl.attach();
  const press = (midi: number) => {
    notes.noteOn(midi, 0.8, 'keys');
    notes.noteOff(midi, 'keys');
  };
  const pressTarget = () => {
    const t = ctrl.target!;
    if (t.kind !== 'note') throw new Error('expected a note target');
    press(t.note.note!.midi);
  };
  /** Hold several notes (for chords), then release them. */
  const playChord = (midis: number[]) => {
    for (const m of midis) notes.noteOn(m, 0.8, 'keys');
    for (const m of midis) notes.noteOff(m, 'keys');
  };
  return {
    clock,
    audio,
    transport,
    lights,
    notes,
    ctrl,
    press,
    pressTarget,
    playChord,
    onFinished,
  };
}

const lit = (lights: KeyLights, layer: 'rh' | 'lh' | 'target' | 'chordTarget') => {
  const out: number[] = [];
  for (let m = 20; m < 100; m++) if (lights.has(m, layer)) out.push(m);
  return out;
};

describe('SongController, Listen', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it('starts at 76 bpm with loop, melody and left hand on', () => {
    expect(env.ctrl.snapshot).toMatchObject({
      mode: 'listen',
      tempo: 76,
      loop: true,
      rhOn: true,
      lhOn: true,
    });
    expect(env.transport.loopRegion).toEqual({ start: 0, end: 64 });
  });

  it('lights the notes actually sounding in the broken-chord accompaniment', () => {
    env.ctrl.playPause();
    env.clock.advance(0.1); // beat 0.13: only the first arpeggio note has started
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([38]); // D2
    env.clock.advance(0.4); // beat 0.63: the second note joins, first is sustained
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'rh')).toEqual([69]);
    expect(lit(env.lights, 'lh')).toEqual([38, 45]); // D2 and A2, not all Dmaj7 tones
    expect(env.ctrl.snapshot.activeChipId).toBe('rh-0-0');
    env.clock.advance(0.8); // beat 1.65: all four notes have entered
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([38, 45, 49, 54]);
  });

  it('matches block-chord attacks and releases after choosing another arrangement', () => {
    env.ctrl.load(
      compileSongArrangement(SENJA_DI_TERAS, {
        ...DEFAULT_SONG_ARRANGEMENT,
        pattern: 'block',
        chordOctave: 1,
      }),
    );
    env.ctrl.playPause();
    env.clock.advance(0.2); // beat 0.25: all chord tones sustain
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([50, 57, 61, 66]);
    env.clock.advance(0.54); // beat 0.94: the 0.9 beat notes have released
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([]);
    env.clock.advance(0.1); // beat 1.06: the next attack
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([50, 57, 61, 66]);
  });

  it('does not display a chord during rests in an accompaniment pattern', () => {
    env.ctrl.load(
      compileSongArrangement(SENJA_DI_TERAS, {
        ...DEFAULT_SONG_ARRANGEMENT,
        pattern: 'alberti',
      }),
    );
    env.ctrl.playPause();
    env.clock.advance(0.1);
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([38]);
    env.clock.advance(0.4);
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([54]);
  });

  it('keeps the chip marked but clears keys when paused, and resumes from there', () => {
    env.ctrl.playPause();
    env.clock.advance(2);
    env.ctrl.renderFrame();
    const chip = env.ctrl.snapshot.activeChipId;
    env.ctrl.playPause();
    env.ctrl.renderFrame();
    expect(env.ctrl.snapshot.transport).toBe('paused');
    expect(env.ctrl.snapshot.activeChipId).toBe(chip);
    expect(lit(env.lights, 'rh')).toEqual([]);
    expect(lit(env.lights, 'lh')).toEqual([]);
    const at = env.transport.beatAt();
    env.ctrl.playPause();
    expect(env.transport.beatAt()).toBeCloseTo(at, 6);
  });

  it('restart goes to 0, and keeps playing if it was playing', () => {
    env.ctrl.playPause();
    env.clock.advance(5);
    env.ctrl.restart();
    expect(env.transport.state).toBe('playing');
    expect(env.transport.beatAt()).toBeCloseTo(0, 6);
    env.ctrl.playPause();
    env.ctrl.restart();
    expect(env.transport.state).toBe('stopped');
    env.ctrl.renderFrame();
    expect(env.ctrl.snapshot.activeChipId).toBeNull();
  });

  it('plays from a clicked bar', () => {
    env.ctrl.selectBar(8);
    env.clock.advance(0.1);
    env.ctrl.renderFrame();
    expect(env.ctrl.snapshot.bar).toBe(8);
    expect(env.transport.state).toBe('playing');
  });

  it('stops after the last beat with loop off and resets to 0', () => {
    env.ctrl.setLoop(false);
    env.ctrl.selectBar(15);
    env.clock.advance(4 * (60 / 76) + 0.2);
    env.ctrl.renderFrame();
    expect(env.transport.state).toBe('stopped');
    expect(env.ctrl.snapshot).toMatchObject({ activeChipId: null, bar: 0 });
  });

  it('mutes a hand without stopping, and stops lighting it', () => {
    env.ctrl.playPause();
    env.ctrl.setHand('lh', false);
    expect(lit(env.lights, 'lh')).toEqual([]);
    env.clock.advance(0.5);
    env.ctrl.renderFrame();
    expect(env.transport.isMuted('lh')).toBe(true);
    expect(env.transport.state).toBe('playing');
    expect(lit(env.lights, 'lh')).toEqual([]);
  });
});

describe('SongController, Practice', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it('entering practice stops playback and targets the first note of the current bar', () => {
    env.ctrl.selectBar(2);
    env.clock.advance(1.5); // inside bar 3
    env.ctrl.setMode('practice');
    expect(env.transport.state).toBe('stopped');
    expect(env.ctrl.snapshot).toMatchObject({ mode: 'practice', bar: 2, activeChipId: null });
    expect(env.ctrl.snapshot.targetChipId).toBe('rh-2-0');
    expect(lit(env.lights, 'target')).toEqual([64]); // E4
    expect(lit(env.lights, 'lh')).toEqual([40, 47, 50, 55]); // Em7: E2 B2 D3 G3
  });

  it('play and restart do nothing in practice', () => {
    env.ctrl.setMode('practice');
    env.ctrl.playPause();
    env.ctrl.restart();
    expect(env.transport.state).toBe('stopped');
  });

  it('counts a hit, advances, and rolls the chord at a new segment', () => {
    env.ctrl.setMode('practice');
    env.pressTarget();
    expect(env.ctrl.snapshot).toMatchObject({ hits: 1, targetIndex: 1 });
    const rolled = env.audio.playAt.mock.calls.map((c) => [
      c[0],
      Number((c[1] as number).toFixed(3)),
    ]);
    expect(rolled.map((r) => r[0])).toEqual([38, 45, 49, 54]);
    expect(rolled[1]![1] - rolled[0]![1]).toBeCloseTo(0.035, 3);
    env.audio.playAt.mockClear();
    env.pressTarget(); // F#4, same chord: no roll
    expect(env.audio.playAt).not.toHaveBeenCalled();
  });

  it('does not roll with the left hand off', () => {
    env.ctrl.setMode('practice');
    env.ctrl.setHand('lh', false);
    expect(lit(env.lights, 'lh')).toEqual([]);
    env.pressTarget();
    expect(env.audio.playAt).not.toHaveBeenCalled();
  });

  it('counts a miss, flashes the key red and keeps the target', () => {
    env.ctrl.setMode('practice');
    env.press(60);
    expect(env.ctrl.snapshot).toMatchObject({ misses: 1, targetIndex: 0 });
    expect(env.lights.has(60, 'wrong')).toBe(true);
  });

  it('finishes, reports the counts and resets to the start', () => {
    env.ctrl.setMode('practice');
    env.press(1);
    const total = env.ctrl['session'].targets.length;
    for (let i = 0; i < total; i++) env.pressTarget();
    expect(env.onFinished).toHaveBeenCalledWith({ hits: total, misses: 1 });
    expect(env.ctrl.snapshot).toMatchObject({
      finished: { hits: total, misses: 1 },
      hits: 0,
      misses: 0,
      targetIndex: 0,
    });
    env.pressTarget();
    expect(env.ctrl.snapshot.finished).toBeNull();
  });

  it('a bar click moves the target without resetting counts; start over resets', () => {
    env.ctrl.setMode('practice');
    env.press(1);
    env.ctrl.selectBar(9);
    expect(env.ctrl.snapshot).toMatchObject({ targetChipId: 'rh-9-0', misses: 1, bar: 9 });
    env.ctrl.startOver();
    expect(env.ctrl.snapshot).toMatchObject({ targetIndex: 0, hits: 0, misses: 0 });
  });

  it('hear it plays the target note', () => {
    env.ctrl.setMode('practice');
    env.ctrl.hearIt();
    expect(env.audio.playAt).toHaveBeenCalledWith(69, expect.any(Number), 0.55, 0.5);
  });

  it('back to listen clears the target and parks at the target bar', () => {
    env.ctrl.setMode('practice');
    env.ctrl.selectBar(5);
    env.ctrl.setMode('listen');
    expect(lit(env.lights, 'target')).toEqual([]);
    expect(env.transport.state).toBe('paused');
    expect(env.transport.beatAt()).toBe(20);
  });
});

describe('SongController, left-hand and both-hands practice', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
    env.ctrl.setMode('practice');
  });

  it('left hand: targets the chord, plays the segment melody on a hit', () => {
    env.ctrl.setHands('lh');
    expect(env.ctrl.snapshot).toMatchObject({
      hands: 'lh',
      targetChordId: 'chord-0-0',
      targetChipId: null,
    });
    expect(lit(env.lights, 'chordTarget')).toEqual([38, 45, 49, 54]);
    expect(lit(env.lights, 'target')).toEqual([]);
    env.playChord([50, 54, 57, 61]); // Dmaj7 an octave up: any inversion is fine
    expect(env.ctrl.snapshot).toMatchObject({ hits: 1, targetChordId: 'chord-1-0' });
    // Bar 1 melody (A4 F#4 E4 F#4 A4) plays along.
    expect(env.audio.playAt.mock.calls.map((c) => c[0])).toEqual([69, 66, 64, 66, 69]);
  });

  it('left hand: a non-chord tone is a miss; with melody off nothing plays along', () => {
    env.ctrl.setHands('lh');
    env.ctrl.setHand('rh', false);
    env.press(51);
    expect(env.ctrl.snapshot.misses).toBe(1);
    env.playChord([50, 54, 57, 61]);
    expect(env.audio.playAt).not.toHaveBeenCalled();
  });

  it('both hands: needs the chord with the first note of each chord', () => {
    env.ctrl.setHands('both');
    expect(lit(env.lights, 'target')).toEqual([69]);
    expect(lit(env.lights, 'lh')).toEqual([38, 45, 49, 54]);
    env.press(69); // melody alone is not enough here
    expect(env.ctrl.snapshot.hits).toBe(0);
    env.playChord([50, 54, 61, 69]);
    expect(env.ctrl.snapshot).toMatchObject({ hits: 1, misses: 0, targetChipId: 'rh-0-1' });
    env.press(66); // F#4, same chord: melody alone is enough
    expect(env.ctrl.snapshot.hits).toBe(2);
  });

  it('switching hands keeps the place and resets the counts', () => {
    env.ctrl.selectBar(5);
    env.press(1);
    env.ctrl.setHands('lh');
    expect(env.ctrl.snapshot).toMatchObject({ bar: 5, misses: 0, targetChordId: 'chord-5-0' });
  });

  it('hear it plays the chord in left-hand practice', () => {
    env.ctrl.setHands('lh');
    env.ctrl.hearIt();
    expect(env.audio.playAt.mock.calls.map((c) => c[0])).toEqual([38, 45, 49, 54]);
  });
});
