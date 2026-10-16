import { MIX, mixVelocity } from '@config/mix';
import type { Transport, TransportState } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import {
  soundingSpans,
  spanDuration,
  type CompiledChord,
  type CompiledLesson,
} from '@/core/content/compile';
import type { NoteStream } from '@/core/input';
import {
  barAt,
  chordAt,
  PlayAlongScorer,
  rhNoteAt,
  WaitSession,
  type PlayAlongSummary,
  type Timing,
  type PracticeHands,
  type PracticeTarget,
} from '@/core/practice';
import type { KeyLights } from '@/state/keyLights';
import { WRONG_FLASH_MS } from '@/state/keyLights';

export type SongMode = 'listen' | 'practice' | 'playalong';

export interface SongSnapshot {
  mode: SongMode;
  transport: TransportState;
  tempo: number;
  loop: boolean;
  rhOn: boolean;
  lhOn: boolean;
  /** Current bar: the playhead's in Listen, the target's in Practice. */
  bar: number;
  /** Listen: the chip under the playhead (kept while paused). */
  activeChipId: string | null;
  /** Practice: index of the target among the melody notes. */
  targetIndex: number;
  /** Practice: which hands are practised. */
  hands: PracticeHands;
  /** Practice: the target melody chip (right hand, both hands). */
  targetChipId: string | null;
  /** Practice: the target chord (left hand). */
  targetChordId: string | null;
  /** Practice: beat of the target; chips before it show as done. */
  targetBeat: number;
  hits: number;
  misses: number;
  /** Set after the last note in Practice, until the next press or reset. */
  finished: { hits: number; misses: number } | null;
  /** Chord at the playhead (Listen) or at the target (Practice). */
  chordSymbol: string | null;
  /** Count-in beats left, or null. */
  countIn: number | null;
  /** Play-along: how each chord change was played so far, by chord id. */
  chordScores: Readonly<Record<string, Timing>>;
  /** Play-along: the result of the last complete run. */
  playSummary: PlayAlongSummary | null;
  /** Play-along: count in one bar before starting. */
  countInOn: boolean;
  /** Play-along: play the comping pattern while you play. */
  backing: boolean;
  /** Polite live-region text for practice feedback. */
  announcement: string;
}

export interface SongServices {
  transport: Transport;
  audio: AudioEngine;
  lights: KeyLights;
  notes: NoteStream;
  onFinished?: (result: { hits: number; misses: number }) => void;
  /** Play-along run completed: the summary and the tempo it was played at. */
  onPlayAlongDone?: (summary: PlayAlongSummary, tempo: number) => void;
  /** Practice hands to start with (the progression trainer practises chords). */
  initialHands?: PracticeHands;
}

const TIMING_WORDS: Record<Timing, string> = {
  'on-time': 'On time',
  early: 'Early',
  late: 'Late',
  missed: 'Missed',
};

/**
 * Drives one song page: Listen (transport playback with lit keys and chips)
 * and Practice (wait for each melody note). Plain TypeScript; the React page
 * subscribes to snapshots, which change only when something visible changes.
 */
export class SongController {
  private snap: SongSnapshot;
  private listeners = new Set<() => void>();
  private session: WaitSession;
  private raf = 0;
  private offs: (() => void)[] = [];
  private progressEl: HTMLElement | null = null;
  private scorer: PlayAlongScorer | null = null;
  private _compiled: CompiledLesson;

  constructor(
    compiled: CompiledLesson,
    private readonly s: SongServices,
  ) {
    this._compiled = compiled;
    const hands = s.initialHands ?? 'rh';
    this.session = new WaitSession(compiled, hands, compiled.lesson.rules.strictness);
    this.snap = {
      mode: 'listen',
      transport: 'stopped',
      tempo: compiled.lesson.tempo.default,
      loop: true,
      rhOn: true,
      lhOn: true,
      bar: 0,
      activeChipId: null,
      targetIndex: 0,
      hands,
      targetChipId: null,
      targetChordId: null,
      targetBeat: 0,
      hits: 0,
      misses: 0,
      finished: null,
      chordSymbol: compiled.chords[0]?.symbol ?? null,
      countIn: null,
      announcement: '',
      chordScores: {},
      playSummary: null,
      countInOn: true,
      backing: false,
    };
  }

  get compiled(): CompiledLesson {
    return this._compiled;
  }

  /**
   * Swap in a different lesson (another key, pattern or voicing) without
   * losing the mode, tempo, hands or toggles.
   */
  load(compiled: CompiledLesson): void {
    const t = this.s.transport;
    t.stop();
    this._compiled = compiled;
    this.session = new WaitSession(compiled, this.session.hands, compiled.lesson.rules.strictness);
    this.scorer = null;
    t.setTimeline(compiled.events, compiled.lengthBeats);
    t.setBeatsPerBar(compiled.beatsPerBar);
    if (this.snap.mode === 'playalong') t.setLoop(null);
    else this.applyLoop();
    this.clearLights();
    this.set({
      bar: 0,
      activeChipId: null,
      finished: null,
      hits: 0,
      misses: 0,
      chordScores: {},
      playSummary: null,
      countIn: null,
      chordSymbol: compiled.chords[0]?.symbol ?? null,
    });
    if (this.snap.mode === 'practice') this.renderPractice();
    else this.renderProgress(0);
  }

  // ---- store -----------------------------------------------------------------

  get snapshot(): SongSnapshot {
    return this.snap;
  }

  /** The current practice target. */
  get target(): PracticeTarget | null {
    return this.session.target;
  }

  /** Practice the right hand, the left hand (chords) or both. Keeps the place in the song. */
  setHands(hands: PracticeHands): void {
    if (hands === this.session.hands) return;
    const beat = this.session.target?.startBeat ?? 0;
    this.session = new WaitSession(this.compiled, hands, this.compiled.lesson.rules.strictness);
    this.session.goToBeat(beat);
    this.set({ hands, finished: null, hits: 0, misses: 0 });
    if (this.snap.mode === 'practice') this.renderPractice();
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<SongSnapshot>): void {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof SongSnapshot)[]) {
      if (this.snap[k] !== patch[k]) changed = true;
    }
    if (!changed) return;
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  /** The element whose fill shows progress; updated imperatively. */
  setProgressElement(el: HTMLElement | null): void {
    this.progressEl = el;
    this.renderProgress(this.snap.mode === 'practice' ? this.targetBeat() : 0);
  }

  // ---- lifecycle -------------------------------------------------------------

  attach(): void {
    const t = this.s.transport;
    t.stop();
    t.setTimeline(this.compiled.events, this.compiled.lengthBeats);
    t.setBeatsPerBar(this.compiled.beatsPerBar);
    t.setTempo(this.snap.tempo);
    t.setSwing(0);
    this.applyLoop();
    t.setMuted('rh', !this.snap.rhOn);
    t.setMuted('lh', !this.snap.lhOn);
    this.offs.push(t.subscribe(() => this.set({ transport: t.state })));
    this.offs.push(this.s.notes.subscribe((e) => e.type === 'on' && this.onPress(e.midi)));
    this.offs.push(t.onEnd(() => this.onTransportEnd()));
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
    this.s.transport.stop();
    this.clearLights();
    this.listeners.clear();
  }

  // ---- settings ----------------------------------------------------------------

  setTempo(bpm: number): void {
    this.s.transport.setTempo(bpm);
    this.set({ tempo: bpm });
  }

  setLoop(on: boolean): void {
    this.set({ loop: on });
    this.applyLoop();
  }

  private applyLoop(): void {
    this.s.transport.setLoop(this.snap.loop ? { start: 0, end: this.compiled.lengthBeats } : null);
  }

  setHand(hand: 'rh' | 'lh', on: boolean): void {
    if (!(this.snap.mode === 'playalong' && hand === 'lh')) this.s.transport.setMuted(hand, !on);
    this.set(hand === 'rh' ? { rhOn: on } : { lhOn: on });
    if (this.snap.mode === 'practice') this.renderPractice();
  }

  // ---- listen --------------------------------------------------------------------

  playPause(): void {
    if (this.snap.mode === 'practice') return;
    void this.s.audio.unlock();
    const t = this.s.transport;
    if (this.snap.mode === 'playalong') {
      if (t.state === 'playing') this.stopPlayAlong();
      else this.startPlayAlong();
      return;
    }
    if (t.state === 'playing') t.pause();
    else if (t.state === 'paused') t.resume({ countInBars: 0 });
    else t.play(0);
  }

  restart(): void {
    if (this.snap.mode === 'playalong') {
      void this.s.audio.unlock();
      this.startPlayAlong();
      return;
    }
    if (this.snap.mode !== 'listen') return;
    const t = this.s.transport;
    if (t.state === 'playing') t.play(0);
    else t.stop();
  }

  /** Bar click (or Enter/Space on a bar). */
  selectBar(index: number): void {
    const bar = this.compiled.bars[index];
    if (!bar || this.snap.mode === 'playalong') return;
    if (this.snap.mode === 'listen') {
      void this.s.audio.unlock();
      this.s.transport.play(bar.startBeat, { countInBars: 0 });
    } else {
      this.session.goToBar(index);
      this.set({ finished: null });
      this.renderPractice();
    }
  }

  // ---- mode ----------------------------------------------------------------------

  setMode(mode: SongMode): void {
    if (mode === this.snap.mode) return;
    const t = this.s.transport;
    const leavingPlayAlong = this.snap.mode === 'playalong';
    if (leavingPlayAlong) {
      this.scorer = null;
      this.applyLoop();
      t.setMuted('lh', !this.snap.lhOn);
      this.set({ chordScores: {}, playSummary: null });
    }
    if (mode === 'playalong') {
      t.stop();
      this.clearLights();
      t.setLoop(null);
      t.setMuted('lh', !this.snap.backing);
      this.set({
        mode,
        activeChipId: null,
        targetChipId: null,
        targetChordId: null,
        finished: null,
        countIn: null,
        bar: 0,
        chordScores: {},
        playSummary: null,
        announcement: '',
      });
      this.renderProgress(0);
      return;
    }
    if (mode === 'practice') {
      const beat = Math.max(0, t.beatAt());
      t.stop();
      this.clearLights();
      this.session.goToBeat(beat);
      this.set({ mode, activeChipId: null, finished: null, countIn: null });
      this.renderPractice();
    } else {
      const target = this.session.target;
      this.clearLights();
      this.set({ mode, targetChipId: null, targetChordId: null, finished: null, announcement: '' });
      if (target) t.seek(this.compiled.bars[target.barIndex]!.startBeat);
      else t.stop();
    }
  }

  // ---- play-along ----------------------------------------------------------------

  setCountIn(on: boolean): void {
    this.set({ countInOn: on });
  }

  setBacking(on: boolean): void {
    this.set({ backing: on });
    if (this.snap.mode === 'playalong') this.s.transport.setMuted('lh', !on);
  }

  private startPlayAlong(): void {
    const rules = this.compiled.lesson.rules;
    this.scorer = new PlayAlongScorer(this.compiled.chords, {
      strictness: rules.strictness,
      hitWindowMs: rules.hitWindowMs,
    });
    this.clearLights();
    this.set({ chordScores: {}, playSummary: null, announcement: '' });
    const t = this.s.transport;
    t.setLoop(null);
    t.setMuted('lh', !this.snap.backing);
    t.play(0, { countInBars: this.snap.countInOn ? 1 : 0 });
  }

  private stopPlayAlong(): void {
    this.s.transport.stop();
    this.scorer = null;
    this.clearLights();
    this.set({ countIn: null, bar: 0 });
    this.renderProgress(0);
  }

  private onTransportEnd(): void {
    if (this.snap.mode !== 'playalong' || !this.scorer) return;
    this.applyScores(this.scorer.update([], this.compiled.lengthBeats, this.snap.tempo));
    const summary = this.scorer.summary();
    this.scorer = null;
    this.clearLights();
    this.s.onPlayAlongDone?.(summary, this.snap.tempo);
    this.set({
      playSummary: summary,
      countIn: null,
      announcement: `Done: ${summary.onTime} of ${summary.total} on time, ${summary.missed} missed.`,
    });
  }

  /** Transport beat that is being heard now (what the player is playing along to). */
  private heardBeat(): number {
    return this.s.transport.beatAt(this.s.audio.now() - this.s.audio.outputLatency());
  }

  private applyScores(results: readonly { chordId: string; timing: Timing }[]): void {
    if (!results.length) return;
    const next = { ...this.snap.chordScores };
    for (const r of results) next[r.chordId] = r.timing;
    const last = results[results.length - 1]!;
    this.set({ chordScores: next, announcement: TIMING_WORDS[last.timing] });
  }

  private renderPlayAlong(): void {
    const t = this.s.transport;
    if (t.state !== 'playing' || !this.scorer) {
      this.s.lights.clear('chordTarget');
      if (this.snap.countIn !== null) this.set({ countIn: null });
      return;
    }
    const time = this.s.audio.now() - this.s.audio.outputLatency();
    const beat = t.beatAt(time);
    this.applyScores(this.scorer.update(this.s.notes.held(), beat, this.snap.tempo));
    // Show the chord to play: the current one, or the next one just before the change.
    const look = beat + 0.35;
    const chord =
      beat < 0
        ? this.compiled.chords[0]
        : chordAt(this.compiled, Math.min(look, this.compiled.lengthBeats - 1e-6));
    this.s.lights.setExactly('chordTarget', chord ? chord.voicing.map((n) => n.midi) : []);
    const countIn = t.countInRemaining(time);
    const now = beat < 0 ? this.compiled.chords[0] : chordAt(this.compiled, beat);
    this.set({
      bar: beat < 0 ? 0 : barAt(this.compiled, beat),
      chordSymbol: now?.symbol ?? null,
      countIn: countIn === null ? null : Math.ceil(countIn),
    });
    this.renderProgress(Math.max(0, beat));
  }

  // ---- practice ----------------------------------------------------------------

  hearIt(): void {
    const target = this.session.target;
    if (this.snap.mode !== 'practice' || !target) return;
    void this.s.audio.unlock();
    if (target.kind === 'chord') {
      this.rollChord(target.chord);
      for (const n of target.chord.voicing) this.s.lights.flash(n.midi, 'press', 400);
      return;
    }
    const midi = target.note.note!.midi;
    const { hearItLengthSec, hearItVelocity } = MIX.practice;
    this.s.audio.playAt(
      midi,
      this.s.audio.now() + 0.01,
      hearItLengthSec,
      mixVelocity('rh', hearItVelocity),
    );
    this.s.lights.flash(midi, 'press', 400);
  }

  private rollChord(chord: CompiledChord): void {
    const t0 = this.s.audio.now() + 0.01;
    const p = MIX.practice;
    chord.voicing.forEach((n, i) =>
      this.s.audio.playAt(
        n.midi,
        t0 + i * p.rollGapSec,
        p.rollLengthSec,
        mixVelocity('lh', i === 0 ? p.rollRootVelocity : p.rollVelocity),
      ),
    );
  }

  /** Left-hand practice: play the melody of a chord segment you just played, at the current tempo. */
  private playSegmentMelody(chord: CompiledChord): void {
    const bar = this.compiled.bars[chord.barIndex];
    if (!bar) return;
    const t0 = this.s.audio.now() + 0.02;
    const spb = 60 / this.snap.tempo;
    const end = chord.startBeat + chord.beats;
    const inChord = bar.rh.filter(
      (n) => n.startBeat >= chord.startBeat - 1e-9 && n.startBeat < end - 1e-9,
    );
    // Ties within the chord hold; a note tied in from the last chord is struck again,
    // since playback waited for you in between.
    for (const span of soundingSpans(inChord)) {
      this.s.audio.playAt(
        span.first.note!.midi,
        t0 + (span.startBeat - chord.startBeat) * spb,
        spanDuration(span, MIX.melody.legato) * spb,
        mixVelocity('rh', span.first.velocity),
      );
    }
  }

  startOver(): void {
    if (this.snap.mode !== 'practice') return;
    this.session.reset();
    this.set({ finished: null, announcement: 'Back to the first note.' });
    this.renderPractice();
  }

  private onPress(midi: number): void {
    if (this.snap.mode === 'playalong') {
      if (!this.scorer || this.s.transport.state !== 'playing') return;
      const beat = this.heardBeat();
      if (this.scorer.noteOn(midi, beat)) this.s.lights.flash(midi, 'wrong', WRONG_FLASH_MS);
      this.applyScores(this.scorer.update(this.s.notes.held(), beat, this.snap.tempo));
      return;
    }
    if (this.snap.mode !== 'practice') return;
    const r = this.session.press(midi, this.s.notes.held());
    if (r.kind === 'miss') {
      this.s.lights.flash(midi, 'wrong', WRONG_FLASH_MS);
      this.set({
        misses: this.session.misses,
        announcement: `Not that one. ${this.session.misses} missed.`,
      });
      return;
    }
    if (r.kind !== 'hit') return;
    if (r.roll && this.snap.lhOn) this.rollChord(r.roll);
    if (r.segment && this.snap.rhOn) this.playSegmentMelody(r.segment);
    if (r.finished) {
      this.s.onFinished?.(r.finished);
      this.set({
        finished: r.finished,
        announcement: `Finished: ${r.finished.hits} hits, ${r.finished.misses} misses.`,
      });
    } else if (this.snap.finished) {
      this.set({ finished: null });
    }
    this.renderPractice();
  }

  private targetBeat(): number {
    return this.session.target?.startBeat ?? 0;
  }

  private renderPractice(): void {
    const target = this.session.target;
    const chord = this.session.targetChord;
    const voicing = chord ? chord.voicing.map((n) => n.midi) : [];
    const { lights } = this.s;
    lights.clear('rh');
    if (target?.kind === 'chord') {
      lights.setExactly('target', []);
      lights.setExactly('lh', []);
      lights.setExactly('chordTarget', voicing);
    } else {
      const showChord = this.session.hands === 'both' || this.snap.lhOn;
      lights.setExactly('chordTarget', []);
      lights.setExactly('target', target ? [target.note.note!.midi] : []);
      lights.setExactly('lh', showChord ? voicing : []);
    }
    this.set({
      targetIndex: this.session.index,
      targetChipId: target?.kind === 'note' ? target.id : null,
      targetChordId: target?.kind === 'chord' ? target.id : null,
      targetBeat: target?.startBeat ?? 0,
      hits: this.session.hits,
      misses: this.session.misses,
      bar: target?.barIndex ?? 0,
      chordSymbol: chord?.symbol ?? null,
    });
    this.renderProgress(this.targetBeat());
  }

  // ---- per-frame (listen) ----------------------------------------------------------

  /** One visual frame in Listen mode. The page calls it via requestAnimationFrame. */
  renderFrame(): void {
    if (this.snap.mode === 'playalong') return this.renderPlayAlong();
    if (this.snap.mode !== 'listen') return;
    const t = this.s.transport;
    const time = this.s.audio.now() - this.s.audio.outputLatency();
    const playing = t.state === 'playing';
    const beat = t.state === 'stopped' ? 0 : t.beatAt(time);
    const inSong = t.state !== 'stopped' && beat >= 0;
    const chip = inSong ? rhNoteAt(this.compiled, beat) : null;

    if (playing && beat >= 0) {
      const chord = chordAt(this.compiled, beat);
      const fill = chip?.note
        ? undefined
        : this.compiled.fills?.find((f) => beat >= f.beat && beat < f.beat + f.dur);
      const rh = chip?.note ? [chip.note.midi] : (fill?.midis ?? []);
      this.s.lights.setExactly('rh', this.snap.rhOn ? rh : []);
      this.s.lights.setExactly(
        'lh',
        this.snap.lhOn && chord ? chord.voicing.map((n) => n.midi) : [],
      );
    } else {
      this.s.lights.clear('rh');
      this.s.lights.clear('lh');
    }
    const countIn = t.countInRemaining(time);
    const chordNow = inSong ? chordAt(this.compiled, beat) : this.compiled.chords[0];
    this.set({
      chordSymbol: chordNow?.symbol ?? null,
      activeChipId: chip?.id ?? null,
      bar: inSong ? barAt(this.compiled, beat) : 0,
      countIn: countIn === null ? null : Math.ceil(countIn),
    });
    this.renderProgress(inSong ? beat : 0);
  }

  private renderProgress(beat: number): void {
    if (!this.progressEl) return;
    const f = Math.max(0, Math.min(1, beat / this.compiled.lengthBeats));
    this.progressEl.style.transform = `scaleX(${f})`;
  }

  private clearLights(): void {
    for (const l of ['rh', 'lh', 'target', 'chordTarget'] as const) this.s.lights.clear(l);
  }
}
