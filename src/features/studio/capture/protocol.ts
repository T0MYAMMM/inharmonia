import type { NoteEvent, PitchFrame } from '@/core/transcription';

/** Messages to the analysis worker. */
export type AnalysisRequest =
  | { type: 'live-start'; sampleRate: number }
  | { type: 'live-block'; data: Float32Array }
  | { type: 'analyze'; id: number; samples: Float32Array; sampleRate: number };

/** Messages from it. */
export type AnalysisResponse =
  | { type: 'live-frames'; frames: PitchFrame[] }
  | { type: 'result'; id: number; frames: PitchFrame[]; events: NoteEvent[] };
