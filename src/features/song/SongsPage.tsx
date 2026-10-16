import { Link } from 'react-router';
import { SONGS } from '@/content/lessons';
import { keyName } from '@/core/notation';
import { loadProgress } from '@/state/progress';
import page from '../page.module.css';
import styles from './SongsPage.module.css';

export function SongsPage() {
  const progress = loadProgress();
  return (
    <>
      <div className={page.hero}>
        <h1>Songs</h1>
        <p className={page.lede}>
          Listen through a piece, then practice it note by note at your own pace.
        </p>
        <p>
          <Link to="/studio">Make your own in Studio</Link>: sing or hum a melody and it is written
          down for you.
        </p>
      </div>
      <ul className={styles.list}>
        {SONGS.map((s) => {
          const p = progress.exercises[s.id];
          return (
            <li key={s.id}>
              <Link to={`/songs/${s.id}`} className={styles.card}>
                <span className={styles.title}>{s.title}</span>
                <span className={styles.meta}>
                  {keyName(s.key)}, {s.bars.length} bars
                </span>
                {s.summary ? <span className={styles.summary}>{s.summary}</span> : null}
                {p ? (
                  <span className={styles.meta}>
                    Best accuracy {Math.round(p.bestAccuracy * 100)}%
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
