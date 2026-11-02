import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, EARLY_STALE_S } from './engine';

/** A stand-in for Tone.js that records what the engine plays. */
const tone = vi.hoisted(() => {
  const played: { kind: 'note' | 'click'; freq: number; time: number }[] = [];
  class Node {
    connect() {
      return this;
    }
    chain() {
      return this;
    }
  }
  class Volume extends Node {
    volume = { value: 0 };
  }
  class PolySynth extends Node {
    maxPolyphony = 0;
    triggerAttackRelease(freq: number, _dur: number, time: number) {
      played.push({ kind: 'note', freq, time });
    }
    releaseAll() {}
  }
  class Synth extends Node {
    triggerAttackRelease(freq: number, _dur: number, time: number) {
      played.push({ kind: 'click', freq, time });
    }
  }
  return {
    played,
    module: {
      setContext: () => undefined,
      Context: class {},
      Volume,
      Compressor: Node,
      Limiter: Node,
      getDestination: () => ({}),
      PolySynth,
      Synth,
      ToneAudioBuffer: class {},
      Sampler: Node,
      immediate: () => 0,
    },
  };
});
vi.mock('tone', () => tone.module);

/** The engine reads the clock from its context; tests move it by hand. */
class FakeContext {
  static last: FakeContext | null = null;
  state = 'running';
  currentTime = 0;
  baseLatency = 0;
  outputLatency = 0;
  sampleRate = 48000;
  constructor() {
    FakeContext.last = this;
  }
  resume() {
    return Promise.resolve();
  }
}

const C4 = 440 * 2 ** ((60 - 69) / 12);
const E4 = 440 * 2 ** ((64 - 69) / 12);
const G4 = 440 * 2 ** ((67 - 69) / 12);

/** Unlock, then run the clock to `now` before Tone finishes loading. */
async function loadAt(engine: AudioEngine, now: number) {
  FakeContext.last!.currentTime = now;
  await engine.unlock();
}

describe('AudioEngine before Tone has loaded', () => {
  beforeEach(() => {
    tone.played.length = 0;
    vi.stubGlobal('AudioContext', FakeContext);
    // Samples never arrive, so everything plays on the synth.
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('holds notes and clicks, then plays them on time, or now if a little late', async () => {
    const engine = new AudioEngine('/');
    const loading = engine.unlock();
    engine.click(0.06, true);
    engine.playAt(60, 0.06, 0.5);
    engine.playAt(64, 0.9, 0.5);
    expect(tone.played).toEqual([]);

    FakeContext.last!.currentTime = 0.4;
    await loading;
    expect(tone.played).toEqual([
      { kind: 'click', freq: 1760, time: 0.4 },
      { kind: 'note', freq: C4, time: 0.4 },
      { kind: 'note', freq: E4, time: 0.9 },
    ]);
  });

  it('drops what is stale by the time Tone is ready', async () => {
    const engine = new AudioEngine('/');
    void engine.unlock();
    engine.playAt(60, 0.06, 0.5);
    engine.playAt(67, 0.7, 0.5);
    await loadAt(engine, 0.06 + EARLY_STALE_S + 0.01);
    expect(tone.played).toEqual([{ kind: 'note', freq: G4, time: 0.7 }]);
  });

  it('forgets what it held when everything is released', async () => {
    const engine = new AudioEngine('/');
    void engine.unlock();
    engine.playAt(60, 0.06, 0.5);
    engine.click(0.06, false);
    engine.releaseAll();
    await loadAt(engine, 0.1);
    expect(tone.played).toEqual([]);
  });

  it('holds nothing before it is unlocked: there is no clock yet', async () => {
    const engine = new AudioEngine('/');
    engine.playAt(60, 0.06, 0.5);
    void engine.unlock();
    await loadAt(engine, 0);
    expect(tone.played).toEqual([]);
  });

  it('plays straight away once Tone has loaded', async () => {
    const engine = new AudioEngine('/');
    await engine.unlock();
    engine.playAt(60, 1, 0.5);
    expect(tone.played).toEqual([{ kind: 'note', freq: C4, time: 1 }]);
  });
});
