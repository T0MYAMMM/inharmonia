import { forwardRef, memo, useEffect, useRef, type KeyboardEvent } from 'react';
import type { CompiledBar, CompiledLesson } from '@/core/content/compile';
import {
  doHeader,
  formatChord,
  formatNote,
  type AccidentalStyle,
  type KeyContext,
  type NotationSystem,
} from '@/core/notation';
import { NoteLabel } from '@/ui/NoteLabel';
import styles from './Score.module.css';

export interface ScoreProps {
  compiled: CompiledLesson;
  notation: NotationSystem;
  accidentalStyle: AccidentalStyle;
  mode: 'listen' | 'practice';
  currentBar: number;
  /** Listen: chip under the playhead. */
  activeChipId: string | null;
  /** Practice: the target chip and its position. */
  targetChipId: string | null;
  targetBar: number;
  targetIndexInBar: number;
  onSelectBar: (index: number) => void;
}

/**
 * The song as bar cards: sections, chords sized by duration, note chips sized by
 * duration. Re-renders only bars whose state changed (BarCard is memoised on
 * per-bar props).
 */
export function Score(props: ScoreProps) {
  const { compiled, notation, mode, currentBar } = props;
  const key = compiled.lesson.key;
  const sections = groupSections(compiled.bars);
  const currentRef = useRef<HTMLDivElement | null>(null);

  useScrollIntoView(currentRef, currentBar);

  return (
    <div className={styles.score}>
      {notation === 'angka' ? <p className={styles.doHeader}>{doHeader(key)}</p> : null}
      {sections.map((sec) => (
        <section key={sec.startIndex} className={styles.section} aria-label={sec.title ?? 'Bars'}>
          {sec.title ? <h2 className={styles.sectionTitle}>{sec.title}</h2> : null}
          <div className={styles.grid}>
            {sec.bars.map((bar) => {
              const isCurrent = bar.index === currentBar;
              const doneCount =
                mode !== 'practice'
                  ? 0
                  : bar.index < props.targetBar
                    ? bar.rh.length
                    : bar.index === props.targetBar
                      ? props.targetIndexInBar
                      : 0;
              const activeId = props.activeChipId?.startsWith(`rh-${bar.index}-`)
                ? props.activeChipId
                : null;
              const targetId = props.targetChipId?.startsWith(`rh-${bar.index}-`)
                ? props.targetChipId
                : null;
              return (
                <BarCard
                  key={bar.index}
                  ref={isCurrent ? currentRef : undefined}
                  bar={bar}
                  barCount={compiled.bars.length}
                  keyContext={key}
                  notation={notation}
                  accidentalStyle={props.accidentalStyle}
                  mode={mode}
                  current={isCurrent}
                  activeId={activeId}
                  targetId={targetId}
                  doneCount={doneCount}
                  onSelect={props.onSelectBar}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

interface BarCardProps {
  bar: CompiledBar;
  barCount: number;
  keyContext: KeyContext;
  notation: NotationSystem;
  accidentalStyle: AccidentalStyle;
  mode: 'listen' | 'practice';
  current: boolean;
  activeId: string | null;
  targetId: string | null;
  doneCount: number;
  onSelect: (index: number) => void;
}

const BarCard = memo(
  forwardRef<HTMLDivElement, BarCardProps>(function BarCard(
    {
      bar,
      barCount,
      keyContext,
      notation,
      accidentalStyle,
      mode,
      current,
      activeId,
      targetId,
      doneCount,
      onSelect,
    }: BarCardProps,
    ref,
  ) {
    const chordText = bar.chords.map((c) => formatChord(c.symbol, keyContext, notation)).join(', ');
    const angka = notation === 'angka';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(bar.index);
      }
    };
    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        className={styles.bar}
        aria-current={current ? 'true' : undefined}
        aria-label={`Bar ${bar.index + 1} of ${barCount}, ${chordText}. ${mode === 'listen' ? 'Play from here' : 'Practice from here'}`}
        data-bar={bar.index}
        onClick={() => onSelect(bar.index)}
        onKeyDown={onKeyDown}
      >
        <span className={styles.barNumber} aria-hidden="true">
          {bar.index + 1}
        </span>
        <div className={styles.chords} aria-hidden="true">
          {bar.chords.map((c) => (
            <span
              key={c.id}
              className={styles.chord}
              style={{ flexGrow: c.beats, flexBasis: 0, fontSize: `${0.82 + c.beats * 0.1}rem` }}
            >
              {formatChord(c.symbol, keyContext, notation)}
            </span>
          ))}
        </div>
        <div className={styles.chips} aria-hidden="true">
          {bar.rh.map((n, i) => {
            const state =
              n.id === activeId
                ? 'active'
                : n.id === targetId
                  ? 'target'
                  : i < doneCount
                    ? 'done'
                    : undefined;
            return (
              <span
                key={n.id}
                className={styles.chip}
                data-state={state}
                data-chip={n.id}
                data-angka={angka || undefined}
                style={{ flexGrow: n.beats, flexBasis: 0 }}
              >
                {n.note ? (
                  <NoteLabel
                    label={formatNote(n.note, keyContext, { system: notation, accidentalStyle })}
                    angka={angka}
                    accidentalStyle={accidentalStyle}
                  />
                ) : (
                  '·'
                )}
              </span>
            );
          })}
        </div>
      </div>
    );
  }),
);

function groupSections(bars: CompiledBar[]) {
  const out: { title: string | null; startIndex: number; bars: CompiledBar[] }[] = [];
  for (const b of bars) {
    if (b.section || out.length === 0)
      out.push({ title: b.section ?? null, startIndex: b.index, bars: [] });
    out[out.length - 1]!.bars.push(b);
  }
  return out;
}

/**
 * Keep the current bar visible: if it is off-screen, under the sticky controls
 * or behind the keyboard dock, scroll it to the middle of the visible area
 * (smoothly unless reduced motion).
 */
function useScrollIntoView(ref: React.RefObject<HTMLDivElement | null>, bar: number) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dock = document.querySelector('[data-dock]');
    const panel = document.querySelector('[data-sticky-panel]');
    const bottom = dock ? dock.getBoundingClientRect().top : window.innerHeight;
    const panelBottom = panel ? panel.getBoundingClientRect().bottom : 0;
    const top =
      getComputedStyle(panel ?? document.body).position === 'sticky' ? Math.max(0, panelBottom) : 0;
    if (rect.top >= top && rect.bottom <= bottom) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const delta = rect.top + rect.height / 2 - (top + bottom) / 2;
    window.scrollBy?.({ top: delta, behavior: reduce ? 'auto' : 'smooth' });
  }, [ref, bar]);
}
