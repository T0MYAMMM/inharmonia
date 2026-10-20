import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { audio, getTransport, lights, notes } from '@/app/services';
import { describeChange, type VoicingChange } from '@/core/charts';
import type { CompiledChord, CompiledLesson } from '@/core/content/compile';
import { formatChord, prettyAccidentals } from '@/core/notation';
import type { PracticeHands } from '@/core/practice';
import { recordAttempt } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button } from '@/ui/Button';
import { ProgressTrack } from '@/ui/ProgressTrack';
import { Segmented } from '@/ui/Segmented';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';
import { dockRangeFor, KeyboardDock } from '@/ui/keyboard';
import { Score, type FallingViewOptions } from './Score';
import { FallingNotes } from './FallingNotes';
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
  /** The same URL-controlled arrangement, rendered only inside Falling Notes fullscreen. */
  fullScreenSettings?: ReactNode;
  /** Roman numerals under the chord symbols (default: on for progressions). */
  showNumerals?: boolean;
  /**
   * Say how the hand moves into the current chord ("keep C and E, move G up 2
   * semitones to A") and mark it on the keyboard: a dot on notes that stay, a
   * ring on notes to move to.
   */
  voicingHints?: boolean;
}

/**
 * The shared player for songs and progressions: transport controls, mode,
 * practice and play-along state, the bar-card score and the keyboard dock.
 * Swapping `compiled` (a new key or pattern) keeps the mode and tempo.
 */
export function LessonPlayer({
  compiled,
  recordId,
  variant,
  settings,
  fullScreenSettings,
  showNumerals,
  voicingHints = false,
}: LessonPlayerProps) {
  const progression = variant === 'progression';
  const [fallingOptions, setFallingOptions] = useState<FallingViewOptions | null>(null);
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
  const visualBeat = useCallback(() => ctrl.visualBeat(), [ctrl]);
  const performanceBeat = useCallback((beat: number) => getTransport().performanceBeat(beat), []);
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
  const hint = voicingHints
    ? changeInto(compiled, practice ? snap.targetChordId : null, snap.bar, snap.chordSymbol)
    : null;
  const hintKey = hint
    ? `${hint.change.stays.map((n) => n.midi)}|${[...hint.change.moves.map((m) => m.to), ...hint.change.adds].map((n) => n.midi)}`
    : '';
  useEffect(() => {
    if (!hintKey) return;
    const [stays = '', moves = ''] = hintKey.split('|');
    const midis = (s: string) => (s ? s.split(',').map(Number) : []);
    lights.setExactly('stay', midis(stays));
    lights.setExactly('moveTo', midis(moves));
    return () => {
      lights.clear('stay');
      lights.clear('moveTo');
    };
  }, [hintKey]);
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
        {hint ? (
          <p className={styles.note} data-testid="voicing-hint">
            <span className={styles.chord}>
              {formatChord(hint.from.symbol, lesson.key, notation)} →{' '}
              {formatChord(hint.to.symbol, lesson.key, notation)}
            </span>
            : {prettyAccidentals(hint.change.text)}.
          </p>
        ) : null}
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
        showNumerals={showNumerals ?? progression}
        chordScores={snap.chordScores}
        onFallingChange={setFallingOptions}
        fallingSelected={fallingOptions}
        onSelectBar={(i) => ctrl.selectBar(i)}
      />
      <KeyboardDock
        fullScreenControls={{
          left: (
            <section className={styles.fullScreenPanel} aria-label="Playback and timing">
              <h2 className={styles.fullScreenHeading}>Playback</h2>
              <span className={styles.fullScreenPosition} data-testid="fullscreen-position">
                Bar {snap.bar + 1} / {compiled.bars.length}
                {snap.chordSymbol
                  ? ' · ' + formatChord(snap.chordSymbol, lesson.key, notation)
                  : ''}
              </span>
              <Segmented
                label="Full Screen mode"
                value={snap.mode}
                options={progression ? PROGRESSION_MODES : SONG_MODES}
                onChange={(m) => ctrl.setMode(m)}
              />
              <div className={styles.fullScreenGroup}>
                <Button
                  variant="primary"
                  onClick={() => ctrl.playPause()}
                  disabled={practice}
                  data-testid="fullscreen-play"
                >
                  {playing ? (playAlong ? 'Stop' : 'Pause') : 'Play'}
                </Button>
                <Button
                  onClick={() => ctrl.restart()}
                  disabled={practice}
                  data-testid="fullscreen-restart"
                >
                  Restart
                </Button>
                {practice ? (
                  <>
                    <Button variant="primary" onClick={() => ctrl.hearIt()}>
                      Hear it
                    </Button>
                    <Button onClick={() => ctrl.startOver()}>Start over</Button>
                  </>
                ) : null}
              </div>
              <div className={styles.fullScreenGroup}>
                {!practice ? (
                  <Toggle pressed={snap.loop} onChange={(v) => ctrl.setLoop(v)}>
                    Loop
                  </Toggle>
                ) : null}
                <Toggle pressed={metronome} onChange={(v) => setSettings({ metronome: v })}>
                  Metronome
                </Toggle>
              </div>
              {!practice ? (
                <label className={styles.fullScreenField}>
                  Tempo: {snap.tempo} bpm
                  <input
                    type="range"
                    aria-label="Full Screen tempo"
                    data-testid="fullscreen-tempo"
                    min={lesson.tempo.min}
                    max={lesson.tempo.max}
                    value={snap.tempo}
                    onChange={(event) => ctrl.setTempo(Number(event.target.value))}
                  />
                </label>
              ) : null}
              <label className={styles.fullScreenField}>
                Count-in
                <select
                  aria-label="Full Screen count-in"
                  data-testid="fullscreen-countin"
                  value={countInBars}
                  onChange={(event) => setSettings({ countInBars: Number(event.target.value) })}
                >
                  <option value={0}>Off</option>
                  <option value={1}>1 bar</option>
                  <option value={2}>2 bars</option>
                </select>
              </label>
            </section>
          ),
          right: (
            <section className={styles.fullScreenPanel} aria-label="Arrangement and visualization">
              <h2 className={styles.fullScreenHeading}>Hands &amp; arrangement</h2>
              {practice ? (
                <Segmented
                  label="Full Screen practice hand"
                  value={snap.hands}
                  options={PRACTICE_HANDS}
                  onChange={(v) => ctrl.setHands(v)}
                />
              ) : null}
              <div className={styles.fullScreenGroup}>
                <Toggle pressed={snap.rhOn} onChange={(v) => ctrl.setHand('rh', v)} tone="amber">
                  Melody
                </Toggle>
                <Toggle pressed={snap.lhOn} onChange={(v) => ctrl.setHand('lh', v)} tone="dusk">
                  Left hand
                </Toggle>
              </div>
              <div className={styles.fullScreenGroup}>
                <label className={styles.fullScreenField}>
                  View
                  <select
                    aria-label="Full Screen displayed hands"
                    data-testid="fullscreen-falling-hand"
                    value={fallingOptions?.hand ?? 'both'}
                    onChange={(event) =>
                      setFallingOptions((old) =>
                        old
                          ? { ...old, hand: event.target.value as FallingViewOptions['hand'] }
                          : old,
                      )
                    }
                  >
                    <option value="both">Both hands</option>
                    <option value="rh">Right hand</option>
                    <option value="lh">Left hand</option>
                  </select>
                </label>
                <label className={styles.fullScreenField}>
                  Look ahead
                  <select
                    aria-label="Full Screen look ahead"
                    data-testid="fullscreen-falling-lookahead"
                    value={fallingOptions?.lookAheadBeats ?? 4}
                    onChange={(event) =>
                      setFallingOptions((old) =>
                        old ? { ...old, lookAheadBeats: Number(event.target.value) } : old,
                      )
                    }
                  >
                    <option value={4}>4 beats</option>
                    <option value={8}>8 beats</option>
                  </select>
                </label>
              </div>
              {fullScreenSettings ? (
                <div className={styles.fullScreenArrangement}>{fullScreenSettings}</div>
              ) : null}
            </section>
          ),
        }}

        focus={focus}
        low={low}
        high={high}
        showTarget={practice && !progression}
        roll={
          fallingOptions ? (
            <FallingNotes
              compiled={compiled}
              hand={fallingOptions.hand}
              lookAheadBeats={fallingOptions.lookAheadBeats}
              mode={snap.mode}
              playing={playing}
              visualBeat={visualBeat}
              performanceBeat={performanceBeat}
              rhOn={snap.rhOn}
              lhOn={snap.lhOn}
              targetBeat={snap.targetBeat}
              low={low}
              high={high}
            />
          ) : undefined
        }
      />
    </>
  );
}

/**
 * The change into the current chord: the practice target, or the chord at the
 * playhead. Null at the first chord, on N.C., or when there is nothing to say.
 */
function changeInto(
  c: CompiledLesson,
  targetId: string | null,
  bar: number,
  symbol: string | null,
): { from: CompiledChord; to: CompiledChord; change: VoicingChange } | null {
  const i = targetId
    ? c.chords.findIndex((x) => x.id === targetId)
    : c.chords.findIndex((x) => x.barIndex === bar && x.symbol === symbol);
  const to = c.chords[i];
  if (!to || to.voicing.length === 0) return null;
  for (let j = i - 1; j >= 0; j--) {
    const from = c.chords[j]!;
    if (from.voicing.length === 0) continue;
    return { from, to, change: describeChange(from.voicing, to.voicing) };
  }
  return null;
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
