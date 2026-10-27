import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { audio, getTransport, lights, notes } from '@/app/services';
import { useMediaQuery } from '@/app/hooks';
import { FILL_CATEGORIES, getFill } from '@/content/fills';
import {
  changeKey,
  compileFillExercise,
  FILL_CHANGES,
  type FillChange,
  type FillExercise,
} from '@/core/content/fills';
import { MAJOR_KEYS, MINOR_KEYS } from '@/core/content/realize';
import type { FillSpec } from '@/core/content/types';
import { formatChord, prettyAccidentals, prettyNumeral } from '@/core/notation';
import { romanToChord, type Mode } from '@/core/theory';
import { recordAttempt } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Select } from '@/ui/Select';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';
import { KeyboardDock } from '@/ui/keyboard';
import { NotFoundPage } from '../not-found/NotFoundPage';
import songStyles from '../song/SongPage.module.css';
import progStyles from '../progressions/progressions.module.css';
import { FillController, type FillMode } from './FillController';
import { FillStrip } from './FillStrip';
import styles from './fills.module.css';

const MODES = [
  { value: 'listen', label: 'Listen' },
  { value: 'practice', label: 'Practice' },
  { value: 'speed', label: 'Speed-up' },
] as const satisfies readonly { value: FillMode; label: string }[];

const KEY_MODES = [
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
] as const satisfies readonly { value: Mode; label: string }[];

const NEEDED = [2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}×` }));
const STEPS = [2, 5, 10].map((n) => ({ value: String(n), label: `+${n}` }));

/** Changes offered for a fill in a mode: its own suggestion first (major only). */
function changesFor(fill: FillSpec, mode: Mode): readonly FillChange[] {
  const list = FILL_CHANGES[mode];
  if (mode === 'minor') return list;
  const own = changeKey(fill.suggested);
  return [fill.suggested, ...list.filter((c) => changeKey(c) !== own)];
}

let lastExercise: { id: string; exercise: FillExercise } | null = null;

/** The same exercise object for the same settings, so the trainer only reloads on a change. */
function exerciseFor(fill: FillSpec, key: string, mode: Mode, change: FillChange): FillExercise {
  const id = `${fill.id}|${key}|${mode}|${changeKey(change)}`;
  if (lastExercise?.id !== id)
    lastExercise = { id, exercise: compileFillExercise(fill, { key, mode, change }) };
  return lastExercise.exercise;
}

export function FillPage() {
  const { fillId = '' } = useParams();
  const fill = getFill(fillId);
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get('mode') === 'minor' ? 'minor' : 'major';
  const keys: readonly string[] = mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
  const key = keys.includes(params.get('key') ?? '')
    ? params.get('key')!
    : mode === 'minor'
      ? 'A'
      : 'C';
  const changes = fill ? changesFor(fill, mode) : [];
  const change = changes.find((c) => changeKey(c) === params.get('change')) ?? changes[0];

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const exercise = fill && change ? exerciseFor(fill, key, mode, change) : null;
  const small = useMediaQuery('(max-width: 600px)');
  if (!fill || !exercise) return <NotFoundPage />;

  const keyLabel = (k: string) => `${prettyAccidentals(k)}${mode === 'minor' ? ' minor' : ''}`;
  const changeLabel = (c: FillChange) =>
    `${prettyNumeral(c.from)} → ${prettyNumeral(c.to)} (${prettyAccidentals(romanToChord(c.from, key, mode))} → ${prettyAccidentals(romanToChord(c.to, key, mode))})`;
  const category = FILL_CATEGORIES.find((c) => c.id === fill.category)!.name;

  const fields = (
    <div className={progStyles.settings}>
      <Segmented
        label="Key mode"
        value={mode}
        options={KEY_MODES}
        onChange={(m) => update({ mode: m, key: null, change: null })}
      />
      <Field label="Key">
        <Select value={key} onChange={(e) => update({ key: e.target.value })} data-testid="key">
          {keys.map((k) => (
            <option key={k} value={k}>
              {keyLabel(k)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Change">
        <Select
          value={changeKey(change!)}
          onChange={(e) => update({ change: e.target.value })}
          data-testid="change"
        >
          {changes.map((c) => (
            <option key={changeKey(c)} value={changeKey(c)}>
              {changeLabel(c)}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );

  return (
    <>
      <div className={songStyles.header}>
        <p className={songStyles.meta}>
          <Link to="/fills">Fills</Link>
        </p>
        <h1>{fill.name}</h1>
        <p className={songStyles.meta}>
          {category}, level {fill.level}, {fill.hand === 'rh' ? 'right hand' : 'left hand'}.{' '}
          {fill.description}
        </p>
      </div>
      <FillTrainer
        key={fill.id}
        exerciseId={fill.id}
        exercise={exercise}
        settings={
          small ? (
            <details className={progStyles.details}>
              <summary className={progStyles.summary}>
                {keyLabel(key)} · {prettyNumeral(change!.from)} → {prettyNumeral(change!.to)}
              </summary>
              {fields}
            </details>
          ) : (
            fields
          )
        }
      />
    </>
  );
}

function FillTrainer({
  exercise,
  exerciseId,
  settings,
}: {
  exercise: FillExercise;
  exerciseId: string;
  settings: React.ReactNode;
}) {
  const [ctrl] = useState(
    () =>
      new FillController(exercise, {
        transport: getTransport(),
        audio,
        lights,
        notes,
        onRound: (r) => recordAttempt(`fill:${exerciseId}`, r),
        onSpeedSession: (r) =>
          recordAttempt(`fill:${exerciseId}:speed`, {
            hits: r.clean,
            misses: r.reps - r.clean,
            ...(r.best !== null ? { tempo: r.best } : {}),
          }),
      }),
  );
  const snap = useSyncExternalStore(ctrl.subscribe, () => ctrl.snapshot);
  const notation = useSettings((s) => s.notation);
  const accidentalStyle = useSettings((s) => s.accidentalStyle);
  const small = useMediaQuery('(max-width: 600px)');

  useEffect(() => {
    ctrl.attach();
    return () => ctrl.detach();
  }, [ctrl]);

  const loaded = useRef(exercise);
  useEffect(() => {
    if (loaded.current === exercise) return;
    loaded.current = exercise;
    ctrl.load(exercise);
  }, [ctrl, exercise]);

  // The metronome stays off here; the backing chords keep time.
  useEffect(() => getTransport().setMetronome(false, 0), []);

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

  const key = { tonic: exercise.context.key, mode: exercise.context.mode };
  const practice = snap.mode === 'practice';
  const speed = snap.mode === 'speed';
  const playing = snap.transport === 'playing';
  const chord = exercise.chords[snap.chordIndex]!;
  const lastRep = snap.lastRep;

  const speedSettings = (
    <div className={styles.speedSettings}>
      <Slider
        label="Start at"
        value={snap.speed.start}
        min={40}
        max={140}
        onChange={(v) => ctrl.setSpeed({ start: v })}
        format={(v) => `${v} bpm`}
      />
      <Slider
        label="Work up to"
        value={snap.speed.goal}
        min={40}
        max={160}
        onChange={(v) => ctrl.setSpeed({ goal: v })}
        format={(v) => `${v} bpm`}
      />
      <div className={styles.speedField}>
        <span>Clean in a row</span>
        <Segmented
          label="Clean in a row"
          value={String(snap.speed.needed)}
          options={NEEDED}
          onChange={(v) => ctrl.setSpeed({ needed: Number(v) })}
        />
      </div>
      <div className={styles.speedField}>
        <span>Then faster by</span>
        <Segmented
          label="Then faster by"
          value={String(snap.speed.step)}
          options={STEPS}
          onChange={(v) => ctrl.setSpeed({ step: Number(v) })}
        />
      </div>
    </div>
  );

  return (
    <>
      <div className={styles.panel}>
        {settings}
        <div className={songStyles.row}>
          <Segmented
            label="Mode"
            value={snap.mode}
            options={MODES}
            onChange={(m) => ctrl.setMode(m)}
          />
          <span className={songStyles.spacer} />
          <Toggle pressed={snap.backing} onChange={(v) => ctrl.setBacking(v)} tone="dusk">
            Chords
          </Toggle>
          {snap.mode !== 'listen' ? (
            <Toggle
              pressed={snap.match === 'exact'}
              onChange={(v) => ctrl.setMatch(v ? 'exact' : 'any-octave')}
            >
              Exact octave
            </Toggle>
          ) : null}
        </div>
      </div>

      <FillStrip
        exercise={exercise}
        notation={notation}
        accidentalStyle={accidentalStyle}
        activeHit={snap.activeHit}
        doneBefore={snap.doneBefore}
        practice={practice}
        chordIndex={snap.chordIndex}
      />

      <div className={styles.controls}>
        {practice ? (
          <div className={songStyles.row}>
            <Button variant="primary" onClick={() => ctrl.hearIt()}>
              Hear it
            </Button>
            <span className={songStyles.note}>
              Play each note when you&apos;re ready; the chords come in as you reach them.
            </span>
          </div>
        ) : (
          <div className={songStyles.row}>
            <Button variant="primary" onClick={() => ctrl.playPause()} data-testid="play">
              {playing ? 'Stop' : speed ? 'Start' : 'Play'}
            </Button>
            {snap.mode === 'listen' ? (
              <div className={songStyles.tempo}>
                <Slider
                  label="Tempo"
                  value={snap.tempo}
                  min={40}
                  max={140}
                  onChange={(v) => ctrl.setTempo(v)}
                  format={(v) => `${v} bpm`}
                />
              </div>
            ) : (
              <div className={styles.speedStatus} data-testid="speed-status">
                <span className={styles.speedTempo}>{snap.speedTempo} bpm</span>
                <span
                  className={styles.streak}
                  role="img"
                  aria-label={`${snap.streak} of ${snap.speed.needed} clean`}
                >
                  {Array.from({ length: snap.speed.needed }, (_, i) => (
                    <span key={i} className={styles.dot} data-on={i < snap.streak || undefined} />
                  ))}
                </span>
                <span className={songStyles.counts}>
                  {snap.reps
                    ? `${snap.cleanReps} of ${snap.reps} clean${snap.best !== null ? `, best ${snap.best} bpm` : ''}`
                    : `Goal ${snap.speed.goal} bpm`}
                </span>
                {lastRep ? (
                  <span className={styles.repResult} data-clean={lastRep.clean || undefined}>
                    {lastRep.clean
                      ? 'Last time: clean'
                      : `Last time: ${lastRep.onTime} of ${lastRep.notes} on time${lastRep.wrong ? `, ${lastRep.wrong} wrong` : ''}`}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        )}

        {speed && !playing ? (
          small ? (
            <details className={progStyles.details}>
              <summary className={progStyles.summary}>
                {snap.speed.start} → {snap.speed.goal} bpm · {snap.speed.needed}× clean · +
                {snap.speed.step}
              </summary>
              {speedSettings}
            </details>
          ) : (
            speedSettings
          )
        ) : null}
        {speed ? (
          <p className={songStyles.note}>
            One bar to count in, then play the fill each time round. {snap.speed.needed} clean in a
            row and it speeds up.
          </p>
        ) : null}

        <div className={songStyles.statusLine}>
          <span data-testid="status-line">
            {snap.countIn !== null ? (
              <>Count-in, {snap.countIn}</>
            ) : (
              <>
                Bar {snap.chordIndex + 1} of 2,{' '}
                <span className={songStyles.chord}>{formatChord(chord.symbol, key, notation)}</span>
              </>
            )}
          </span>
          {practice ? (
            <span className={songStyles.counts} data-testid="counts">
              {snap.misses} missed this time through
              {snap.rounds ? `, ${snap.rounds} done` : ''}
            </span>
          ) : null}
        </div>
        <p className="visually-hidden" role="status" aria-live="polite">
          {snap.announcement}
        </p>
      </div>
      <KeyboardDock focus={exercise.range} showTarget={practice || speed} />
    </>
  );
}
