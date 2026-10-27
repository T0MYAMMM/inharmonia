import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { keyName, isBlack } from '@/ui/keyboard/layout';
import type { MidiNote, MidiProject } from '@/core/midi/smf';
import { projectEndBeat } from '@/core/midi/smf';
import { beatLabel, cellStart, moveNotes, notesInBox, resizeNotes, snapBeat } from './rollEdit';
import styles from './midiWorkspace.module.css';

interface Props {
  project: MidiProject;
  trackId: string;
  selection: ReadonlySet<string>;
  /** Grid step in beats; 0 is free. */
  step: number;
  /** Horizontal zoom: pixels per beat. */
  zoom: number;
  /** Vertical zoom: pixels per semitone row. */
  row: number;
  /** The playhead: the playing beat, or the cursor when stopped. */
  getBeat: () => number;
  /** Scroll along with the playhead (while playing). */
  follow: boolean;
  /** Notes being recorded from the keyboard, not yet in the track. */
  pending: readonly Omit<MidiNote, 'id'>[];
  onSelection(ids: string[]): void;
  /** One undoable edit of the current track's notes. */
  onTrackNotes(notes: MidiNote[], message: string): void;
  onAdd(midi: number, startBeat: number): void;
  onSeek(beat: number): void;
}

/** Width of the sticky pitch column and height of the sticky bar ruler. */
export const KEYS_WIDTH = 56;
export const RULER_HEIGHT = 28;
/** Pointer travel, in pixels, before a press becomes a drag. */
const DRAG_SLOP = 4;
/** The right edge of a note, in pixels, that resizes it. */
const EDGE = 9;

type Drag = {
  pointer: number;
  x: number;
  y: number;
  ids: Set<string>;
  resize: boolean;
  preview: MidiNote[] | null;
};
type Marquee = {
  pointer: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  additive: boolean;
  moved: boolean;
};
type Hover = { kind: 'cell'; midi: number; beat: number } | { kind: 'note'; id: string } | null;

/**
 * Multitrack piano roll. The pitch column and the bar ruler stay in view while
 * the grid scrolls both ways; only notes in the visible time window are drawn.
 */
export function MidiRoll({
  project,
  trackId,
  selection,
  step,
  zoom,
  row,
  getBeat,
  follow,
  pending,
  onSelection,
  onTrackNotes,
  onAdd,
  onSeek,
}: Props) {
  const px = zoom;
  const tracks = project.tracks;
  const active = tracks.find((t) => t.id === trackId);
  const pitchList = tracks.flatMap((t) => t.notes.map((n) => n.midi));
  const lo = Math.max(0, Math.min(48, ...pitchList) - 4);
  const hi = Math.min(127, Math.max(84, ...pitchList) + 4);
  const rollHeight = (hi - lo + 1) * row;
  const endBeat = projectEndBeat(project);
  const beats = Math.max(Math.ceil(endBeat / project.meter.beats + 2) * project.meter.beats, 16);
  const width = Math.max(960, beats * px);
  const scroll = useRef<HTMLDivElement>(null);
  const grid = useRef<SVGSVGElement>(null);
  const playLine = useRef<SVGLineElement>(null);
  const playMark = useRef<SVGPathElement>(null);
  const [windowBeats, setWindowBeats] = useState<[number, number]>([0, 32]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const ruler = useRef<number | null>(null);
  const noteY = (m: number) => (hi - m) * row;
  // What is at the top-left corner, kept when zooming so the view stays put.
  const anchor = useRef({ beat: 0, pitch: 76, ready: false });

  const updateWindow = () => {
    const el = scroll.current;
    if (!el) return;
    const viewW = Math.max(0, el.clientWidth - KEYS_WIDTH);
    anchor.current.beat = el.scrollLeft / px;
    anchor.current.pitch = hi - el.scrollTop / row;
    setWindowBeats([Math.max(0, el.scrollLeft / px - 2), (el.scrollLeft + viewW) / px + 2]);
  };

  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    if (!anchor.current.ready) {
      // Start near middle C, with room above for a melody.
      anchor.current = { beat: 0, pitch: Math.min(hi, 79), ready: true };
    }
    el.scrollLeft = anchor.current.beat * px;
    el.scrollTop = Math.max(0, (hi - anchor.current.pitch) * row);
    updateWindow();
    // Re-anchor only when the scale changes; scrolling updates the anchor itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [px, row]);

  // The playhead moves every frame without re-rendering the roll.
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const x = Math.max(0, getBeat()) * px;
      playLine.current?.setAttribute('x1', String(x));
      playLine.current?.setAttribute('x2', String(x));
      playMark.current?.setAttribute('transform', `translate(${x} 0)`);
      const el = scroll.current;
      if (follow && el) {
        const viewW = el.clientWidth - KEYS_WIDTH;
        if (x > el.scrollLeft + viewW * 0.85 || x < el.scrollLeft)
          el.scrollLeft = Math.max(0, x - viewW * 0.15);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [getBeat, px, follow]);

  /** Pointer position in grid coordinates (pixels from the grid's top-left). */
  const local = (e: { clientX: number; clientY: number }) => {
    const r = grid.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pitchAt = (y: number) => Math.max(0, Math.min(127, hi - Math.floor(y / row)));

  // ---- notes: select, move, resize ---------------------------------------------
  const noteDown = (e: PointerEvent<SVGRectElement>, n: MidiNote) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const ids = new Set(selection);
      if (ids.has(n.id)) ids.delete(n.id);
      else ids.add(n.id);
      onSelection([...ids]);
      return;
    }
    const ids = selection.has(n.id) ? new Set(selection) : new Set([n.id]);
    if (!selection.has(n.id)) onSelection([n.id]);
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    setDrag({
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      ids,
      resize: e.clientX >= rect.right - EDGE,
      preview: null,
    });
  };
  const noteMove = (e: PointerEvent<SVGRectElement>) => {
    if (!drag || e.pointerId !== drag.pointer || !active) return;
    const rawDx = (e.clientX - drag.x) / px;
    const dx = step ? Math.round(rawDx / step) * step : rawDx;
    const dy = -Math.round((e.clientY - drag.y) / row);
    if (!drag.preview && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_SLOP) return;
    const preview = drag.resize
      ? resizeNotes(active.notes, drag.ids, dx, step || 0.0625)
      : moveNotes(active.notes, drag.ids, dx, dy);
    setDrag({ ...drag, preview });
  };
  const noteUp = (e: PointerEvent<SVGRectElement>) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (drag.preview) {
      // A drag is ONE undo step, however many notes and frames it moved through.
      const count = drag.ids.size;
      onTrackNotes(
        drag.preview,
        `${drag.resize ? 'Resized' : 'Moved'} ${count} note${count === 1 ? '' : 's'}.`,
      );
    }
    setDrag(null);
  };

  // ---- empty grid: draw a note, or drag a box to select --------------------------
  const emptyDown = (e: PointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    const p = local(e);
    // Touch drags scroll the roll; mouse and pen drags draw a selection box.
    if (e.pointerType !== 'touch') e.currentTarget.setPointerCapture(e.pointerId);
    setMarquee({
      pointer: e.pointerId,
      x0: p.x,
      y0: p.y,
      x1: p.x,
      y1: p.y,
      additive: e.shiftKey || e.ctrlKey || e.metaKey,
      moved: false,
    });
  };
  const emptyMove = (e: PointerEvent<SVGRectElement>) => {
    const p = local(e);
    if (marquee && e.pointerId === marquee.pointer) {
      const moved =
        marquee.moved ||
        (e.pointerType !== 'touch' && Math.hypot(p.x - marquee.x0, p.y - marquee.y0) >= DRAG_SLOP);
      setMarquee({ ...marquee, x1: p.x, y1: p.y, moved });
      if (moved) setHover(null);
      return;
    }
    setHover({ kind: 'cell', midi: pitchAt(p.y), beat: cellStart(p.x / px, step) });
  };
  const emptyUp = (e: PointerEvent<SVGRectElement>) => {
    if (!marquee || e.pointerId !== marquee.pointer) return;
    if (marquee.moved && active) {
      const found = notesInBox(active.notes, {
        fromBeat: Math.min(marquee.x0, marquee.x1) / px,
        toBeat: Math.max(marquee.x0, marquee.x1) / px,
        lowMidi: pitchAt(Math.max(marquee.y0, marquee.y1)),
        highMidi: pitchAt(Math.min(marquee.y0, marquee.y1)),
      });
      onSelection(marquee.additive ? [...new Set([...selection, ...found])] : found);
    } else if (!marquee.moved) {
      onAdd(
        Math.max(21, Math.min(108, pitchAt(marquee.y0))),
        step ? cellStart(marquee.x0 / px, step) : snapBeat(marquee.x0 / px, 0),
      );
    }
    setMarquee(null);
  };

  // ---- ruler: click or drag to move the playhead ---------------------------------
  const rulerBeat = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.round(((e.clientX - r.left) / px) * 4) / 4);
  };

  const gridStep = Math.max(step, step && px * step < 6 ? 1 : 0.25);
  const lines: number[] = [];
  const firstLine = Math.floor(windowBeats[0] / gridStep) * gridStep;
  for (let b = firstLine; b <= windowBeats[1] && lines.length < 2000; b += gridStep)
    if (b >= 0 && b <= beats) lines.push(Number(b.toFixed(4)));
  const bars: number[] = [];
  for (
    let b = Math.floor(windowBeats[0] / project.meter.beats) * project.meter.beats;
    b <= Math.min(beats, windowBeats[1]);
    b += project.meter.beats
  )
    if (b >= 0) bars.push(b);

  const labelEvery = row >= 15 ? 1 : 12;
  const fontSize = Math.max(9, Math.min(12, row - 6));
  const hoverMidi =
    hover?.kind === 'cell'
      ? hover.midi
      : hover?.kind === 'note'
        ? active?.notes.find((n) => n.id === hover.id)?.midi
        : undefined;
  const previews = new Map((drag?.preview ?? []).map((n) => [n.id, n]));

  // The hover readout: an empty cell, or the note under the pointer.
  let tip: { x: number; y: number; text: string } | null = null;
  if (hover?.kind === 'cell' && !drag && !marquee?.moved) {
    tip = {
      x: hover.beat * px,
      y: noteY(hover.midi),
      text: `${keyName(hover.midi)} · ${beatLabel(hover.beat, project.meter.beats)}`,
    };
  } else if (hover?.kind === 'note' && !drag) {
    const n = active?.notes.find((x) => x.id === hover.id);
    if (n)
      tip = {
        x: n.startBeat * px,
        y: noteY(n.midi),
        text:
          `${keyName(n.midi)} · ${beatLabel(n.startBeat, project.meter.beats)} · ` +
          `${n.beats} beat${n.beats === 1 ? '' : 's'} · velocity ${n.velocity}`,
      };
  }
  const tipWidth = tip ? tip.text.length * 6.3 + 14 : 0;
  const tipX = tip
    ? Math.max(windowBeats[0] * px, Math.min(tip.x, (windowBeats[1] - 2) * px - tipWidth))
    : 0;
  const tipY = tip ? (tip.y >= 26 ? tip.y - 24 : tip.y + row + 4) : 0;
  const cellW = Math.max(3, (step || 0.25) * px);

  return (
    <div className={styles.rollFrame} data-testid="midi-roll-frame">
      <div
        className={styles.rollScroller}
        ref={scroll}
        onScroll={updateWindow}
        data-testid="midi-roll"
      >
        <div
          className={styles.rollCanvas}
          style={{ width: KEYS_WIDTH + width, height: RULER_HEIGHT + rollHeight }}
        >
          <div className={styles.rulerRow} style={{ height: RULER_HEIGHT }}>
            <div className={styles.rollCorner} style={{ width: KEYS_WIDTH }}>
              {project.meter.beats}/{project.meter.unit}
            </div>
            <svg
              width={width}
              height={RULER_HEIGHT}
              className={styles.ruler}
              data-testid="midi-ruler"
              aria-label="Bar ruler: click to move the playhead"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                ruler.current = e.pointerId;
                onSeek(rulerBeat(e));
              }}
              onPointerMove={(e) => ruler.current === e.pointerId && onSeek(rulerBeat(e))}
              onPointerUp={() => (ruler.current = null)}
              onPointerCancel={() => (ruler.current = null)}
            >
              {lines
                .filter((b) => b % 1 === 0)
                .map((b) => (
                  <line
                    key={b}
                    x1={b * px}
                    x2={b * px}
                    y1={b % project.meter.beats === 0 ? 4 : RULER_HEIGHT - 7}
                    y2={RULER_HEIGHT}
                    stroke="var(--line)"
                    strokeWidth={b % project.meter.beats === 0 ? 1.4 : 1}
                  />
                ))}
              {bars.map((b) => (
                <text
                  key={'bar' + b}
                  x={b * px + 5}
                  y={17}
                  fontSize={11}
                  fontWeight={700}
                  fill="var(--muted)"
                >
                  {b / project.meter.beats + 1}
                </text>
              ))}
              <path ref={playMark} d="M-6 0h12l-6 9z" fill="var(--ink)" pointerEvents="none" />
            </svg>
          </div>
          <div className={styles.bodyRow}>
            <svg
              width={KEYS_WIDTH}
              height={rollHeight}
              className={styles.keys}
              data-testid="midi-keys"
              aria-hidden="true"
            >
              {Array.from({ length: hi - lo + 1 }, (_, i) => hi - i).map((m) => (
                <g key={m}>
                  <rect
                    x={0}
                    y={noteY(m)}
                    width={KEYS_WIDTH}
                    height={row}
                    fill={
                      m === hoverMidi
                        ? 'var(--amber-soft)'
                        : isBlack(m)
                          ? 'var(--key-black)'
                          : 'var(--surface)'
                    }
                    fillOpacity={m === hoverMidi ? 1 : isBlack(m) ? 0.82 : 1}
                    stroke="var(--line)"
                    strokeWidth={0.5}
                  />
                  {m % labelEvery === 0 || m === hoverMidi ? (
                    <text
                      x={6}
                      y={noteY(m) + row / 2 + fontSize / 2.8}
                      fontSize={fontSize}
                      fontWeight={m % 12 === 0 || m === hoverMidi ? 700 : 400}
                      fill={isBlack(m) && m !== hoverMidi ? 'var(--key-white)' : 'var(--ink)'}
                    >
                      {keyName(m)}
                    </text>
                  ) : null}
                </g>
              ))}
            </svg>
            <svg
              ref={grid}
              className={styles.rollSvg}
              width={width}
              height={rollHeight}
              role="group"
              aria-label="Editable MIDI piano roll"
              onPointerLeave={() => setHover(null)}
            >
              {Array.from({ length: hi - lo + 1 }, (_, i) => hi - i).map((m) => (
                <rect
                  key={m}
                  x={0}
                  y={noteY(m)}
                  width={width}
                  height={row}
                  fill={isBlack(m) ? 'var(--surface-sunk)' : 'var(--surface)'}
                />
              ))}
              {hoverMidi !== undefined ? (
                <rect
                  x={0}
                  y={noteY(hoverMidi)}
                  width={width}
                  height={row}
                  fill="var(--amber)"
                  fillOpacity={0.08}
                  pointerEvents="none"
                />
              ) : null}
              {Array.from({ length: hi - lo + 1 }, (_, i) => hi - i).map((m) => (
                <line
                  key={'r' + m}
                  x1={0}
                  x2={width}
                  y1={noteY(m)}
                  y2={noteY(m)}
                  stroke="var(--line)"
                  strokeOpacity={m % 12 === 11 ? 0.9 : 0.35}
                />
              ))}
              {lines.map((b) => (
                <line
                  key={b}
                  x1={b * px}
                  x2={b * px}
                  y1={0}
                  y2={rollHeight}
                  stroke="var(--line)"
                  strokeWidth={b % project.meter.beats === 0 ? 1.6 : 0.6}
                  strokeDasharray={b % 1 === 0 ? undefined : '2 4'}
                />
              ))}
              <rect
                x={0}
                y={0}
                width={width}
                height={rollHeight}
                fill="transparent"
                data-testid="midi-roll-empty"
                style={{ cursor: 'crosshair' }}
                onPointerDown={emptyDown}
                onPointerMove={emptyMove}
                onPointerUp={emptyUp}
                onPointerCancel={() => setMarquee(null)}
              />
              {hover?.kind === 'cell' && !marquee?.moved ? (
                <rect
                  x={hover.beat * px + 1}
                  y={noteY(hover.midi) + 2}
                  width={cellW - 2}
                  height={row - 4}
                  rx={3}
                  fill="var(--amber)"
                  fillOpacity={0.25}
                  stroke="var(--amber)"
                  strokeDasharray="3 2"
                  pointerEvents="none"
                  data-testid="midi-hover-cell"
                />
              ) : null}
              {tracks.flatMap((t) =>
                t.notes
                  .filter(
                    (n) => n.startBeat + n.beats >= windowBeats[0] && n.startBeat <= windowBeats[1],
                  )
                  .map((n) => {
                    const isActive = t.id === trackId;
                    const shown = (isActive && previews.get(n.id)) || n;
                    const picked = isActive && selection.has(n.id);
                    return (
                      <rect
                        key={t.id + '-' + n.id}
                        className={isActive ? styles.note : undefined}
                        x={shown.startBeat * px}
                        y={noteY(shown.midi) + 1.5}
                        width={Math.max(3, shown.beats * px)}
                        height={Math.max(3, row - 3)}
                        rx={3}
                        data-testid={isActive ? 'midi-note' : 'midi-ghost-note'}
                        data-note-id={n.id}
                        data-selected={picked || undefined}
                        fill={isActive ? 'var(--amber)' : 'var(--dusk)'}
                        opacity={isActive ? 0.95 : 0.28}
                        stroke={picked ? 'var(--ink)' : 'transparent'}
                        strokeWidth={2}
                        style={{
                          cursor: isActive ? (drag?.resize ? 'ew-resize' : 'grab') : 'default',
                          touchAction: 'none',
                        }}
                        pointerEvents={isActive ? undefined : 'none'}
                        onPointerDown={isActive ? (e) => noteDown(e, n) : undefined}
                        onPointerMove={isActive ? noteMove : undefined}
                        onPointerUp={isActive ? noteUp : undefined}
                        onPointerCancel={isActive ? () => setDrag(null) : undefined}
                        onPointerEnter={
                          isActive ? () => setHover({ kind: 'note', id: n.id }) : undefined
                        }
                      />
                    );
                  }),
              )}
              {pending.map((n, i) => (
                <rect
                  key={'pending-' + i}
                  x={n.startBeat * px}
                  y={noteY(n.midi) + 1.5}
                  width={Math.max(3, n.beats * px)}
                  height={Math.max(3, row - 3)}
                  rx={3}
                  fill="var(--amber)"
                  fillOpacity={0.5}
                  stroke="var(--wrong)"
                  strokeWidth={1.5}
                  pointerEvents="none"
                  data-testid="midi-pending-note"
                />
              ))}
              {marquee?.moved ? (
                <rect
                  x={Math.min(marquee.x0, marquee.x1)}
                  y={Math.min(marquee.y0, marquee.y1)}
                  width={Math.abs(marquee.x1 - marquee.x0)}
                  height={Math.abs(marquee.y1 - marquee.y0)}
                  fill="var(--amber)"
                  fillOpacity={0.12}
                  stroke="var(--amber)"
                  strokeDasharray="4 3"
                  pointerEvents="none"
                  data-testid="midi-marquee"
                />
              ) : null}
              <line
                ref={playLine}
                x1={0}
                x2={0}
                y1={0}
                y2={rollHeight}
                stroke="var(--ink)"
                strokeWidth={2}
                pointerEvents="none"
                data-testid="midi-playhead"
              />
              {tip ? (
                <g pointerEvents="none" data-testid="midi-hover">
                  <rect
                    x={tipX}
                    y={tipY}
                    width={tipWidth}
                    height={20}
                    rx={6}
                    fill="var(--ink)"
                    fillOpacity={0.92}
                  />
                  <text x={tipX + 7} y={tipY + 14} fontSize={11} fill="var(--surface)">
                    {tip.text}
                  </text>
                </g>
              ) : null}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
