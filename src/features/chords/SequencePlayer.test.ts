import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { FakeClock, Transport } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import {
  chartToLesson,
  EMPTY_SEQUENCE,
  readChords,
  sequenceChart,
  sequenceView,
  type ChordSequence,
} from '@/core/charts';
import { compileLesson } from '@/core/content/compile';
import { KeyLights } from '@/state/keyLights';
import { SequencePlayer } from './SequencePlayer';

/** A sequence played with the right hand only, so the lit keys are each chord's voicing. */
function compiled(text: string, beats: 3 | 4 = 4) {
  const seq: ChordSequence = {
    ...EMPTY_SEQUENCE,
    meter: { beats, unit: 4 },
    bars: readChords(text, beats, 32).bars,
    style: 'held',
  };
  return compileLesson(chartToLesson('seq', sequenceChart(seq), sequenceView(seq)), PATTERNS);
}

function setup() {
  const clock = new FakeClock();
  const clicks: number[] = [];
  const transport = new Transport({
    clock,
    ticker: clock,
    sink: { note: () => {}, click: (time) => clicks.push(time), silence: () => {} },
    startDelay: 0,
  });
  const audio = {
    unlock: vi.fn(async () => {}),
    now: () => clock.now(),
    outputLatency: () => 0,
  };
  const lights = new KeyLights();
  const player = new SequencePlayer({
    transport,
    audio: audio as unknown as AudioEngine,
    lights,
  });
  /** Move time on and draw a frame, as the page's animation frame would. */
  const advance = (seconds: number) => {
    clock.advance(seconds);
    player.renderFrame();
  };
  return { clock, transport, audio, lights, player, advance, clicks };
}

const lit = (lights: KeyLights) => {
  const out: number[] = [];
  for (let m = 20; m < 100; m++) if (lights.has(m, 'lh')) out.push(m);
  return out;
};

/** The voicing of the chord in bar `bar`, as MIDI. */
const voicing = (c: ReturnType<typeof compiled>, bar: number) =>
  c.chords.find((ch) => ch.barIndex === bar)!.voicing.map((n) => n.midi);

describe('SequencePlayer', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    env = setup();
  });

  it('plays from bar 1, lighting each chord and following the bar', () => {
    const c = compiled('C Am F G');
    env.player.load(c);
    env.player.setTempo(120); // a bar every 2 seconds
    env.player.play();
    expect(env.audio.unlock).toHaveBeenCalled();
    expect(env.player.snapshot).toEqual({ playing: true, bar: 0 });
    env.advance(0.1);
    expect(lit(env.lights)).toEqual(voicing(c, 0));
    env.advance(2);
    expect(env.player.snapshot.bar).toBe(1);
    expect(lit(env.lights)).toEqual(voicing(c, 1));
    expect(voicing(c, 1)).not.toEqual(voicing(c, 0));
  });

  it('loops back to bar 1, and keeps going', () => {
    env.player.load(compiled('C Am'));
    env.player.setTempo(120);
    env.player.play();
    env.advance(4.5);
    expect(env.player.snapshot).toEqual({ playing: true, bar: 0 });
    expect(env.transport.state).toBe('playing');
  });

  it('without the loop, stops at the end and puts its lights out', () => {
    env.player.load(compiled('C Am'));
    env.player.setTempo(120);
    env.player.setLoop(false);
    env.player.play();
    env.advance(1);
    expect(lit(env.lights).length).toBeGreaterThan(0);
    env.advance(3.5);
    expect(env.player.snapshot).toEqual({ playing: false, bar: null });
    expect(env.transport.state).toBe('stopped');
    expect(lit(env.lights)).toEqual([]);
  });

  it('never touches the lights while stopped, so the chord builder keeps its chord', () => {
    const builder = [63, 67, 70, 74];
    env.lights.setExactly('lh', builder);
    env.player.load(compiled('C Am'));
    env.player.setTempo(90);
    env.player.setLoop(false);
    env.player.renderFrame();
    env.player.stop();
    env.player.load(null);
    expect(lit(env.lights)).toEqual(builder);

    env.player.load(compiled('C Am'));
    env.player.play();
    env.advance(0.1);
    expect(lit(env.lights)).not.toEqual(builder);
    env.player.stop();
    expect(lit(env.lights)).toEqual([]);
    // The builder lights its chord again; nothing the player does now changes that.
    env.lights.setExactly('lh', builder);
    env.advance(1);
    env.player.stop();
    env.player.load(compiled('F'));
    expect(lit(env.lights)).toEqual(builder);
  });

  it('hears an edit from the next note, without starting again', () => {
    env.player.load(compiled('C Am F G'));
    env.player.setTempo(120);
    env.player.play();
    env.advance(1);
    const beat = env.transport.beatAt();
    const edited = compiled('C Am Dm G');
    env.player.load(edited);
    expect(env.transport.beatAt()).toBeCloseTo(beat, 6);
    env.advance(3.5); // into bar 3
    expect(env.player.snapshot.bar).toBe(2);
    expect(lit(env.lights)).toEqual(voicing(edited, 2));
  });

  it('starts again from bar 1 when the bars under the playhead are gone', () => {
    env.player.load(compiled('C Am F G'));
    env.player.setTempo(120);
    env.player.play();
    env.advance(6.5); // bar 4
    expect(env.player.snapshot.bar).toBe(3);
    env.player.load(compiled('C Am'));
    env.advance(0.1);
    expect(env.player.snapshot).toEqual({ playing: true, bar: 0 });
  });

  it('starts again from bar 1 when the meter changes', () => {
    env.player.load(compiled('C Am F G'));
    env.player.setTempo(120);
    env.player.play();
    env.advance(2.5); // bar 2, beat 1 of 4/4
    env.player.load(compiled('C Am F G', 3));
    expect(env.transport.beatsPerBar).toBe(3);
    env.advance(0.1);
    expect(env.player.snapshot).toEqual({ playing: true, bar: 0 });
  });

  it('stops when the sequence is emptied', () => {
    env.player.load(compiled('C'));
    env.player.play();
    env.advance(0.2);
    env.player.load(null);
    expect(env.player.snapshot.playing).toBe(false);
    expect(env.transport.state).toBe('stopped');
    expect(lit(env.lights)).toEqual([]);
  });

  it('changes tempo as it plays', () => {
    env.player.load(compiled('C Am'));
    env.player.setTempo(80);
    env.player.play();
    expect(env.transport.bpm).toBe(80);
    env.player.setTempo(140);
    expect(env.transport.bpm).toBe(140);
  });

  it('plays nothing until there is a sequence', () => {
    env.player.play();
    expect(env.player.snapshot.playing).toBe(false);
    expect(env.transport.state).toBe('stopped');
  });

  it('plays every chord with no click, whatever another player left set', () => {
    env.transport.setMetronome(true, 1);
    env.transport.setMuted('lh', true);
    env.player.load(compiled('C Am'));
    env.player.play();
    env.advance(2);
    expect(env.clicks).toEqual([]);
    expect(env.transport.isMuted('lh')).toBe(false);
  });

  it('stops the transport when the page lets it go', () => {
    const heard = vi.fn();
    env.player.subscribe(heard);
    env.player.load(compiled('C'));
    env.player.play();
    env.player.detach();
    expect(env.transport.state).toBe('stopped');
    heard.mockClear();
    env.player.load(compiled('C'));
    env.player.play();
    expect(heard).not.toHaveBeenCalled();
  });
});
