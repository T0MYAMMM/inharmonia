import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  barOf,
  insertBars,
  LIMITS,
  NO_CHORD,
  roomLeft,
  setMeter as withMeter,
  type ChartBar,
  type ChordSequence,
  type SequenceBars,
} from '@/core/charts';
import { prettyChord } from '@/core/notation';
import { storage, type KeyValueStore } from '@/core/persistence/storage';
import { commit, historyOf, redo as redoStep, undo as undoStep, type History } from '@/core/songs';
import { loadSequence, saveSequence } from '@/state/sequence';

/** A state of the bars, and what made it: "Added Am as bar 3." */
interface Step extends SequenceBars {
  did: string;
}

type Settings = Pick<ChordSequence, 'tempo' | 'style' | 'loop' | 'showFunction'>;

export interface SequenceEditor {
  sequence: ChordSequence;
  /** The chosen bar, which new chords go after; null for none. */
  selected: number | null;
  /** The last thing done or refused, for the live region; `n` counts, so a repeat is spoken again. */
  announcement: { text: string; n: number };
  canUndo: boolean;
  canRedo: boolean;
  full: boolean;
  select: (index: number | null) => void;
  announce: (text: string) => void;
  /** Add bars after the chosen bar, or at the end. False when they do not fit. */
  addBars: (bars: readonly ChartBar[]) => boolean;
  addChord: (symbol: string) => boolean;
  /** Any edit from `core/charts`: kept for undo and announced, unless it changed nothing. */
  change: (next: SequenceBars, did: string, select?: number | null) => void;
  setMeter: (beats: 3 | 4) => void;
  setSettings: (patch: Partial<Settings>) => void;
  undo: () => void;
  redo: () => void;
}

/** A bar as words: "F G", "N.C.". */
export const barWords = (bar: ChartBar) =>
  bar.chords.map((c) => (c.symbol === NO_CHORD ? c.symbol : prettyChord(c.symbol))).join(' ');

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The chord sequence on the Chords page: its bars with undo and redo, its
 * settings, the chosen bar and what to announce. Saved on every change.
 */
export function useSequenceEditor(store: KeyValueStore = storage): SequenceEditor {
  const [initial] = useState(() => loadSequence(store));
  const [history, setHistory] = useState<History<Step>>(() =>
    historyOf({ meter: initial.meter, bars: initial.bars, did: '' }),
  );
  const [settings, setSettingsState] = useState<Settings>(() => ({
    tempo: initial.tempo,
    style: initial.style,
    loop: initial.loop,
    showFunction: initial.showFunction,
  }));
  const [chosen, setChosen] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState({ text: '', n: 0 });
  const present = history.present;
  const { meter, bars } = present;
  // Undo can take away the chosen bar.
  const selected = chosen !== null && chosen < bars.length ? chosen : null;

  const sequence = useMemo<ChordSequence>(
    () => ({ meter, bars, ...settings }),
    [meter, bars, settings],
  );
  useEffect(() => saveSequence(sequence, store), [sequence, store]);

  const announce = useCallback(
    (text: string) => setAnnouncement((a) => ({ text, n: a.n + 1 })),
    [],
  );

  const change = (next: SequenceBars, did: string, select?: number | null) => {
    if (next.bars === bars && next.meter === meter) return;
    setHistory((h) => commit(h, { meter: next.meter, bars: next.bars, did }));
    if (select !== undefined) setChosen(select);
    announce(did);
  };

  const addBars = (added: readonly ChartBar[]) => {
    const at = selected === null ? bars.length : selected + 1;
    const next = insertBars(present, at, added);
    if (next === present) {
      if (added.length)
        announce(
          roomLeft(present) <= 0
            ? `Not added: the sequence is full at ${LIMITS.barsPerSection} bars.`
            : `Not added: there is room for ${roomLeft(present)} more bars.`,
        );
      return false;
    }
    const n = added.length;
    const what = n > 8 ? `${n} bars` : added.map(barWords).join(', ');
    const where = n === 1 ? `bar ${at + 1}` : `bars ${at + 1} to ${at + n}`;
    change(next, `Added ${what} as ${where}.`, selected === null ? undefined : at + n - 1);
    return true;
  };

  return {
    sequence,
    selected,
    announcement,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    full: roomLeft(present) <= 0,
    select: setChosen,
    announce,
    addBars,
    addChord: (symbol) => addBars([barOf([symbol], meter.beats)]),
    change,
    setMeter: (beats) =>
      change(
        withMeter(present, beats),
        bars.length
          ? `Meter ${beats}/4: the chords in each bar split evenly.`
          : `Meter ${beats}/4.`,
      ),
    setSettings: (patch) => setSettingsState((s) => ({ ...s, ...patch })),
    undo: () => {
      if (!history.past.length) return;
      setHistory(undoStep);
      announce(`Undone: ${lowerFirst(present.did)}`);
    },
    redo: () => {
      const next = history.future[0];
      if (!next) return;
      setHistory(redoStep);
      announce(`Redone: ${lowerFirst(next.did)}`);
    },
  };
}
