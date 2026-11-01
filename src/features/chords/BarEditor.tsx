import { useState } from 'react';
import {
  barSplits,
  copyBar,
  moveBar,
  readChord,
  removeBar,
  removeChord,
  setChord,
  setSplit,
  type ChartChord,
} from '@/core/charts';
import { NO_CHORD } from '@/core/content/types';
import { prettyChord } from '@/core/notation';
import { Button } from '@/ui/Button';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '@/ui/icons';
import { Field } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { TextInput } from '@/ui/TextInput';
import { barWords, type SequenceEditor } from './useSequenceEditor';
import styles from './sequence.module.css';

const half = (b: number) => (b === 0.5 ? '½' : String(b));
const splitLabel = (split: readonly number[]) => split.map(half).join('+');
const beatsLabel = (b: number) => (b === 0.5 ? '½ beat' : `${b} beat${b === 1 ? '' : 's'}`);
const symbolOf = (c: ChartChord) => (c.symbol === NO_CHORD ? c.symbol : prettyChord(c.symbol));

export interface BarEditorProps {
  editor: SequenceEditor;
  index: number;
  /** Where the first chord field's id starts, so Enter on a bar can come here. */
  idPrefix: string;
  /** The keys' explanation, shown where there is a keyboard. */
  keysHint?: string;
  /** After the last bar is deleted. */
  onEmpty: () => void;
}

/**
 * The chosen bar: how its beats split, each chord (change it by typing,
 * or take it out), and moving, copying or deleting the bar.
 */
export function BarEditor({ editor, index, idPrefix, keysHint, onEmpty }: BarEditorProps) {
  const seq = editor.sequence;
  const bar = seq.bars[index]!;
  const n = index + 1;
  const splits = barSplits(seq.meter.beats);
  const split = splitLabel(bar.chords.map((c) => c.beats));

  return (
    <section className={styles.editor} aria-label={`Bar ${n}`} data-testid="bar-editor">
      <div className={styles.editorHead}>
        <h3 className={styles.editorTitle}>Bar {n}</h3>
        <div className={styles.editorTools}>
          <Button
            size="small"
            icon
            aria-label={`Move bar ${n} left`}
            title="Move left (Shift+←)"
            disabled={index === 0}
            onClick={() =>
              editor.change(
                moveBar(seq, index, index - 1),
                `Moved bar ${n} to bar ${n - 1}.`,
                index - 1,
              )
            }
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="small"
            icon
            aria-label={`Move bar ${n} right`}
            title="Move right (Shift+→)"
            disabled={index === seq.bars.length - 1}
            onClick={() =>
              editor.change(
                moveBar(seq, index, index + 1),
                `Moved bar ${n} to bar ${n + 1}.`,
                index + 1,
              )
            }
          >
            <ChevronRightIcon />
          </Button>
          <Button
            size="small"
            aria-label={`Copy bar ${n} after it`}
            disabled={editor.full}
            onClick={() =>
              editor.change(copyBar(seq, index), `Copied bar ${n} to bar ${n + 1}.`, index + 1)
            }
          >
            Copy
          </Button>
          <Button
            size="small"
            aria-label={`Delete bar ${n}`}
            title="Delete (Delete key)"
            onClick={() => {
              const next = removeBar(seq, index);
              editor.change(
                next,
                `Deleted bar ${n}, ${barWords(bar)}.`,
                next.bars.length ? Math.min(index, next.bars.length - 1) : null,
              );
              if (!next.bars.length) onEmpty();
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      <Field label="Beats" group>
        <Segmented
          label={`Beats in bar ${n}`}
          value={split}
          options={splits.map((s) => ({ value: splitLabel(s), label: splitLabel(s) }))}
          onChange={(v) => {
            const to = splits.find((s) => splitLabel(s) === v)!;
            const next = setSplit(seq, index, to);
            editor.change(next, `Bar ${n} is now ${barWords(next.bars[index]!)}, ${v} beats.`);
          }}
        />
      </Field>

      <div className={styles.slots}>
        {bar.chords.map((c, k) => (
          <ChordSlot
            key={k}
            id={k === 0 ? `${idPrefix}-chord` : undefined}
            chord={c}
            label={`Chord ${k + 1}, ${beatsLabel(c.beats)}`}
            removable={bar.chords.length > 1}
            removeLabel={`Remove ${symbolOf(c)} from bar ${n}`}
            onChange={(typed) => {
              const next = setChord(seq, index, k, typed);
              editor.change(next, `Bar ${n} is now ${barWords(next.bars[index]!)}.`);
            }}
            onRemove={() => {
              const next = removeChord(seq, index, k);
              editor.change(
                next,
                `Took ${symbolOf(c)} out of bar ${n}: now ${barWords(next.bars[index]!)}.`,
              );
            }}
          />
        ))}
      </div>

      {keysHint ? <p className={styles.note}>{keysHint}</p> : null}
    </section>
  );
}

/**
 * One chord of the bar, as text. A chord is used on Enter or when you
 * leave the field; what is not a chord stays to be fixed, and Escape puts
 * the chord back.
 */
function ChordSlot({
  id,
  chord,
  label,
  removable,
  removeLabel,
  onChange,
  onRemove,
}: {
  id?: string;
  chord: ChartChord;
  label: string;
  removable: boolean;
  removeLabel: string;
  onChange: (typed: string) => void;
  onRemove: () => void;
}) {
  // What is being typed, for the chord it was typed over: undo or a new
  // split under the field drops it.
  const [draft, setDraft] = useState<{ text: string; over: string } | null>(null);
  const [tried, setTried] = useState(false);
  const typing = draft && draft.over === chord.symbol ? draft.text : null;
  const bad = typing !== null && readChord(typing) === null;

  const use = () => {
    if (typing === null) return;
    if (readChord(typing) === null) {
      if (!typing.trim()) setDraft(null);
      else setTried(true);
      return;
    }
    onChange(typing);
    setDraft(null);
    setTried(false);
  };

  return (
    <Field
      label={label}
      id={id}
      error={tried && bad ? 'Not a chord yet. Escape puts it back.' : undefined}
      className={styles.slot}
    >
      <div className={styles.slotRow}>
        <TextInput
          className={styles.slotInput}
          value={typing ?? chord.symbol}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(e) => setDraft({ text: e.target.value, over: chord.symbol })}
          onBlur={use}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              use();
            } else if (e.key === 'Escape' && typing !== null) {
              e.preventDefault();
              setDraft(null);
              setTried(false);
            }
          }}
        />
        <Button size="small" icon aria-label={removeLabel} disabled={!removable} onClick={onRemove}>
          <CloseIcon />
        </Button>
      </div>
    </Field>
  );
}
