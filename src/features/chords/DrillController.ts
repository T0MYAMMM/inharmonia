import { MIX, mixVelocity } from '@config/mix';
import type { AudioEngine } from '@/core/audio/engine';
import type { NoteStream } from '@/core/input';
import {
  ALL_ROOTS,
  ChordDrill,
  ChordRecognizer,
  matchChord,
  NATURAL_ROOTS,
  type DrillResult,
  type DrillSummary,
  type Timers,
} from '@/core/practice';
import type { KeyLights } from '@/state/keyLights';
import { WRONG_FLASH_MS } from '@/state/keyLights';
import type { DrillSettings } from '@/state/settings';

export interface DrillSnapshot {
  running: boolean;
  /** Prompt index, 0-based. */
  index: number;
  roundLength: number;
  prompt: { chord: string; inversion: string | null; lowest: string | null } | null;
  /** Lowest and highest note of the prompt's voicing, to keep in view on the keyboard. */
  range: [number, number] | null;
  /** Feedback on the current shape held. */
  hint: string;
  /** Brief confirmation after a correct chord. */
  correct: boolean;
  showing: boolean;
  clean: number;
  summary: DrillSummary | null;
  announcement: string;
}

export interface DrillServices {
  audio: AudioEngine;
  lights: KeyLights;
  notes: NoteStream;
  onRoundDone?: (summary: DrillSummary) => void;
  /** A chord played cleanly: no wrong note first and no "Show me". */
  onCleanChord?: (symbol: string) => void;
  timers?: Timers;
}

const CORRECT_PAUSE_MS = 650;

const realTimers: Timers = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/**
 * Runs a chord drill round: prompts, wrong-note flashes, held-chord recognition,
 * a short "correct" pause, and the round summary. Plain TypeScript.
 */
export class DrillController {
  private drill: ChordDrill | null = null;
  private recognizer: ChordRecognizer;
  private snap: DrillSnapshot = {
    running: false,
    index: 0,
    roundLength: 10,
    prompt: null,
    range: null,
    hint: '',
    correct: false,
    showing: false,
    clean: 0,
    summary: null,
    announcement: '',
  };
  private listeners = new Set<() => void>();
  private off: (() => void) | null = null;
  private pause: unknown = null;
  /** "Show me" was used on the current prompt. */
  private helped = false;

  constructor(private readonly s: DrillServices) {
    this.recognizer = new ChordRecognizer({
      onMatch: () => this.onMatch(),
      settleMs: 80,
      timers: this.timers,
    });
  }

  private get timers(): Timers {
    return this.s.timers ?? realTimers;
  }

  get snapshot(): DrillSnapshot {
    return this.snap;
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<DrillSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  attach(): void {
    this.off = this.s.notes.subscribe((e) => {
      if (e.type === 'on') this.onPress(e.midi);
      this.evaluate();
    });
  }

  detach(): void {
    this.off?.();
    this.off = null;
    this.recognizer.reset();
    if (this.pause !== null) this.timers.clearTimeout(this.pause);
    this.clearLights();
    this.listeners.clear();
  }

  start(settings: DrillSettings, rng?: () => number): void {
    this.drill = new ChordDrill(
      {
        qualityIds: settings.qualityIds,
        roots: settings.naturalsOnly ? NATURAL_ROOTS : ALL_ROOTS,
        inversions: settings.inversions,
        strictness: settings.strictness,
        ...(rng ? { rng } : {}),
      },
      this.timers.now(),
    );
    this.recognizer.reset();
    this.set({ running: true, summary: null, clean: 0, roundLength: this.drill.roundLength });
    this.showPrompt();
  }

  stop(): void {
    this.drill = null;
    this.recognizer.reset();
    this.clearLights();
    this.set({
      running: false,
      prompt: null,
      summary: null,
      hint: '',
      showing: false,
      correct: false,
    });
  }

  again(): void {
    if (!this.drill) return;
    this.drill.restart(this.timers.now());
    this.recognizer.reset();
    this.set({ summary: null, clean: 0 });
    this.showPrompt();
  }

  hearIt(): void {
    const item = this.drill?.current;
    if (!item) return;
    void this.s.audio.unlock();
    const t0 = this.s.audio.now() + 0.01;
    const { velocity, lengthSec } = MIX.chords;
    for (const n of item.voicing)
      this.s.audio.playAt(n.midi, t0, lengthSec, mixVelocity('lh', velocity));
  }

  /** Reveal the chord on the keyboard (toggle). */
  showMe(): void {
    if (!this.drill) return;
    const showing = !this.snap.showing;
    if (showing) this.helped = true;
    this.s.lights.setExactly(
      'chordTarget',
      showing ? this.drill.current.voicing.map((n) => n.midi) : [],
    );
    this.set({ showing });
  }

  skip(): void {
    if (!this.drill || this.snap.correct) return;
    this.after(this.drill.skip(this.timers.now()));
  }

  private onPress(midi: number): void {
    if (!this.drill || this.snap.correct || this.drill.done) return;
    if (this.drill.press(midi)) {
      this.s.lights.flash(midi, 'wrong', WRONG_FLASH_MS);
      this.set({ hint: 'That note is not in the chord.', announcement: 'Not in the chord.' });
    }
  }

  private evaluate(): void {
    if (!this.drill || this.snap.correct || this.drill.done) return;
    const item = this.drill.current;
    const r = this.recognizer.update(
      this.s.notes.heldWithTimes(),
      item.target,
      this.drill.strictness,
    );
    if (r.status === 'wrong-bass') {
      this.set({
        hint: `Right notes. Now put ${item.voicing[0]!.name.replace(/\d+$/, '')} at the bottom.`,
      });
    } else if (r.status === 'partial' && this.snap.hint !== 'That note is not in the chord.') {
      this.set({
        hint: r.missing.length === 1 ? 'One more note.' : `${r.missing.length} more notes.`,
      });
    } else if (r.status === 'idle') {
      this.set({ hint: '' });
    }
  }

  private onMatch(): void {
    if (!this.drill || this.snap.correct || this.drill.done) return;
    // The recognizer only fires on a settled match; double-check against the current notes.
    const held = this.s.notes.held();
    if (matchChord(held, this.drill.current.target, this.drill.strictness).status !== 'match')
      return;
    this.after(this.drill.accept(this.timers.now()));
  }

  private after(result: DrillResult | null): void {
    if (!result || !this.drill) return;
    const clean = this.drill.results.filter((r) => r.clean).length;
    if (result.skipped) {
      this.set({ clean, announcement: 'Skipped.' });
      this.next();
      return;
    }
    this.s.lights.setExactly('chordTarget', []);
    if (result.clean && !this.helped) this.s.onCleanChord?.(result.item.symbol);
    this.set({
      correct: true,
      clean,
      hint: '',
      announcement: `Yes, ${this.snap.prompt?.chord ?? 'that is it'}.`,
    });
    this.pause = this.timers.setTimeout(() => {
      this.pause = null;
      this.set({ correct: false });
      this.next();
    }, CORRECT_PAUSE_MS);
  }

  private next(): void {
    if (!this.drill) return;
    this.recognizer.reset();
    if (this.drill.done) {
      const summary = this.drill.summary();
      this.s.onRoundDone?.(summary);
      this.clearLights();
      this.set({
        summary,
        prompt: null,
        showing: false,
        announcement: `Round done: ${summary.clean} of ${summary.total} clean.`,
      });
      return;
    }
    this.showPrompt();
  }

  private showPrompt(): void {
    if (!this.drill) return;
    this.clearLights();
    this.helped = false;
    const v = this.drill.current.voicing;
    this.set({
      index: this.drill.results.length,
      prompt: this.drill.describe(),
      range: [v[0]!.midi, v.at(-1)!.midi],
      hint: '',
      showing: false,
    });
  }

  private clearLights(): void {
    this.s.lights.clear('chordTarget');
    this.s.lights.clear('lh');
  }
}
