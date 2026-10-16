import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { audio, getTransport, lights, notes } from '@/app/services';
import type { CompiledLesson } from '@/core/content/compile';
import { formatChord } from '@/core/notation';
import type { PracticeHands } from '@/core/practice';
import { recordAttempt } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button } from '@/ui/Button';
import { ProgressTrack } from '@/ui/ProgressTrack';
import { Segmented } from '@/ui/Segmented';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';
import { dockRangeFor, KeyboardDock } from '@/ui/keyboard';
import { Score } from './Score';
import { SongController, type SongMode } from './SongController';
import styles from './SongPage.module.css';

const PRACTICE_HANDS = [
  { value: 'rh', label: 'Right hand' },
  { value: 'lh', label: 'Left hand' },
  { value: 'both', label: 'Both hands' },
] as const satisfies readonly { value: PracticeHands; label: string }[];

const HAND_NOTES: Record<PracticeHands, string> = {
  rh: 'Play the melody. The left hand rolls in on each new chord.',
  lh: 'Play each chord, in any octave or inversion. The melody plays along.',
  both: 'Play the melody, and hold each new chord with it.',
};

const SONG_MODES = [
  { value: 'listen', label: 'Listen' },
  { value: 'practice', label: 'Practice' },
] as const satisfies readonly { value: SongMode; label: string }[];

const PROGRESSION_MODES = [
  { value: 'listen', label: 'Listen' },
  { value: 'practice', label: 'Practice' },
  { value: 'playalong', label: 'Play-along' },
] as const satisfies readonly { value: SongMode; label: string }[];

export interface LessonPlayerProps {
  compiled: CompiledLesson;
  /**
   * Progress is recorded under this id (play-along runs under `${id}:play-along`).
   * Without one (a draft), nothing is recorded.
   */
  recordId?: string;
  /** song: melody plus left hand, with a hand selector. progression: chords only, with play-along. */
  variant: 'song' | 'progression';
  /** Settings that shape the lesson (key, pattern, voicing), shown in the sticky panel. */
  settings?: ReactNode;
}

/**
 * The shared player for songs and progressions: transport controls, mode,
 * practice and play-along state, the bar-card score and the keyboard dock.
 * Swapping `compiled` (a new key or pattern) keeps the mode and tempo.
 */
export function LessonPlayer({ compiled, recordId, variant, settings }: LessonPlayerProps) {
  const progression = variant === 'progression';
  const [ctrl] = useState(
    () =>
      new SongController(compiled, {
        transport: getTransport(),
        audio,
        lights,
        notes,
        ...(progression ? { initialHands: 'lh' as const } : {}),
        onFinished: (r) => {
          if (recordId) recordAttempt(recordId, r);
        },
        onPlayAlongDone: (s, tempo) => {
          if (recordId)
            recordAttempt(`${recordId}:play-along`, {
              hits: s.total - s.missed,
              misses: s.missed,
              tempo,
            });
        },
      }),
  );
  const snap = useSyncExternalStore(ctrl.subscribe, () => ctrl.snapshot);
  const notation = useSettings((s) => s.notation);
  const accidentalStyle = useSettings((s) => s.accidentalStyle);
  const metronome = useSettings((s) => s.metronome);
  const countInBars = useSettings((s) => s.countInBars);
  const setSettings = useSettings((s) => s.set);
  const progressRef = useRef<HTMLDivElement>(null);
  const lesson = compiled.lesson;

  useEffect(() => {
    ctrl.attach();
    ctrl.setProgressElement(progressRef.current);
    return () => ctrl.detach();
  }, [ctrl]);

  // A new key, pattern or voicing: swap the lesson, keep everything else.
  const loaded = useRef(compiled);
  useEffect(() => {
    if (loaded.current === compiled) return;
    loaded.current = compiled;
    ctrl.load(compiled);
  }, [ctrl, compiled]);

  useEffect(() => getTransport().setMetronome(metronome, countInBars), [metronome, countInBars]);

  // Space toggles play when nothing in particular has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== 'main') return;
      e.preventDefault();
      ctrl.playPause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl]);

  const practice = snap.mode === 'practice';
  const playAlong = snap.mode === 'playalong';
  const playing = snap.transport === 'playing';
  const target = practice ? ctrl.target : null;
  const firstChord = compiled.chords[0]?.voicing ?? [];
  const focus: [number, number] = target
    ? target.kind === 'note'
      ? [target.note.note!.midi - 7, target.note.note!.midi + 7]
      : [target.chord.voicing[0]!.midi, target.chord.voicing.at(-1)!.midi]
    : progression && firstChord.length
      ? [firstChord[0]!.midi, firstChord.at(-1)!.midi]
      : [62, 76];
  const what = progression ? 'progression' : 'song';
  const [low, high] = dockRange(compiled);

  return (
    <>
      <div className={styles.panel} data-sticky-panel>
        {settings}
        <div className={styles.row}>
          <Segmented
            label="Mode"
            value={snap.mode}
            options={progression ? PROGRESSION_MODES : SONG_MODES}
            onChange={(m) => ctrl.setMode(m)}
          />
          <span className={styles.spacer} />
          {progression ? (
            !practice ? (
              playAlong ? (
                <Toggle pressed={snap.backing} onChange={(v) => ctrl.setBacking(v)} tone="dusk">
                  Backing
                </Toggle>
              ) : (
                <Toggle pressed={snap.lhOn} onChange={(v) => ctrl.setHand('lh', v)} tone="dusk">
                  Comping
                </Toggle>
              )
            ) : null
          ) : (
            <>
              <Toggle pressed={snap.rhOn} onChange={(v) => ctrl.setHand('rh', v)} tone="amber">
                Melody
              </Toggle>
              <Toggle pressed={snap.lhOn} onChange={(v) => ctrl.setHand('lh', v)} tone="dusk">
                Left hand
              </Toggle>
            </>
          )}
        </div>
        <div className={styles.row}>
          <Button
            variant="primary"
            onClick={() => ctrl.playPause()}
            disabled={practice}
            data-testid="play"
          >
            {playing ? (playAlong ? 'Stop' : 'Pause') : 'Play'}
          </Button>
          <Button onClick={() => ctrl.restart()} disabled={practice}>
            Restart
          </Button>
          {practice ? (
            <>
              <Button variant="primary" onClick={() => ctrl.hearIt()}>
                Hear it
              </Button>
              <Button onClick={() => ctrl.startOver()}>Start over</Button>
            </>
          ) : (
            <>
              {!playAlong ? (
                <Toggle pressed={snap.loop} onChange={(v) => ctrl.setLoop(v)}>
                  Loop
                </Toggle>
              ) : (
                <Toggle pressed={snap.countInOn} onChange={(v) => ctrl.setCountIn(v)}>
                  Count-in
                </Toggle>
              )}
              <Toggle pressed={metronome} onChange={(v) => setSettings({ metronome: v })}>
                Metronome
              </Toggle>
            </>
          )}
        </div>
        {practice && !progression ? (
          <div className={styles.row}>
            <Segmented
              label="Practice hand"
              value={snap.hands}
              options={PRACTICE_HANDS}
              onChange={(h) => ctrl.setHands(h)}
              describedBy="practice-hand-note"
            />
            <span id="practice-hand-note" className={styles.note}>
              {HAND_NOTES[snap.hands]}
            </span>
          </div>
        ) : null}
        {practice && progression ? (
          <p className={styles.note}>
            Play each chord, in any octave or inversion. Take your time.
          </p>
        ) : null}
        {playAlong ? (
          <p className={styles.note}>
            Play each chord on the change. The keyboard shows what is coming.
          </p>
        ) : null}
        {!practice ? (
          <div className={styles.tempo}>
            <Slider
              label="Tempo"
              value={snap.tempo}
              min={lesson.tempo.min}
              max={lesson.tempo.max}
              onChange={(v) => ctrl.setTempo(v)}
              format={(v) => `${v} bpm`}
            />
          </div>
        ) : null}
        <ProgressTrack ref={progressRef} label={`Position in the ${what}`} />
        <div className={styles.statusLine}>
          <span data-testid="status-line">
            {snap.countIn !== null ? (
              <>Count-in, {snap.countIn}</>
            ) : (
              <>
                Bar {snap.bar + 1} of {compiled.bars.length},{' '}
                <span className={styles.chord}>
                  {snap.chordSymbol ? formatChord(snap.chordSymbol, lesson.key, notation) : ''}
                </span>
              </>
            )}
          </span>
          {practice ? (
            <span className={styles.counts} data-testid="counts">
              {snap.hits} hit{snap.hits === 1 ? '' : 's'}, {snap.misses} miss
              {snap.misses === 1 ? '' : 'es'}
            </span>
          ) : null}
        </div>
        {snap.finished ? (
          <p className={styles.finished} data-testid="finished">
            Finished. {snap.finished.hits} hits and {snap.finished.misses} misses.{' '}
            {progression ? 'Play the first chord to go again.' : 'Play the first note to go again.'}
          </p>
        ) : null}
        {snap.playSummary ? (
          <p className={styles.finished} data-testid="play-summary">
            {snap.playSummary.onTime} of {snap.playSummary.total} on time
            {snap.playSummary.early ? `, ${snap.playSummary.early} early` : ''}
            {snap.playSummary.late ? `, ${snap.playSummary.late} late` : ''}
            {snap.playSummary.missed ? `, ${snap.playSummary.missed} missed` : ''}
            {snap.playSummary.wrongNotes
              ? `, ${snap.playSummary.wrongNotes} wrong note${snap.playSummary.wrongNotes === 1 ? '' : 's'}`
              : ''}{' '}
            at {snap.tempo} bpm.
          </p>
        ) : null}
        <p className="visually-hidden" role="status" aria-live="polite">
          {snap.announcement}
        </p>
      </div>

      <Score
        compiled={compiled}
        notation={notation}
        accidentalStyle={accidentalStyle}
        mode={snap.mode}
        currentBar={snap.bar}
        activeChipId={snap.activeChipId}
        targetChipId={snap.targetChipId}
        targetChordId={snap.targetChordId}
        targetBeat={snap.targetBeat}
        showNumerals={progression}
        chordScores={snap.chordScores}
        onSelectBar={(i) => ctrl.selectBar(i)}
      />
      <KeyboardDock focus={focus} low={low} high={high} showTarget={practice && !progression} />
    </>
  );
}

const ranges = new WeakMap<CompiledLesson, [number, number]>();

/** A keyboard range that shows every note the lesson plays or asks for. */
function dockRange(c: CompiledLesson): [number, number] {
  let r = ranges.get(c);
  if (!r) {
    const midis = [
      ...c.bars.flatMap((b) => [...b.rh, ...b.lh].flatMap((n) => (n.note ? [n.note.midi] : []))),
      ...c.chords.flatMap((ch) => ch.voicing.map((n) => n.midi)),
      ...(c.fills ?? []).flatMap((f) => f.midis),
    ];
    r = dockRangeFor(midis);
    ranges.set(c, r);
  }
  return r;
}
