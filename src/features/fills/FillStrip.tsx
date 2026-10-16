import type { FillExercise } from '@/core/content/fills';
import {
  formatChord,
  formatNote,
  prettyNumeral,
  type AccidentalStyle,
  type NotationSystem,
} from '@/core/notation';
import { NoteLabel } from '@/ui/NoteLabel';
import { countLabel } from './count';
import styles from './fills.module.css';

export interface FillStripProps {
  exercise: FillExercise;
  notation: NotationSystem;
  accidentalStyle: AccidentalStyle;
  /** Hit sounding (Listen) or to play (Practice). */
  activeHit: number | null;
  /** Practice: hits before this are done. */
  doneBefore: number;
  practice: boolean;
  chordIndex: 0 | 1;
}

/**
 * The two chords either side of the change, and the fill as a row of hits,
 * each with how to count it.
 */
export function FillStrip({
  exercise,
  notation,
  accidentalStyle,
  activeHit,
  doneBefore,
  practice,
  chordIndex,
}: FillStripProps) {
  const key = { tonic: exercise.context.key, mode: exercise.context.mode };
  const angka = notation === 'angka';
  return (
    <div className={styles.strip}>
      <div className={styles.chordPair}>
        {exercise.chords.map((c, i) => (
          <div
            key={i}
            className={styles.chordCard}
            aria-current={chordIndex === i ? 'true' : undefined}
          >
            <span className={styles.barNumber}>Bar {i + 1}</span>
            <span className={styles.chordSymbol}>{formatChord(c.symbol, key, notation)}</span>
            {notation !== 'roman' ? (
              <span className={styles.chordNumeral}>{prettyNumeral(c.numeral)}</span>
            ) : null}
          </div>
        ))}
      </div>
      <ol className={styles.hits} aria-label="The fill">
        {exercise.hits.map((h, i) => {
          const state = practice
            ? i === activeHit
              ? 'target'
              : i < doneBefore
                ? 'done'
                : undefined
            : i === activeHit
              ? 'active'
              : undefined;
          const names = h.notes
            .map((n) => formatNote(n, key, { system: notation, accidentalStyle }))
            .reverse();
          return (
            <li
              key={h.id}
              className={styles.hit}
              data-state={state}
              data-landing={h.landing || undefined}
              aria-label={`${names.map((n) => n.ariaLabel).join(' and ')}, on ${countLabel(h.beat)}${h.landing ? ', the landing' : ''}`}
            >
              <span className={styles.hitNotes} aria-hidden="true">
                {names.map((label, j) => (
                  <NoteLabel
                    key={j}
                    label={label}
                    angka={angka}
                    accidentalStyle={accidentalStyle}
                  />
                ))}
              </span>
              <span className={styles.count} aria-hidden="true">
                {countLabel(h.beat)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
