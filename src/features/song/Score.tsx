import { forwardRef, memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { CompiledBar, CompiledLesson } from '@/core/content/compile';
import {
  prettyNumeral,
  doHeader,
  formatChord,
  formatNote,
  type AccidentalStyle,
  type KeyContext,
  type NotationSystem,
} from '@/core/notation';
import { NoteLabel } from '@/ui/NoteLabel';
import { Segmented } from '@/ui/Segmented';
import type { Timing } from '@/core/practice';
import type { SongMode } from './SongController';
import { barDensity } from './scoreLayout';
import { FallingNotes } from './FallingNotes';
import type { FallingHand } from './fallingNotesLayout';
import styles from './Score.module.css';

export interface ScoreProps {
  compiled: CompiledLesson;
  notation: NotationSystem;
  accidentalStyle: AccidentalStyle;
  mode: SongMode;
  currentBar: number;
  /** Show each chord's Roman numeral under its symbol (progressions). */
  showNumerals?: boolean;
  /** Play-along results by chord id. */
  chordScores?: Readonly<Record<string, Timing>>;
  /** Listen: chip under the playhead. */
  activeChipId: string | null;
  /** Practice: the target chip (melody) or chord (left hand), and its beat. */
  targetChipId: string | null;
  targetChordId: string | null;
  targetBeat: number;
  onSelectBar: (index: number) => void;
  /** Hide the otherwise sticky keyboard while the interactive keys live under the roll. */
  onFallingChange?: (falling: boolean) => void;
  /** Optional shared audio playhead, available in the song player. */
  falling?: {
    visualBeat: () => number;
    performanceBeat: (beat: number) => number;
    playing: boolean;
    rhOn: boolean;
    lhOn: boolean;
    keyboard?: {
      low: number;
      high: number;
      focus: [number, number];
      showTarget: boolean;
    };
  };
}

type ScoreView = 'overview' | 'follow' | 'falling';

const VIEW_OPTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'follow', label: 'Follow Along' },
  { value: 'falling', label: 'Falling Notes' },
] as const;

/** The transport remains the source of truth for the bar and note in both layouts. */
export function Score(props: ScoreProps) {
  const { compiled, notation, mode, currentBar } = props;
  const key = compiled.lesson.key;
  const sections = groupSections(compiled.bars);
  const isSong = compiled.lesson.kind === 'song';
  const [view, setView] = useState<ScoreView>(() =>
    isSong &&
    compiled.lesson.level === 'advanced' &&
    compiled.bars.some((bar) => bar.rh.filter((n) => n.note).length >= 9)
      ? 'follow'
      : 'overview',
  );
  const [zoom, setZoom] = useState(100);
  const [fallingHand, setFallingHand] = useState<FallingHand>('both');
  const [lookAheadBeats, setLookAheadBeats] = useState(4);
  const shownView = isSong ? view : 'overview';
  useEffect(
    () => props.onFallingChange?.(shownView === 'falling'),
    [props.onFallingChange, shownView],
  );
  const currentRef = useRef<HTMLDivElement | null>(null);
  const current = compiled.bars[currentBar] ?? compiled.bars[0]!;
  const sectionAt = [...sections].reverse().find((sec) => sec.startIndex <= current.index);
  useScrollIntoView(currentRef, currentBar, shownView);

  const card = (bar: CompiledBar, follow: boolean) => {
    const isCurrent = bar.index === currentBar;
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
        activeId={
          props.activeChipId?.startsWith('rh-' + bar.index + '-') ? props.activeChipId : null
        }
        targetId={
          props.targetChipId?.startsWith('rh-' + bar.index + '-') ? props.targetChipId : null
        }
        targetChordId={
          props.targetChordId?.startsWith('chord-' + bar.index + '-') ? props.targetChordId : null
        }
        doneBefore={mode === 'practice' ? props.targetBeat : -Infinity}
        showNumerals={props.showNumerals ?? false}
        chordScores={props.chordScores ?? NO_SCORES}
        onSelect={props.onSelectBar}
        follow={follow}
        zoom={zoom}
      />
    );
  };

  return (
    <div className={styles.score} data-score-view={shownView}>
      {notation === 'angka' ? <p className={styles.doHeader}>{doHeader(key)}</p> : null}
      {isSong ? (
        <div className={styles.scoreTools} data-testid="score-tools">
          <Segmented label="Score view" value={view} options={VIEW_OPTIONS} onChange={setView} />
          {shownView === 'falling' ? (
            <div className={styles.followTools}>
              <label className={styles.field}>
                Displayed hands
                <select
                  data-testid="falling-hand"
                  aria-label="Displayed hands"
                  value={fallingHand}
                  onChange={(event) => setFallingHand(event.target.value as FallingHand)}
                >
                  <option value="both">Both hands</option>
                  <option value="rh">Right hand</option>
                  <option value="lh">Left hand</option>
                </select>
              </label>
              <label className={styles.field}>
                Look ahead
                <select
                  aria-label="Look ahead"
                  data-testid="falling-lookahead"
                  value={lookAheadBeats}
                  onChange={(event) => setLookAheadBeats(Number(event.target.value))}
                >
                  <option value={4}>4 beats</option>
                  <option value={8}>8 beats</option>
                </select>
              </label>
            </div>
          ) : null}
          {shownView === 'follow' ? (
            <div className={styles.followTools}>
              <button
                className={styles.navButton}
                type="button"
                onClick={() => props.onSelectBar(current.index - 1)}
                disabled={current.index === 0}
                aria-label="Previous bar"
              >
                Previous
              </button>
              <strong className={styles.barPosition}>
                Bar {current.index + 1} of {compiled.bars.length}
              </strong>
              <button
                className={styles.navButton}
                type="button"
                onClick={() => props.onSelectBar(current.index + 1)}
                disabled={current.index === compiled.bars.length - 1}
                aria-label="Next bar"
              >
                Next
              </button>
              {sections.length > 1 ? (
                <label className={styles.field}>
                  Section
                  <select
                    aria-label="Jump to section"
                    value={sectionAt?.startIndex ?? 0}
                    onChange={(event) => props.onSelectBar(Number(event.target.value))}
                  >
                    {sections.map((section) => (
                      <option key={section.startIndex} value={section.startIndex}>
                        {section.title ?? 'Opening'} (bar {section.startIndex + 1})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className={styles.field}>
                Note size: {zoom}%
                <input
                  type="range"
                  min={75}
                  max={175}
                  step={25}
                  value={zoom}
                  data-testid="score-zoom"
                  onChange={(event) => setZoom(Number(event.target.value))}
                  aria-label="Note size"
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
      {shownView === 'falling' ? (
        <FallingNotes
          compiled={compiled}
          hand={fallingHand}
          lookAheadBeats={lookAheadBeats}
          mode={mode}
          playing={props.falling?.playing ?? false}
          visualBeat={props.falling?.visualBeat ?? DEFAULT_BEAT}
          performanceBeat={props.falling?.performanceBeat ?? DEFAULT_WARP}
          rhOn={props.falling?.rhOn ?? true}
          lhOn={props.falling?.lhOn ?? true}
          targetBeat={props.targetBeat}
          keyboard={props.falling?.keyboard}
        />
      ) : shownView === 'follow' ? (
        <section className={styles.followSection} aria-label="Follow Along score">
          {sectionAt?.title ? <h2 className={styles.sectionTitle}>{sectionAt.title}</h2> : null}
          {card(current, true)}
          <p className={styles.followHint}>
            Notes stay readable at their actual rhythm. Scroll the note strip sideways, or use
            Previous and Next to move by bar.
          </p>
        </section>
      ) : (
        sections.map((sec) => (
          <section key={sec.startIndex} className={styles.section} aria-label={sec.title ?? 'Bars'}>
            {sec.title ? <h2 className={styles.sectionTitle}>{sec.title}</h2> : null}
            <div className={styles.grid}>{sec.bars.map((bar) => card(bar, false))}</div>
          </section>
        ))
      )}
    </div>
  );
}

interface BarCardProps {
  bar: CompiledBar;
  barCount: number;
  keyContext: KeyContext;
  notation: NotationSystem;
  accidentalStyle: AccidentalStyle;
  mode: SongMode;
  current: boolean;
  showNumerals: boolean;
  chordScores: Readonly<Record<string, Timing>>;
  activeId: string | null;
  targetId: string | null;
  targetChordId: string | null;
  /** Chips that start before this beat show as done. */
  doneBefore: number;
  onSelect: (index: number) => void;
  follow: boolean;
  zoom: number;
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
      targetChordId,
      doneBefore,
      showNumerals,
      chordScores,
      onSelect,
      follow,
      zoom,
    }: BarCardProps,
    ref,
  ) {
    const chordText = bar.chords.map((c) => formatChord(c.symbol, keyContext, notation)).join(', ');
    const angka = notation === 'angka';
    const noteCount = bar.rh.filter((n) => n.note !== null).length;
    const density = barDensity(bar);
    const noteStrip = useRef<HTMLDivElement | null>(null);

    // Keep the sounding note (or the practice target) visible within the strip,
    // without unexpectedly scrolling the entire document.
    useEffect(() => {
      if (!follow) return;
      const id = mode === 'practice' ? targetId : activeId;
      const strip = noteStrip.current;
      if (!id || !strip) return;
      const chip = [...strip.querySelectorAll<HTMLElement>('[data-chip]')].find(
        (node) => node.dataset.chip === id,
      );
      const slot = chip?.closest<HTMLElement>('[data-note-slot]');
      if (!slot) return;
      const left = slot.offsetLeft;
      const right = left + slot.offsetWidth;
      if (left >= strip.scrollLeft + 24 && right <= strip.scrollLeft + strip.clientWidth - 24)
        return;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      strip.scrollTo({
        left: Math.max(0, left - strip.clientWidth * 0.3),
        behavior: reduceMotion ? 'instant' : 'smooth',
      });
    }, [activeId, targetId, follow, mode, zoom, bar.index]);
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
        className={[styles.bar, follow ? styles.followBar : ''].filter(Boolean).join(' ')}
        data-density={density}
        aria-current={current ? 'true' : undefined}
        data-bar={bar.index}
        onClick={() => onSelect(bar.index)}
        onKeyDown={onKeyDown}
      >
        {/* The name comes from this text, so voice control can say the bar number shown. */}
        <span className="visually-hidden">
          Bar {bar.index + 1} of {barCount}, {chordText}.
          {noteCount > 0 ? ` ${noteCount} melody notes.` : ''}
          {ACTION[mode]}
        </span>
        <span className={styles.barNumber} aria-hidden="true">
          {bar.index + 1}
        </span>
        <div className={styles.chords} aria-hidden="true">
          {bar.chords.map((c) => (
            <span
              key={c.id}
              className={styles.chord}
              data-state={c.id === targetChordId ? 'target' : undefined}
              style={{ flexGrow: c.beats, flexBasis: 0, fontSize: `${0.82 + c.beats * 0.1}rem` }}
            >
              <span className={styles.chordText}>
                {formatChord(c.symbol, keyContext, notation)}
              </span>
              {c.original ? (
                <span className={styles.original} data-testid="original-chord">
                  {formatChord(c.original, keyContext, notation)}
                </span>
              ) : null}
              {showNumerals && c.numeral && notation !== 'roman' ? (
                <span className={styles.numeral}>{prettyNumeral(c.numeral)}</span>
              ) : null}
              {chordScores[c.id] ? (
                <span className={styles.result} data-result={chordScores[c.id]}>
                  {RESULT_WORDS[chordScores[c.id]!]}
                </span>
              ) : null}
            </span>
          ))}
        </div>
        {!follow && density === 'dense' ? (
          <div className={styles.denseSummary} data-testid="dense-summary" aria-hidden="true">
            <strong>{noteCount} notes</strong>
            <span>Open Follow Along to read every note</span>
            <span className={styles.rhythm}>
              {bar.rh.map((note) => (
                <i key={note.id} style={{ flexGrow: note.beats }} />
              ))}
            </span>
          </div>
        ) : null}
        {!follow && density === 'wide' ? (
          <div className={styles.mobileSummary} aria-hidden="true">
            {noteCount} notes · Use Follow Along to see each note
          </div>
        ) : null}
        {follow ? (
          <span className="visually-hidden">
            Written melody: {bar.rh.map((n) => n.note?.name ?? 'rest').join(', ')}.
          </span>
        ) : null}
        {bar.rh.length > 0 ? (
          <div
            ref={noteStrip}
            className={[styles.chips, follow ? styles.followChips : ''].filter(Boolean).join(' ')}
            aria-hidden="true"
            data-ties={bar.rh.some((n) => n.tiedTo || n.tiedFrom) || undefined}
          >
            {bar.rh.map((n) => {
              const state =
                n.id === activeId
                  ? 'active'
                  : n.id === targetId
                    ? 'target'
                    : n.startBeat < doneBefore - 1e-9
                      ? 'done'
                      : undefined;
              const inBar = (id: string | undefined) => !!id?.startsWith(`rh-${bar.index}-`);
              return (
                <span
                  key={n.id}
                  className={styles.chipSlot}
                  data-note-slot
                  style={
                    follow
                      ? {
                          flex: '0 0 auto',
                          width: Math.max(48, n.beats * 64) * (zoom / 100),
                        }
                      : { flexGrow: n.beats, flexBasis: 0 }
                  }
                >
                  {follow &&
                  Math.abs(n.startBeat - bar.startBeat - Math.round(n.startBeat - bar.startBeat)) <
                    1e-8 ? (
                    <span className={styles.beatTag} aria-hidden="true">
                      {Math.round(n.startBeat - bar.startBeat) + 1}
                    </span>
                  ) : null}
                  <span
                    className={styles.chip}
                    data-state={state}
                    data-chip={n.id}
                    data-angka={angka || undefined}
                  >
                    {n.note ? (
                      <NoteLabel
                        label={formatNote(n.note, keyContext, {
                          system: notation,
                          accidentalStyle,
                        })}
                        angka={angka}
                        accidentalStyle={accidentalStyle}
                      />
                    ) : (
                      '·'
                    )}
                  </span>
                  {/* A tie is drawn in two halves that meet between the chips, or at the barline. */}
                  {n.tiedTo ? (
                    <span
                      className={styles.tieOut}
                      data-tie={n.id}
                      data-across={inBar(n.tiedTo) ? undefined : true}
                    />
                  ) : null}
                  {n.tiedFrom ? (
                    <span
                      className={styles.tieIn}
                      data-tie={n.tiedFrom}
                      data-across={inBar(n.tiedFrom) ? undefined : true}
                    />
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }),
);

const NO_SCORES: Readonly<Record<string, Timing>> = {};
const DEFAULT_BEAT = () => 0;
const DEFAULT_WARP = (beat: number) => beat;

const ACTION: Record<SongMode, string> = {
  listen: ' Play from here',
  practice: ' Practice from here',
  playalong: '',
};

const RESULT_WORDS: Record<Timing, string> = {
  'on-time': 'On time',
  early: 'Early',
  late: 'Late',
  missed: 'Missed',
};

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
function useScrollIntoView(
  ref: React.RefObject<HTMLDivElement | null>,
  bar: number,
  view: ScoreView,
) {
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
  }, [ref, bar, view]);
}
