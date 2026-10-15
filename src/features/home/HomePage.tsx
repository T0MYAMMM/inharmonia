import { Link } from 'react-router';
import { Card } from '@/ui/Card';
import styles from '../page.module.css';

const COMING = [
  {
    title: 'Progress',
    body: 'Best scores, streaks, and what to review today.',
  },
  {
    title: 'Your own progressions',
    body: 'Write a progression in Roman numerals, save it, and practice it like the rest.',
  },
  {
    title: 'Fills and runs',
    body: 'Short fills that slot between chords, speeding up as you get them clean.',
  },
  { title: 'Ear training', body: 'Hear a chord or a progression, then name it.' },
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
          <Link to="/songs/senja-di-teras">Play Senja di Teras</Link>,{' '}
          <Link to="/chords">explore chords</Link>, <Link to="/chords/drill">drill them</Link> or{' '}
          <Link to="/progressions">comp through a progression</Link>
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
