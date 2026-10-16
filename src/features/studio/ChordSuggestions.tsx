import { useState } from 'react';
import { PATTERNS } from '@/content/patterns';
import type { Lesson } from '@/core/content/types';
import { formatChord, prettyNumeral } from '@/core/notation';
import {
  draftLesson,
  harmonize,
  type GridNote,
  type Harmonization,
  type TakeTiming,
} from '@/core/transcription';
import { useSettings } from '@/state/settings';
import { Button } from '@/ui/Button';
import styles from './studio.module.css';

/** Drafts made this session; each gets a fresh id so the player starts over. */
let drafts = 0;

/** Left-hand patterns that suit each meter, first is the default. */
const PATTERN_IDS: Record<number, string[]> = {
  4: ['arpeggio-8ths', 'ballad-8ths', 'block', 'root-fifth', 'held'],
  3: ['waltz', 'held'],
  2: ['arpeggio-8ths', 'block', 'root-fifth', 'held'],
};

export interface ChordSuggestionsProps {
  notes: readonly GridNote[];
  timing: TakeTiming;
  keyContext: { tonic: string; mode: 'major' | 'minor' };
  onTry: (lesson: Lesson) => void;
}

/**
 * Three harmonizations of the take, each with why it works, a left-hand
 * pattern, and a way to try the result in the player.
 */
export function ChordSuggestions({ notes, timing, keyContext, onTry }: ChordSuggestionsProps) {
  const notation = useSettings((s) => s.notation);
  const [choice, setChoice] = useState(0);
  const patternIds = PATTERN_IDS[timing.meter.beats] ?? PATTERN_IDS[4]!;
  const [pattern, setPattern] = useState(patternIds[0]!);
  const suggestions = notes.length
    ? harmonize({ notes, timing, key: keyContext })
    : ([] as Harmonization[]);
  const picked = suggestions[Math.min(choice, suggestions.length - 1)];
  const lhPattern = patternIds.includes(pattern) ? pattern : patternIds[0]!;

  if (!picked) return null;

  const tryIt = () =>
    onTry(
      draftLesson({
        id: `draft-${++drafts}`,
        title: 'Your draft',
        notes,
        timing,
        key: keyContext,
        chords: picked.chords,
        lhPattern,
      }),
    );

  return (
    <section className={styles.card} aria-labelledby="chords-title">
      <h2 id="chords-title" className={styles.cardTitle}>
        Chords
      </h2>
      <p className={styles.note}>Three ways to harmonize your melody. Pick one to try it.</p>
      <div className={styles.suggestions} role="radiogroup" aria-labelledby="chords-title">
        {suggestions.map((h, i) => {
          const id = `suggestion-${h.style}`;
          return (
            <label
              key={h.style}
              className={styles.suggestion}
              data-selected={h === picked || undefined}
              data-testid={id}
            >
              <input
                type="radio"
                name="harmonization"
                className={styles.radio}
                checked={h === picked}
                onChange={() => setChoice(i)}
                aria-describedby={`${id}-why`}
              />
              <span className={styles.suggestionHead}>
                <span className={styles.suggestionName}>{h.name}</span>
                <span className={styles.fit}>{Math.round(h.fit * 100)}% on chord notes</span>
              </span>
              <span className={styles.chordLine} data-testid={`${id}-chords`}>
                {chordLine(h, timing.meter.beats, keyContext, notation)}
              </span>
              <span id={`${id}-why`} className={styles.why}>
                {h.explanation.join(' ')}
              </span>
            </label>
          );
        })}
      </div>

      <details className={styles.details}>
        <summary>Why each chord</summary>
        <ol className={styles.whyList} data-testid="chord-reasons">
          {picked.chords.map((c) => {
            const bar = Math.floor(c.startBeat / timing.meter.beats) + 1;
            const beat = (c.startBeat % timing.meter.beats) + 1;
            return (
              <li key={c.startBeat}>
                <strong>{formatChord(c.symbol, keyContext, notation)}</strong>
                {notation !== 'roman' ? ` (${prettyNumeral(c.numeral)})` : ''}, bar {bar}
                {beat > 1 ? `, beat ${beat}` : ''}: {c.why}
              </li>
            );
          })}
        </ol>
      </details>

      <div className={styles.row}>
        <label className={styles.field}>
          Left hand
          <select
            className={styles.select}
            value={lhPattern}
            onChange={(e) => setPattern(e.target.value)}
            data-testid="lh-pattern"
          >
            {patternIds.map((p) => (
              <option key={p} value={p}>
                {PATTERNS[p]!.name}
              </option>
            ))}
          </select>
        </label>
        <Button variant="primary" onClick={tryIt} data-testid="try-draft">
          Try it with the chords
        </Button>
      </div>
    </section>
  );
}

/** "C | F G | C" in the chosen notation: bars separated by bars. */
function chordLine(
  h: Harmonization,
  beatsPerBar: number,
  key: { tonic: string; mode: 'major' | 'minor' },
  notation: ReturnType<typeof useSettings.getState>['notation'],
): string {
  const bars: string[][] = [];
  for (const c of h.chords) {
    const i = Math.floor(c.startBeat / beatsPerBar + 1e-6);
    (bars[i] ??= []).push(formatChord(c.symbol, key, notation));
  }
  return bars.map((b) => b.join(' ')).join(' | ');
}
