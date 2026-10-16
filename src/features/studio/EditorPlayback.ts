import type { Transport } from '@/core/audio';
import type { AudioEngine, RecordingPlayback } from '@/core/audio/engine';
import type { CompiledLesson } from '@/core/content/compile';

export type HearSource = 'take' | 'notes';

export interface EditorTakeAudio {
  samples: Float32Array;
  sampleRate: number;
  /** Seconds into the recording where beat 0 falls. */
  beat0: number;
}

const TAKE_GAIN = 0.9;

/**
 * Editor playback with A/B: the edited song runs on the transport while the
 * original take plays in sync from the same beat. Switching what you hear
 * mutes one and brings up the other mid-playback, so the two can be compared
 * note for note.
 */
export class EditorPlayback {
  private rec: RecordingPlayback | null = null;
  private offEnd: (() => void) | null = null;
  private _source: HearSource = 'notes';
  private _chords = true;
  private listeners = new Set<() => void>();

  constructor(private readonly s: { transport: Transport; audio: AudioEngine }) {}

  get playing(): boolean {
    return this.s.transport.state === 'playing';
  }

  get source(): HearSource {
    return this._source;
  }

  get chords(): boolean {
    return this._chords;
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** The beat being heard, or null when stopped. */
  beat(): number | null {
    if (!this.playing) return null;
    return this.s.transport.beatAt(this.s.audio.now() - this.s.audio.outputLatency());
  }

  play(compiled: CompiledLesson, take: EditorTakeAudio | null, fromBeat = 0): void {
    const t = this.s.transport;
    this.stop();
    void this.s.audio.unlock();
    const meta = compiled.lesson;
    t.setLoop(null);
    t.setTimeline(compiled.events, compiled.lengthBeats);
    t.setBeatsPerBar(compiled.beatsPerBar);
    t.setTempo(meta.tempo.default);
    t.setSwing(0);
    t.setMetronome(false, 0);
    if (!take) this._source = 'notes';
    this.applyMutes();
    t.play(fromBeat, { countInBars: 0 });
    if (take) {
      const at = t.timeAtBeat(fromBeat);
      const offset = take.beat0 + (fromBeat * 60) / meta.tempo.default;
      this.rec = this.s.audio.playRecording(
        take.samples,
        take.sampleRate,
        at,
        this._source === 'take' ? TAKE_GAIN : 0,
        offset,
      );
    }
    this.offEnd = t.onEnd(() => this.stop());
    this.emit();
  }

  /** A: your take, B: the edited notes. Works while playing. */
  setSource(source: HearSource): void {
    this._source = source;
    this.applyMutes();
    this.rec?.setGain(source === 'take' ? TAKE_GAIN : 0);
    this.emit();
  }

  setChords(on: boolean): void {
    this._chords = on;
    this.applyMutes();
    this.emit();
  }

  stop(): void {
    this.offEnd?.();
    this.offEnd = null;
    this.rec?.stop();
    this.rec = null;
    const t = this.s.transport;
    if (t.state !== 'stopped') t.stop();
    // Leave the transport as the other players expect it.
    t.setMuted('rh', false);
    t.setMuted('lh', false);
    this.emit();
  }

  private applyMutes() {
    const t = this.s.transport;
    t.setMuted('rh', this._source === 'take');
    t.setMuted('lh', !this._chords);
  }
}
