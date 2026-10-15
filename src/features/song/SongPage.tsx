import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router';
import { audio, getTransport, lights, notes } from '@/app/services';
import { PATTERNS } from '@/content/patterns';
import { getSong } from '@/content/lessons';
import { compileLesson } from '@/core/content/compile';
import { formatChord, keyName } from '@/core/notation';
import { recordAttempt } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button } from '@/ui/Button';
import { ProgressTrack } from '@/ui/ProgressTrack';
import { Segmented } from '@/ui/Segmented';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';
import { KeyboardDock } from '@/ui/keyboard';
import { NotFoundPage } from '../not-found/NotFoundPage';
import { Score } from './Score';
import { SongController, type SongMode } from './SongController';
import styles from './SongPage.module.css';

const PRACTICE_HANDS = [
  { value: 'rh', label: 'Right hand' },
  { value: 'lh', label: 'Left hand', disabled: true },
  { value: 'both', label: 'Both hands', disabled: true },
] as const;

const MODES = [
  { value: 'listen', label: 'Listen' },
  { value: 'practice', label: 'Practice' },
] as const satisfies readonly { value: SongMode; label: string }[];

export function SongPage() {
  const { songId = '' } = useParams();
  const lesson = getSong(songId);
  if (!lesson) return <NotFoundPage />;
  return <SongPlayer key={lesson.id} lessonId={lesson.id} />;
}

function SongPlayer({ lessonId }: { lessonId: string }) {
  const lesson = getSong(lessonId)!;
  const compiled = useMemo(() => compileLesson(lesson, PATTERNS), [lesson]);
  const [ctrl] = useState(
    () =>
      new SongController(compiled, {
        transport: getTransport(),
        audio,
        lights,
        notes,
        onFinished: (r) => recordAttempt(lesson.id, r),
      }),
  );
  const snap = useSyncExternalStore(ctrl.subscribe, () => ctrl.snapshot);
  const notation = useSettings((s) => s.notation);
  const accidentalStyle = useSettings((s) => s.accidentalStyle);
  const metronome = useSettings((s) => s.metronome);
  const countInBars = useSettings((s) => s.countInBars);
  const setSettings = useSettings((s) => s.set);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ctrl.attach();
    ctrl.setProgressElement(progressRef.current);
    return () => ctrl.detach();
  }, [ctrl]);

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
  const playing = snap.transport === 'playing';
  const target = practice ? ctrl.target : null;
  const focus: [number, number] | undefined = target?.note
    ? [target.note.midi - 7, target.note.midi + 7]
    : [62, 76];

  return (
    <>
      <div className={styles.header}>
        <p className={styles.meta}>
          <Link to="/songs">Songs</Link>
        </p>
        <h1>{lesson.title}</h1>
        <p className={styles.meta}>
          {keyName(lesson.key)}, {lesson.meter.beats}/{lesson.meter.unit}, {lesson.bars.length} bars
        </p>
      </div>

      <div className={styles.panel} data-sticky-panel>
        <div className={styles.row}>
          <Segmented
            label="Mode"
            value={snap.mode}
            options={MODES}
            onChange={(m) => ctrl.setMode(m)}
          />
          <span className={styles.spacer} />
          <Toggle pressed={snap.rhOn} onChange={(v) => ctrl.setHand('rh', v)} tone="amber">
            Melody
          </Toggle>
          <Toggle pressed={snap.lhOn} onChange={(v) => ctrl.setHand('lh', v)} tone="dusk">
            Left hand
          </Toggle>
        </div>
        <div className={styles.row}>
          <Button
            variant="primary"
            onClick={() => ctrl.playPause()}
            disabled={practice}
            data-testid="play"
          >
            {playing ? 'Pause' : 'Play'}
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
              <Toggle pressed={snap.loop} onChange={(v) => ctrl.setLoop(v)}>
                Loop
              </Toggle>
              <Toggle pressed={metronome} onChange={(v) => setSettings({ metronome: v })}>
                Metronome
              </Toggle>
            </>
          )}
        </div>
        {practice ? (
          <div className={styles.row}>
            <Segmented
              label="Practice hand"
              value="rh"
              options={PRACTICE_HANDS}
              onChange={() => {}}
              describedBy="practice-hand-note"
            />
            <span id="practice-hand-note" className={styles.note}>
              Left hand and both hands arrive with chord practice.
            </span>
          </div>
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
        <ProgressTrack ref={progressRef} label="Position in the song" />
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
            Finished. {snap.finished.hits} hits and {snap.finished.misses} misses. Play the first
            note to go again.
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
        targetBar={target?.barIndex ?? -1}
        targetIndexInBar={target?.indexInBar ?? 0}
        onSelectBar={(i) => ctrl.selectBar(i)}
      />
      <KeyboardDock focus={focus} showTarget={practice} />
    </>
  );
}
