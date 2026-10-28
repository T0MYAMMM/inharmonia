import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { ChartBar } from '@/core/charts';
import { NO_CHORD } from '@/core/content/types';
import { prettyChord } from '@/core/notation';
import { dropGap, dropIndex, type Box } from './barDrag';
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
 * Shift with an arrow moves it, Delete removes it. With a mouse, drag a
 * bar; on touch, drag the grip of the chosen bar, so a swipe over the bars
 * still scrolls the page. The bar playing is marked in ink, the chosen one
 * ringed.
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

  const stripRef = useRef<HTMLDivElement | null>(null);
  const drag = useBarDrag(bars.length, refs, stripRef, onMove);
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
      ref={stripRef}
      role="listbox"
      aria-label="Bars"
      aria-orientation="horizontal"
      aria-describedby={describedBy}
      className={styles.strip}
      data-testid="sequence-bars"
      data-dragging={drag.state ? 'true' : undefined}
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
          data-dragging={drag.state?.from === i || undefined}
          style={
            drag.state?.from === i
              ? { transform: `translate(${drag.state.dx}px, ${drag.state.dy}px)` }
              : undefined
          }
          onPointerDown={(e) => {
            // On touch a bar scrolls the page; the chosen bar's grip drags it.
            if (e.pointerType !== 'touch') drag.begin(e, i, false);
          }}
          onClick={() => {
            if (drag.consumeClick()) return;
            onSelect(selected === i ? null : i);
          }}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {selected === i ? (
            <span
              className={styles.grip}
              aria-hidden="true"
              data-grip
              onPointerDown={(e) => {
                e.stopPropagation();
                drag.begin(e, i, true);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="12" height="18" viewBox="0 0 12 18" focusable="false">
                {[3, 9].flatMap((cx) =>
                  [3, 9, 15].map((cy) => (
                    <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" fill="currentColor" />
                  )),
                )}
              </svg>
            </span>
          ) : null}
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
      {drag.line ? (
        <div
          className={styles.dropLine}
          aria-hidden="true"
          data-drop
          style={{ left: drag.line.left, top: drag.line.top, height: drag.line.height }}
        />
      ) : null}
    </div>
  );
}

interface DragState {
  from: number;
  /** The gap it would drop into. */
  gap: number;
  /** How far it has moved, in page pixels. */
  dx: number;
  dy: number;
  /** The line marking the gap, in the strip; null where dropping moves nothing. */
  line: { left: number; top: number; height: number } | null;
}

interface Press {
  id: number;
  from: number;
  /** Where it went down, in the viewport and on the page. */
  x: number;
  y: number;
  pageX: number;
  pageY: number;
  started: boolean;
  /** The bars' boxes on the page, measured when the drag starts. */
  boxes: Box[];
}

/** Within this many pixels of the top of the screen, or of the dock, the page scrolls. */
const EDGE = 48;
/** A press that moves less than this is a click. */
const SLOP = 6;

/**
 * Drag a bar to a new place. A mouse or pen press becomes a drag once it
 * moves; the grip starts one at once. The bar follows the pointer, a line
 * marks where it will go, Escape cancels, and near the top of the screen or
 * the keyboard dock the page scrolls.
 */
function useBarDrag(
  count: number,
  refs: { readonly current: (HTMLDivElement | null)[] },
  strip: { readonly current: HTMLDivElement | null },
  onMove: (from: number, to: number) => void,
) {
  const [state, setState] = useState<DragState | null>(null);
  const [pressing, setPressing] = useState(false);
  const press = useRef<Press | null>(null);
  const dragged = useRef(false);
  const moveTo = useRef(onMove);
  useEffect(() => {
    moveTo.current = onMove;
  });

  const measure = (): Box[] =>
    refs.current.slice(0, count).map((el) => {
      const r = el!.getBoundingClientRect();
      return {
        left: r.left + window.scrollX,
        right: r.right + window.scrollX,
        top: r.top + window.scrollY,
        bottom: r.bottom + window.scrollY,
      };
    });

  const begin = (e: ReactPointerEvent, from: number, now: boolean) => {
    if (e.button !== 0) return;
    dragged.current = false;
    press.current = {
      id: e.pointerId,
      from,
      x: e.clientX,
      y: e.clientY,
      pageX: e.clientX + window.scrollX,
      pageY: e.clientY + window.scrollY,
      started: now,
      boxes: now ? measure() : [],
    };
    if (now) setState({ from, gap: from, dx: 0, dy: 0, line: null });
    setPressing(true);
  };

  useEffect(() => {
    if (!pressing) return;
    let last = { x: press.current?.x ?? 0, y: press.current?.y ?? 0 };
    let raf = 0;
    const show = () => {
      const p = press.current;
      if (!p?.started) return;
      const x = last.x + window.scrollX;
      const y = last.y + window.scrollY;
      const gap = dropGap(p.boxes, x, y);
      // A gap next to the bar itself is no move, so it gets no line.
      const still = gap === p.from || gap === p.from + 1;
      setState({
        from: p.from,
        gap,
        dx: x - p.pageX,
        dy: y - p.pageY,
        line: still ? null : lineAt(p.boxes, gap, strip.current),
      });
    };
    const stop = () => {
      press.current = null;
      setPressing(false);
      setState(null);
    };
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.id) return;
      last = { x: e.clientX, y: e.clientY };
      if (!p.started) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < SLOP) return;
        p.started = true;
        p.boxes = measure();
      }
      e.preventDefault();
      show();
    };
    const up = (e: PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.id) return;
      stop();
      if (!p.started || e.type === 'pointercancel') return;
      dragged.current = true;
      const gap = dropGap(p.boxes, e.clientX + window.scrollX, e.clientY + window.scrollY);
      const to = dropIndex(p.from, gap);
      if (to !== p.from) moveTo.current(p.from, to);
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || !press.current?.started) return;
      e.preventDefault();
      dragged.current = true;
      stop();
    };
    const scroll = () => {
      if (press.current?.started) {
        const dock = document.querySelector('[data-dock]')?.getBoundingClientRect().top;
        const bottom = Math.min(window.innerHeight, dock ?? window.innerHeight);
        const dy = last.y < EDGE ? -12 : last.y > bottom - EDGE ? 12 : 0;
        if (dy) {
          window.scrollBy(0, dy);
          show();
        }
      }
      raf = requestAnimationFrame(scroll);
    };
    raf = requestAnimationFrame(scroll);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    };
    // measure reads refs; the drag lives as long as the press.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressing]);

  return {
    state,
    line: state?.line ?? null,
    begin,
    /** The click that ends a drag is not a choice. */
    consumeClick: () => {
      const was = dragged.current;
      dragged.current = false;
      return was;
    },
  };
}

/**
 * The line that marks a gap, in the strip's own coordinates: in the space
 * before bar `gap`, or after the last bar.
 */
function lineAt(
  boxes: readonly Box[],
  gap: number,
  strip: HTMLElement | null,
): { left: number; top: number; height: number } | null {
  const box = boxes[gap] ?? boxes.at(-1);
  if (!box || !strip) return null;
  const r = strip.getBoundingClientRect();
  const x = gap < boxes.length ? box.left - 5.5 : box.right + 2.5;
  return {
    left: x - (r.left + window.scrollX),
    top: box.top - (r.top + window.scrollY),
    height: box.bottom - box.top,
  };
}
