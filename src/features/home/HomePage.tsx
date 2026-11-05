import { lazy, Suspense, useMemo } from 'react';
import { Link } from 'react-router';
import { useTouchOnly } from '@/app/hooks';
import { BUILT_IN_ENTRIES } from '@/content/builtInIndex';
import { computerKeyMap } from '@/core/input';
import { keyName } from '@/ui/keyboard/layout';
import { loadProgress } from '@/state/progress';
import { dueForReview, lastSevenDays } from '@/state/review';
import { useDownloads } from '@/state/downloads';
import { useSettings } from '@/state/settings';
import { useUserProgressions } from '@/state/userProgressions';
import { CardArt } from '@/ui/art/CardArt';
import { KeysSpot } from '@/ui/art/spots';
import type { Room } from '@/ui/art/rooms';
import { BetaBadge } from '@/ui/BetaBadge';
import { Button } from '@/ui/Button';
import { buttonClass } from '@/ui/buttonClass';
import { describeExercise, FIRST_SONG, nextNew, songLookup } from '../progress/catalog';
import page from '../page.module.css';
import { PageHeader } from '../PageHeader';
import styles from './home.module.css';

const ROOMS: { to: string; room: Room; title: string; body: string; beta?: boolean }[] = [
  {
    to: '/songs',
    room: 'songs',
    title: 'Songs',
    body: 'Listen through a piece, then practise it note by note.',
  },
  {
    to: '/chords',
    room: 'chords',
    title: 'Chords',
    body: 'How each chord is built, and the ways to spread it over the keys: inversions and voicings. Then a drill.',
  },
  {
    to: '/progressions',
    room: 'progressions',
    title: 'Progressions',
    body: "Chord progressions in any key, with a comping pattern, the left hand's accompaniment, under them. Practise them, or play along in time.",
  },
  {
    to: '/fills',
    room: 'fills',
    title: 'Fills and runs',
    body: 'Short fills between chords that speed up as you get them clean.',
  },
  { to: '/ear', room: 'ear', title: 'Ear training', body: 'Hear a chord or four, then name them.' },
  {
    to: '/studio',
    room: 'studio',
    title: 'Studio',
    body: 'Make a song: sing it, compose it on a piano roll, or open a MIDI file.',
    beta: true,
  },
  {
    to: '/progress',
    room: 'progress',
    title: 'Progress',
    body: 'Your best scores, your last seven days, and what to look at today.',
  },
];

/** The first song for someone new: white keys only, six notes, a tune everyone knows. */
const WELCOME_SONG = `/songs/${FIRST_SONG}`;

/**
 * The rooms' drawings load after the page, so the first screen doesn't wait
 * for them. A chunk that doesn't arrive (or is missing after a deploy, while
 * preloadError.ts reloads) leaves the panels empty rather than the page broken.
 */
const RoomArt = lazy(() =>
  import('./RoomArt').then(
    (m) => ({ default: m?.RoomArt ?? NoArt }),
    () => ({ default: NoArt }),
  ),
);

function NoArt() {
  return null;
}

/** The computer keys' range, from the same map the keyboard uses. */
const KEY_MAP = computerKeyMap();
const FIRST_KEY = KEY_MAP[0]!;
const LAST_KEY = KEY_MAP.at(-1)!;

export function HomePage() {
  const dismissed = useSettings((s) => s.welcomeDismissed);
  const set = useSettings((s) => s.set);
  // A touch-only phone has no computer keys to press: the first step says so.
  const touchOnly = useTouchOnly();
  const mine = useUserProgressions((s) => s.items);
  const state = loadProgress();
  const practised = Object.keys(state.exercises).length > 0;
  // Songs on this device only: Home never fetches the catalogue.
  const kept = useDownloads().pieces;
  const songs = useMemo(
    () => songLookup([...BUILT_IN_ENTRIES, ...kept.map((p) => p.entry)]),
    [kept],
  );
  const describe = (id: string) => describeExercise(id, mine, songs);
  const due = dueForReview(state, describe, { limit: 1 })[0]?.info ?? null;
  const next = due ?? nextNew((id) => id in state.exercises);
  const week = lastSevenDays(state);
  const practisedDays = week.filter((d) => d.practised).length;

  return (
    <>
      <PageHeader
        title="A quiet room to practice harmony."
        lede="Chords, voicings, progressions, comping and fills, learned at the keys. Take your time; nothing here is timed unless you ask it to be."
      />

      {!dismissed && !practised ? (
        <section className={styles.welcome} aria-labelledby="welcome-title">
          <h2 id="welcome-title">New here?</h2>
          {/* The way in first, so it is in the first screen on a phone; the lay of the land after. */}
          <div className={styles.welcomeActions}>
            <Link to={WELCOME_SONG} className={buttonClass('primary')}>
              Start with Twinkle, Twinkle
            </Link>
            <Button variant="ghost" onClick={() => set({ welcomeDismissed: true })}>
              Got it
            </Button>
          </div>
          <ol className={styles.steps}>
            <li>
              <strong>Find the keys.</strong>{' '}
              {touchOnly ? (
                'Tap the piano at the foot of every practice page, or plug in a MIDI keyboard and connect it there.'
              ) : (
                <>
                  Click the piano at the foot of every practice page, or use your computer keyboard:{' '}
                  {FIRST_KEY.label} to {LAST_KEY.label} play {keyName(FIRST_KEY.midi)} to{' '}
                  {keyName(LAST_KEY.midi)}. A MIDI keyboard connects there too.
                </>
              )}{' '}
              Try them on the <Link to="/keyboard">keyboard page</Link>.
            </li>
            <li>
              <strong>Listen, then play.</strong>{' '}
              <Link to={WELCOME_SONG}>Twinkle, Twinkle, Little Star</Link> plays through first;
              Practice then waits for each note.
            </li>
            <li>
              <strong>Learn a chord or two.</strong> The <Link to="/chords">chord library</Link>{' '}
              shows how each is built; the <Link to="/chords/drill">drill</Link> asks you to play
              them.
            </li>
          </ol>
          <div className={styles.welcomeArt}>
            <KeysSpot labels={!touchOnly} />
          </div>
        </section>
      ) : null}

      {practised && next ? (
        <section className={styles.today} aria-labelledby="today-title">
          <div>
            <h2 id="today-title">Today</h2>
            <p className={page.muted}>
              {practisedDays ? `Practised ${practisedDays} of the last 7 days. ` : ''}
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
            <Link to={r.to} className={styles.room} data-room={r.room}>
              <CardArt>
                <Suspense fallback={null}>
                  <RoomArt room={r.room} week={week} />
                </Suspense>
              </CardArt>
              <span className={styles.roomTitle}>
                {r.title}
                {r.beta ? <BetaBadge /> : null}
              </span>
              <span className={page.muted}>{r.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
