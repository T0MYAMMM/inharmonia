import { describe, expect, it } from 'vitest';
import {
  CHORD_EAR_LEVELS,
  ChordEarQuiz,
  MAX_RUN,
  NOTE_EAR_LEVELS,
  NOTE_EAR_RANGE,
  NoteEarQuiz,
  PROGRESSION_EAR_LEVELS,
  ProgressionEarQuiz,
  voiceNumerals,
} from './ear';

/** A repeatable random source. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** The longest run of one value in a list. */
function longestRun(xs: readonly unknown[]): number {
  let best = 0;
  let run = 0;
  xs.forEach((x, i) => {
    run = i && x === xs[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

describe('ChordEarQuiz', () => {
  it('asks only the level’s qualities, around middle C', () => {
    const quiz = new ChordEarQuiz(CHORD_EAR_LEVELS[1]!, seeded(7));
    for (let i = 0; i < 50; i++) {
      const q = quiz.next();
      expect(['major', 'minor', 'dim', 'aug']).toContain(q.quality.id);
      expect(q.voicing[0]!.midi).toBeGreaterThanOrEqual(48);
      expect(q.voicing[0]!.midi).toBeLessThan(60);
    }
  });

  it('does not alternate major and minor: repeats happen, but never more than MAX_RUN', () => {
    const quiz = new ChordEarQuiz(CHORD_EAR_LEVELS[0]!, seeded(13));
    const asked = [quiz.question.quality.id];
    for (let i = 0; i < 400; i++) asked.push(quiz.next().quality.id);
    const repeats = asked.filter((q, i) => i && q === asked[i - 1]).length;
    // Independent picks repeat about half the time; strict alternation never does.
    expect(repeats).toBeGreaterThan(120);
    expect(longestRun(asked)).toBe(MAX_RUN);
    const majors = asked.filter((q) => q === 'major').length;
    expect(majors / asked.length).toBeGreaterThan(0.4);
    expect(majors / asked.length).toBeLessThan(0.6);
  });

  it('scores answers, keeps the first answer, and tracks the streak', () => {
    const quiz = new ChordEarQuiz(CHORD_EAR_LEVELS[0]!, seeded(3));
    const right = quiz.question.quality.id;
    const wrong = right === 'major' ? 'minor' : 'major';
    expect(quiz.answer(right)).toBe(true);
    expect(quiz.answer(wrong)).toBe(true); // already answered
    quiz.next();
    quiz.answer(quiz.question.quality.id);
    expect(quiz.score).toEqual({ correct: 2, total: 2, streak: 2 });
    quiz.next();
    quiz.answer(quiz.question.quality.id === 'major' ? 'minor' : 'major');
    expect(quiz.score).toEqual({ correct: 2, total: 3, streak: 0 });
    expect(quiz.answered).toMatchObject({ correct: false });
  });

  it('builds every level', () => {
    for (const level of CHORD_EAR_LEVELS) {
      const quiz = new ChordEarQuiz(level, seeded(11));
      for (let i = 0; i < 30; i++) expect(quiz.next().voicing.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('ProgressionEarQuiz', () => {
  it('starts on I with different neighbours, from the level’s numerals', () => {
    for (const level of PROGRESSION_EAR_LEVELS) {
      const quiz = new ProgressionEarQuiz(level, seeded(5));
      for (let i = 0; i < 40; i++) {
        const q = quiz.next();
        expect(q.numerals).toHaveLength(4);
        expect(q.numerals[0]).toBe('I');
        q.numerals.forEach((n, j) => {
          expect(level.numerals).toContain(n);
          if (j) expect(n).not.toBe(q.numerals[j - 1]);
        });
        expect(q.voicings).toHaveLength(4);
      }
    }
  });

  it('marks each chord', () => {
    const quiz = new ProgressionEarQuiz(PROGRESSION_EAR_LEVELS[2]!, seeded(9));
    const n = quiz.question.numerals;
    const guess = [...n];
    guess[2] = n[2] === 'ii' ? 'iii' : 'ii';
    expect(quiz.answer(guess)).toBe(false);
    expect(quiz.answered!.right).toEqual([true, true, false, true]);
    quiz.next();
    expect(quiz.answer(quiz.question.numerals)).toBe(true);
    expect(quiz.score).toEqual({ correct: 1, total: 2, streak: 1 });
  });

  it('voices numerals smoothly in the key', () => {
    const v = voiceNumerals(['I', 'IV', 'V', 'I'], 'C');
    expect(v[0]!.map((n) => n.name)).toEqual(['C3', 'E3', 'G3']);
    // Each chord moves by small steps from the last.
    for (let i = 1; i < v.length; i++) {
      const moved = v[i]!.reduce((s, n, j) => s + Math.abs(n.midi - v[i - 1]![j]!.midi), 0);
      expect(moved).toBeLessThanOrEqual(6);
    }
  });
});

describe('NoteEarQuiz', () => {
  it('asks the level’s notes across five octaves, at most MAX_RUN of a name running', () => {
    for (const level of NOTE_EAR_LEVELS) {
      const quiz = new NoteEarQuiz(level, seeded(17));
      const asked = [quiz.question];
      for (let i = 0; i < 600; i++) asked.push(quiz.next());
      for (const q of asked) {
        expect(level.pitchClasses).toContain(q.pitchClass);
        expect(q.midi % 12).toBe(q.pitchClass);
        expect(q.midi).toBeGreaterThanOrEqual(NOTE_EAR_RANGE[0]);
        expect(q.midi).toBeLessThanOrEqual(NOTE_EAR_RANGE[1]);
      }
      expect(new Set(asked.map((q) => q.pitchClass)).size).toBe(level.pitchClasses.length);
      expect(new Set(asked.map((q) => Math.floor(q.midi / 12))).size).toBe(5);
      expect(longestRun(asked.map((q) => q.pitchClass))).toBeLessThanOrEqual(MAX_RUN);
    }
  });

  it('scores answers and keeps the first one', () => {
    const quiz = new NoteEarQuiz(NOTE_EAR_LEVELS[1]!, seeded(19));
    const right = quiz.question.pitchClass;
    expect(quiz.answer(right)).toBe(true);
    expect(quiz.answer((right + 1) % 12)).toBe(true);
    quiz.next();
    expect(quiz.answer((quiz.question.pitchClass + 1) % 12)).toBe(false);
    expect(quiz.score).toEqual({ correct: 1, total: 2, streak: 0 });
  });
});
