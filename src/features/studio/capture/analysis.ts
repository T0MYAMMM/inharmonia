import { VoiceTranscriber, type NoteEvent, type PitchFrame } from '@/core/transcription';
import type { AnalysisRequest, AnalysisResponse } from './protocol';

export interface Analyzer {
  startLive(sampleRate: number): void;
  pushLive(block: Float32Array): void;
  onLiveFrames(l: (frames: PitchFrame[]) => void): () => void;
  analyze(
    samples: Float32Array,
    sampleRate: number,
  ): Promise<{ frames: PitchFrame[]; events: NoteEvent[] }>;
  dispose(): void;
}

/** Runs analysis in a Web Worker. */
export function createWorkerAnalyzer(): Analyzer {
  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  const live = new Set<(f: PitchFrame[]) => void>();
  const pending = new Map<number, (r: { frames: PitchFrame[]; events: NoteEvent[] }) => void>();
  let next = 1;
  worker.onmessage = (e: MessageEvent<AnalysisResponse>) => {
    const m = e.data;
    if (m.type === 'live-frames') for (const l of live) l(m.frames);
    else {
      pending.get(m.id)?.({ frames: m.frames, events: m.events });
      pending.delete(m.id);
    }
  };
  const send = (m: AnalysisRequest, transfer: Transferable[] = []) =>
    worker.postMessage(m, transfer);
  return {
    startLive: (sampleRate) => send({ type: 'live-start', sampleRate }),
    pushLive: (data) => send({ type: 'live-block', data }),
    onLiveFrames: (l) => {
      live.add(l);
      return () => live.delete(l);
    },
    analyze: (samples, sampleRate) =>
      new Promise((resolve) => {
        const id = next++;
        pending.set(id, resolve);
        const copy = samples.slice();
        send({ type: 'analyze', id, samples: copy, sampleRate }, [copy.buffer]);
      }),
    dispose: () => worker.terminate(),
  };
}

/** Runs analysis on the calling thread (tests, or where workers are unavailable). */
export function createInlineAnalyzer(): Analyzer {
  return {
    startLive: () => undefined,
    pushLive: () => undefined,
    onLiveFrames: () => () => undefined,
    analyze: async (samples, sampleRate) => {
      const t = new VoiceTranscriber();
      const frames = t.frames({ samples, sampleRate });
      return { frames, events: t.transcribeFrames(frames) };
    },
    dispose: () => undefined,
  };
}
