/// <reference lib="webworker" />
import { LivePitch, PitchyTracker, VoiceTranscriber, windowSizeFor } from '@/core/transcription';
import type { AnalysisRequest, AnalysisResponse } from './protocol';

/**
 * Pitch analysis off the main thread: a live trace while recording, then the
 * full take through the voice transcriber.
 */
let live: LivePitch | null = null;

const post = (m: AnalysisResponse) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const m = e.data;
  if (m.type === 'live-start') {
    live = new LivePitch(new PitchyTracker(windowSizeFor(m.sampleRate)), m.sampleRate);
  } else if (m.type === 'live-block') {
    if (!live) return;
    const frames = live.push(m.data);
    if (frames.length) post({ type: 'live-frames', frames });
  } else if (m.type === 'analyze') {
    const t = new VoiceTranscriber();
    const audio = { samples: m.samples, sampleRate: m.sampleRate };
    const frames = t.frames(audio);
    const events = t.transcribeFrames(frames);
    post({ type: 'result', id: m.id, frames, events });
  }
};
