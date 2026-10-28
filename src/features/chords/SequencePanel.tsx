import { useId, useState } from 'react';
import {
  CHART_STYLES,
  readChords,
  roomLeft,
  SEQUENCE_TEMPO,
  sequenceKey,
  type ChartStyle,
  type SequenceIssue,
} from '@/core/charts';
import { keyName, prettyAccidentals } from '@/core/notation';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Field } from '@/ui/Field';
import { PlayButton } from '@/ui/PlayButton';
import { Segmented } from '@/ui/Segmented';
import { Select } from '@/ui/Select';
import { Slider } from '@/ui/Slider';
import { TextInput } from '@/ui/TextInput';
import { Toggle } from '@/ui/Toggle';
import { BarStrip } from './BarStrip';
import type { SequenceEditor } from './useSequenceEditor';
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

export interface SequencePanelProps {
  editor: SequenceEditor;
  playback: SequencePlayback;
}

/**
 * The chord sequence: put chords in a line, by typing them or from the chord
 * above, and hear them played at a tempo, in a style, looped or once.
 */
export function SequencePanel({ editor, playback }: SequencePanelProps) {
  const titleId = useId();
  const { sequence: seq } = editor;
  const n = seq.bars.length;
  const key = sequenceKey(seq.bars);
  const style = CHART_STYLES.find((s) => s.id === seq.style) ?? CHART_STYLES[0];

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

      {n ? (
        <p className={styles.summary}>
          <span data-testid="sequence-summary">
            {n} bar{n === 1 ? '' : 's'}
            {key ? ` in ${prettyAccidentals(keyName(key))}` : ''}
          </span>
          {playback.playing && playback.bar !== null ? (
            <span data-testid="sequence-position">
              Bar {playback.bar + 1} of {n}
            </span>
          ) : null}
        </p>
      ) : null}

      {n ? (
        <BarStrip bars={seq.bars} playing={playback.playing ? playback.bar : null} />
      ) : (
        <div className={styles.empty} data-testid="sequence-empty">
          <p>No chords yet. Type some below, or try these.</p>
          <Button
            onClick={() => editor.addBars(readChords(EXAMPLE, seq.meter.beats, roomLeft(seq)).bars)}
          >
            Try {EXAMPLE}
          </Button>
        </div>
      )}

      <ChordEntry editor={editor} />

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
      </div>

      <p className="visually-hidden" role="status" aria-live="polite" data-testid="sequence-status">
        {/* A space that comes and goes, so the same words twice are spoken twice. */}
        {editor.announcement.text}
        {editor.announcement.n % 2 ? ' ' : ''}
      </p>
    </Card>
  );
}

/**
 * Chords typed in a line, added after the chosen bar or at the end. Problems
 * show once you try to add, and update as you fix them.
 */
function ChordEntry({ editor }: { editor: SequenceEditor }) {
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
