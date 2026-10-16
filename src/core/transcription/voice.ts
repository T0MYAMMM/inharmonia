import { trackPitch } from './frames';
import type { Transcriber } from './interfaces';
import { detectKey, type KeyCandidate } from './key';
import { PitchyTracker, windowSizeFor } from './pitchyTracker';
import { bestOctaveShift, DEFAULT_QUANTIZE, quantize, type QuantizeResult } from './quantize';
import { SEGMENT_CONFIG, segmentNotes, type SegmentConfig } from './segment';
import type { MonoAudio, NoteEvent, PitchFrame, QuantizeOptions, TakeTiming } from './types';

/** Where melodies are moved to by default: the right hand's comfortable range, C4 to C6. */
export const COMFORT_RANGE: [number, number] = [60, 84];

/** Monophonic voice transcription: McLeod pitch tracking, then note segmentation. */
export class VoiceTranscriber implements Transcriber {
  readonly id = 'voice-mpm';
  constructor(private readonly cfg: SegmentConfig = SEGMENT_CONFIG) {}

  frames(audio: MonoAudio): PitchFrame[] {
    return trackPitch(audio, new PitchyTracker(windowSizeFor(audio.sampleRate)));
  }

  transcribeFrames(frames: readonly PitchFrame[]): NoteEvent[] {
    return segmentNotes(frames, this.cfg);
  }

  async transcribe(audio: MonoAudio): Promise<NoteEvent[]> {
    return this.transcribeFrames(this.frames(audio));
  }
}

/** Notes sung during the take itself (after the count-in), weighted by length, for key finding. */
export function keyCandidates(events: readonly NoteEvent[], timing: TakeTiming): KeyCandidate[] {
  const after = events.filter((e) => e.end > timing.beat0);
  return detectKey(after.map((e) => ({ midi: e.pitch, weight: e.end - e.start })));
}

export interface Draft {
  keys: KeyCandidate[];
  key: { tonic: string; mode: 'major' | 'minor' };
  octaveShift: number;
  grid: QuantizeResult;
}

/**
 * From note events to a draft melody: key (best guess unless overridden),
 * octave shift into the comfort range (unless overridden), then the grid.
 */
export function draftMelody(
  events: readonly NoteEvent[],
  timing: TakeTiming,
  opts: {
    quantize?: QuantizeOptions;
    key?: { tonic: string; mode: 'major' | 'minor' };
    octaveShift?: number;
    range?: [number, number];
  } = {},
): Draft {
  const keys = keyCandidates(events, timing);
  const key = opts.key ?? { tonic: keys[0]!.tonic, mode: keys[0]!.mode };
  const inTake = events.filter((e) => e.end > timing.beat0).map((e) => Math.round(e.pitch));
  const octaveShift = opts.octaveShift ?? bestOctaveShift(inTake, opts.range ?? COMFORT_RANGE);
  const grid = quantize(events, timing, key, opts.quantize ?? DEFAULT_QUANTIZE, octaveShift);
  return { keys, key, octaveShift, grid };
}
