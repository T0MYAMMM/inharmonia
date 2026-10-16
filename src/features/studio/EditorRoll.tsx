import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { formatChord, prettyNumeral, type NotationSystem } from '@/core/notation';
import {
  addNote,
  deleteNote,
  lengthBeats,
  MIN_NOTE_BEATS,
  updateNote,
  type DraftNote,
  type SongDraft,
} from '@/core/songs';
import { BEAT_PX, describeNote, ROW_PX, type ChordOption, type EditorTrace } from './editorModel';
import styles from './editor.module.css';

const LANE_PX = 40;
const EDGE_PX = 9;
const MIN_ROWS = 25;

export interface EditorRollProps {
  draft: SongDraft;
  selectedId: string | null;
  /** Edit grid in beats. */
  step: number;
  notation: NotationSystem;
  trace: EditorTrace | null;
  showTrace: boolean;
  playheadRef: RefObject<SVGLineElement>;
  chordOptions: (index: number) => { suggested: ChordOption[]; others: ChordOption[] };
  onSelect: (id: string | null) => void;
  /** A finished edit, with words for the live region. */
  onChange: (next: SongDraft, said: string) => void;
  onChordChange: (index: number, option: ChordOption) => void;
}

interface Drag {
  pointer: number;
  id: string;
  mode: 'move' | 'resize';
  x: number;
  y: number;
  origin: DraftNote;
  preview: SongDraft | null;
}

function pitchRange(notes: readonly DraftNote[]): [number, number] {
  if (notes.length === 0) return [55, 79];
  let lo = Math.min(...notes.map((n) => n.midi)) - 4;
  let hi = Math.max(...notes.map((n) => n.midi)) + 4;
  const extra = MIN_ROWS - (hi - lo + 1);
  if (extra > 0) {
    lo -= Math.floor(extra / 2);
    hi += Math.ceil(extra / 2);
  }
  return [Math.max(21, lo), Math.min(108, hi)];
}

const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * The editable piano roll: the chord lane on top, the melody as notes on a
 * beat grid, and optionally your sung pitch underneath. Notes can be dragged
 * (move, or resize from the right edge), and tapping an empty spot adds one;
 * with the keyboard, the arrows move the selected note, Shift with the arrows
 * changes its length or octave, [ and ] pick the previous or next note, and
 * Delete removes it.
 */
export function EditorRoll(props: EditorRollProps) {
  const { draft, selectedId, step, notation, trace, showTrace, playheadRef } = props;
  const [initialRange] = useState(() => pitchRange(draft.notes));
  const [drag, setDrag] = useState<Drag | null>(null);
  const shown = drag?.preview ?? draft;
  const noteRange = pitchRange(shown.notes);
  const lo = Math.min(initialRange[0], noteRange[0]);
  const hi = Math.max(initialRange[1], noteRange[1]);
  const beats = lengthBeats(draft);
  const bpb = draft.meter.beats;
  const width = beats * BEAT_PX;
  const height = (hi - lo + 1) * ROW_PX;
  const x = (b: number) => b * BEAT_PX;
  const y = (m: number) => (hi - m) * ROW_PX;
  const noteRefs = useRef(new Map<string, SVGGElement>());
  const rollRef = useRef<HTMLDivElement | null>(null);

  // Keep keyboard focus on the selected note after edits and selection moves.
  useEffect(() => {
    if (!selectedId || !rollRef.current?.contains(document.activeElement)) return;
    noteRefs.current.get(selectedId)?.focus({ preventScroll: false });
  }, [selectedId, draft]);

  const sorted = shown.notes;
  const index = sorted.findIndex((n) => n.id === selectedId);

  const onNoteKey = (e: KeyboardEvent, n: DraftNote) => {
    const say = (d: SongDraft, what: string) => {
      const moved = d.notes.find((m) => m.id === n.id);
      props.onChange(d, moved ? `${what}: ${describeNote(moved, d, notation)}` : what);
    };
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        if (e.shiftKey)
          say(
            updateNote(draft, n.id, { beats: Math.max(MIN_NOTE_BEATS, n.beats + dir * step) }),
            dir > 0 ? 'Longer' : 'Shorter',
          );
        else say(updateNote(draft, n.id, { startBeat: n.startBeat + dir * step }), 'Moved');
        break;
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        const dir = e.key === 'ArrowUp' ? 1 : -1;
        say(
          updateNote(draft, n.id, { midi: n.midi + dir * (e.shiftKey ? 12 : 1) }),
          dir > 0 ? 'Up' : 'Down',
        );
        break;
      }
      case 'Delete':
      case 'Backspace': {
        const next = sorted[index + 1] ?? sorted[index - 1] ?? null;
        props.onChange(deleteNote(draft, n.id), `Deleted ${describeNote(n, draft, notation)}`);
        props.onSelect(next?.id ?? null);
        break;
      }
      case '[':
      case ']': {
        const next = sorted[index + (e.key === ']' ? 1 : -1)];
        if (next) props.onSelect(next.id);
        break;
      }
      case 'Escape':
        props.onSelect(null);
        (e.currentTarget as SVGGElement).blur();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const onNoteDown = (e: PointerEvent<SVGGElement>, n: DraftNote) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    props.onSelect(n.id);
    const rect = (e.currentTarget as SVGGElement).getBoundingClientRect();
    const mode = e.clientX > rect.right - EDGE_PX ? 'resize' : 'move';
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      pointer: e.pointerId,
      id: n.id,
      mode,
      x: e.clientX,
      y: e.clientY,
      origin: n,
      preview: null,
    });
  };

  const onNoteMove = (e: PointerEvent<SVGGElement>) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const db = Math.round((e.clientX - drag.x) / BEAT_PX / step) * step;
    const dm = -Math.round((e.clientY - drag.y) / ROW_PX);
    const o = drag.origin;
    const preview =
      db === 0 && dm === 0
        ? null
        : drag.mode === 'resize'
          ? updateNote(draft, o.id, { beats: Math.max(MIN_NOTE_BEATS, o.beats + db) })
          : updateNote(draft, o.id, { startBeat: o.startBeat + db, midi: o.midi + dm });
    setDrag({ ...drag, preview });
  };

  const onNoteUp = (e: PointerEvent<SVGGElement>) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const moved = drag.preview?.notes.find((m) => m.id === drag.id);
    if (drag.preview && moved)
      props.onChange(
        drag.preview,
        `${drag.mode === 'resize' ? 'Resized' : 'Moved'}: ${describeNote(moved, drag.preview, notation)}`,
      );
    setDrag(null);
  };

  const onEmptyClick = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const b = Math.floor((e.clientX - box.left) / BEAT_PX / step) * step;
    const m = hi - Math.floor((e.clientY - box.top) / ROW_PX);
    const { draft: next, id } = addNote(draft, {
      startBeat: b,
      beats: Math.max(step, 0.5),
      midi: m,
    });
    const added = next.notes.find((n) => n.id === id)!;
    props.onChange(next, `Added ${describeNote(added, next, notation)}`);
    props.onSelect(id);
  };

  // The sung pitch as polylines, broken where nothing steady was heard.
  const paths: string[] = [];
  if (trace && showTrace) {
    let d = '';
    const bps = trace.tempo / 60;
    for (let i = 0; i < trace.values.length; i++) {
      const v = trace.values[i]!;
      const b = (trace.start + i * trace.hop - trace.beat0) * bps;
      if (Number.isNaN(v) || b < 0 || b > beats) {
        if (d) paths.push(d);
        d = '';
        continue;
      }
      const pt = `${x(b).toFixed(1)},${(y(v + trace.shift) + ROW_PX / 2).toFixed(1)}`;
      d += d ? ` L${pt}` : `M${pt}`;
    }
    if (d) paths.push(d);
  }

  return (
    <div className={styles.rollScroll} ref={rollRef}>
      <div className={styles.rollInner} style={{ width }}>
        <div className={styles.lane} style={{ height: LANE_PX }} role="group" aria-label="Chords">
          {draft.chords.map((c, i) => {
            const { suggested, others } = props.chordOptions(i);
            const all = [...suggested, ...others];
            const bar = Math.floor(c.startBeat / bpb + 1e-6) + 1;
            const beat = (c.startBeat % bpb) + 1;
            return (
              <select
                key={`${c.startBeat}`}
                className={styles.chordSelect}
                style={{ left: x(c.startBeat) + 2, width: x(c.beats) - 4 }}
                value={c.symbol}
                aria-label={`Chord, bar ${bar}${beat > 1 ? `, beat ${beat}` : ''}`}
                data-testid={`chord-${i}`}
                onChange={(e) => {
                  const o = all.find((a) => a.symbol === e.target.value);
                  if (o) props.onChordChange(i, o);
                }}
              >
                <optgroup label="Suggested">
                  {suggested.map((o) => (
                    <option key={o.symbol} value={o.symbol}>
                      {label(o, draft, notation)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="More chords in the key">
                  {others.map((o) => (
                    <option key={o.symbol} value={o.symbol}>
                      {label(o, draft, notation)}
                    </option>
                  ))}
                </optgroup>
              </select>
            );
          })}
        </div>
        <svg
          className={styles.roll}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={`Melody: ${draft.notes.length} notes. Tap an empty spot to add a note.`}
        >
          {Array.from({ length: hi - lo + 1 }, (_, i) => {
            const m = hi - i;
            return (
              <rect
                key={m}
                x={0}
                y={y(m)}
                width={width}
                height={ROW_PX}
                className={BLACK.has(m % 12) ? styles.rowBlack : styles.rowWhite}
              />
            );
          })}
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            className={styles.hit}
            onClick={onEmptyClick}
            data-testid="roll-empty"
          />
          {Array.from({ length: Math.round(beats / step) + 1 }, (_, i) => {
            const b = i * step;
            const cls =
              Math.abs(b % bpb) < 1e-6
                ? styles.barLine
                : Math.abs(b - Math.round(b)) < 1e-6
                  ? styles.beatLine
                  : styles.stepLine;
            return <line key={i} x1={x(b)} x2={x(b)} y1={0} y2={height} className={cls} />;
          })}
          {Array.from({ length: hi - lo + 1 }, (_, i) => hi - i)
            .filter((m) => m % 12 === 0)
            .map((m) => (
              <text key={m} x={3} y={y(m) + ROW_PX - 3} className={styles.cLabel}>
                C{m / 12 - 1}
              </text>
            ))}
          {shown.notes.map((n) => {
            const selected = n.id === selectedId;
            const w = Math.max(6, x(n.beats) - 2);
            return (
              <g
                key={n.id}
                ref={(el) => {
                  if (el) noteRefs.current.set(n.id, el);
                  else noteRefs.current.delete(n.id);
                }}
                role="button"
                tabIndex={selected || (!selectedId && n === shown.notes[0]) ? 0 : -1}
                aria-pressed={selected}
                aria-label={describeNote(n, shown, notation)}
                className={styles.note}
                data-note={n.id}
                data-selected={selected || undefined}
                onFocus={() => {
                  if (!selected) props.onSelect(n.id);
                }}
                onKeyDown={(e) => onNoteKey(e, n)}
                onPointerDown={(e) => onNoteDown(e, n)}
                onPointerMove={onNoteMove}
                onPointerUp={onNoteUp}
                onPointerCancel={() => setDrag(null)}
              >
                <rect
                  x={x(n.startBeat) + 1}
                  y={y(n.midi) + 1}
                  width={w}
                  height={ROW_PX - 2}
                  rx={3}
                />
                <rect
                  x={x(n.startBeat) + 1 + w - EDGE_PX}
                  y={y(n.midi) + 1}
                  width={EDGE_PX}
                  height={ROW_PX - 2}
                  className={styles.edge}
                />
              </g>
            );
          })}
          {/* Your pitch on top of the notes, so you can see where they differ. */}
          {paths.map((p, i) => (
            <path key={i} d={p} className={styles.trace} />
          ))}
          <line
            ref={playheadRef}
            x1={-10}
            x2={-10}
            y1={0}
            y2={height}
            className={styles.playhead}
          />
        </svg>
      </div>
    </div>
  );
}

function label(o: ChordOption, d: SongDraft, notation: NotationSystem): string {
  const text = formatChord(o.symbol, d.key, notation);
  return o.numeral && notation !== 'roman' ? `${text} (${prettyNumeral(o.numeral)})` : text;
}
