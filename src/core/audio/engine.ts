import type * as ToneNS from 'tone';
import { MIX, mixVelocity } from '@config/mix';
import { loadSample } from './sampleLoader';
import { pickSampleFormat, sampleUrls } from './samples';
import type { TransportSink } from './transport';
import type { TimelineEvent } from './timeline';

export type AudioStatus =
  | 'locked' // no user gesture yet
  | 'starting' // context created, Tone loading
  | 'synth' // playable with the synth fallback, samples loading
  | 'ready' // piano samples loaded
  | 'error'; // samples failed; synth fallback stays

export interface AudioSnapshot {
  status: AudioStatus;
  samplesLoaded: number;
  samplesTotal: number;
  instrument: 'none' | 'synth' | 'piano';
}

type Tone = typeof ToneNS;
type Listener = (s: AudioSnapshot) => void;

const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);

/**
 * Owns the AudioContext, the piano sampler and the synth fallback.
 *
 * The AudioContext is created synchronously inside the first user gesture (the
 * only way iOS Safari reliably starts audio); Tone.js is then imported and bound
 * to that context with lookAhead 0, because the app's own Transport does the
 * lookahead scheduling. Live input uses Tone.immediate() so a key press is heard
 * as soon as the audio hardware allows.
 */
export class AudioEngine {
  private raw: AudioContext | null = null;
  private tone: Tone | null = null;
  private sampler: ToneNS.Sampler | null = null;
  private synth: ToneNS.PolySynth | null = null;
  private clickSynth: ToneNS.Synth | null = null;
  private out: ToneNS.Volume | null = null;
  private loading: Promise<void> | null = null;
  /** Which instrument each live-held note started on, so noteOff releases the right one. */
  private held = new Map<number, 'synth' | 'piano'>();
  private pending: { midi: number; velocity: number; at: number }[] = [];
  private listeners = new Set<Listener>();
  private snapshot: AudioSnapshot = {
    status: 'locked',
    samplesLoaded: 0,
    samplesTotal: 0,
    instrument: 'none',
  };

  constructor(private readonly baseUrl: string) {}

  get state(): AudioSnapshot {
    return this.snapshot;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private set(patch: Partial<AudioSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l(this.snapshot);
  }

  /**
   * Call from a user gesture handler (pointerdown, keydown, click). Idempotent.
   * The synchronous part creates and resumes the context inside the gesture.
   */
  unlock(): Promise<void> {
    if (!this.raw) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.set({ status: 'error' });
        return Promise.resolve();
      }
      this.raw = new Ctor({ latencyHint: 'interactive' });
      this.set({ status: 'starting' });
    }
    if (this.raw.state !== 'running') void this.raw.resume().catch(() => undefined);
    this.loading ??= this.boot();
    return this.loading;
  }

  get unlocked(): boolean {
    return this.raw !== null;
  }

  private async boot(): Promise<void> {
    const Tone = await import('tone');
    const raw = this.raw!;
    Tone.setContext(
      new Tone.Context({ context: raw, lookAhead: 0, latencyHint: 'interactive' }),
      true,
    );
    this.tone = Tone;
    this.out = new Tone.Volume(-4);
    this.out.chain(new Tone.Limiter(-1), Tone.getDestination());

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fattriangle', count: 2, spread: 12 },
      envelope: { attack: 0.004, decay: 0.9, sustain: 0.18, release: 0.9 },
      volume: -14,
    }).connect(this.out);
    this.synth.maxPolyphony = 48;
    this.clickSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
      volume: -8,
    }).connect(this.out);

    this.set({ status: 'synth', instrument: 'synth' });
    this.flushPending();
    void this.loadSamples();
  }

  private async loadSamples(): Promise<void> {
    const Tone = this.tone!;
    const format = pickSampleFormat((t) => new Audio().canPlayType(t));
    const urls = sampleUrls(this.baseUrl, format);
    const entries = Object.entries(urls);
    this.set({ samplesTotal: entries.length, samplesLoaded: 0 });
    try {
      let loaded = 0;
      const buffers = await Promise.all(
        entries.map(async ([note, url]) => {
          const buf = new Tone.ToneAudioBuffer(await loadSample(this.raw!, url, format));
          loaded++;
          this.set({ samplesLoaded: loaded });
          return [note, buf] as const;
        }),
      );
      this.sampler = new Tone.Sampler({
        urls: Object.fromEntries(buffers),
        release: 1.1,
        curve: 'exponential',
      }).connect(this.out!);
      this.set({ status: 'ready', instrument: 'piano' });
    } catch (err) {
      console.warn('Piano samples failed to load; using the synth fallback.', err);
      this.set({ status: 'error' });
    }
  }

  private flushPending(): void {
    const now = performance.now();
    // Play notes pressed while Tone was loading, unless they are stale.
    for (const p of this.pending) if (now - p.at < 250) this.noteOn(p.midi, p.velocity);
    this.pending = [];
  }

  /** The shared AudioContext, once unlocked (microphone capture runs on it too). */
  context(): AudioContext | null {
    return this.raw;
  }

  /**
   * Play recorded mono audio (a Studio take) at an audio-clock time, straight to
   * the output. Returns a function that stops it.
   */
  playRecording(samples: Float32Array, sampleRate: number, when: number, gain = 0.9): () => void {
    const ctx = this.raw;
    if (!ctx) return () => undefined;
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(ctx.destination);
    src.start(Math.max(when, ctx.currentTime));
    return () => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
    };
  }

  /** Current audio-clock time, seconds. */
  now(): number {
    return this.raw?.currentTime ?? 0;
  }

  /** Seconds between scheduling a sound and hearing it. Used to align visuals. */
  outputLatency(): number {
    const r = this.raw;
    if (!r) return 0;
    return (r.outputLatency || 0) + (r.baseLatency || 0);
  }

  latencyInfo(): { base: number; output: number; sampleRate: number } {
    return {
      base: this.raw?.baseLatency ?? 0,
      output: this.raw?.outputLatency ?? 0,
      sampleRate: this.raw?.sampleRate ?? 0,
    };
  }

  // ---- live input ------------------------------------------------------------

  noteOn(midi: number, velocity = 0.8): void {
    const Tone = this.tone;
    if (!Tone) {
      this.pending.push({ midi, velocity, at: performance.now() });
      return;
    }
    if (this.held.has(midi)) this.noteOff(midi);
    velocity = mixVelocity('live', velocity);
    const t = Tone.immediate();
    const freq = midiToFreq(midi);
    if (this.sampler) {
      this.sampler.triggerAttack(freq, t, velocity);
      this.held.set(midi, 'piano');
    } else if (this.synth) {
      this.synth.triggerAttack(freq, t, velocity);
      this.held.set(midi, 'synth');
    }
  }

  noteOff(midi: number): void {
    this.pending = this.pending.filter((p) => p.midi !== midi);
    const Tone = this.tone;
    const inst = this.held.get(midi);
    if (!Tone || !inst) return;
    this.held.delete(midi);
    const t = Tone.immediate();
    const freq = midiToFreq(midi);
    if (inst === 'piano') this.sampler?.triggerRelease(freq, t);
    else this.synth?.triggerRelease(freq, t);
  }

  // ---- scheduled playback ----------------------------------------------------

  playAt(midi: number, time: number, duration: number, velocity = 0.7): void {
    const freq = midiToFreq(midi);
    const dur = Math.max(0.05, duration);
    if (this.sampler) this.sampler.triggerAttackRelease(freq, dur, time, velocity);
    else this.synth?.triggerAttackRelease(freq, dur, time, velocity);
  }

  click(time: number, accent: boolean): void {
    const v = accent ? MIX.metronome.accentVelocity : MIX.metronome.velocity;
    this.clickSynth?.triggerAttackRelease(
      accent ? 1760 : 1320,
      0.03,
      time,
      mixVelocity('metronome', v),
    );
  }

  releaseAll(): void {
    const t = this.tone?.immediate();
    this.sampler?.releaseAll(t);
    this.synth?.releaseAll(t);
    this.held.clear();
  }

  setVolume(db: number): void {
    if (this.out) this.out.volume.value = db;
  }

  /** Adapter so a Transport can play through this engine. */
  sink(): TransportSink {
    return {
      note: (ev: TimelineEvent, time: number, dur: number) =>
        this.playAt(ev.midi, time, dur, mixVelocity(ev.channel, ev.velocity)),
      click: (time, accent) => this.click(time, accent),
      silence: () => this.releaseAll(),
    };
  }

  clock(): { now(): number } {
    return { now: () => this.now() };
  }
}
