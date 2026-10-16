import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { MIX, mixVelocity } from '@config/mix';
import { audio } from '@/app/services';
import {
  CHORD_EAR_LEVELS,
  ChordEarQuiz,
  EAR_ROUND,
  PROGRESSION_EAR_LEVELS,
  ProgressionEarQuiz,
  voiceNumerals,
} from '@/core/practice';
import { formatChord, keyName, prettyAccidentals, prettyNumeral } from '@/core/notation';
import { voiceChord, type SpelledNote } from '@/core/theory';
import { recordAttempt } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import page from '../page.module.css';
import styles from './ear.module.css';

type Exercise = 'chords' | 'progressions';

const EXERCISES = [
  { value: 'chords', label: 'Chord quality' },
  { value: 'progressions', label: 'Progressions' },
] as const satisfies readonly { value: Exercise; label: string }[];

/** Strike notes together, or one after another. */
function strike(
  notes: readonly SpelledNote[],
  at: number,
  opts: { broken?: boolean; length?: number } = {},
) {
  const { velocity, lengthSec, brokenGapSec } = MIX.chords;
  const gap = opts.broken ? brokenGapSec : 0;
  notes.forEach((n, i) =>
    audio.playAt(
      n.midi,
      at + i * gap,
      (opts.length ?? lengthSec) + (notes.length - i) * gap,
      mixVelocity('lh', velocity),
    ),
  );
}

/** Play chords one per `step` seconds. */
function playSequence(chords: readonly SpelledNote[][], step = 1.1) {
  void audio.unlock();
  const t0 = audio.now() + 0.05;
  chords.forEach((c, i) => strike(c, t0 + i * step, { length: step * 0.95 }));
}

function playChord(notes: readonly SpelledNote[], broken = false) {
  void audio.unlock();
  strike(notes, audio.now() + 0.02, { broken });
}

export function EarPage() {
  const [params, setParams] = useSearchParams();
  const exercise: Exercise = params.get('exercise') === 'progressions' ? 'progressions' : 'chords';
  const levels = exercise === 'chords' ? CHORD_EAR_LEVELS : PROGRESSION_EAR_LEVELS;
  const level = levels.find((l) => l.id === params.get('level')) ?? levels[0]!;
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className={page.hero}>
        <h1>Ear training</h1>
        <p className={page.lede}>
          Hear a chord and name its quality, or hear four chords and name them in Roman numerals.
          Listen as often as you like before you answer.
        </p>
      </div>
      <div className={styles.controls}>
        <Segmented
          label="Exercise"
          value={exercise}
          options={EXERCISES}
          onChange={(v) => set({ exercise: v, level: '' })}
        />
        <Segmented
          label="Level"
          value={level.id}
          options={levels.map((l) => ({ value: l.id, label: l.name }))}
          onChange={(v) => set({ level: v })}
        />
      </div>
      {exercise === 'chords' ? (
        <ChordQuiz key={level.id} levelId={level.id} />
      ) : (
        <ProgressionQuiz key={level.id} levelId={level.id} />
      )}
    </>
  );
}

/** Round bookkeeping: counts this round and saves it to progress after EAR_ROUND answers. */
function useRound(exerciseId: string) {
  const [round, setRound] = useState({ correct: 0, total: 0 });
  const [last, setLast] = useState<{ correct: number; total: number } | null>(null);
  const add = (correct: boolean) => {
    const next = { correct: round.correct + (correct ? 1 : 0), total: round.total + 1 };
    if (next.total >= EAR_ROUND) {
      recordAttempt(exerciseId, { hits: next.correct, misses: next.total - next.correct });
      setLast(next);
      setRound({ correct: 0, total: 0 });
    } else setRound(next);
  };
  return { round, last, add, clearLast: () => setLast(null) };
}

function RoundLine({
  round,
  last,
  streak,
}: {
  round: { correct: number; total: number };
  last: { correct: number; total: number } | null;
  streak: number;
}) {
  return (
    <p className={styles.round} data-testid="round">
      {last ? (
        <strong>
          Round done: {last.correct} of {last.total}.{' '}
        </strong>
      ) : null}
      {round.total
        ? `${round.correct} of ${round.total} right this round`
        : `Rounds of ${EAR_ROUND}`}
      {streak > 1 ? `, ${streak} in a row` : ''}
    </p>
  );
}

function ChordQuiz({ levelId }: { levelId: string }) {
  const level = CHORD_EAR_LEVELS.find((l) => l.id === levelId)!;
  const [quiz] = useState(() => new ChordEarQuiz(level));
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  const notation = useSettings((s) => s.notation);
  const { round, last, add, clearLast } = useRound(`ear:chords:${level.id}`);
  const q = quiz.question;
  const answered = quiz.answered;

  const choose = (id: string) => {
    if (answered) return;
    add(quiz.answer(id));
    refresh();
  };
  const next = () => {
    quiz.next();
    clearLast();
    refresh();
    playChord(quiz.question.voicing);
  };

  // Number keys answer, Enter goes on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= quiz.options.length && !quiz.answered) {
        e.preventDefault();
        add(quiz.answer(quiz.options[n - 1]!.id));
        refresh();
      } else if (e.key === 'Enter' && quiz.answered && document.activeElement === document.body) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const yours =
    answered && !answered.correct ? quiz.options.find((o) => o.id === answered.choice) : null;
  const key = { tonic: q.root, mode: 'major' as const };

  return (
    <section className={styles.card} aria-label="Chord quality">
      <div className={styles.row}>
        <Button variant="primary" onClick={() => playChord(q.voicing)} data-testid="play">
          Play
        </Button>
        <Button onClick={() => playChord(q.voicing, true)}>Play broken</Button>
      </div>
      <div className={styles.options} role="group" aria-label="What quality is it?">
        {quiz.options.map((o, i) => {
          const state = !answered
            ? undefined
            : o.id === q.quality.id
              ? 'right'
              : o.id === answered.choice
                ? 'wrong'
                : undefined;
          return (
            <button
              key={o.id}
              type="button"
              className={styles.option}
              data-state={state}
              aria-pressed={answered?.choice === o.id}
              disabled={!!answered && !state}
              onClick={() => choose(o.id)}
            >
              <span className={styles.optionKey} aria-hidden="true">
                {i + 1}
              </span>
              {o.name}
            </button>
          );
        })}
      </div>
      <div className={styles.feedback} aria-live="polite" data-testid="feedback">
        {answered ? (
          <>
            <p>
              {answered.correct ? 'Yes: ' : 'It was '}
              <strong>
                {formatChord(q.symbol, key, notation === 'roman' ? 'letter' : notation)}
              </strong>
              , {q.quality.name.toLowerCase()}.
            </p>
            <div className={styles.row}>
              {yours ? (
                <>
                  <Button size="small" onClick={() => playChord(q.voicing)}>
                    Hear {q.quality.name.toLowerCase()}
                  </Button>
                  <Button
                    size="small"
                    onClick={() =>
                      playChord(
                        voiceChord(`${q.root}${yours.suffix}`, { style: 'close', floor: 'C3' }),
                      )
                    }
                  >
                    Hear {yours.name.toLowerCase()}
                  </Button>
                </>
              ) : null}
              <Button variant="primary" onClick={next} data-testid="next">
                Next chord
              </Button>
            </div>
          </>
        ) : (
          <p className={styles.muted}>Press Play, then choose. Number keys answer too.</p>
        )}
      </div>
      <RoundLine round={round} last={last} streak={quiz.score.streak} />
    </section>
  );
}

function ProgressionQuiz({ levelId }: { levelId: string }) {
  const level = PROGRESSION_EAR_LEVELS.find((l) => l.id === levelId)!;
  const [quiz] = useState(() => new ProgressionEarQuiz(level));
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  const [choice, setChoice] = useState<(string | null)[]>([null, null, null]);
  const { round, last, add, clearLast } = useRound(`ear:progressions:${level.id}`);
  const q = quiz.question;
  const answered = quiz.answered;
  const complete = choice.every((c) => c !== null);

  const check = () => {
    if (!complete || answered) return;
    add(quiz.answer(['I', ...(choice as string[])]));
    refresh();
  };
  const next = () => {
    quiz.next();
    setChoice([null, null, null]);
    clearLast();
    refresh();
    playSequence(quiz.question.voicings);
  };
  const options = level.numerals.map((n) => ({ value: n, label: prettyNumeral(n) }));

  return (
    <section className={styles.card} aria-label="Progressions">
      <p className={styles.muted}>
        Four chords in {keyName({ tonic: q.key, mode: 'major' })}. The first is always I.
      </p>
      <div className={styles.row}>
        <Button variant="primary" onClick={() => playSequence(q.voicings)} data-testid="play">
          Play
        </Button>
        <Button onClick={() => playChord(q.voicings[0]!)}>Hear I</Button>
      </div>
      <ol className={styles.slots}>
        <li className={styles.slot}>
          <span className={styles.slotLabel}>Chord 1</span>
          <span className={styles.given}>I</span>
        </li>
        {[1, 2, 3].map((i) => {
          const right = answered?.right[i];
          return (
            <li
              key={i}
              className={styles.slot}
              data-state={answered ? (right ? 'right' : 'wrong') : undefined}
            >
              <span className={styles.slotLabel}>Chord {i + 1}</span>
              <Segmented
                label={`Chord ${i + 1}`}
                value={choice[i - 1] ?? ''}
                options={options.map((o) => ({ ...o, disabled: !!answered }))}
                onChange={(v) => setChoice((c) => c.map((x, j) => (j === i - 1 ? v : x)))}
              />
              {answered && !right ? (
                <span className={styles.correction}>It was {prettyNumeral(q.numerals[i]!)}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className={styles.feedback} aria-live="polite" data-testid="feedback">
        {answered ? (
          <>
            <p>
              {answered.correct ? 'All four right: ' : 'It was '}
              <strong>{q.numerals.map(prettyNumeral).join(' – ')}</strong> (
              {q.symbols.map((s) => prettyAccidentals(s)).join(' – ')}).
            </p>
            <div className={styles.row}>
              {!answered.correct ? (
                <Button
                  size="small"
                  onClick={() => playSequence(voiceNumerals(answered.choice, q.key))}
                >
                  Hear yours
                </Button>
              ) : null}
              <Button variant="primary" onClick={next} data-testid="next">
                Next progression
              </Button>
            </div>
          </>
        ) : (
          <Button variant="primary" onClick={check} disabled={!complete} data-testid="check">
            Check
          </Button>
        )}
      </div>
      <RoundLine round={round} last={last} streak={quiz.score.streak} />
    </section>
  );
}
