import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import type { ChartBar } from '@/core/charts';
import { NO_CHORD } from '@/core/content/types';
import { prettyChord } from '@/core/notation';
import { barWords } from './useSequenceEditor';
import styles from './sequence.module.css';

export interface BarStripProps {
  bars: readonly ChartBar[];
  /** The bar playing, or null. */
  playing: number | null;
  selected: number | null;
  onSelect: (index: number | null) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (index: number) => void;
  /** Enter on a bar: go to its chords. */
  onOpen: (index: number) => void;
  /** id of the line that explains the keys. */
  describedBy?: string;
}

/**
 * The sequence's bars, four to a line (two on a phone), each chord as wide
 * as its beats: a listbox with one tab stop. Arrow keys choose a bar,
 * Shift with an arrow moves it, Delete removes it. The bar playing is
 * marked in ink, the chosen one ringed.
 */
export function BarStrip({
  bars,
  playing,
  selected,
  onSelect,
  onMove,
  onDelete,
  onOpen,
  describedBy,
}: BarStripProps) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  // A bar to focus once the bars have changed under the keyboard.
  const pendingFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    const i = pendingFocus.current;
    if (i === null) return;
    pendingFocus.current = null;
    refs.current[i]?.focus();
  });

  const tabStop = selected ?? 0;
  const goTo = (i: number) => {
    if (i < 0 || i >= bars.length) return;
    pendingFocus.current = i;
    onSelect(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, i: number) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step && e.shiftKey) {
      e.preventDefault();
      const to = i + step;
      if (to < 0 || to >= bars.length) return;
      pendingFocus.current = to;
      onMove(i, to);
    } else if (step) {
      e.preventDefault();
      goTo(i + step);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      goTo(e.key === 'Home' ? 0 : bars.length - 1);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      pendingFocus.current = bars.length > 1 ? Math.min(i, bars.length - 2) : null;
      onDelete(i);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onSelect(i);
      onOpen(i);
    } else if (e.key === ' ') {
      e.preventDefault();
      onSelect(i);
    } else if (e.key === 'Escape' && selected !== null) {
      e.preventDefault();
      onSelect(null);
    }
  };

  return (
    <div
      role="listbox"
      aria-label="Bars"
      aria-orientation="horizontal"
      aria-describedby={describedBy}
      className={styles.strip}
      data-testid="sequence-bars"
    >
      {bars.map((bar, i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="option"
          aria-selected={selected === i}
          aria-current={playing === i ? 'true' : undefined}
          aria-label={`Bar ${i + 1}: ${barWords(bar).replace(/ /g, ', ')}`}
          tabIndex={i === tabStop ? 0 : -1}
          className={styles.bar}
          data-bar={i}
          onClick={() => onSelect(selected === i ? null : i)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          <span className={styles.barNo} aria-hidden="true">
            {i + 1}
          </span>
          <span className={styles.chords} aria-hidden="true">
            {bar.chords.map((c, k) => (
              <span key={k} className={styles.chord} style={{ flexGrow: c.beats }}>
                <span
                  className={styles.symbol}
                  data-symbol
                  data-nc={c.symbol === NO_CHORD || undefined}
                >
                  {c.symbol === NO_CHORD ? c.symbol : prettyChord(c.symbol)}
                </span>
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
