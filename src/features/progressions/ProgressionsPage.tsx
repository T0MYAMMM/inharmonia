import { Link } from 'react-router';
import { PROGRESSIONS } from '@/content/progressions';
import { prettyNumerals } from '@/core/notation';
import page from '../page.module.css';
import styles from './progressions.module.css';

export function ProgressionsPage() {
  return (
    <>
      <div className={page.hero}>
        <h1>Progressions</h1>
        <p className={page.lede}>
          Common chord progressions, written as Roman numerals. Play them in any key, with any
          voicing and comping pattern, then practice them or play along in time.
        </p>
      </div>
      <ul className={styles.list}>
        {PROGRESSIONS.map((p) => (
          <li key={p.id}>
            <Link to={`/progressions/${p.id}`} className={styles.card}>
              <span className={styles.title}>{p.name}</span>
              <span className={styles.numerals}>{prettyNumerals(p.steps)}</span>
              {p.description ? <span className={styles.desc}>{p.description}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
