import { useId, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router';
import type { SongLevel } from '@/core/content/types';
import type { CatalogueEntry } from '@/core/library/catalogue';
import { keyName, prettyAccidentals } from '@/core/notation';
import type { ProgressState } from '@/state/progress';
import { LEVEL_NAMES } from './credit';
import styles from './SongsPage.module.css';

export interface SongCardProps {
  entry: CatalogueEntry;
  /** A level picked in the filters: the card opens it and shows its key. */
  level?: SongLevel;
  progress: ProgressState['exercises'];
  /** What can be done with it: Download, Update, Remove, or a word on where it is. */
  actions?: ReactNode;
  /** Its own alert region, always there, for a download or removal that failed. */
  alert?: ReactNode;
  titleRef?: Ref<HTMLAnchorElement>;
}

/**
 * One piece, from its index entry, wherever it is: built in, downloaded or in
 * the catalogue. An article of title, credit, meta, summary and foot, so a
 * drawing can go in as its first child.
 */
export function SongCard({ entry, level, progress, actions, alert, titleRef }: SongCardProps) {
  const main = entry.levels.find((l) => l.level === (level ?? 'easy')) ?? entry.levels[0]!;
  // The written key, unless a level is picked: then the key that version plays in.
  const key = level ? main.key : entry.key;
  // A downloaded piece has a card in Your songs and one in the catalogue.
  const titleId = useId();
  return (
    <article className={styles.card} aria-labelledby={titleId} data-testid={`piece-${entry.piece}`}>
      <h3 className={styles.title} id={titleId}>
        <Link to={`/songs/${main.id}`} ref={titleRef}>
          {entry.title}
        </Link>
      </h3>
      <p className={styles.meta}>{entry.credit}</p>
      <p className={styles.meta}>
        {prettyAccidentals(keyName(key))}, {entry.meter.beats}/{entry.meter.unit}
      </p>
      {entry.summary ? <p className={styles.summary}>{entry.summary}</p> : null}
      <div className={styles.foot}>
        <span className={styles.levels} role="group" aria-label={`${entry.title} versions`}>
          {entry.levels.map((l) => {
            const p = progress[l.id];
            return (
              <Link
                key={l.id}
                to={`/songs/${l.id}`}
                className={styles.level}
                data-current={l.level === level || undefined}
                data-testid={`level-${l.id}`}
              >
                {LEVEL_NAMES[l.level]}
                <span className={styles.levelMeta}>
                  {l.bars} bars
                  {p ? `, best ${Math.round(p.bestAccuracy * 100)}%` : ''}
                </span>
              </Link>
            );
          })}
        </span>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
        {alert}
      </div>
    </article>
  );
}
