import type { Transport, TransportState } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import type { CompiledLesson, CompiledNote } from '@/core/content/compile';
import type { NoteStream } from '@/core/input';
import { barAt, chordAt, rhNoteAt, WaitSession } from '@/core/practice';
import type { KeyLights } from '@/state/keyLights';
import { WRONG_FLASH_MS } from '@/state/keyLights';

export type SongMode = 'listen' | 'practice';

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
  targetChipId: string | null;
  hits: number;
  misses: number;
  /** Set after the last note in Practice, until the next press or reset. */
  finished: { hits: number; misses: number } | null;
  /** Chord at the playhead (Listen) or at the target (Practice). */
  chordSymbol: string | null;
  /** Count-in beats left, or null. */
  countIn: number | null;
  /** Polite live-region text for practice feedback. */
  announcement: string;
}

export interface SongServices {
  transport: Transport;
  audio: AudioEngine;
  lights: KeyLights;
  notes: NoteStream;
  onFinished?: (result: { hits: number; misses: number }) => void;
}

const ROLL_GAP = 0.035;
const ROLL_LENGTH = 1.8;
const HEAR_IT_LENGTH = 0.55;

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

  constructor(
    readonly compiled: CompiledLesson,
    private readonly s: SongServices,
  ) {
    this.session = new WaitSession(compiled);
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
      targetChipId: null,
      hits: 0,
      misses: 0,
      finished: null,
      chordSymbol: compiled.chords[0]?.symbol ?? null,
      countIn: null,
      announcement: '',
    };
  }

  // ---- store -----------------------------------------------------------------

  get snapshot(): SongSnapshot {
    return this.snap;
  }

  /** The current practice target (melody note). */
  get target(): CompiledNote | null {
    return this.session.target;
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
    this.s.transport.setMuted(hand, !on);
    this.set(hand === 'rh' ? { rhOn: on } : { lhOn: on });
    if (this.snap.mode === 'practice') this.renderPractice();
  }

  // ---- listen --------------------------------------------------------------------

  playPause(): void {
    if (this.snap.mode !== 'listen') return;
    void this.s.audio.unlock();
    const t = this.s.transport;
    if (t.state === 'playing') t.pause();
    else if (t.state === 'paused') t.resume({ countInBars: 0 });
    else t.play(0);
  }

  restart(): void {
    if (this.snap.mode !== 'listen') return;
    const t = this.s.transport;
    if (t.state === 'playing') t.play(0);
    else t.stop();
  }

  /** Bar click (or Enter/Space on a bar). */
  selectBar(index: number): void {
    const bar = this.compiled.bars[index];
    if (!bar) return;
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
      this.set({ mode, targetChipId: null, finished: null, announcement: '' });
      if (target) t.seek(this.compiled.bars[target.barIndex]!.startBeat);
      else t.stop();
    }
  }

  // ---- practice ----------------------------------------------------------------

  hearIt(): void {
    const target = this.session.target;
    if (this.snap.mode !== 'practice' || !target?.note) return;
    void this.s.audio.unlock();
    this.s.audio.playAt(target.note.midi, this.s.audio.now() + 0.01, HEAR_IT_LENGTH, 0.5);
    this.s.lights.flash(target.note.midi, 'press', 400);
  }

  startOver(): void {
    if (this.snap.mode !== 'practice') return;
    this.session.reset();
    this.set({ finished: null, announcement: 'Back to the first note.' });
    this.renderPractice();
  }

  private onPress(midi: number): void {
    if (this.snap.mode !== 'practice') return;
    const r = this.session.press(midi);
    if (r.kind === 'miss') {
      this.s.lights.flash(midi, 'wrong', WRONG_FLASH_MS);
      this.set({
        misses: this.session.misses,
        announcement: `Not that one. ${this.session.misses} missed.`,
      });
      return;
    }
    if (r.kind !== 'hit') return;
    if (r.roll && this.snap.lhOn) {
      const t0 = this.s.audio.now() + 0.01;
      r.roll.voicing.forEach((n, i) =>
        this.s.audio.playAt(n.midi, t0 + i * ROLL_GAP, ROLL_LENGTH, i === 0 ? 0.3 : 0.17),
      );
    }
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
    const { lights } = this.s;
    lights.clear('rh');
    lights.setExactly('target', target?.note ? [target.note.midi] : []);
    lights.setExactly('lh', this.snap.lhOn && chord ? chord.voicing.map((n) => n.midi) : []);
    this.set({
      targetIndex: this.session.index,
      targetChipId: target?.id ?? null,
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
    if (this.snap.mode !== 'listen') return;
    const t = this.s.transport;
    const time = this.s.audio.now() - this.s.audio.outputLatency();
    const playing = t.state === 'playing';
    const beat = t.state === 'stopped' ? 0 : t.beatAt(time);
    const inSong = t.state !== 'stopped' && beat >= 0;
    const chip = inSong ? rhNoteAt(this.compiled, beat) : null;

    if (playing && beat >= 0) {
      const chord = chordAt(this.compiled, beat);
      this.s.lights.setExactly('rh', this.snap.rhOn && chip?.note ? [chip.note.midi] : []);
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
    for (const l of ['rh', 'lh', 'target'] as const) this.s.lights.clear(l);
  }
}
