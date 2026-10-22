import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { keyName, isBlack } from '@/ui/keyboard/layout';
import type { MidiNote, MidiProject } from '@/core/midi/smf';
import { projectEndBeat } from '@/core/midi/smf';
import styles from './midiWorkspace.module.css';

interface Props {
  project: MidiProject;
  trackId: string;
  selected: string | null;
  step: number;
  zoom: number;
  playheadRef: RefObject<SVGLineElement>;
  onSelect(id: string | null): void;
  onNote(id: string, patch: Partial<MidiNote>): void;
  onAdd(midi: number, startBeat: number): void;
}
const ROW = 19;
const LABEL = 52;
type Drag = { id: string; pointer: number; x: number; y: number; origin: MidiNote; resize: boolean };
const snap = (beat: number, step: number) =>
  Math.max(0, step ? Math.round(beat / step) * step : Math.round(beat * 1000) / 1000);

/** Independent pitch and time scrolling, with note geometry virtualized in the visible time window. */
export function MidiRoll({ project, trackId, selected, step, zoom, playheadRef, onSelect, onNote, onAdd }: Props) {
  const px = zoom;
  const tracks = project.tracks;
  const pitchList = tracks.flatMap((t) => t.notes.map((n) => n.midi));
  const lo = Math.max(21, Math.min(48, ...pitchList) - 4);
  const hi = Math.min(108, Math.max(84, ...pitchList) + 4);
  const rollHeight = (hi - lo + 1) * ROW;
  const width = Math.max(960, Math.ceil(projectEndBeat(project) / 4) * 4 * px);
  const scroll = useRef<HTMLDivElement>(null);
  const [windowBeats, setWindowBeats] = useState<[number, number]>([0, 32]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const noteY = (m: number) => (hi - m) * ROW;
  const updateWindow = () => {
    const el = scroll.current;
    if (!el) return;
    setWindowBeats([Math.max(0, el.scrollLeft / px - 2), (el.scrollLeft + el.clientWidth) / px + 2]);
  };
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    // Start near middle C, but allow vertical scrolling across the full imported range.
    el.scrollTop = Math.max(0, noteY(72) - 130);
    updateWindow();
  // Only initialize scrolling once on mount; zoom changes are handled by onScroll.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const down = (e: PointerEvent<SVGRectElement>, n: MidiNote) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(n.id);
    const rect = e.currentTarget.getBoundingClientRect();
    setDrag({ id: n.id, pointer: e.pointerId, x: e.clientX, y: e.clientY,
      origin: n, resize: e.clientX >= rect.right - 9 });
  };
  const move = (e: PointerEvent<SVGRectElement>) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const dx = step ? Math.round((e.clientX - drag.x) / px / step) * step : (e.clientX - drag.x) / px;
    const dy = -Math.round((e.clientY - drag.y) / ROW);
    if (drag.resize) onNote(drag.id, { beats: Math.max(step || 0.0625, drag.origin.beats + dx) });
    else onNote(drag.id, { startBeat: Math.max(0, drag.origin.startBeat + dx),
      midi: Math.max(21, Math.min(108, drag.origin.midi + dy)) });
    // Move in small increments relative to the last committed preview.
    setDrag({ ...drag, x: e.clientX, y: e.clientY,
      origin: { ...drag.origin,
        startBeat: drag.resize ? drag.origin.startBeat : Math.max(0, drag.origin.startBeat + dx),
        beats: drag.resize ? Math.max(step || 0.0625, drag.origin.beats + dx) : drag.origin.beats,
        midi: drag.resize ? drag.origin.midi : Math.max(21, Math.min(108, drag.origin.midi + dy)),
      },
    });
  };
  const grid: number[] = [];
  const gridStart = Math.floor(windowBeats[0] / Math.max(step, 0.25)) * Math.max(step, 0.25);
  for (let b = gridStart; b <= windowBeats[1]; b += Math.max(step, 0.25)) {
    if (b >= 0 && b <= width / px) grid.push(Number(b.toFixed(4)));
    if (grid.length > 1000) break;
  }
  return (
    <div className={styles.rollFrame} data-testid="midi-roll-frame">
      <div className={styles.rollScroller} ref={scroll} onScroll={updateWindow} data-testid="midi-roll">
        <svg className={styles.rollSvg} width={LABEL + width} height={rollHeight + 25} role="group" aria-label="Editable MIDI piano roll">
          <g transform="translate(0 25)">
            {Array.from({ length: hi - lo + 1 }, (_, i) => hi - i).map((m) => (
              <g key={m}>
                <rect x={0} y={noteY(m)} width={LABEL + width} height={ROW}
                  fill={isBlack(m) ? 'var(--surface-sunk)' : 'var(--surface)'} />
                <text x={4} y={noteY(m) + 13} fontSize={10} fill="var(--muted)">{keyName(m)}</text>
                <line x1={LABEL} x2={LABEL + width} y1={noteY(m)} y2={noteY(m)}
                  stroke="var(--line)" strokeOpacity={0.45} />
              </g>
            ))}
            {grid.map((b) => (
              <line key={b} x1={LABEL + b * px} x2={LABEL + b * px} y1={0} y2={rollHeight}
                stroke="var(--line)" strokeWidth={b % project.meter.beats === 0 ? 1.6 : 0.6}
                strokeDasharray={b % 1 === 0 ? undefined : '2 4'} />
            ))}
            <rect x={LABEL} y={0} width={width} height={rollHeight} fill="transparent"
              data-testid="midi-roll-empty"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                const bounds = e.currentTarget.getBoundingClientRect();
                const beat = snap((e.clientX - bounds.left) / px, step);
                const midi = hi - Math.floor((e.clientY - bounds.top) / ROW);
                onAdd(Math.max(21, Math.min(108, midi)), beat);
              }}
            />
            {tracks.flatMap((t) => t.notes.filter((n) => n.startBeat + n.beats >= windowBeats[0] &&
              n.startBeat <= windowBeats[1]).map((n) => {
              const active = t.id === trackId;
              const rectWidth = Math.max(3, n.beats * px);
              return (
                <rect key={t.id + '-' + n.id}
                  x={LABEL + n.startBeat * px} y={noteY(n.midi) + 2}
                  width={rectWidth} height={ROW - 4} rx={3}
                  data-testid={active ? 'midi-note' : 'midi-ghost-note'}
                  data-note-id={n.id}
                  fill={active ? 'var(--amber)' : 'var(--dusk)'}
                  opacity={active ? 0.95 : 0.28}
                  stroke={active && n.id === selected ? 'var(--ink)' : 'transparent'}
                  strokeWidth={2}
                  style={{ cursor: active ? 'grab' : 'default', touchAction: 'none' }}
                  onPointerDown={active ? (e) => down(e, n) : undefined}
                  onPointerMove={active ? move : undefined}
                  onPointerUp={active ? (e) => { if (drag?.pointer === e.pointerId) setDrag(null); } : undefined}
                  onPointerCancel={active ? () => setDrag(null) : undefined}
                />
              );
            }))}
            <line ref={playheadRef} x1={-10} x2={-10} y1={0} y2={rollHeight}
              stroke="var(--ink)" strokeWidth={2} pointerEvents="none" />
          </g>
          <rect width={LABEL} height={25} fill="var(--surface-sunk)" />
          {grid.filter((b) => b % project.meter.beats === 0).map((b) => (
            <text key={'bar' + b} x={LABEL + b * px + 4} y={16}
              fontSize={10} fontWeight={700} fill="var(--muted)">Bar {b / project.meter.beats + 1}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}
