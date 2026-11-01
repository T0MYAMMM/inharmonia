import { Link } from 'react-router';
import { FILLS } from '@/content/fills';
import { PROGRESSIONS } from '@/content/progressions';
import { computerKeyMap } from '@/core/input';
import { keyName } from '@/ui/keyboard/layout';
import { loadProgress, streak } from '@/state/progress';
import { dueForReview, lastSevenDays } from '@/state/review';
import { useSettings } from '@/state/settings';
import { useUserProgressions } from '@/state/userProgressions';
import { CardArt } from '@/ui/art/CardArt';
import { ChordWave } from '@/ui/art/ChordWave';
import { FillRun } from '@/ui/art/FillRun';
import { MiniKeys } from '@/ui/art/MiniKeys';
import { TWINKLE } from '@/ui/art/previews';
import { KeysSpot } from '@/ui/art/spots';
import type { Room } from '@/ui/art/rooms';
import { StaffBars } from '@/ui/art/StaffBars';
import { SungToNotes } from '@/ui/art/SungToNotes';
import { VoiceLines } from '@/ui/art/VoiceLines';
import { WeekDots } from '@/ui/art/WeekDots';
import { BetaBadge } from '@/ui/BetaBadge';
import { Button } from '@/ui/Button';
import { buttonClass } from '@/ui/buttonClass';
import { describeExercise, nextNew } from '../progress/catalog';
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
    body: 'Every quality, inversion and voicing, then a drill to test them.',
  },
  {
    to: '/progressions',
    room: 'progressions',
    title: 'Progressions',
    body: 'Roman-numeral progressions in any key, comped, practised or played along.',
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
    body: 'Your best scores, streak, and what to look at today.',
  },
];

const II_V_I = PROGRESSIONS.find((p) => p.id === 'ii-v-i');
const RUN_UP = FILLS.find((f) => f.id === 'run-up');

/** Each room drawn from what it holds. */
function RoomArt({ room, week }: { room: Room; week: { key: string; practised: boolean }[] }) {
  switch (room) {
    case 'songs':
      return <StaffBars preview={TWINKLE} />;
    case 'chords':
      return <MiniKeys notes={[60, 64, 67, 71]} below={1} octaves={3} />;
    case 'progressions':
      return II_V_I ? (
        <VoiceLines numerals={II_V_I.steps.map((s) => s.numeral)} mode={II_V_I.mode} width={220} />
      ) : null;
    case 'fills':
      return RUN_UP ? <FillRun fill={RUN_UP} /> : null;
    case 'ear':
      return <ChordWave notes={[60, 64, 67]} width={250} />;
    case 'studio':
      return <SungToNotes preview={TWINKLE} />;
    case 'progress':
      return <WeekDots days={week} />;
  }
}

/** The computer keys' range, from the same map the keyboard uses. */
const KEY_MAP = computerKeyMap();
const FIRST_KEY = KEY_MAP[0]!;
const LAST_KEY = KEY_MAP.at(-1)!;

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
  const week = lastSevenDays(state);

  return (
    <>
      <PageHeader
        title="A quiet room to practice harmony."
        lede="Chords, voicings, progressions, comping and fills, learned at the keys. Take your time; nothing here is timed unless you ask it to be."
      />

      {!dismissed && !practised ? (
        <section className={styles.welcome} aria-labelledby="welcome-title">
          <h2 id="welcome-title">New here?</h2>
          <div className={styles.welcomeArt}>
            <KeysSpot />
          </div>
          <ol className={styles.steps}>
            <li>
              <strong>Find the keys.</strong> Tap the piano, use your computer keyboard (
              {FIRST_KEY.label} to {LAST_KEY.label} play {keyName(FIRST_KEY.midi)} to{' '}
              {keyName(LAST_KEY.midi)}), or plug in a MIDI keyboard and connect it under the piano.
              The <Link to="/keyboard">keyboard page</Link> is a good place to try.
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
            <Link to={r.to} className={styles.room} data-room={r.room}>
              <CardArt>
                <RoomArt room={r.room} week={week} />
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
