import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock, Transport } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import { draftMelody } from '@/core/transcription';
import { FIXTURE_SPECS, seeded, synthesize } from '@/core/transcription/fixtures';
import { createInlineAnalyzer } from './capture/analysis';
import { MicError, type CaptureBlock, type Microphone } from './capture/microphone';
import { StudioController } from './StudioController';

const SR = 22050;

function setup(opts: { latency?: number | null; openFails?: string } = {}) {
  const clock = new FakeClock();
  clock.time = 5;
  const transport = new Transport({
    clock,
    ticker: clock,
    sink: { note: () => {}, click: () => {}, silence: () => {} },
    startDelay: 0,
  });
  const listeners = new Set<(b: CaptureBlock) => void>();
  const mic = {
    sampleRate: SR,
    label: () => 'Test mic',
    reportedLatency: () => 0,
    onBlock: (l: (b: CaptureBlock) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    close: vi.fn(),
  } as unknown as Microphone;
  const audio = {
    unlock: vi.fn(async () => {}),
    context: () => ({ currentTime: clock.now() }) as AudioContext,
    now: () => clock.now(),
    outputLatency: () => 0,
  } as unknown as AudioEngine;
  const saveLatency = vi.fn();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const ctrl = new StudioController({
    transport,
    audio,
    analyzer: createInlineAnalyzer(),
    openMic: async () => {
      if (opts.openFails) {
        const e = new MicError(opts.openFails as never, 'nope');
        throw e;
      }
      return mic;
    },
    latencyMs: () => (opts.latency === undefined ? 0 : opts.latency),
    saveLatency,
    restoreMetronome: vi.fn(),
  });
  /** Feed samples as capture blocks, starting at the clock's current context time. */
  const feed = (samples: Float32Array) => {
    let frame = Math.round(clock.now() * SR);
    for (let i = 0; i < samples.length; i += 1024) {
      const data = samples.slice(i, i + 1024);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v));
      for (const l of listeners) l({ frame, data, peak });
      frame += data.length;
    }
  };
  return { clock, transport, ctrl, feed, saveLatency, mic };
}

describe('StudioController', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it('records against the click and lines the take up with beat 0', async () => {
    const fx = synthesize({ ...FIXTURE_SPECS[0]!, sampleRate: SR });
    await env.ctrl.enable();
    expect(env.ctrl.snapshot).toMatchObject({ phase: 'ready', device: 'Test mic' });
    await env.ctrl.record({ tempo: fx.spec.tempo, beatsPerBar: 4, bars: 4 });
    expect(env.ctrl.snapshot.phase).toBe('counting');
    // The fixture's lead-in is one bar, the same as the count-in.
    env.feed(fx.audio.samples);
    env.ctrl.stop();
    await vi.waitFor(() => expect(env.ctrl.snapshot.phase).toBe('done'));
    const take = env.ctrl.snapshot.take!;
    expect(take.timing.beat0).toBeCloseTo(fx.timing.beat0, 2);
    expect(take.timing.bars).toBe(4);
    expect(take.latencySource).toBe('calibrated');
    const draft = draftMelody(take.events, take.timing);
    expect(draft.key).toEqual({ tonic: 'C', mode: 'major' });
    expect(draft.grid.notes.slice(0, 8).map((n) => [n.startBeat, n.note.name])).toEqual([
      [0, 'C4'],
      [1, 'D4'],
      [2, 'E4'],
      [3, 'F4'],
      [4, 'G4'],
      [5, 'A4'],
      [6, 'B4'],
      [7, 'C5'],
    ]);
    expect(env.ctrl.snapshot.problem).toBeNull();
  });

  it('applies the saved latency', async () => {
    env = setup({ latency: 120 });
    const fx = synthesize({ ...FIXTURE_SPECS[0]!, sampleRate: SR });
    await env.ctrl.record({ tempo: fx.spec.tempo, beatsPerBar: 4, bars: 4 });
    env.feed(fx.audio.samples);
    env.ctrl.stop();
    await vi.waitFor(() => expect(env.ctrl.snapshot.take).not.toBeNull());
    expect(env.ctrl.snapshot.take!.timing.beat0).toBeCloseTo(fx.timing.beat0 + 0.12, 2);
  });

  it('says when the take is too quiet, or has no pitch', async () => {
    const fx = synthesize({ ...FIXTURE_SPECS[0]!, sampleRate: SR });
    await env.ctrl.record({ tempo: fx.spec.tempo, beatsPerBar: 4, bars: 4 });
    env.feed(fx.audio.samples.map((v) => v * 0.002));
    env.ctrl.stop();
    await vi.waitFor(() => expect(env.ctrl.snapshot.problem).toBe('too-quiet'));

    env.ctrl.discard();
    const rand = seeded(2);
    await env.ctrl.record({ tempo: 100, beatsPerBar: 4, bars: 2 });
    env.feed(new Float32Array(SR * 6).map(() => 0.05 * (rand() * 2 - 1)));
    env.ctrl.stop();
    await vi.waitFor(() => expect(env.ctrl.snapshot.problem).toBe('no-pitch'));
    expect(env.ctrl.snapshot.warning).toBe('too-noisy');
  });

  it('reports a refused microphone', async () => {
    env = setup({ openFails: 'denied' });
    await env.ctrl.enable();
    expect(env.ctrl.snapshot).toMatchObject({ phase: 'off', problem: 'denied' });
  });

  it('calibrates from claps on the clicks', async () => {
    await env.ctrl.calibrate();
    expect(env.ctrl.snapshot.phase).toBe('calibrating');
    // Claps 90 ms after each click at 100 bpm.
    const rand = seeded(9);
    const samples = new Float32Array(SR * 7).map(() => 0.001 * (rand() * 2 - 1));
    for (let k = 0; k < 10; k++) {
      const at = Math.round((k * 0.6 + 0.09) * SR);
      for (let j = 0; j < 300; j++) samples[at + j]! += 0.5 * (rand() * 2 - 1) * Math.exp(-j / 60);
    }
    env.feed(samples);
    env.ctrl.stop();
    await vi.waitFor(() => expect(env.ctrl.snapshot.calibration).not.toBeNull());
    expect(env.ctrl.snapshot.calibration!.ok).toBe(true);
    const ms = env.saveLatency.mock.calls[0]![0] as number;
    expect(ms).toBeGreaterThan(84);
    expect(ms).toBeLessThan(96);
  });

  it('stops the microphone when turned off', async () => {
    await env.ctrl.enable();
    env.ctrl.disable();
    expect(env.mic.close).toHaveBeenCalled();
    expect(env.ctrl.snapshot.phase).toBe('off');
  });
});
