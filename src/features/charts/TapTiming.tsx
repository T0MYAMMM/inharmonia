import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BEAT_TAP_BARS,
  bpmOf,
  fitsSection,
  gridFromTaps,
  LIMITS,
  NO_CHORD,
  retime,
  snapTaps,
  tapChords,
  timedFromStarts,
  type BeatGrid,
  type ChartBar,
} from '@/core/charts';
import { prettyChord } from '@/core/notation';
import { usePrefersReducedMotion } from '@/app/hooks';
import { Button } from '@/ui/Button';
import { FilePicker } from '@/ui/FilePicker';
import { Segmented } from '@/ui/Segmented';
import { Slider } from '@/ui/Slider';
import { startMetronome, tapNow, type Metronome } from './tapSource';
import styles from './charts.module.css';

export interface TapTimingProps {
  /** The section's name, for what is said. */
  label: string;
  bars: readonly ChartBar[];
  beatsPerBar: number;
  tempo: number;
  onApply: (bars: ChartBar[]) => void;
  onCancel: () => void;
}

type Source = 'metronome' | 'file';

/** A song file's beat, tapped: where it started playing, the taps, and the grid they made. */
interface Beat {
  from: number;
  taps: number[];
  grid: BeatGrid | null;
}

type Phase =
  | { name: 'setup' }
  | { name: 'beat' }
  | { name: 'tapping'; grid: BeatGrid }
  | { name: 'result'; grid: BeatGrid };

const chordName = (s: string) => (s === NO_CHORD ? s : prettyChord(s));
const clockTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** Keys the panel takes while you tap; typing in a field keeps them. */
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * Set a section's chord lengths by ear: play along with a metronome or a song
 * file of your own and tap when the chord changes. The taps snap to beats and
 * the chords are put into bars; you see the bars before and after, and keep
 * them or not. A song file stays in memory while this is open, and goes.
 */
export function TapTiming({ label, bars, beatsPerBar, tempo, onApply, onCancel }: TapTimingProps) {
  const chords = useMemo(() => tapChords(bars), [bars]);
  const changes = chords.length - 1;
  const [source, setSource] = useState<Source>('metronome');
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });
  const [taps, setTaps] = useState<number[]>([]);
  const [said, setSaid] = useState('');
  const reduced = usePrefersReducedMotion();

  // The song file: its object URL, how fast and from where it plays.
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [speed, setSpeed] = useState(100);
  const [from, setFrom] = useState(0);
  const [duration, setDuration] = useState(0);
  const [beat, setBeat] = useState<Beat | null>(null);
  const player = useRef<HTMLAudioElement>(null);
  const metronome = useRef<Metronome | null>(null);
  const tapButton = useRef<HTMLButtonElement>(null);

  // The file is let go when another is chosen and when the panel closes.
  useEffect(() => (file ? () => URL.revokeObjectURL(file.url) : undefined), [file]);
  useEffect(() => {
    const el = player.current;
    if (!el) return;
    el.preservesPitch = true;
    el.playbackRate = speed / 100;
  }, [speed, file]);

  /** Seconds on the clock taps are read on: the song's own time while a file plays. */
  const now = useCallback(
    () => (source === 'file' ? (player.current?.currentTime ?? 0) : tapNow()),
    [source],
  );

  const silence = useCallback(() => {
    metronome.current?.stop();
    metronome.current = null;
    if (player.current?.src) player.current.pause();
  }, []);
  useEffect(() => silence, [silence]);

  const startFile = (at: number) => {
    const el = player.current;
    if (!el) return;
    el.currentTime = Math.max(0, at);
    void el.play()?.catch(() => setSaid('The file would not play. Try another.'));
  };

  // ---- the steps ------------------------------------------------------------

  const startTapping = (grid?: BeatGrid) => {
    silence();
    setTaps([]);
    if (source === 'metronome') {
      const m = startMetronome(tempo, beatsPerBar, LIMITS.barsPerSection + 1);
      metronome.current = m;
      setPhase({ name: 'tapping', grid: m.grid });
      setSaid(`Counting in. First chord ${chordName(chords[0]!.symbol)}.`);
    } else if (grid) {
      // A bar before the first downbeat, to hear it coming.
      startFile(grid.downbeat - grid.period * beatsPerBar);
      setPhase({ name: 'tapping', grid });
      setSaid(`Get ready. First chord ${chordName(chords[0]!.symbol)}.`);
    }
  };

  const startBeat = () => {
    silence();
    setBeat({ from, taps: [], grid: null });
    startFile(from);
    setPhase({ name: 'beat' });
    setSaid(`Tap the beat for ${BEAT_TAP_BARS} bars, starting on the section's first beat.`);
  };

  const finish = useCallback(
    (grid: BeatGrid, done: number) => {
      silence();
      if (done === 0) {
        setPhase({ name: 'setup' });
        setSaid('Stopped.');
        return;
      }
      setPhase({ name: 'result', grid });
      setSaid(
        done === changes
          ? 'Done. Here are the new bars.'
          : `Stopped after ${done} of ${changes} changes. The rest keep their lengths.`,
      );
    },
    [silence, changes],
  );

  const stop = useCallback(() => {
    if (phase.name === 'tapping') finish(phase.grid, taps.length);
    else if (phase.name === 'beat') {
      silence();
      setPhase({ name: 'setup' });
      setSaid('Stopped.');
    }
  }, [phase, taps.length, finish, silence]);

  const stopLatest = useRef(stop);
  useEffect(() => {
    stopLatest.current = stop;
  }, [stop]);

  const tap = useCallback(() => {
    const t = now();
    if (phase.name === 'beat' && beat) {
      const all = [...beat.taps, t];
      const need = BEAT_TAP_BARS * beatsPerBar;
      if (all.length < need) {
        setBeat({ ...beat, taps: all });
        setSaid(`Beat ${all.length} of ${need}.`);
        return;
      }
      const grid = gridFromTaps(all);
      silence();
      setBeat({ ...beat, taps: all, grid });
      setPhase({ name: 'setup' });
      setSaid(
        grid
          ? `About ${Math.round(bpmOf(grid))} bpm. Now tap the chords.`
          : 'Those taps were not a steady beat. Tap the beat again.',
      );
    } else if (phase.name === 'tapping') {
      const next = [...taps, t];
      setTaps(next);
      if (next.length >= changes) finish(phase.grid, next.length);
      else
        setSaid(
          `Chord ${next.length + 1} of ${chords.length}, ${chordName(chords[next.length]!.symbol)}.`,
        );
    }
  }, [now, phase, beat, beatsPerBar, silence, taps, changes, chords, finish]);

  const undo = useCallback(() => {
    if (phase.name === 'beat' && beat?.taps.length) {
      setBeat({ ...beat, taps: beat.taps.slice(0, -1) });
      setSaid(`Undone. Beat ${beat.taps.length - 1} of ${BEAT_TAP_BARS * beatsPerBar}.`);
    } else if (phase.name === 'tapping' && taps.length) {
      const left = taps.slice(0, -1);
      setTaps(left);
      setSaid(
        `Undone. Chord ${left.length + 1} of ${chords.length}, ${chordName(chords[left.length]!.symbol)}.`,
      );
    }
  }, [phase, beat, beatsPerBar, taps, chords]);

  // Space taps, Backspace undoes, Esc stops, while tapping.
  const live = phase.name === 'beat' || phase.name === 'tapping';
  useEffect(() => {
    if (!live) return;
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') {
        // Also keeps a focused button from being pressed.
        e.preventDefault();
        if (!e.repeat) tap();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        stop();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ' && !typing(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [live, tap, undo, stop]);

  // The beat you are on, for the count and the beat marks.
  const [beatNow, setBeatNow] = useState<number | null>(null);
  useEffect(() => {
    if (phase.name !== 'tapping') return;
    const { grid } = phase;
    // The metronome stops after the longest section; a song file at its end.
    const last = source === 'metronome' ? (LIMITS.barsPerSection + 1) * beatsPerBar : Infinity;
    let frame = 0;
    const loop = () => {
      const at = Math.floor((now() - grid.downbeat) / grid.period + 1e-6);
      setBeatNow(at);
      if (at >= last) stopLatest.current();
      else frame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [phase, now, source, beatsPerBar]);

  // ---- the result -----------------------------------------------------------

  const result = useMemo(() => {
    if (phase.name !== 'result') return null;
    const starts = snapTaps(taps, phase.grid, source === 'file' ? beat?.taps : undefined);
    return retime(bars, timedFromStarts(chords, starts, beatsPerBar), beatsPerBar);
  }, [phase, taps, source, beat, bars, chords, beatsPerBar]);

  // Focus follows the step: the Tap button while tapping, the result once done.
  const resultRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (phase.name === 'beat' || phase.name === 'tapping') tapButton.current?.focus();
    else if (phase.name === 'result') resultRef.current?.focus();
  }, [phase.name]);

  // ---- what you see ---------------------------------------------------------

  let view: ReactNode;
  if (phase.name === 'result' && result) {
    const fits = fitsSection(result);
    view = (
      <>
        <p className={styles.notice} ref={resultRef} tabIndex={-1} data-testid="tap-summary">
          {label}: {result.length} bar{result.length === 1 ? '' : 's'}, was {bars.length}.
        </p>
        <div className={styles.compare}>
          <BarList title="Now" bars={bars} testId="tap-old" />
          <BarList title="New" bars={result} testId="tap-new" />
        </div>
        {bars.some((b) => b.lyric) ? (
          <p className={styles.note}>Lyrics move with their bars.</p>
        ) : null}
        {!fits ? (
          <p className={styles.tapProblem} data-testid="tap-too-long">
            A section holds up to {LIMITS.barsPerSection} bars. Tap again, or split the section.
          </p>
        ) : null}
        <div className={styles.row}>
          <Button
            variant="primary"
            size="small"
            onClick={() => onApply(result)}
            disabled={!fits}
            data-testid="tap-apply"
          >
            Apply
          </Button>
          <Button size="small" onClick={() => startTapping(phase.grid)} data-testid="tap-restart">
            Restart
          </Button>
          <Button size="small" variant="ghost" onClick={onCancel} data-testid="tap-discard">
            Discard
          </Button>
        </div>
      </>
    );
  } else if (phase.name === 'beat' || phase.name === 'tapping') {
    const tapping = phase.name === 'tapping';
    const counting = tapping && (beatNow === null || beatNow < 0);
    const current = chords[taps.length];
    const next = chords[taps.length + 1];
    const inBar = beatNow !== null ? ((beatNow % beatsPerBar) + beatsPerBar) % beatsPerBar : -1;
    view = (
      <>
        {tapping ? (
          <div className={styles.tapNow}>
            <span className={styles.tapChord} data-testid="tap-current">
              {current ? chordName(current.symbol) : ''}
            </span>
            <span className={styles.tapNext}>
              {next ? (
                <>
                  then <b data-testid="tap-next">{chordName(next.symbol)}</b>
                </>
              ) : (
                'the last chord'
              )}
            </span>
          </div>
        ) : (
          <div className={styles.tapNow}>
            <span className={styles.tapChord} data-testid="tap-beats">
              {beat?.taps.length ?? 0} / {BEAT_TAP_BARS * beatsPerBar}
            </span>
            <span className={styles.tapNext}>beats, the first on the downbeat</span>
          </div>
        )}
        {tapping ? (
          <p className={styles.tapCount} data-testid="tap-count">
            <span>
              {counting
                ? 'Counting in'
                : `Bar ${Math.floor((beatNow ?? 0) / beatsPerBar) + 1}, change ${taps.length} of ${changes}`}
            </span>
            {!reduced ? (
              <span className={styles.tapBeats} aria-hidden="true">
                {Array.from({ length: beatsPerBar }, (_, i) => (
                  <span key={i} data-on={i === inBar || undefined} />
                ))}
              </span>
            ) : null}
          </p>
        ) : null}
        <button
          ref={tapButton}
          type="button"
          className={styles.tapButton}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            tap();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.repeat) {
              e.preventDefault();
              tap();
            }
          }}
          data-testid="tap-button"
        >
          Tap
        </button>
        <p className={styles.note}>
          Space or Tap {tapping ? 'when the chord changes' : 'on each beat'}. Backspace undoes, Esc
          stops.
        </p>
        <div className={styles.row}>
          <Button size="small" onClick={undo} data-testid="tap-undo">
            Undo
          </Button>
          <Button
            size="small"
            onClick={() => (tapping ? startTapping(phase.grid) : startBeat())}
            data-testid="tap-restart"
          >
            Restart
          </Button>
          <Button size="small" variant="ghost" onClick={stop} data-testid="tap-stop">
            Stop
          </Button>
        </div>
      </>
    );
  } else {
    const cancel = (
      <Button variant="ghost" onClick={onCancel} data-testid="tap-cancel">
        Cancel
      </Button>
    );
    view = (
      <>
        <p className={styles.note}>
          Listen, and tap when the chord changes: {chords.length} chords, {changes} change
          {changes === 1 ? '' : 's'}. The chords stay as they are; only their lengths change.
        </p>
        <Segmented
          label="Play along with"
          value={source}
          options={[
            { value: 'metronome', label: `Metronome, ${tempo} bpm` },
            { value: 'file', label: 'A song file' },
          ]}
          onChange={(v) => {
            silence();
            setSource(v);
          }}
        />
        {source === 'metronome' ? (
          <>
            <p className={styles.note}>A bar to count in, then the first chord.</p>
            <div className={styles.row}>
              <Button variant="primary" onClick={() => startTapping()} data-testid="tap-start">
                Start
              </Button>
              {cancel}
            </div>
          </>
        ) : (
          <>
            <div className={styles.row}>
              <FilePicker
                accept="audio/*"
                size="small"
                onFiles={([f]) => {
                  if (!f) return;
                  silence();
                  setFile({ name: f.name, url: URL.createObjectURL(f) });
                  setBeat(null);
                  setFrom(0);
                  setDuration(0);
                }}
                data-testid="tap-file"
              >
                {file ? 'Choose another file' : 'Choose a song file'}
              </FilePicker>
            </div>
            <p className={styles.note}>It stays on this device: never uploaded or kept.</p>
            {file ? (
              <>
                <div className={styles.fields}>
                  <div className={styles.slider}>
                    <Slider
                      label="Speed"
                      value={speed}
                      min={50}
                      max={100}
                      step={5}
                      onChange={setSpeed}
                      format={(v) => `${v}%`}
                    />
                  </div>
                  <div className={styles.slider}>
                    <Slider
                      label="Start from"
                      value={Math.min(from, Math.floor(duration))}
                      min={0}
                      max={Math.max(0, Math.floor(duration))}
                      onChange={setFrom}
                      format={clockTime}
                    />
                  </div>
                </div>
                <p className={styles.note}>
                  Start a little before the {label}. Tap the beat for {BEAT_TAP_BARS} bars, the
                  first tap on its first downbeat: that sets the tempo.
                </p>
                {beat?.grid ? (
                  <p className={styles.notice} data-testid="tap-tempo">
                    About {Math.round(bpmOf(beat.grid))} bpm.
                  </p>
                ) : null}
                <div className={styles.row}>
                  {beat?.grid ? (
                    <Button
                      variant="primary"
                      onClick={() => startTapping(beat.grid!)}
                      data-testid="tap-chords"
                    >
                      Tap the chords
                    </Button>
                  ) : null}
                  <Button
                    variant={beat?.grid ? 'secondary' : 'primary'}
                    onClick={startBeat}
                    data-testid="tap-beat"
                  >
                    {beat ? 'Tap the beat again' : 'Tap the beat'}
                  </Button>
                  {cancel}
                </div>
              </>
            ) : (
              <div className={styles.row}>{cancel}</div>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div
      className={styles.tap}
      role="group"
      aria-label={`Tap timing: ${label}`}
      data-testid="tap-timing"
    >
      <audio
        ref={player}
        src={file?.url}
        preload="auto"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={stop}
      />
      <p className="visually-hidden" role="status" data-testid="tap-said">
        {said}
      </p>
      {view}
    </div>
  );
}

/** A section's bars, read only, as in the editor. */
function BarList({
  title,
  bars,
  testId,
}: {
  title: string;
  bars: readonly ChartBar[];
  testId: string;
}) {
  return (
    <div className={styles.compareSide}>
      <h3 className={styles.compareTitle}>{title}</h3>
      <ol className={styles.bars} aria-label={`${title}: ${bars.length} bars`} data-testid={testId}>
        {bars.map((b, i) => (
          <li key={i}>
            <div className={styles.bar}>
              <span className={styles.barNo}>{i + 1}</span>
              <span className={styles.barChords}>
                {b.chords.map((c, k) => (
                  <span key={k} style={{ flexGrow: c.beats }}>
                    {chordName(c.symbol)}
                    <span className="visually-hidden">
                      , {c.beats} beat{c.beats === 1 ? '' : 's'}
                    </span>
                  </span>
                ))}
              </span>
              {b.lyric ? <span className={styles.barLyric}>{b.lyric}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
