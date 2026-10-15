import { Link } from 'react-router';
import { Card } from '@/ui/Card';
import styles from '../page.module.css';

const COMING = [
  { title: 'Song player', body: 'Play along with Senja di Teras, bar by bar, at your own tempo.' },
  {
    title: 'Chord library',
    body: 'Every common quality, its inversions and voicings, and drills.',
  },
  {
    title: 'Progressions',
    body: 'Roman-numeral progressions in any key with smooth voice leading.',
  },
  {
    title: 'Comping and fills',
    body: 'Left-hand patterns and short fills that slot between chords.',
  },
];

export function HomePage() {
  return (
    <>
      <div className={styles.hero}>
        <h1>A quiet room to practice harmony.</h1>
        <p className={styles.lede}>
          Chords, voicings, progressions, comping and fills, learned at the keys. Take your time;
          nothing here is timed unless you ask it to be.
        </p>
        <p>
          <Link to="/keyboard">Try the keyboard</Link>
        </p>
      </div>
      <h2 style={{ marginBottom: 'var(--space-4)' }}>Coming soon</h2>
      <div className={styles.grid4}>
        {COMING.map((c) => (
          <Card key={c.title} title={c.title}>
            <p className={styles.muted}>{c.body}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
