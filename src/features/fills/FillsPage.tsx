import { Link } from 'react-router';
import { FILL_CATEGORIES, FILLS } from '@/content/fills';
import { loadProgress } from '@/state/progress';
import page from '../page.module.css';
import progStyles from '../progressions/progressions.module.css';
import styles from './fills.module.css';

export function FillsPage() {
  const progress = loadProgress();
  return (
    <>
      <div className={page.hero}>
        <h1>Fills and runs</h1>
        <p className={page.lede}>
          Short fills to slot between chords. Each one is written against the chord change, so it
          works in any key and between any two chords. Learn it slowly, then let the tempo climb as
          you play it clean.
        </p>
      </div>
      {FILL_CATEGORIES.map((cat) => {
        const fills = FILLS.filter((f) => f.category === cat.id);
        if (!fills.length) return null;
        return (
          <section key={cat.id} className={styles.category} aria-labelledby={`cat-${cat.id}`}>
            <h2 id={`cat-${cat.id}`}>{cat.name}</h2>
            <ul className={progStyles.list}>
              {fills.map((f) => {
                const best = progress.exercises[`fill:${f.id}:speed`]?.bestTempo ?? null;
                return (
                  <li key={f.id}>
                    <Link to={`/fills/${f.id}`} className={progStyles.card}>
                      <span className={progStyles.title}>{f.name}</span>
                      <span className={styles.meta}>
                        Level {f.level}, {f.hand === 'rh' ? 'right hand' : 'left hand'}
                        {best ? `, best ${best} bpm` : ''}
                      </span>
                      <span className={progStyles.desc}>{f.description}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
