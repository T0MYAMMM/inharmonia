import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { getSong } from '@/content/lessons';
import { FakeClock, Transport } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import { compileLesson } from '@/core/content/compile';
import { compileSongArrangement, DEFAULT_SONG_ARRANGEMENT } from '@/core/content/songArrangement';
import { NoteStream } from '@/core/input';
import { KeyLights } from '@/state/keyLights';
import { SongController } from './SongController';

/**
 * Ode to Joy, Medium (D major, 24 bars, 100 bpm) with the broken-chord left
 * hand, as ?pattern=arpeggio-8ths plays it. At 100 bpm a beat is 0.6 seconds.
 */
const ODE = { ...getSong('ode-to-joy-medium')!, lhPattern: 'arpeggio-8ths' };
const compiled = compileLesson(ODE, PATTERNS);

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

  it('starts at 100 bpm with loop, melody and left hand on', () => {
    expect(env.ctrl.snapshot).toMatchObject({
      mode: 'listen',
      tempo: 100,
      loop: true,
      rhOn: true,
      lhOn: true,
    });
    expect(env.transport.loopRegion).toEqual({ start: 0, end: 96 });
  });

  it('lights the notes actually sounding in the broken-chord accompaniment', () => {
    env.ctrl.playPause();
    env.clock.advance(0.1); // beat 0.17: only the first arpeggio note has started
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([50]); // D3
    env.clock.advance(0.4); // beat 0.83: the second note joins, first is sustained
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'rh')).toEqual([66]);
    expect(lit(env.lights, 'lh')).toEqual([50, 54]); // D3 and F#3, not all D tones
    expect(env.ctrl.snapshot.activeChipId).toBe('rh-0-0');
    env.clock.advance(0.3); // beat 1.33: all three notes have entered
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([50, 54, 57]);
  });

  it('matches block-chord attacks and releases after choosing another arrangement', () => {
    env.ctrl.load(
      compileSongArrangement(ODE, {
        ...DEFAULT_SONG_ARRANGEMENT,
        pattern: 'block',
        chordOctave: 1,
      }),
    );
    env.ctrl.playPause();
    env.clock.advance(0.15); // beat 0.25: all chord tones sustain
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([62, 66, 69]);
    env.clock.advance(0.42); // beat 0.95: the 0.9 beat notes have released
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([]);
    env.clock.advance(0.07); // beat 1.07: the next attack
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([62, 66, 69]);
  });

  it('does not display a chord during rests in an accompaniment pattern', () => {
    env.ctrl.load(
      compileSongArrangement(ODE, {
        ...DEFAULT_SONG_ARRANGEMENT,
        pattern: 'alberti',
      }),
    );
    env.ctrl.playPause();
    env.clock.advance(0.1);
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([50]);
    env.clock.advance(0.2);
    env.ctrl.renderFrame();
    expect(lit(env.lights, 'lh')).toEqual([57]);
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
    env.ctrl.selectBar(23);
    env.clock.advance(4 * (60 / 100) + 0.2);
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
    expect(lit(env.lights, 'target')).toEqual([62]); // D4
    expect(lit(env.lights, 'lh')).toEqual([55, 59, 62]); // G: G3 B3 D4
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
    expect(rolled.map((r) => r[0])).toEqual([50, 54, 57]);
    expect(rolled[1]![1] - rolled[0]![1]).toBeCloseTo(0.035, 3);
    env.audio.playAt.mockClear();
    env.pressTarget(); // G4 starts bar 1's second D, so it rolls again
    expect(env.audio.playAt.mock.calls.map((c) => c[0])).toEqual([50, 54, 57]);
    env.audio.playAt.mockClear();
    env.pressTarget(); // A4, same chord: no roll
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

  it('says what was expected on a miss, counting repeats so each one is heard', () => {
    env.ctrl.setMode('practice');
    expect(env.ctrl.snapshot.feedback).toBe('');
    env.press(60);
    expect(env.ctrl.snapshot).toMatchObject({
      feedback: 'Not quite: play F#4, the amber key.',
      announcement: 'Not quite: play F#4, the amber key.',
    });
    env.press(60);
    expect(env.ctrl.snapshot.feedback).toBe('Not quite: play F#4, the amber key. 2 missed.');
  });

  it('says what was played and what comes next on a hit, with "again" for a repeat', () => {
    env.ctrl.setMode('practice');
    env.pressTarget(); // bar 1: F#4, G4, A4
    expect(env.ctrl.snapshot.feedback).toBe('F#4. Next: G4.');
    env.pressTarget();
    expect(env.ctrl.snapshot.feedback).toBe('G4. Next: A4.');
    // The first place the melody strikes the same note twice: walk there from its bar.
    const struck = compiled.bars.flatMap((b) =>
      b.rh.filter((n) => n.note && !n.tiedFrom).map((n) => ({ bar: b.index, name: n.note!.name })),
    );
    const i = struck.findIndex(
      (n, k) =>
        k > 0 && struck[k - 1]!.name !== n.name && struck[k + 1]?.name === n.name && struck[k + 2],
    );
    expect(i).toBeGreaterThan(-1);
    env.ctrl.selectBar(struck[i]!.bar);
    for (let k = struck.findIndex((n) => n.bar === struck[i]!.bar); k < i; k++) env.pressTarget();
    env.pressTarget();
    expect(env.ctrl.snapshot.feedback).toBe(`${struck[i]!.name}. Next: ${struck[i]!.name}.`);
    env.pressTarget();
    expect(env.ctrl.snapshot.feedback).toBe(
      `${struck[i]!.name} again. Next: ${struck[i + 2]!.name}.`,
    );
  });

  it('names notes and chords through the names it is given', () => {
    env.ctrl.setNames({
      note: (n) => ({
        text: n.note!.name.replace(/\d+$/, '').replace('#', '♯'),
        spoken: 'ef sharp',
      }),
      chord: (s) => `${s} major`,
    });
    env.ctrl.setMode('practice');
    env.press(60);
    expect(env.ctrl.snapshot).toMatchObject({
      feedback: 'Not quite: play F♯, the amber key.',
      announcement: 'Not quite: play ef sharp, the amber key.',
    });
    env.ctrl.setHands('lh');
    env.press(51);
    expect(env.ctrl.snapshot.feedback).toBe('Not quite: play D major, the ringed keys.');
  });

  it('clears the words when the mode or the hand changes, and on start over says so', () => {
    env.ctrl.setMode('practice');
    env.press(60);
    env.ctrl.setHands('lh');
    expect(env.ctrl.snapshot).toMatchObject({ feedback: '', announcement: '' });
    env.press(51);
    expect(env.ctrl.snapshot.feedback).not.toBe('');
    env.ctrl.setMode('listen');
    expect(env.ctrl.snapshot).toMatchObject({ feedback: '', announcement: '' });
    env.ctrl.setMode('practice');
    expect(env.ctrl.snapshot.feedback).toBe('');
    env.ctrl.startOver();
    expect(env.ctrl.snapshot.feedback).toBe('Back to the first note.');
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
    expect(env.audio.playAt).toHaveBeenCalledWith(66, expect.any(Number), 0.55, 0.5);
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

describe('SongController, play-along', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
    env.ctrl.setMode('playalong');
  });

  it('says the count-in as it runs, then lets the chords speak', () => {
    env.ctrl.playPause(); // one bar of count-in at 100 bpm: 4 beats, 0.6 s each
    env.ctrl.renderFrame();
    expect(env.ctrl.snapshot).toMatchObject({ countIn: 4, feedback: 'Count-in, 4.' });
    env.clock.advance(1.5);
    env.ctrl.renderFrame();
    expect(env.ctrl.snapshot).toMatchObject({ countIn: 2, feedback: 'Count-in, 2.' });
    env.clock.advance(1.2);
    env.ctrl.renderFrame();
    expect(env.ctrl.snapshot).toMatchObject({ countIn: null, feedback: '' });
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
    expect(lit(env.lights, 'chordTarget')).toEqual([50, 54, 57]);
    expect(lit(env.lights, 'target')).toEqual([]);
    env.playChord([62, 66, 69]); // D an octave up: any octave is fine
    expect(env.ctrl.snapshot).toMatchObject({ hits: 1, targetChordId: 'chord-0-1' });
    // The melody under that first D (a held F#4) plays along.
    expect(env.audio.playAt.mock.calls.map((c) => c[0])).toEqual([66]);
  });

  it('left hand: a non-chord tone is a miss; with melody off nothing plays along', () => {
    env.ctrl.setHands('lh');
    env.ctrl.setHand('rh', false);
    env.press(51);
    expect(env.ctrl.snapshot.misses).toBe(1);
    env.playChord([62, 66, 69]);
    expect(env.audio.playAt).not.toHaveBeenCalled();
  });

  it('both hands: needs the chord with the first note of each chord', () => {
    env.ctrl.setHands('both');
    expect(lit(env.lights, 'target')).toEqual([66]);
    expect(lit(env.lights, 'lh')).toEqual([50, 54, 57]);
    env.press(66); // melody alone is not enough here
    expect(env.ctrl.snapshot.hits).toBe(0);
    env.playChord([50, 57, 66]);
    expect(env.ctrl.snapshot).toMatchObject({ hits: 1, misses: 0, targetChipId: 'rh-0-1' });
    env.playChord([50, 54, 57, 67]); // G4 starts the second D: the chord again
    expect(env.ctrl.snapshot.hits).toBe(2);
    env.press(69); // A4, same chord: melody alone is enough
    expect(env.ctrl.snapshot.hits).toBe(3);
  });

  it('left hand: says how many notes are still to hold', () => {
    env.ctrl.setHands('lh');
    env.notes.noteOn(62, 0.8, 'keys'); // D, held
    expect(env.ctrl.snapshot.feedback).toBe('2 more notes.');
    env.notes.noteOn(66, 0.8, 'keys'); // F#, held too
    expect(env.ctrl.snapshot.feedback).toBe('One more note.');
    env.notes.noteOn(69, 0.8, 'keys'); // A completes D
    expect(env.ctrl.snapshot).toMatchObject({ hits: 1, feedback: 'D. Next: D.' });
    for (const m of [62, 66, 69]) env.notes.noteOff(m, 'keys');
    env.playChord([62, 66, 69]);
    expect(env.ctrl.snapshot.feedback).toBe('D again. Next: G.');
  });

  it('both hands: says to hold the chord, or that the melody note is missing', () => {
    env.ctrl.setHands('both');
    env.notes.noteOn(66, 0.8, 'keys'); // the melody note alone
    expect(env.ctrl.snapshot.feedback).toBe('Hold D with it: 2 more notes.');
    env.notes.noteOff(66, 'keys');
    env.notes.noteOn(50, 0.8, 'keys'); // a chord tone without the melody
    expect(env.ctrl.snapshot.feedback).toBe('Now the melody note, F#4.');
    env.notes.noteOff(50, 'keys');
    env.press(60); // a wrong note: the chord is due with this note
    expect(env.ctrl.snapshot.feedback).toBe('Not quite: play F#4 with D.');
    env.playChord([50, 57, 66]);
    // G4 starts the bar's second D, so the chord is due with it too.
    expect(env.ctrl.snapshot.feedback).toBe('F#4 with D. Next: G4 with D.');
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
    expect(env.audio.playAt.mock.calls.map((c) => c[0])).toEqual([50, 54, 57]);
  });
});
