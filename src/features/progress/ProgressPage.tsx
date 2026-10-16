import { useState } from 'react';
import { Link } from 'react-router';
import { clearProgress, loadProgress, streak } from '@/state/progress';
import { dueForReview, lastSevenDays, relativeDay } from '@/state/review';
import { useUserProgressions } from '@/state/userProgressions';
import { Button } from '@/ui/Button';
import page from '../page.module.css';
import { describeExercise, nextNew, starterExercises, type ExerciseInfo } from './catalog';
import styles from './progress.module.css';

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
const WEEKDAY_LONG = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function ProgressPage() {
  const mine = useUserProgressions((s) => s.items);
  const [version, setVersion] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const state = loadProgress();
  void version;
  const now = new Date();
  const describe = (id: string) => describeExercise(id, mine);
  const rows = Object.entries(state.exercises)
    .map(([id, p]) => ({ id, p, info: describe(id) }))
    .filter((r): r is { id: string; p: typeof r.p; info: ExerciseInfo } => r.info !== null)
    .sort((a, b) => b.p.lastPracticed.localeCompare(a.p.lastPracticed));
  const review = dueForReview(state, describe, { now });
  const fresh = nextNew((id) => id in state.exercises);
  const days = lastSevenDays(state, now);
  const run = streak(state, now);
  const thisWeek = days.filter((d) => d.practised).length;

  if (!rows.length)
    return (
      <>
        <div className={page.hero}>
          <h1>Progress</h1>
          <p className={page.lede}>
            Nothing practised yet. When you finish a song, a drill round, a play-along or a fill, it
            shows up here with your best score, and comes back when it's worth another look.
          </p>
        </div>
        <h2 className={styles.h2}>Somewhere to start</h2>
        <SuggestionList items={starterExercises().slice(0, 4)} />
      </>
    );

  const clear = () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    clearProgress();
    setConfirm(false);
    setVersion((v) => v + 1);
  };

  return (
    <>
      <div className={page.hero}>
        <h1>Progress</h1>
        <p className={page.lede}>
          What to look at today, and how everything you've practised is going.
        </p>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{run}</span>
          <span className={styles.statLabel}>day{run === 1 ? '' : 's'} in a row</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{thisWeek} of 7</span>
          <span className={styles.statLabel}>days this week</span>
          <ol className={styles.week} aria-label="The last seven days">
            {days.map((d) => (
              <li
                key={d.key}
                className={styles.day}
                data-on={d.practised || undefined}
                aria-label={`${WEEKDAY_LONG.format(d.date)}: ${d.practised ? 'practised' : 'not practised'}`}
              >
                <span aria-hidden="true">{WEEKDAY.format(d.date)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{rows.length}</span>
          <span className={styles.statLabel}>exercise{rows.length === 1 ? '' : 's'} tried</span>
        </div>
      </div>

      <h2 className={styles.h2}>Today</h2>
      {review.length ? (
        <ul className={styles.cards}>
          {review.map((r) => (
            <li key={r.id}>
              <Link to={r.info.href} className={styles.card}>
                <span className={styles.kind}>{r.info.kind}</span>
                <span className={styles.title}>{r.info.title}</span>
                <span className={styles.meta}>
                  Best {pct(r.progress.bestAccuracy)}, last{' '}
                  {relativeDay(r.progress.lastPracticed, now)}
                </span>
              </Link>
            </li>
          ))}
          {fresh ? <NewCard item={fresh} /> : null}
        </ul>
      ) : (
        <>
          <p className={styles.note}>Nothing is due for review. Something new, perhaps:</p>
          {fresh ? (
            <ul className={styles.cards}>
              <NewCard item={fresh} />
            </ul>
          ) : (
            <p className={styles.note}>You've tried everything in the starter list. Lovely.</p>
          )}
        </>
      )}

      <h2 className={styles.h2}>Everything you've practised</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Exercise</th>
            <th scope="col">Best</th>
            <th scope="col">Best tempo</th>
            <th scope="col">Times</th>
            <th scope="col">Last</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, p, info }) => (
            <tr key={id}>
              <th scope="row">
                <Link to={info.href}>{info.title}</Link>
                <span className={styles.kind}>{info.kind}</span>
              </th>
              <td data-label="Best">{pct(p.bestAccuracy)}</td>
              <td data-label="Best tempo">{p.bestTempo ? `${p.bestTempo} bpm` : '–'}</td>
              <td data-label="Times">{p.attempts}</td>
              <td data-label="Last">{relativeDay(p.lastPracticed, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.footer}>
        <Button variant="ghost" onClick={clear} onBlur={() => setConfirm(false)}>
          {confirm ? 'Clear all progress for good?' : 'Clear progress'}
        </Button>
      </div>
    </>
  );
}

function NewCard({ item }: { item: ExerciseInfo }) {
  return (
    <li>
      <Link to={item.href} className={styles.card} data-new>
        <span className={styles.kind}>New: {item.kind}</span>
        <span className={styles.title}>{item.title}</span>
        <span className={styles.meta}>Not tried yet</span>
      </Link>
    </li>
  );
}

function SuggestionList({ items }: { items: ExerciseInfo[] }) {
  return (
    <ul className={styles.cards}>
      {items.map((i) => (
        <li key={i.id}>
          <Link to={i.href} className={styles.card}>
            <span className={styles.kind}>{i.kind}</span>
            <span className={styles.title}>{i.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
