import type { ChartBar } from '@/core/charts';
import { NO_CHORD } from '@/core/content/types';
import { prettyChord } from '@/core/notation';
import styles from './sequence.module.css';

export interface BarStripProps {
  bars: readonly ChartBar[];
  /** The bar playing, or null. */
  playing: number | null;
}

/**
 * The sequence's bars, four to a line (two on a phone), each chord as wide
 * as its beats. The bar that is playing is marked in ink.
 */
export function BarStrip({ bars, playing }: BarStripProps) {
  return (
    <ol className={styles.strip} aria-label="Bars" data-testid="sequence-bars">
      {bars.map((bar, i) => (
        <li
          key={i}
          className={styles.bar}
          aria-current={playing === i ? 'true' : undefined}
          data-bar={i}
        >
          <span className={styles.barNo}>{i + 1}</span>
          <span className={styles.chords}>
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
        </li>
      ))}
    </ol>
  );
}
