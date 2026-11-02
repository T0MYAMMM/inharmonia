import { describe, expect, it, vi } from 'vitest';
import type { PitchFrame } from '@/core/transcription';
import { createWorkerAnalyzer } from './analysis';
import type { AnalysisRequest, AnalysisResponse } from './protocol';

/** A worker that records what it is sent and can answer. */
function fakeWorker() {
  const sent: AnalysisRequest[] = [];
  const worker = {
    onmessage: null as ((e: MessageEvent<AnalysisResponse>) => void) | null,
    postMessage: (m: AnalysisRequest) => sent.push(m),
    terminate: vi.fn(),
  };
  const reply = (data: AnalysisResponse) =>
    worker.onmessage?.({ data } as MessageEvent<AnalysisResponse>);
  return { worker, sent, reply };
}

const frame: PitchFrame = { time: 0, f0: 220, midi: 57, clarity: 0.9, rms: 0.1, rmsShort: 0.1 };

describe('createWorkerAnalyzer', () => {
  it('starts the worker with the first take, not when it is made', () => {
    const fake = fakeWorker();
    const start = vi.fn(() => fake.worker as unknown as Worker);
    const analyzer = createWorkerAnalyzer(start);
    const frames: PitchFrame[][] = [];
    analyzer.onLiveFrames((f) => frames.push(f));
    expect(start).not.toHaveBeenCalled();

    analyzer.startLive(48000);
    analyzer.pushLive(new Float32Array(128));
    expect(start).toHaveBeenCalledTimes(1);
    expect(fake.sent.map((m) => m.type)).toEqual(['live-start', 'live-block']);

    fake.reply({ type: 'live-frames', frames: [frame] });
    expect(frames).toEqual([[frame]]);
  });

  it('answers an analysis from the worker it started', async () => {
    const fake = fakeWorker();
    const analyzer = createWorkerAnalyzer(() => fake.worker as unknown as Worker);
    const result = analyzer.analyze(new Float32Array(4), 48000);
    const asked = fake.sent[0]!;
    expect(asked.type).toBe('analyze');
    fake.reply({ type: 'result', id: (asked as { id: number }).id, frames: [frame], events: [] });
    await expect(result).resolves.toEqual({ frames: [frame], events: [] });
  });

  it('closing Studio before a take starts no worker', () => {
    const start = vi.fn(() => fakeWorker().worker as unknown as Worker);
    createWorkerAnalyzer(start).dispose();
    expect(start).not.toHaveBeenCalled();
  });

  it('closing Studio after a take stops the worker', () => {
    const fake = fakeWorker();
    const analyzer = createWorkerAnalyzer(() => fake.worker as unknown as Worker);
    analyzer.startLive(48000);
    analyzer.dispose();
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1);
  });
});
