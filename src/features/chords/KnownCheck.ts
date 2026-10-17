import type { NoteStream } from '@/core/input';
import {
  belongsToChord,
  chordTarget,
  ChordRecognizer,
  type ChordTarget,
  type Timers,
} from '@/core/practice';
import type { SpelledNote } from '@/core/theory';
import type { KeyLights } from '@/state/keyLights';
import { WRONG_FLASH_MS } from '@/state/keyLights';

export type CheckStatus = 'waiting' | 'building' | 'clean' | 'helped' | 'slipped';

export interface CheckSnapshot {
  status: CheckStatus;
  /** "Show me" is lighting the chord. */
  showing: boolean;
}

export interface CheckServices {
  notes: NoteStream;
  lights: KeyLights;
  /** A clean play: no wrong note first and no "Show me". */
  onClean: (symbol: string) => void;
  timers?: Timers;
}

const realTimers: Timers = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/**
 * "Play it": listens for one chord in any octave or inversion. A try runs until
 * the chord is played; it counts as a clean play when it had no wrong note and
 * no "Show me", as in chord drills. Let go of every key to start the next try.
 * Plain TypeScript.
 */
export class KnownCheck {
  private symbol = '';
  private target: ChordTarget | null = null;
  private voicing: readonly SpelledNote[] = [];
  private slipped = false;
  private helped = false;
  private done = false;
  private snap: CheckSnapshot = { status: 'waiting', showing: false };
  private listeners = new Set<() => void>();
  private off: (() => void) | null = null;
  private recognizer: ChordRecognizer;

  constructor(private readonly s: CheckServices) {
    this.recognizer = new ChordRecognizer({
      onMatch: () => this.onMatch(),
      settleMs: 80,
      timers: s.timers ?? realTimers,
    });
  }

  get snapshot(): CheckSnapshot {
    return this.snap;
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<CheckSnapshot>): void {
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
    this.s.lights.clear('chordTarget');
    this.listeners.clear();
  }

  /** Listen for this chord from now on. */
  setChord(symbol: string, voicing: readonly SpelledNote[]): void {
    this.symbol = symbol;
    this.target = chordTarget(voicing);
    this.voicing = voicing;
    this.fresh();
    this.s.lights.clear('chordTarget');
    this.set({ status: 'waiting', showing: false });
  }

  /** Light the chord (toggle). This try then does not count. */
  showMe(): void {
    const showing = !this.snap.showing;
    if (showing) this.helped = true;
    this.s.lights.setExactly('chordTarget', showing ? this.voicing.map((n) => n.midi) : []);
    this.set({ showing });
  }

  private fresh(): void {
    this.slipped = false;
    this.helped = this.snap.showing;
    this.done = false;
    this.recognizer.reset();
  }

  private onPress(midi: number): void {
    if (!this.target) return;
    if (this.done) return;
    if (!belongsToChord(midi, this.target, 'pitch-class')) {
      this.slipped = true;
      this.s.lights.flash(midi, 'wrong', WRONG_FLASH_MS);
    }
  }

  private evaluate(): void {
    if (!this.target) return;
    const held = this.s.notes.heldWithTimes();
    // Letting go after the chord starts the next try; the result stays on show
    // until the next key goes down.
    if (held.length === 0) {
      if (this.done) this.fresh();
      return;
    }
    if (this.done) return;
    this.recognizer.update(held, this.target, 'pitch-class');
    if (this.snap.status !== 'building') this.set({ status: 'building' });
  }

  private onMatch(): void {
    if (this.done || !this.target) return;
    this.done = true;
    if (this.slipped) return this.set({ status: 'slipped' });
    if (this.helped) return this.set({ status: 'helped' });
    this.s.onClean(this.symbol);
    this.set({ status: 'clean' });
  }
}
