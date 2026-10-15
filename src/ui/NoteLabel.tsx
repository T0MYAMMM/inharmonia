import type { AccidentalStyle, NoteLabel as Label } from '@/core/notation';
import styles from './NoteLabel.module.css';

/**
 * Renders a formatted note. Not angka gets octave dots above or below and the
 * chromatic slash drawn with CSS (combining characters render inconsistently).
 */
export function NoteLabel({
  label,
  angka,
  accidentalStyle = 'slash',
  className,
}: {
  label: Label;
  angka: boolean;
  accidentalStyle?: AccidentalStyle;
  className?: string;
}) {
  if (!angka) {
    return (
      <span
        className={[styles.label, className].filter(Boolean).join(' ')}
        aria-label={label.ariaLabel}
      >
        {label.text}
      </span>
    );
  }
  const dots = Math.min(3, Math.abs(label.octave));
  const slash = accidentalStyle === 'slash' && label.alteration;
  return (
    <span
      className={[styles.label, styles.angka, className].filter(Boolean).join(' ')}
      role="img"
      aria-label={label.ariaLabel}
    >
      {dots > 0 && label.octave > 0 ? <Dots n={dots} where="above" /> : null}
      <span aria-hidden="true">
        <span
          className={[styles.digit, slash && styles[label.alteration!]].filter(Boolean).join(' ')}
        >
          {label.main}
        </span>
        {!slash && label.alteration ? (
          <span className={styles.suffix}>{label.alteration === 'raised' ? '♯' : '♭'}</span>
        ) : null}
      </span>
      {dots > 0 && label.octave < 0 ? <Dots n={dots} where="below" /> : null}
    </span>
  );
}

function Dots({ n, where }: { n: number; where: 'above' | 'below' }) {
  return (
    <span
      className={`${styles.dots} ${where === 'above' ? styles.dotsAbove : styles.dotsBelow}`}
      aria-hidden="true"
    >
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={styles.dot} />
      ))}
    </span>
  );
}
