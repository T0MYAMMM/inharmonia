import type { Transport } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import {
  detectOnsets,
  estimateLatency,
  SEGMENT_CONFIG,
  type LatencyEstimate,
  type MonoAudio,
  type NoteEvent,
  type PitchFrame,
  type TakeTiming,
} from '@/core/transcription';
import type { Analyzer } from './capture/analysis';
import { MicError, TakeBuffer, type MicProblem, type Microphone } from './capture/microphone';

export type StudioPhase =
  'off' | 'opening' | 'ready' | 'calibrating' | 'counting' | 'recording' | 'analyzing' | 'done';

/** Things that stop a take or need the singer's attention. */
export type StudioProblem =
  MicProblem | 'too-quiet' | 'too-noisy' | 'no-pitch' | 'calibration-failed';

export interface Take {
  audio: MonoAudio;
  timing: TakeTiming;
  frames: PitchFrame[];
  events: NoteEvent[];
  /** Latency applied to line the take up, ms, and where it came from. */
  latencyMs: number;
  latencySource: 'calibrated' | 'estimated';
  /** Loudest moment, dBFS. */
  peakDb: number;
  /** Noise during the count-in, dBFS. */
  noiseDb: number;
}

export interface StudioSnapshot {
  phase: StudioPhase;
  /** A problem to show; `warning` problems don't stop the take. */
  problem: StudioProblem | null;
  warning: StudioProblem | null;
  /** Count-in beats left. */
  countIn: number | null;
  /** Beat being recorded (0-based), while recording. */
  beat: number;
  take: Take | null;
  calibration: LatencyEstimate | null;
  /** Input device name, when the browser shares it. */
  device: string;
}

export interface StudioServices {
  transport: Transport;
  audio: AudioEngine;
  analyzer: Analyzer;
  openMic: (ctx: AudioContext) => Promise<Microphone>;
  /** Saved round-trip latency, ms, or null to estimate. */
  latencyMs: () => number | null;
  saveLatency: (ms: number) => void;
  /** Turn the metronome back to the user's setting after a take. */
  restoreMetronome: () => void;
  /** A take's click has started; beat 0 falls at this audio-clock time. */
  onTakeStart?: (info: { beat0: number; tempo: number; beatsPerBar: number }) => void;
}

export interface TakeSettings {
  tempo: number;
  beatsPerBar: number;
  bars: number;
}

/** Quieter than this at its loudest, the take is too quiet to read. */
export const TOO_QUIET_DB = -42;
/** Noise during the count-in louder than this makes pitch tracking unreliable. */
export const TOO_NOISY_DB = -38;
/** Clicks in the calibration run. */
export const CALIBRATION_CLICKS = 10;
const CALIBRATION_TEMPO = 100;

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

/**
 * Drives the Studio recorder. Plain TypeScript: the page subscribes to
 * snapshots; level and live pitch go to listeners so the meter and trace can
 * draw every frame without React renders.
 */
export class StudioController {
  private snap: StudioSnapshot = {
    phase: 'off',
    problem: null,
    warning: null,
    countIn: null,
    beat: 0,
    take: null,
    calibration: null,
    device: '',
  };
  private listeners = new Set<() => void>();
  private mic: Microphone | null = null;
  private offMic: (() => void) | null = null;
  private recording: TakeBuffer | null = null;
  private offEnd: (() => void) | null = null;
  private raf = 0;
  /** Recent level, 0..1 peak, decaying. */
  level = 0;
  /** Live pitch trace: recent frames, newest last. */
  readonly trace: PitchFrame[] = [];
  private traceOffset = 0;
  private levelListeners = new Set<() => void>();
  private run: {
    kind: 'take' | 'calibration';
    settings: TakeSettings;
    beat0: number;
    clicks: number[];
    countInPeak: number;
    countInSum: number;
    countInN: number;
  } | null = null;

  constructor(private readonly s: StudioServices) {
    s.analyzer.onLiveFrames((frames) => {
      for (const f of frames) this.trace.push({ ...f, time: f.time + this.traceOffset });
      if (this.trace.length > 600) this.trace.splice(0, this.trace.length - 600);
    });
  }

  get snapshot(): StudioSnapshot {
    return this.snap;
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** Called often (meter, live trace). */
  onLevel(l: () => void): () => void {
    this.levelListeners.add(l);
    return () => this.levelListeners.delete(l);
  }

  private set(patch: Partial<StudioSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  // ---- microphone ------------------------------------------------------------

  /** Ask for the microphone (from a click: it also unlocks audio). */
  async enable(): Promise<void> {
    if (this.mic || this.snap.phase === 'opening') return;
    void this.s.audio.unlock();
    const ctx = this.s.audio.context();
    if (!ctx) {
      this.set({ problem: 'unsupported' });
      return;
    }
    this.set({ phase: 'opening', problem: null });
    try {
      const mic = await this.s.openMic(ctx);
      this.mic = mic;
      this.s.analyzer.startLive(mic.sampleRate);
      this.traceOffset = ctx.currentTime;
      this.offMic = mic.onBlock((b) => {
        this.level = Math.max(b.peak, this.level * 0.85);
        this.s.analyzer.pushLive(b.data);
        this.recording?.add(b);
        this.watchCountIn(b);
        for (const l of this.levelListeners) l();
      });
      this.set({ phase: 'ready', device: mic.label() });
      this.startFrames();
    } catch (err) {
      const kind = err instanceof MicError ? err.kind : 'unknown';
      this.set({ phase: 'off', problem: kind });
    }
  }

  /** Release the microphone. */
  disable(): void {
    this.cancel();
    this.offMic?.();
    this.offMic = null;
    this.mic?.close();
    this.mic = null;
    cancelAnimationFrame(this.raf);
    this.set({ phase: 'off', device: '' });
  }

  dispose(): void {
    this.disable();
    this.s.analyzer.dispose();
    this.listeners.clear();
    this.levelListeners.clear();
  }

  private startFrames(): void {
    const frame = () => {
      this.renderFrame();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Per frame: count-in and beat while running. */
  renderFrame(): void {
    const t = this.s.transport;
    if (!this.run || t.state !== 'playing') return;
    const now = this.s.audio.now() - this.s.audio.outputLatency();
    const left = t.countInRemaining(now);
    const beat = Math.max(0, Math.floor(t.beatAt(now)));
    const counting = left !== null;
    if (this.run.kind === 'take') {
      const phase = counting ? 'counting' : 'recording';
      if (
        phase !== this.snap.phase ||
        beat !== this.snap.beat ||
        this.snap.countIn !== (counting ? Math.ceil(left) : null)
      )
        this.set({ phase, beat, countIn: counting ? Math.ceil(left) : null });
    }
  }

  /** Noise floor: loudness during the count-in, when the singer should be quiet. */
  private watchCountIn(b: { frame: number; data: Float32Array }): void {
    const run = this.run;
    if (!run || run.kind !== 'take' || !this.mic) return;
    const t = b.frame / this.mic.sampleRate;
    // Skip the first half beat (the click starting) and stop half a beat before the downbeat.
    const spb = 60 / run.settings.tempo;
    if (t > run.beat0 - spb / 2 || t < run.beat0 - (run.settings.beatsPerBar - 0.5) * spb) return;
    let sum = 0;
    for (let i = 0; i < b.data.length; i++) sum += b.data[i]! * b.data[i]!;
    run.countInSum += sum;
    run.countInN += b.data.length;
  }

  // ---- takes ---------------------------------------------------------------------

  /** Record a take: one bar of count-in, then `bars` bars against the click. */
  async record(settings: TakeSettings): Promise<void> {
    if (!this.mic) await this.enable();
    if (!this.mic || this.run) return;
    const t = this.s.transport;
    const beats = settings.bars * settings.beatsPerBar;
    t.stop();
    t.setLoop(null);
    t.setTimeline([], beats);
    t.setBeatsPerBar(settings.beatsPerBar);
    t.setTempo(settings.tempo);
    t.setSwing(0);
    t.setMetronome(true, 1);
    this.recording = new TakeBuffer(this.mic.sampleRate);
    t.play(0, { countInBars: 1 });
    this.run = {
      kind: 'take',
      settings,
      beat0: t.timeAtBeat(0),
      clicks: [],
      countInPeak: 0,
      countInSum: 0,
      countInN: 0,
    };
    this.set({ phase: 'counting', problem: null, warning: null, take: null, beat: 0 });
    this.s.onTakeStart?.({
      beat0: this.run.beat0,
      tempo: settings.tempo,
      beatsPerBar: settings.beatsPerBar,
    });
    this.offEnd = t.onEnd(() => {
      // Keep listening a moment for the last note's tail.
      setTimeout(() => void this.finish(), 300);
    });
  }

  /** Stop early and keep what was sung. */
  stop(): void {
    if (!this.run) return;
    this.s.transport.stop();
    void this.finish();
  }

  /** Abandon the current run without analysing it. */
  cancel(): void {
    if (!this.run) return;
    this.offEnd?.();
    this.offEnd = null;
    this.run = null;
    this.recording = null;
    this.s.transport.stop();
    this.s.restoreMetronome();
    this.set({ phase: this.mic ? 'ready' : 'off', countIn: null });
  }

  private latency(): { ms: number; source: 'calibrated' | 'estimated' } {
    const saved = this.s.latencyMs();
    if (saved !== null) return { ms: saved, source: 'calibrated' };
    const est = (this.s.audio.outputLatency() + (this.mic?.reportedLatency() ?? 0)) * 1000 + 10;
    return { ms: Math.round(est), source: 'estimated' };
  }

  private async finish(): Promise<void> {
    const run = this.run;
    const rec = this.recording;
    this.offEnd?.();
    this.offEnd = null;
    this.run = null;
    this.recording = null;
    this.s.restoreMetronome();
    if (!run || !rec) return;
    const { samples, sampleRate, startTime } = rec.finish();
    if (run.kind === 'calibration')
      return this.finishCalibration(run, samples, sampleRate, startTime);

    this.set({ phase: 'analyzing', countIn: null });
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]!));
    const noiseDb = run.countInN ? db(Math.sqrt(run.countInSum / run.countInN)) : -120;
    const latency = this.latency();
    const sungBeats = Math.max(
      0,
      (startTime + samples.length / sampleRate - run.beat0) * (run.settings.tempo / 60),
    );
    const bars = Math.max(
      1,
      Math.min(run.settings.bars, Math.ceil(sungBeats / run.settings.beatsPerBar - 0.05)),
    );
    const timing: TakeTiming = {
      tempo: run.settings.tempo,
      meter: { beats: run.settings.beatsPerBar, unit: 4 },
      beat0: run.beat0 - startTime + latency.ms / 1000,
      bars,
    };
    const { frames, events } = await this.s.analyzer.analyze(samples, sampleRate);
    const take: Take = {
      audio: { samples, sampleRate },
      timing,
      frames,
      events,
      latencyMs: latency.ms,
      latencySource: latency.source,
      peakDb: db(peak),
      noiseDb,
    };
    const voiced = frames.filter(
      (f) => f.midi !== null && f.clarity >= SEGMENT_CONFIG.minClarity,
    ).length;
    const problem: StudioProblem | null =
      take.peakDb < TOO_QUIET_DB
        ? 'too-quiet'
        : events.filter((e) => e.end > timing.beat0).length === 0 || voiced < 20
          ? 'no-pitch'
          : null;
    const warning: StudioProblem | null = noiseDb > TOO_NOISY_DB ? 'too-noisy' : null;
    this.set({ phase: this.mic ? 'done' : 'off', take, problem, warning });
  }

  // ---- calibration ---------------------------------------------------------------

  /** Play clicks; the singer claps on each. The delay heard back becomes the latency. */
  async calibrate(): Promise<void> {
    if (!this.mic) await this.enable();
    if (!this.mic || this.run) return;
    const t = this.s.transport;
    t.stop();
    t.setLoop(null);
    t.setTimeline([], CALIBRATION_CLICKS);
    t.setBeatsPerBar(4);
    t.setTempo(CALIBRATION_TEMPO);
    t.setMetronome(true, 0);
    this.recording = new TakeBuffer(this.mic.sampleRate);
    t.play(0, { countInBars: 0 });
    const clicks = Array.from({ length: CALIBRATION_CLICKS }, (_, k) => t.timeAtBeat(k));
    this.run = {
      kind: 'calibration',
      settings: { tempo: CALIBRATION_TEMPO, beatsPerBar: 4, bars: 0 },
      beat0: clicks[0]!,
      clicks,
      countInPeak: 0,
      countInSum: 0,
      countInN: 0,
    };
    this.set({ phase: 'calibrating', problem: null, calibration: null });
    this.offEnd = t.onEnd(() => setTimeout(() => void this.finish(), 450));
  }

  private finishCalibration(
    run: NonNullable<StudioController['run']>,
    samples: Float32Array,
    sampleRate: number,
    startTime: number,
  ): void {
    const onsets = detectOnsets({ samples, sampleRate }).map((x) => x + startTime);
    const est = estimateLatency(run.clicks, onsets);
    if (est.ok) this.s.saveLatency(Math.round(est.latencyMs));
    this.set({
      phase: this.mic ? 'ready' : 'off',
      calibration: est,
      problem: est.ok ? null : 'calibration-failed',
    });
  }

  /** Clear the current take (to record again). */
  discard(): void {
    this.set({ take: null, problem: null, warning: null, phase: this.mic ? 'ready' : 'off' });
  }
}
