import { Link } from 'react-router';
import { loadProgress, streak } from '@/state/progress';
import { dueForReview } from '@/state/review';
import { useSettings } from '@/state/settings';
import { useUserProgressions } from '@/state/userProgressions';
import { Button } from '@/ui/Button';
import { buttonClass } from '@/ui/buttonClass';
import { describeExercise, nextNew } from '../progress/catalog';
import page from '../page.module.css';
import styles from './home.module.css';

const ROOMS = [
  { to: '/songs', title: 'Songs', body: 'Listen through a piece, then practise it note by note.' },
  {
    to: '/chords',
    title: 'Chords',
    body: 'Every quality, inversion and voicing, then a drill to test them.',
  },
  {
    to: '/progressions',
    title: 'Progressions',
    body: 'Roman-numeral progressions in any key, comped, practised or played along.',
  },
  {
    to: '/fills',
    title: 'Fills and runs',
    body: 'Short fills between chords that speed up as you get them clean.',
  },
  { to: '/ear', title: 'Ear training', body: 'Hear a chord or four, then name them.' },
  {
    to: '/progress',
    title: 'Progress',
    body: 'Your best scores, streak, and what to look at today.',
  },
];

export function HomePage() {
  const dismissed = useSettings((s) => s.welcomeDismissed);
  const set = useSettings((s) => s.set);
  const mine = useUserProgressions((s) => s.items);
  const state = loadProgress();
  const practised = Object.keys(state.exercises).length > 0;
  const describe = (id: string) => describeExercise(id, mine);
  const due = dueForReview(state, describe, { limit: 1 })[0]?.info ?? null;
  const next = due ?? nextNew((id) => id in state.exercises);
  const run = streak(state);

  return (
    <>
      <div className={page.hero}>
        <h1>A quiet room to practice harmony.</h1>
        <p className={page.lede}>
          Chords, voicings, progressions, comping and fills, learned at the keys. Take your time;
          nothing here is timed unless you ask it to be.
        </p>
      </div>

      {!dismissed && !practised ? (
        <section className={styles.welcome} aria-labelledby="welcome-title">
          <h2 id="welcome-title">New here?</h2>
          <ol className={styles.steps}>
            <li>
              <strong>Find the keys.</strong> Tap the piano, use your computer keyboard (A to ' play
              C4 to F5), or plug in a MIDI keyboard and press Connect MIDI. The{' '}
              <Link to="/keyboard">keyboard page</Link> is a good place to try.
            </li>
            <li>
              <strong>Listen, then play.</strong>{' '}
              <Link to="/songs/senja-di-teras">Senja di Teras</Link> plays through first; Practice
              then waits for each note.
            </li>
            <li>
              <strong>Learn a chord or two.</strong> The <Link to="/chords">chord library</Link>{' '}
              shows how each is built; the <Link to="/chords/drill">drill</Link> asks you to play
              them.
            </li>
          </ol>
          <div className={styles.welcomeActions}>
            <Link to="/songs/senja-di-teras" className={buttonClass('primary')}>
              Start with Senja di Teras
            </Link>
            <Button variant="ghost" onClick={() => set({ welcomeDismissed: true })}>
              Got it
            </Button>
          </div>
        </section>
      ) : null}

      {practised && next ? (
        <section className={styles.today} aria-labelledby="today-title">
          <div>
            <h2 id="today-title">Today</h2>
            <p className={page.muted}>
              {run ? `${run} day${run === 1 ? '' : 's'} in a row. ` : ''}
              {due ? 'Worth another look:' : 'Something new:'}
            </p>
          </div>
          <Link to={next.href} className={styles.todayLink}>
            <span className={styles.kind}>{next.kind}</span>
            <span className={styles.todayTitle}>{next.title}</span>
          </Link>
          <Link to="/progress" className={styles.more}>
            All your progress
          </Link>
        </section>
      ) : null}

      <ul className={styles.rooms}>
        {ROOMS.map((r) => (
          <li key={r.to}>
            <Link to={r.to} className={styles.room}>
              <span className={styles.roomTitle}>{r.title}</span>
              <span className={page.muted}>{r.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
