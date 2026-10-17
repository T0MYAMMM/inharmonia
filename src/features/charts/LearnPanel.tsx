import { useState } from 'react';
import { Link } from 'react-router';
import {
  CHART_STYLES,
  easierKeys,
  playedChords,
  shiftLabel,
  transposeKey,
  type ChartStyle,
  type ChartView,
  type ChordChart,
  type KeyOption,
  type SimplifyLevel,
} from '@/core/charts';
import { NO_CHORD } from '@/core/content/types';
import { keyName, prettyAccidentals, prettyChord } from '@/core/notation';
import { isKnownChord, useKnownChords } from '@/state/knownChords';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import styles from './charts.module.css';

const LEVELS: { value: SimplifyLevel; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'simplified', label: 'Simplified' },
  { value: 'basic', label: 'Basic' },
];

const LEVEL_NOTES: Record<SimplifyLevel, string> = {
  original: 'Every chord as written.',
  simplified:
    'Extensions down to sevenths, sus to the plain chord; a slash bass stays in the left hand.',
  basic: 'Triads only (diminished stays diminished), no slash bass.',
};

const SHIFTS = Array.from({ length: 12 }, (_, i) => i - 6);

const chordList = (symbols: readonly string[]) => symbols.map(prettyChord).join(' ');

/**
 * Make a chart playable: key (with "Find an easier key"), simplify level and
 * accompaniment style. Changes are view settings; the chart stays as written.
 */
export function LearnPanel({
  chart,
  view,
  onChange,
}: {
  chart: ChordChart;
  view: ChartView;
  onChange: (view: ChartView) => void;
}) {
  const profile = useKnownChords();
  const isKnown = (s: string) => isKnownChord(s, profile);
  const [options, setOptions] = useState<KeyOption[] | null>(null);
  const set = (patch: Partial<ChartView>) => {
    setOptions(null);
    onChange({ ...view, ...patch });
  };

  const inKey: string[] = [];
  for (const c of playedChords(chart, view).flat())
    if (c.symbol !== NO_CHORD && !inKey.includes(c.symbol)) inKey.push(c.symbol);
  const known = inKey.filter(isKnown).length;
  const style = CHART_STYLES.find((s) => s.id === view.style) ?? CHART_STYLES[0];

  return (
    <section className={styles.learn} aria-labelledby="learn-title">
      <h2 id="learn-title" className={styles.cardTitle}>
        Make it playable
      </h2>
      <div className={styles.fields}>
        <label className={styles.field}>
          Key
          <select
            className={styles.select}
            value={view.transpose}
            onChange={(e) => set({ transpose: Number(e.target.value) })}
            data-testid="transpose"
          >
            {SHIFTS.map((t) => (
              <option key={t} value={t}>
                {prettyAccidentals(keyName(transposeKey(chart.key, t)))}
                {t === 0 ? ' (as written)' : ` (${shiftLabel(t)})`}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="small"
          onClick={() => setOptions(easierKeys(chart, view, isKnown))}
          data-testid="find-key"
        >
          Find an easier key
        </Button>
      </div>
      {options ? (
        <ol className={styles.keyOptions} data-testid="key-options">
          {options.map((o, i) => (
            <li key={o.transpose} className={styles.keyOption} data-testid={`key-option-${i}`}>
              <div className={styles.keyHead}>
                <strong>{prettyAccidentals(keyName(o.key))}</strong>
                <span className={styles.note}>{o.shift}</span>
                <span className={styles.spacer} />
                {o.transpose === view.transpose ? (
                  <span className={styles.note}>Current</span>
                ) : (
                  <Button
                    size="small"
                    variant="primary"
                    onClick={() => set({ transpose: o.transpose })}
                    data-testid={`use-key-${i}`}
                  >
                    Use this key
                  </Button>
                )}
              </div>
              <span className={styles.keyChords}>{chordList(o.chords)}</span>
              <span className={styles.note}>
                {o.unknown.length === 0
                  ? 'You know every chord.'
                  : `New to you: ${o.unknown.map(prettyChord).join(', ')}.`}
                {o.blackKeys < 0.05
                  ? ' White keys only.'
                  : ` ${o.blackKeys.toFixed(1)} black keys a chord.`}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <p className={styles.note} data-testid="known-summary">
        You know {known} of the {inKey.length} chords in this key: {chordList(inKey)}.{' '}
        <Link to="/chords/known">Chords you know</Link>
      </p>
      <Segmented<SimplifyLevel>
        label="Chords"
        value={view.simplify}
        options={LEVELS}
        onChange={(v) => set({ simplify: v })}
      />
      <p className={styles.note}>{LEVEL_NOTES[view.simplify]}</p>
      <label className={styles.field}>
        Accompaniment
        <select
          className={styles.select}
          value={view.style}
          onChange={(e) => set({ style: e.target.value as ChartStyle })}
          data-testid="style"
        >
          {CHART_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.note}>{style.note}</p>
    </section>
  );
}
