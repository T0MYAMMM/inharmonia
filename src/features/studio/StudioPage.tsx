import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { mixVelocity } from '@config/mix';
import { audio, getTransport } from '@/app/services';
import { PATTERNS } from '@/content/patterns';
import { compileLesson } from '@/core/content/compile';
import type { Lesson } from '@/core/content/types';
import {
  fromHarmonization,
  toUserRecording,
  traceOf,
  type SongDraft,
  type UserRecording,
} from '@/core/songs';
import {
  draftMelody,
  HOP_SEC,
  SEGMENT_CONFIG,
  type GridStep,
  type Harmonization,
  type QuantizeOptions,
} from '@/core/transcription';
import { MAJOR_KEYS, MINOR_KEYS } from '@/core/content/realize';
import { formatNote, keyName, prettyAccidentals } from '@/core/notation';
import { useSettings } from '@/state/settings';
import { BetaBadge } from '@/ui/BetaBadge';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';
import page from '../page.module.css';
import { LessonPlayer } from '../song/LessonPlayer';
import song from '../song/SongPage.module.css';
import { createWorkerAnalyzer } from './capture/analysis';
import { Microphone } from './capture/microphone';
import { ChordSuggestions } from './ChordSuggestions';
import { LiveInput } from './LiveInput';
import { problemMessage } from './messages';
import { CALIBRATION_CLICKS, StudioController, type Take } from './StudioController';
import type { EditorTakeAudio } from './EditorPlayback';
import type { EditorTrace } from './editorModel';
import { SongEditor } from './SongEditor';
import { TakeView } from './TakeView';
import styles from './studio.module.css';

const METERS = [
  { value: '4', label: '4/4' },
  { value: '3', label: '3/4' },
  { value: '2', label: '2/4' },
] as const;
const BARS = [4, 8, 12, 16, 24, 32];
const GRIDS = [
  { value: '1', label: '1/4' },
  { value: '0.5', label: '1/8' },
  { value: '0.25', label: '1/16' },
] as const;

function makeController() {
  return new StudioController({
    transport: getTransport(),
    audio,
    analyzer: createWorkerAnalyzer(),
    openMic: (ctx) => Microphone.open(ctx),
    latencyMs: () => useSettings.getState().inputLatencyMs,
    saveLatency: (ms) => useSettings.getState().set({ inputLatencyMs: ms }),
    restoreMetronome: () => {
      const s = useSettings.getState();
      getTransport().setMetronome(s.metronome, s.countInBars);
    },
    // Announced on the window for tests (and any tool) that need to sing on the beat.
    onTakeStart: (detail) =>
      window.dispatchEvent(new CustomEvent('inharmonia:take-start', { detail })),
  });
}

export function StudioPage() {
  const [ctrl] = useState(makeController);
  const snap = useSyncExternalStore(ctrl.subscribe, () => ctrl.snapshot);
  const studio = useSettings((s) => s.studio);
  const latency = useSettings((s) => s.inputLatencyMs);
  const set = useSettings((s) => s.set);
  useEffect(() => () => ctrl.dispose(), [ctrl]);

  const busy =
    snap.phase === 'counting' || snap.phase === 'recording' || snap.phase === 'calibrating';
  const setStudio = (patch: Partial<typeof studio>) => set({ studio: { ...studio, ...patch } });
  const problem = snap.problem ? problemMessage(snap.problem) : null;
  const warning = snap.warning ? problemMessage(snap.warning) : null;
  const [draft, setDraft] = useState<Lesson | null>(null);
  const [editing, setEditing] = useState<EditorInput | null>(null);

  const tryDraft = (lesson: Lesson) => {
    ctrl.disable();
    setDraft(lesson);
    window.scrollTo?.(0, 0);
  };
  const edit = (input: EditorInput) => {
    ctrl.disable();
    setEditing(input);
    window.scrollTo?.(0, 0);
  };
  const backFromTry = () => {
    setDraft(null);
    if (!editing)
      requestAnimationFrame(() =>
        document.getElementById('chords-title')?.scrollIntoView({ block: 'start' }),
      );
  };
  const backFromEdit = () => {
    setEditing(null);
    requestAnimationFrame(() =>
      document.getElementById('chords-title')?.scrollIntoView({ block: 'start' }),
    );
  };

  return (
    <>
      {draft ? (
        <DraftView
          lesson={draft}
          onBack={backFromTry}
          backLabel={editing ? 'Back to the editor' : 'Back to the take'}
        />
      ) : null}
      {editing ? (
        <div hidden={draft !== null}>
          <div className={song.header}>
            <p className={song.meta}>
              <Button
                variant="ghost"
                size="small"
                onClick={backFromEdit}
                data-testid="back-to-take"
              >
                ← Back to the take
              </Button>
            </p>
            <h1>Edit your song</h1>
          </div>
          <SongEditor
            key={editing.key}
            initial={editing.initial}
            song={null}
            take={editing.take}
            hasKeptRecording={false}
            makeRecording={editing.makeRecording}
            recordingBytes={editing.recordingBytes}
            onSaved={() => undefined}
            onTry={tryDraft}
          />
        </div>
      ) : null}
      <div hidden={draft !== null || editing !== null}>
        <div className={page.hero}>
          <h1>
            Studio <BetaBadge />
          </h1>
          <p className={page.lede}>
            Sing or hum a melody against the click and Inharmonia writes it down: notes on the beat
            grid and the key. Everything stays on this device.
          </p>
        </div>

        <section className={styles.card} aria-labelledby="setup-title">
          <h2 id="setup-title" className={styles.cardTitle}>
            Set up the take
          </h2>
          <div className={styles.setup}>
            <div className={styles.tempo}>
              <Slider
                label="Tempo"
                value={studio.tempo}
                min={50}
                max={140}
                onChange={(v) => setStudio({ tempo: v })}
                format={(v) => `${v} bpm`}
              />
            </div>
            <div className={styles.field}>
              <span>Meter</span>
              <Segmented
                label="Meter"
                value={String(studio.beatsPerBar) as '4' | '3' | '2'}
                options={METERS}
                onChange={(v) => setStudio({ beatsPerBar: Number(v) as 2 | 3 | 4 })}
              />
            </div>
            <label className={styles.field}>
              Bars
              <select
                className={styles.select}
                value={studio.bars}
                onChange={(e) => setStudio({ bars: Number(e.target.value) })}
                data-testid="bars"
              >
                {BARS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={styles.note}>
            Wear headphones if you can, so the click stays out of the recording. Wired ones keep the
            timing tightest.
          </p>
          <p className={styles.note} data-testid="latency">
            {latency === null
              ? 'Timing not calibrated yet; an estimate from your browser is used.'
              : `Timing calibrated: ${latency} ms from click to microphone.`}{' '}
            <Button
              size="small"
              variant="ghost"
              onClick={() => void ctrl.calibrate()}
              disabled={busy}
            >
              {latency === null ? 'Calibrate' : 'Calibrate again'}
            </Button>
          </p>
        </section>

        {snap.phase === 'calibrating' ? (
          <section className={styles.card} aria-live="polite">
            <h2 className={styles.cardTitle}>Clap on the click</h2>
            <p>
              You'll hear {CALIBRATION_CLICKS} clicks. Clap once, sharply, exactly on each one,
              close to the microphone.
            </p>
            <Button onClick={() => ctrl.cancel()}>Cancel</Button>
          </section>
        ) : null}

        <section className={styles.card} aria-labelledby="mic-title">
          <h2 id="mic-title" className={styles.cardTitle}>
            Sing
          </h2>
          {snap.phase === 'off' || snap.phase === 'opening' ? (
            <div className={styles.row}>
              <Button
                variant="primary"
                onClick={() => void ctrl.enable()}
                disabled={snap.phase === 'opening'}
                data-testid="enable-mic"
              >
                {snap.phase === 'opening' ? 'Asking for the microphone…' : 'Turn on the microphone'}
              </Button>
              <span className={styles.note}>Your browser will ask first. Nothing is uploaded.</span>
            </div>
          ) : (
            <>
              <LiveInput ctrl={ctrl} />
              {snap.device ? <p className={styles.note}>Input: {snap.device}</p> : null}
              <div className={styles.row}>
                {busy && snap.phase !== 'calibrating' ? (
                  <Button variant="primary" onClick={() => ctrl.stop()} data-testid="stop">
                    Stop
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => void ctrl.record(studio)}
                    disabled={busy || snap.phase === 'analyzing'}
                    data-testid="record"
                  >
                    {snap.take ? 'Record again' : 'Record'}
                  </Button>
                )}
                <span className={styles.status} role="status" data-testid="studio-status">
                  {snap.phase === 'counting'
                    ? `Count-in: ${snap.countIn ?? ''}`
                    : snap.phase === 'recording'
                      ? `Bar ${Math.floor(snap.beat / studio.beatsPerBar) + 1} of ${studio.bars}, beat ${(snap.beat % studio.beatsPerBar) + 1}`
                      : snap.phase === 'analyzing'
                        ? 'Listening back…'
                        : snap.phase === 'done' && snap.take
                          ? 'Done. Here is what I heard.'
                          : `One bar of count-in, then ${studio.bars} bars at ${studio.tempo} bpm.`}
                </span>
                <span className={styles.spacer} />
                <Button variant="ghost" size="small" onClick={() => ctrl.disable()} disabled={busy}>
                  Turn off the microphone
                </Button>
              </div>
            </>
          )}
          {problem ? (
            <div className={styles.problem} role="alert" data-testid="problem">
              <strong>{problem.title}</strong>
              <ul>
                {problem.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {warning && !problem ? (
            <div className={styles.warning} role="status">
              <strong>{warning.title}</strong> {warning.steps[0]}
            </div>
          ) : null}
        </section>

        {snap.take && !snap.problem ? (
          <TakeResult take={snap.take} onTry={tryDraft} onEdit={edit} />
        ) : null}
      </div>
    </>
  );
}

/** The draft in the song player: listen and practise it before saving. */
/** What the editor needs for a new take. */
interface EditorInput {
  key: number;
  initial: SongDraft;
  take: { audio: EditorTakeAudio; trace: EditorTrace };
  makeRecording: (songId: string) => UserRecording;
  recordingBytes: number;
}

let edits = 0;

function DraftView({
  lesson,
  onBack,
  backLabel,
}: {
  lesson: Lesson;
  onBack: () => void;
  backLabel: string;
}) {
  const compiled = useMemo(() => compileLesson(lesson, PATTERNS), [lesson]);
  return (
    <>
      <div className={song.header}>
        <p className={song.meta}>
          <Button variant="ghost" size="small" onClick={onBack} data-testid="back-from-try">
            ← {backLabel}
          </Button>
        </p>
        <h1>{lesson.title}</h1>
        <p className={song.meta}>
          {keyName(lesson.key)}, {lesson.meter.beats}/{lesson.meter.unit}, {lesson.bars.length}{' '}
          bars. Not saved yet: save it from the editor to keep it.
        </p>
      </div>
      <LessonPlayer key={lesson.id} compiled={compiled} variant="song" />
    </>
  );
}

function TakeResult({
  take,
  onTry,
  onEdit,
}: {
  take: Take;
  onTry: (lesson: Lesson) => void;
  onEdit: (input: EditorInput) => void;
}) {
  const notation = useSettings((s) => s.notation);
  const accidentalStyle = useSettings((s) => s.accidentalStyle);
  const [grid, setGrid] = useState<QuantizeOptions>({
    step: 0.5,
    triplets: false,
    tolerance: 0.35,
  });
  const [keyChoice, setKeyChoice] = useState<string | null>(null);
  const [octave, setOctave] = useState<number | null>(null);
  const keyOverride = keyChoice
    ? { tonic: keyChoice.split(' ')[0]!, mode: keyChoice.split(' ')[1] as 'major' | 'minor' }
    : undefined;
  const draft = draftMelody(take.events, take.timing, {
    quantize: grid,
    ...(keyOverride ? { key: keyOverride } : {}),
    ...(octave !== null ? { octaveShift: octave } : {}),
  });
  const keyId = `${draft.key.tonic} ${draft.key.mode}`;
  const top = draft.keys.slice(0, 2);
  const uncertain = draft.grid.notes.filter((n) => n.uncertain).length;
  const spb = 60 / take.timing.tempo;
  const keyCtx = { tonic: draft.key.tonic, mode: draft.key.mode };

  const playMelody = () => {
    void audio.unlock();
    const t0 = audio.now() + 0.1;
    for (const n of draft.grid.notes)
      audio.playAt(n.midi, t0 + n.startBeat * spb, n.beats * spb * 0.95, mixVelocity('rh', 0.45));
  };
  const playTake = () => {
    void audio.unlock();
    audio.playRecording(take.audio.samples, take.audio.sampleRate, audio.now() + 0.05);
  };

  return (
    <>
      <section className={styles.card} aria-labelledby="result-title">
        <h2 id="result-title" className={styles.cardTitle}>
          What I heard
        </h2>
        <p className={styles.summary} data-testid="take-summary">
          {draft.grid.notes.length} notes in {keyName(keyCtx)}
          {draft.octaveShift
            ? `, moved ${Math.abs(draft.octaveShift)} octave${Math.abs(draft.octaveShift) === 1 ? '' : 's'} ${draft.octaveShift > 0 ? 'up' : 'down'} for the piano`
            : ''}
          {uncertain ? `, ${uncertain} off the grid (dashed)` : ''}.
        </p>
        <div className={styles.row}>
          <Button variant="primary" onClick={playMelody}>
            Play the notes
          </Button>
          <Button onClick={playTake}>Play my take</Button>
        </div>

        <div className={styles.controls}>
          <div className={styles.field}>
            <span>Key</span>
            <Segmented
              label="Key"
              value={top.some((k) => `${k.tonic} ${k.mode}` === keyId) ? keyId : ''}
              options={top.map((k) => ({
                value: `${k.tonic} ${k.mode}`,
                label: keyName({ tonic: k.tonic, mode: k.mode }),
              }))}
              onChange={(v) => setKeyChoice(v)}
            />
          </div>
          <label className={styles.field}>
            Or another key
            <select
              className={styles.select}
              value={keyId}
              onChange={(e) => setKeyChoice(e.target.value)}
              data-testid="key-select"
            >
              {[...MAJOR_KEYS.map((k) => `${k} major`), ...MINOR_KEYS.map((k) => `${k} minor`)].map(
                (k) => (
                  <option key={k} value={k}>
                    {prettyAccidentals(k)}
                  </option>
                ),
              )}
            </select>
          </label>
          <div className={styles.field}>
            <span>Grid</span>
            <Segmented
              label="Grid"
              value={String(grid.step) as '1' | '0.5' | '0.25'}
              options={GRIDS}
              onChange={(v) => setGrid({ ...grid, step: Number(v) as GridStep })}
            />
          </div>
          <Toggle pressed={grid.triplets} onChange={(v) => setGrid({ ...grid, triplets: v })}>
            Triplets
          </Toggle>
          <div className={styles.slider}>
            <Slider
              label="Off-grid tolerance"
              value={Math.round(grid.tolerance * 100)}
              min={10}
              max={50}
              step={5}
              onChange={(v) => setGrid({ ...grid, tolerance: v / 100 })}
              format={(v) => `${v}% of a step`}
            />
          </div>
          <div className={styles.field}>
            <span>Octave</span>
            <Segmented
              label="Octave"
              value={String(draft.octaveShift)}
              options={[-1, 0, 1, 2].map((k) => ({
                value: String(k),
                label: k > 0 ? `+${k}` : String(k),
              }))}
              onChange={(v) => setOctave(Number(v))}
            />
          </div>
        </div>

        <TakeView
          timing={take.timing}
          frames={take.frames}
          events={take.events}
          notes={draft.grid.notes}
          octaveShift={draft.octaveShift}
          minClarity={SEGMENT_CONFIG.minClarity}
        />
        <p className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.legendTrace} /> your pitch
          </span>{' '}
          <span className={styles.legendItem}>
            <span className={styles.legendDetected} /> notes heard
          </span>{' '}
          <span className={styles.legendItem}>
            <span className={styles.legendNote} /> on the grid
          </span>
        </p>

        <details className={styles.details}>
          <summary>The notes as text</summary>
          <ol className={styles.noteList} data-testid="note-list">
            {draft.grid.notes.map((n, i) => {
              const bar = Math.floor(n.startBeat / take.timing.meter.beats) + 1;
              const beat = +((n.startBeat % take.timing.meter.beats) + 1).toFixed(2);
              return (
                <li key={i}>
                  {notation === 'angka'
                    ? formatNote(n.note, keyCtx, { system: notation, accidentalStyle }).text
                    : prettyAccidentals(n.note.name)}
                  , bar {bar}, beat {beat}, {+n.beats.toFixed(2)} beat{n.beats === 1 ? '' : 's'}
                  {n.uncertain ? ' (check the timing)' : ''}
                </li>
              );
            })}
          </ol>
        </details>
        <p className={styles.note}>
          Timing lined up with {take.latencyMs} ms of{' '}
          {take.latencySource === 'calibrated' ? 'calibrated' : 'estimated'} delay. Loudest{' '}
          {take.peakDb.toFixed(0)} dB, background{' '}
          {take.noiseDb < -90 ? 'below -90' : take.noiseDb.toFixed(0)} dB.
        </p>
      </section>
      {draft.grid.notes.length ? (
        <ChordSuggestions
          notes={draft.grid.notes}
          timing={take.timing}
          keyContext={keyCtx}
          onTry={onTry}
          onEdit={(h: Harmonization, lhPattern: string) => {
            const trace = traceOf(take.frames, SEGMENT_CONFIG.minClarity);
            const shift = 12 * draft.octaveShift;
            onEdit({
              key: ++edits,
              initial: fromHarmonization({
                title: 'My song',
                notes: draft.grid.notes,
                key: keyCtx,
                tempo: take.timing.tempo,
                meter: take.timing.meter,
                bars: take.timing.bars,
                chords: h.chords,
                alternatives: h.segments,
                lhPattern,
              }),
              take: {
                audio: { ...take.audio, beat0: take.timing.beat0 },
                trace: {
                  values: trace.values,
                  start: trace.start,
                  hop: HOP_SEC,
                  beat0: take.timing.beat0,
                  tempo: take.timing.tempo,
                  shift,
                },
              },
              makeRecording: (songId) =>
                toUserRecording({
                  songId,
                  samples: take.audio.samples,
                  sampleRate: take.audio.sampleRate,
                  beat0: take.timing.beat0,
                  frames: take.frames,
                  minClarity: SEGMENT_CONFIG.minClarity,
                  hop: HOP_SEC,
                  shift,
                }),
              recordingBytes: take.audio.samples.length * 2 + take.frames.length * 4,
            });
          }}
        />
      ) : null}
    </>
  );
}
