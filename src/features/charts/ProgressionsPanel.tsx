import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Key, SectionHarmony } from '@/core/charts';
import { keyName, prettyAccidentals, prettyChord } from '@/core/notation';
import { PANEL_ID, progressionLink, whereFound } from './progressionWords';
import styles from './charts.module.css';

/** A bar's chords and numerals, said in one go: "Bar 3: Dm7 (ii7), G7 (V7)". */
const barWords = (bar: SectionHarmony['bars'][number], i: number) =>
  `Bar ${i + 1}: ${bar
    .map((c) => (c.numeral ? `${prettyChord(c.symbol)} (${c.numeral})` : prettyChord(c.symbol)))
    .join(', ')}`;

/**
 * Every section of the chart once, in the order entered: its chords as they
 * play now, with their Roman numerals in the key they play in, and the
 * library progressions in it, each a link to its page in that key.
 */
export function ProgressionsPanel({
  sections,
  viewKey,
  sectionTools,
}: {
  sections: readonly SectionHarmony[];
  viewKey: Key;
  /** What can be done with a section: its Send to. */
  sectionTools?: (section: SectionHarmony, index: number) => ReactNode;
}) {
  const key = prettyAccidentals(keyName(viewKey));
  return (
    <section
      id={PANEL_ID}
      className={styles.harmony}
      aria-labelledby="harmony-title"
      data-testid="chart-progressions"
    >
      <h2 id="harmony-title" className={styles.cardTitle}>
        Progressions in this song
      </h2>
      <p className={styles.note}>
        Roman numerals in {key}: each names a chord by its place in the key, so they stay the same
        in any key.
      </p>
      {sections.map((s, si) => (
        <section
          key={s.id}
          className={styles.harmonySection}
          aria-labelledby={`harmony-${s.id}`}
          data-testid={`harmony-${si}`}
        >
          <div className={styles.harmonyHead}>
            <h3 id={`harmony-${s.id}`} className={styles.harmonyLabel}>
              {s.label}
            </h3>
            {sectionTools?.(s, si)}
          </div>
          <ol className={styles.harmonyBars} aria-label={`${s.label}, ${s.bars.length} bars`}>
            {s.bars.map((bar, i) => (
              <li key={i} className={styles.harmonyBar} aria-label={barWords(bar, i)}>
                {bar.map((c, j) => (
                  <span key={j} className={styles.harmonyChord} aria-hidden="true">
                    <span className={styles.harmonySymbol} data-nc={c.numeral ? undefined : true}>
                      {prettyChord(c.symbol)}
                    </span>
                    <span className={styles.harmonyNumeral}>{c.numeral ?? ' '}</span>
                  </span>
                ))}
              </li>
            ))}
          </ol>
          {s.matches.length ? (
            <ul className={styles.matches} data-testid="harmony-matches">
              {s.matches.map((m) => (
                <li key={m.id}>
                  <Link to={progressionLink(m, viewKey)}>{m.name}</Link>{' '}
                  <span className={styles.note}>{whereFound(m)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.note} data-testid="harmony-none">
              No progression from the library here.
            </p>
          )}
        </section>
      ))}
    </section>
  );
}
