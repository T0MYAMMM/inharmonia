import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTouchOnly } from '@/app/hooks';
import {
  CHART_STYLES,
  clearBars,
  LIMITS,
  moveBar,
  readChords,
  removeBar,
  roomLeft,
  SEQUENCE_TEMPO,
  sequenceKey,
  sequenceNumerals,
  type ChartStyle,
  type SequenceIssue,
} from '@/core/charts';
import { keyName, prettyAccidentals, prettyChord } from '@/core/notation';
import type { Played } from '@/core/practice';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Field } from '@/ui/Field';
import { RedoIcon, UndoIcon } from '@/ui/icons';
import { PlayButton } from '@/ui/PlayButton';
import { Segmented } from '@/ui/Segmented';
import { Select } from '@/ui/Select';
import { Slider } from '@/ui/Slider';
import { TextInput } from '@/ui/TextInput';
import { Toggle } from '@/ui/Toggle';
import { BarEditor } from './BarEditor';
import { BarStrip } from './BarStrip';
import { barWords, type SequenceEditor } from './useSequenceEditor';
import type { SequencePlayback } from './useSequencePlayer';
import styles from './sequence.module.css';

/** One example, so a first visit can hear something in one tap. */
const EXAMPLE = 'C G Am F';

const METERS = [
  { value: '4', label: '4/4' },
  { value: '3', label: '3/4' },
] as const;

/** What is wrong with typed chords, in one line. */
function issueText(issues: readonly SequenceIssue[]): string {
  const [first, ...rest] = issues;
  if (!first) return '';
  const where = first.bar ? `Bar ${first.bar}: ` : '';
  const more = rest.length ? ` (and ${rest.length} more)` : '';
  return `${where}${first.message}${more}. Nothing was added.`;
}

/** Keys that belong to whatever has focus, or to an open menu, not to the sequence's undo. */
function keysTakenBy(target: EventTarget | null): boolean {
  if (document.querySelector('[role="menu"]')) return true;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return (
    target instanceof HTMLInputElement &&
    !['range', 'checkbox', 'radio', 'button', 'submit'].includes(target.type)
  );
}

const KEYS_HINT =
  'Keys: ← and → choose a bar, Shift with ← or → moves it, Delete takes it out, Ctrl+Z undoes.';

export interface SequencePanelProps {
  editor: SequenceEditor;
  playback: SequencePlayback;
  /** The chord being played on the keyboard, or the last one played. */
  played: Played | null;
}

/**
 * The chord sequence: put chords in a line, by typing them or from the chord
 * above, and hear them played at a tempo, in a style, looped or once.
 */
export function SequencePanel({ editor, playback, played }: SequencePanelProps) {
  const titleId = useId();
  const idPrefix = useId();
  const keysId = `${idPrefix}-keys`;
  const chordsId = `${idPrefix}-chords`;
  const touchOnly = useTouchOnly();
  const { sequence: seq, selected } = editor;
  const n = seq.bars.length;
  const key = sequenceKey(seq.bars);
  const numerals = seq.showFunction && key ? sequenceNumerals(seq.bars, key) : null;
  const style = CHART_STYLES.find((s) => s.id === seq.style) ?? CHART_STYLES[0];
  const focusChords = () => document.getElementById(chordsId)?.focus();
  const focusBarChord = () => document.getElementById(`${idPrefix}-chord`)?.focus();

  // Enter on a bar that was not chosen yet: its chords appear on the next render.
  const openChosen = useRef(false);
  useLayoutEffect(() => {
    if (!openChosen.current || selected === null) return;
    openChosen.current = false;
    focusBarChord();
  });

  // Undo and redo from anywhere on the page, but not from a text field, a
  // select or an open menu, which have their own.
  const latest = useRef(editor);
  useEffect(() => {
    latest.current = editor;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.defaultPrevented) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      if (keysTakenBy(e.target)) return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) latest.current.redo();
      else latest.current.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Card className={styles.panel} aria-labelledby={titleId} data-testid="sequence">
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          Sequence
        </h2>
        <div className={styles.transport}>
          <PlayButton
            playing={playback.playing}
            stopLabel="Stop"
            onClick={() => (playback.playing ? playback.stop() : playback.play())}
            disabled={n === 0}
            data-testid="sequence-play"
          />
          <Toggle pressed={seq.loop} onChange={(loop) => editor.setSettings({ loop })}>
            Loop
          </Toggle>
        </div>
        <div className={styles.tempo}>
          <Slider
            label="Tempo"
            value={seq.tempo}
            min={SEQUENCE_TEMPO.min}
            max={SEQUENCE_TEMPO.max}
            onChange={(tempo) => editor.setSettings({ tempo })}
            format={(v) => `${v} bpm`}
          />
        </div>
      </div>

      {n || editor.canUndo || editor.canRedo ? (
        <div className={styles.status}>
          <p className={styles.summary}>
            {n ? (
              <span data-testid="sequence-summary">
                {n} bar{n === 1 ? '' : 's'}
                {key ? ` in ${prettyAccidentals(keyName(key))}` : ''}
              </span>
            ) : null}
            {playback.playing && playback.bar !== null ? (
              <span data-testid="sequence-position">
                Bar {playback.bar + 1} of {n}
              </span>
            ) : null}
          </p>
          <div className={styles.tools} role="group" aria-label="Edits">
            <Button
              size="small"
              icon
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              onClick={editor.undo}
              disabled={!editor.canUndo}
            >
              <UndoIcon />
            </Button>
            <Button
              size="small"
              icon
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              onClick={editor.redo}
              disabled={!editor.canRedo}
            >
              <RedoIcon />
            </Button>
            <Button
              size="small"
              variant="ghost"
              disabled={n === 0}
              onClick={() =>
                editor.change(
                  clearBars(seq),
                  `Cleared ${n} bar${n === 1 ? '' : 's'}. Undo brings them back.`,
                  null,
                )
              }
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {n ? (
        <>
          <BarStrip
            bars={seq.bars}
            playing={playback.playing ? playback.bar : null}
            numerals={numerals}
            selected={selected}
            describedBy={keysId}
            onSelect={editor.select}
            onMove={(from, to) =>
              editor.change(moveBar(seq, from, to), `Moved bar ${from + 1} to bar ${to + 1}.`, to)
            }
            onDelete={(i) => {
              const next = removeBar(seq, i);
              editor.change(
                next,
                `Deleted bar ${i + 1}, ${barWords(seq.bars[i]!)}.`,
                next.bars.length ? Math.min(i, next.bars.length - 1) : null,
              );
              if (!next.bars.length) focusChords();
            }}
            onOpen={(i) => {
              if (selected === i) focusBarChord();
              else openChosen.current = true;
            }}
          />
          <p id={keysId} className="visually-hidden">
            {KEYS_HINT}
          </p>
          {selected !== null ? (
            <BarEditor
              editor={editor}
              index={selected}
              idPrefix={idPrefix}
              keysHint={touchOnly ? undefined : KEYS_HINT}
              onEmpty={focusChords}
            />
          ) : null}
        </>
      ) : (
        <div className={styles.empty} data-testid="sequence-empty">
          <p>No chords yet. Type them, add the chord above, play one, or try these.</p>
          <Button
            onClick={() => editor.addBars(readChords(EXAMPLE, seq.meter.beats, roomLeft(seq)).bars)}
          >
            Try {EXAMPLE}
          </Button>
        </div>
      )}

      {editor.full ? (
        <p className={styles.note} data-testid="sequence-full">
          The sequence is full at {LIMITS.barsPerSection} bars: delete one to add more.
        </p>
      ) : null}

      <ChordEntry editor={editor} id={chordsId} />
      <PlayedEntry editor={editor} played={played} touchOnly={touchOnly} />

      <div className={styles.settings}>
        <Field label="Meter" group>
          <Segmented
            label="Meter"
            value={String(seq.meter.beats) as '4' | '3'}
            options={METERS}
            onChange={(v) => editor.setMeter(Number(v) as 3 | 4)}
          />
        </Field>
        <Field label="Accompaniment" hint={style.note} className={styles.style}>
          <Select
            value={seq.style}
            onChange={(e) => editor.setSettings({ style: e.target.value as ChartStyle })}
            data-testid="sequence-style"
          >
            {CHART_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className={styles.toggleCell}>
          <Toggle
            pressed={seq.showFunction}
            onChange={(showFunction) => editor.setSettings({ showFunction })}
          >
            Show function
          </Toggle>
        </div>
      </div>

      <p className="visually-hidden" role="status" aria-live="polite" data-testid="sequence-status">
        {/* A space that comes and goes, so the same words twice are spoken twice. */}
        {editor.announcement.text}
        {editor.announcement.n % 2 ? '\u00a0' : ''}
      </p>
    </Card>
  );
}

/**
 * Chords typed in a line, added after the chosen bar or at the end. Problems
 * show once you try to add, and update as you fix them.
 */
function ChordEntry({ editor, id }: { editor: SequenceEditor; id: string }) {
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const { meter } = editor.sequence;
  const read = readChords(text, meter.beats, roomLeft(editor.sequence));
  const error = tried ? issueText(read.issues) : '';

  const add = () => {
    if (!text.trim()) return;
    if (read.issues.length) {
      setTried(true);
      editor.announce(`Not added. ${issueText(read.issues)}`);
      return;
    }
    if (read.bars.length && editor.addBars(read.bars)) {
      setText('');
      setTried(false);
    }
  };

  return (
    <Field
      label="Type chords"
      hint="A bar each: C Am F G. Two in a bar: | F G |. Commas, dashes and lower case work too."
      error={error || undefined}
      id={id}
      className={styles.entry}
    >
      <div className={styles.entryRow}>
        <TextInput
          className={styles.entryInput}
          value={text}
          placeholder="C Am F G"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          data-testid="sequence-text"
        />
        <Button onClick={add} disabled={!text.trim()} data-testid="sequence-add-text">
          Add
        </Button>
      </div>
    </Field>
  );
}

/**
 * The chord last played on any input, named, ready to add after the chosen
 * bar or at the end. On a touch screen the keys on screen need the notes
 * held together, with two fingers.
 */
function PlayedEntry({
  editor,
  played,
  touchOnly,
}: {
  editor: SequenceEditor;
  played: Played | null;
  touchOnly: boolean;
}) {
  const symbol = played?.symbol ?? null;
  const said = !played
    ? 'Nothing played yet.'
    : symbol
      ? `You played ${prettyChord(symbol)}.`
      : 'Not a chord I can name: hold three or more notes of one chord together.';
  return (
    <Field
      label="Play a chord"
      group
      hint={
        touchOnly
          ? 'Any octave, any inversion. On the keys on screen, hold the notes together with two fingers.'
          : 'Any octave, any inversion, on a MIDI keyboard or the computer keys.'
      }
      className={styles.entry}
    >
      <div className={styles.playedRow}>
        <span className={styles.played} data-testid="sequence-played">
          {said}
        </span>
        <Button
          onClick={() => symbol && editor.addChord(symbol)}
          disabled={!symbol || editor.full}
          data-testid="sequence-add-played"
        >
          {symbol ? `Add ${prettyChord(symbol)}` : 'Add it'}
        </Button>
      </div>
    </Field>
  );
}
