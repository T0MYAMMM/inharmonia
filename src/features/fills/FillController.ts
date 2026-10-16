import { MIX, mixVelocity } from '@config/mix';
import type { Transport, TransportState } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import { CHANGE_BEAT, EXERCISE_BEATS, type FillExercise } from '@/core/content/fills';
import type { NoteStream } from '@/core/input';
import {
  DEFAULT_SPEED,
  FillRepScorer,
  FillWaitSession,
  SpeedLadder,
  type FillMatch,
  type RepResult,
  type SpeedSettings,
} from '@/core/practice';
import type { KeyLights } from '@/state/keyLights';
import { WRONG_FLASH_MS } from '@/state/keyLights';

export type FillMode = 'listen' | 'practice' | 'speed';

/** How long either side of a note counts as on time in speed-up. */
export const FILL_WINDOW_MS = 150;

export interface FillSnapshot {
  mode: FillMode;
  transport: TransportState;
  /** Listen tempo, bpm. */
  tempo: number;
  /** Play the held chords under the fill. */
  backing: boolean;
  match: FillMatch;
  /** Listen: the hit sounding now. Practice: the hit to play. */
  activeHit: number | null;
  /** Hits before this are done (practice). */
  doneBefore: number;
  hits: number;
  misses: number;
  /** Practice: rounds played through. */
  rounds: number;
  /** Chord under the playhead or the target. */
  chordIndex: 0 | 1;
  // Speed-up
  speed: SpeedSettings;
  speedTempo: number;
  streak: number;
  reps: number;
  cleanReps: number;
  best: number | null;
  lastRep: RepResult | null;
  /** Count-in beats left, or null. */
  countIn: number | null;
  announcement: string;
}

export interface FillServices {
  transport: Transport;
  audio: AudioEngine;
  lights: KeyLights;
  notes: NoteStream;
  /** A practice round played through. */
  onRound?: (result: { hits: number; misses: number }) => void;
  /** A speed-up session ended (stopped, mode left or page left) after at least one repetition. */
  onSpeedSession?: (result: { clean: number; reps: number; best: number | null }) => void;
}

/**
 * Drives the fill trainer: Listen (the two-bar loop with the fill), Practice
 * (wait for each note) and Speed-up (timed repetitions on a loop; a run of
 * clean ones moves the tempo up). Plain TypeScript, like SongController.
 */
export class FillController {
  private snap: FillSnapshot;
  private listeners = new Set<() => void>();
  private session: FillWaitSession;
  private ladder: SpeedLadder | null = null;
  private scorer: FillRepScorer | null = null;
  private nextScorer: FillRepScorer | null = null;
  private lastBeat = -Infinity;
  private raf = 0;
  private offs: (() => void)[] = [];
  private _exercise: FillExercise;

  constructor(
    exercise: FillExercise,
    private readonly s: FillServices,
  ) {
    this._exercise = exercise;
    this.session = new FillWaitSession(exercise.hits);
    this.snap = {
      mode: 'listen',
      transport: 'stopped',
      tempo: 72,
      backing: true,
      match: 'any-octave',
      activeHit: null,
      doneBefore: 0,
      hits: 0,
      misses: 0,
      rounds: 0,
      chordIndex: 0,
      speed: DEFAULT_SPEED,
      speedTempo: DEFAULT_SPEED.start,
      streak: 0,
      reps: 0,
      cleanReps: 0,
      best: null,
      lastRep: null,
      countIn: null,
      announcement: '',
    };
  }

  get exercise(): FillExercise {
    return this._exercise;
  }

  get snapshot(): FillSnapshot {
    return this.snap;
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<FillSnapshot>): void {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof FillSnapshot)[])
      if (this.snap[k] !== patch[k]) changed = true;
    if (!changed) return;
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  // ---- lifecycle -------------------------------------------------------------

  attach(): void {
    const t = this.s.transport;
    t.stop();
    this.applyTimeline();
    t.setTempo(this.snap.tempo);
    t.setSwing(0);
    this.offs.push(t.subscribe(() => this.set({ transport: t.state })));
    this.offs.push(this.s.notes.subscribe((e) => e.type === 'on' && this.onPress(e.midi)));
    const frame = () => {
      this.renderFrame();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  detach(): void {
    cancelAnimationFrame(this.raf);
    this.offs.forEach((o) => o());
    this.offs = [];
    this.endSpeedSession();
    this.s.transport.stop();
    this.clearLights();
    this.listeners.clear();
  }

  private applyTimeline(): void {
    const t = this.s.transport;
    t.setTimeline(this._exercise.events, EXERCISE_BEATS);
    t.setBeatsPerBar(4);
    t.setLoop({ start: 0, end: EXERCISE_BEATS });
    this.applyBacking();
  }

  private applyBacking(): void {
    const backingHand = this._exercise.fill.hand === 'rh' ? 'lh' : 'rh';
    const fillHand = this._exercise.fill.hand;
    // In Practice and Speed-up you play the fill; the transport only plays the backing.
    this.s.transport.setMuted(fillHand, this.snap.mode !== 'listen');
    this.s.transport.setMuted(backingHand, !this.snap.backing);
  }

  /** Another key, change or fill. Keeps the mode and settings. */
  load(exercise: FillExercise): void {
    this.endSpeedSession();
    this.s.transport.stop();
    this._exercise = exercise;
    this.session = new FillWaitSession(exercise.hits, this.snap.match);
    this.applyTimeline();
    this.clearLights();
    this.set({ activeHit: null, doneBefore: 0, hits: 0, misses: 0, lastRep: null, countIn: null });
    if (this.snap.mode === 'practice') this.renderPractice();
  }

  // ---- settings --------------------------------------------------------------

  setTempo(bpm: number): void {
    this.set({ tempo: bpm });
    if (this.snap.mode !== 'speed') this.s.transport.setTempo(bpm);
  }

  setBacking(on: boolean): void {
    this.set({ backing: on });
    this.applyBacking();
  }

  setMatch(match: FillMatch): void {
    this.set({ match });
    this.session = new FillWaitSession(this._exercise.hits, match);
    if (this.snap.mode === 'practice') this.renderPractice();
  }

  setSpeed(patch: Partial<SpeedSettings>): void {
    const next = { ...this.snap.speed, ...patch };
    if (next.goal < next.start) {
      if (patch.goal !== undefined) next.start = next.goal;
      else next.goal = next.start;
    }
    this.set({ speed: next });
    if (this.s.transport.state !== 'playing') this.set({ speedTempo: next.start });
  }

  setMode(mode: FillMode): void {
    if (mode === this.snap.mode) return;
    if (this.snap.mode === 'speed') this.endSpeedSession();
    this.s.transport.stop();
    this.clearLights();
    this.set({
      mode,
      activeHit: null,
      doneBefore: 0,
      countIn: null,
      announcement: '',
      lastRep: null,
    });
    this.s.transport.setTempo(this.snap.tempo);
    this.applyBacking();
    if (mode === 'practice') {
      this.session.reset();
      this.set({ hits: 0, misses: 0 });
      this.renderPractice();
    }
    if (mode === 'speed') this.set({ speedTempo: this.snap.speed.start, streak: 0 });
  }

  // ---- transport -------------------------------------------------------------

  playPause(): void {
    if (this.snap.mode === 'practice') return;
    void this.s.audio.unlock();
    const t = this.s.transport;
    if (this.snap.mode === 'speed') {
      if (t.state === 'playing') this.stopSpeed();
      else this.startSpeed();
      return;
    }
    if (t.state === 'playing') t.stop();
    else t.play(0, { countInBars: 0 });
  }

  // ---- speed-up --------------------------------------------------------------

  private startSpeed(): void {
    this.ladder = new SpeedLadder(this.snap.speed);
    this.scorer = this.newScorer();
    this.nextScorer = this.newScorer();
    this.lastBeat = -Infinity;
    const t = this.s.transport;
    t.setTempo(this.ladder.tempo);
    this.set({
      speedTempo: this.ladder.tempo,
      streak: 0,
      reps: 0,
      cleanReps: 0,
      best: null,
      lastRep: null,
      announcement: `Starting at ${this.ladder.tempo} bpm.`,
    });
    t.play(0, { countInBars: 1 });
  }

  private stopSpeed(): void {
    this.endSpeedSession();
    this.s.transport.stop();
    this.clearLights();
    this.set({ countIn: null, activeHit: null });
  }

  private endSpeedSession(): void {
    const l = this.ladder;
    this.ladder = null;
    this.scorer = null;
    this.nextScorer = null;
    if (l && l.reps > 0) this.s.onSpeedSession?.({ clean: l.clean, reps: l.reps, best: l.best });
  }

  private newScorer(): FillRepScorer {
    return new FillRepScorer(this._exercise.hits, {
      windowMs: FILL_WINDOW_MS,
      match: this.snap.match,
    });
  }

  /** The loop came round: score the repetition and maybe speed up. */
  private finishRep(): void {
    if (!this.ladder || !this.scorer) return;
    const result = this.scorer.result();
    this.scorer = this.nextScorer ?? this.newScorer();
    this.nextScorer = this.newScorer();
    const event = this.ladder.rep(result.clean);
    const tempo = this.ladder.tempo;
    if (event === 'up') this.s.transport.setTempo(tempo);
    const needed = this.snap.speed.needed;
    const announcement =
      event === 'up'
        ? `Clean ${needed} times. Up to ${tempo} bpm.`
        : event === 'goal'
          ? `Clean ${needed} times at ${tempo} bpm, your goal.`
          : result.clean
            ? `Clean. ${this.ladder.streak} of ${needed}.`
            : describeRep(result);
    this.set({
      lastRep: result,
      speedTempo: tempo,
      streak: this.ladder.streak,
      reps: this.ladder.reps,
      cleanReps: this.ladder.clean,
      best: this.ladder.best,
      announcement,
    });
  }

  private heardBeat(): number {
    return this.s.transport.beatAt(this.s.audio.now() - this.s.audio.outputLatency());
  }

  // ---- input -----------------------------------------------------------------

  private onPress(midi: number): void {
    if (this.snap.mode === 'speed') {
      if (!this.scorer || this.s.transport.state !== 'playing') return;
      const beat = this.heardBeat();
      const bpm = this.ladder?.tempo ?? this.snap.speed.start;
      const w = this.scorer.windowBeats(bpm);
      if (beat < -w) return; // count-in
      // Early for the next time round the loop.
      const ok =
        beat > EXERCISE_BEATS - w && this.nextScorer
          ? this.nextScorer.noteOn(midi, beat - EXERCISE_BEATS, bpm)
          : this.scorer.noteOn(midi, beat, bpm);
      if (!ok) this.s.lights.flash(midi, 'wrong', WRONG_FLASH_MS);
      return;
    }
    if (this.snap.mode !== 'practice') return;
    const r = this.session.press(midi);
    if (r.kind === 'miss') {
      this.s.lights.flash(midi, 'wrong', WRONG_FLASH_MS);
      this.set({ misses: this.session.misses, announcement: 'Not that one.' });
      return;
    }
    if (r.kind !== 'hit') return;
    // Bring the chords in as you reach them.
    const ex = this._exercise;
    if (this.snap.backing) {
      if (r.index === 0 && r.target.beat < CHANGE_BEAT) this.rollChord(0);
      const prev = ex.hits[r.index - 1];
      if (r.target.beat >= CHANGE_BEAT && (!prev || prev.beat < CHANGE_BEAT)) this.rollChord(1);
    }
    if (r.finished) {
      this.s.onRound?.(r.finished);
      this.set({
        rounds: this.snap.rounds + 1,
        hits: r.finished.hits,
        misses: r.finished.misses,
        announcement:
          r.finished.misses === 0
            ? 'Clean. Again from the top.'
            : `Through, with ${r.finished.misses} missed. Again from the top.`,
      });
    } else {
      this.set({ hits: this.session.hits, announcement: '' });
    }
    this.renderPractice();
  }

  /** Practice: hear the next notes. */
  hearIt(): void {
    const target = this.session.target;
    if (this.snap.mode !== 'practice' || !target) return;
    void this.s.audio.unlock();
    const t0 = this.s.audio.now() + 0.01;
    for (const n of target.notes) {
      this.s.audio.playAt(
        n.midi,
        t0,
        MIX.practice.hearItLengthSec,
        mixVelocity(this._exercise.fill.hand, MIX.practice.hearItVelocity),
      );
      this.s.lights.flash(n.midi, 'press', 400);
    }
  }

  private rollChord(index: 0 | 1): void {
    const chord = this._exercise.chords[index];
    if (!chord) return;
    const hand = this._exercise.fill.hand === 'rh' ? 'lh' : 'rh';
    const t0 = this.s.audio.now() + 0.01;
    const p = MIX.practice;
    chord.voicing.forEach((n, i) =>
      this.s.audio.playAt(
        n.midi,
        t0 + i * p.rollGapSec,
        p.rollLengthSec,
        mixVelocity(hand, i === 0 ? p.rollRootVelocity : p.rollVelocity),
      ),
    );
  }

  // ---- rendering -------------------------------------------------------------

  private renderPractice(): void {
    const target = this.session.target;
    const { lights } = this.s;
    lights.setExactly('target', target ? target.notes.map((n) => n.midi) : []);
    const chordIndex = target && target.beat >= CHANGE_BEAT ? 1 : 0;
    lights.setExactly(
      'lh',
      this._exercise.chords[chordIndex]!.voicing.map((n) => n.midi),
    );
    this.set({
      activeHit: this.session.index,
      doneBefore: this.session.index,
      chordIndex,
    });
  }

  /** One visual frame (Listen and Speed-up). The page calls it via requestAnimationFrame. */
  renderFrame(): void {
    const mode = this.snap.mode;
    if (mode === 'practice') return;
    const t = this.s.transport;
    const time = this.s.audio.now() - this.s.audio.outputLatency();
    if (t.state !== 'playing') {
      if (this.snap.activeHit !== null || this.snap.countIn !== null) {
        this.clearLights();
        this.set({ activeHit: null, countIn: null });
      }
      return;
    }
    const beat = t.beatAt(time);
    if (mode === 'speed' && beat < this.lastBeat - EXERCISE_BEATS / 2) this.finishRep();
    this.lastBeat = beat;
    const ex = this._exercise;
    const chordIndex: 0 | 1 = beat >= CHANGE_BEAT ? 1 : 0;
    const sounding =
      beat < 0 ? -1 : ex.hits.findIndex((h) => beat >= h.beat && beat < h.beat + h.dur);
    const { lights } = this.s;
    const chord = this.snap.backing && beat >= 0 ? ex.chords[chordIndex]!.voicing : [];
    const chordMidis = chord.map((n) => n.midi);
    if (mode === 'listen') {
      const fillMidis = ex.hits[sounding]?.notes.map((n) => n.midi) ?? [];
      // Chord tones are dusk; a right-hand fill is amber, a left-hand one dusk with the chord.
      if (ex.fill.hand === 'rh') {
        lights.setExactly('rh', fillMidis);
        lights.setExactly('lh', chordMidis);
      } else {
        lights.setExactly('lh', [...chordMidis, ...fillMidis]);
      }
    } else {
      // Speed-up: light the next notes just before they are due.
      const bpm = this.ladder?.tempo ?? this.snap.speed.start;
      const next = ex.hits.find((h) => h.beat + 0.1 > beat && h.beat - beat < 0.75 * (bpm / 60));
      lights.setExactly('target', next ? next.notes.map((n) => n.midi) : []);
      lights.setExactly('lh', chordMidis);
    }
    const countIn = t.countInRemaining(time);
    this.set({
      activeHit: sounding >= 0 ? sounding : null,
      chordIndex,
      countIn: countIn === null ? null : Math.ceil(countIn),
    });
  }

  private clearLights(): void {
    for (const l of ['rh', 'lh', 'target', 'chordTarget'] as const) this.s.lights.clear(l);
  }
}

function describeRep(r: RepResult): string {
  const parts: string[] = [];
  if (r.missed) parts.push(`${r.missed} missed`);
  if (r.wrong) parts.push(`${r.wrong} wrong`);
  return `Not clean: ${parts.join(', ')}. Streak back to 0.`;
}
