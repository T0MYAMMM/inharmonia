import {
  normalizeAccidentals,
  romanToChord,
  voiceChord,
  VOICING_STYLES,
  type Mode,
} from '../theory';
import { MAJOR_KEYS, MINOR_KEYS } from './realize';
import type { Progression } from './types';

/** Limits for progressions people write, so a typo can't make a 10 000-bar lesson. */
export const MAX_BARS = 32;
export const MAX_NAME = 60;
export const MAX_DESCRIPTION = 140;
const BAR_BEATS = 4;
/** A bar holds one chord, or splits evenly into two or four. */
const SPLITS = new Set([1, 2, 4]);

export interface TextIssue {
  /** 1-based bar the issue is in, when it belongs to one. */
  bar?: number;
  message: string;
}

export interface ParsedText {
  steps: Progression['steps'];
  /** The numerals bar by bar, as written (accidentals normalised to b and #). */
  bars: string[][];
  issues: TextIssue[];
}

/**
 * Read a progression typed as Roman numerals: one bar per word, bars separated
 * by spaces, new lines or "|", and a comma splitting a bar into equal halves or
 * quarters ("ii7,V7"). Every numeral is checked in every key of the mode.
 */
export function parseProgressionText(text: string, mode: Mode): ParsedText {
  const words = normalizeAccidentals(text)
    .replace(/\s*,\s*/g, ',')
    .split(/[\s|]+/)
    .filter(Boolean);
  const issues: TextIssue[] = [];
  const bars: string[][] = [];
  const steps: Progression['steps'] = [];
  if (words.length === 0) issues.push({ message: 'Add at least one chord.' });
  if (words.length > MAX_BARS)
    issues.push({ message: `That's ${words.length} bars; the limit is ${MAX_BARS}.` });

  words.slice(0, MAX_BARS).forEach((word, i) => {
    const bar = i + 1;
    const parts = word.split(',');
    bars.push(parts);
    if (parts.some((p) => p === '')) {
      issues.push({ bar, message: `Bar ${bar} has an empty slot next to a comma.` });
      return;
    }
    if (!SPLITS.has(parts.length)) {
      issues.push({
        bar,
        message: `Bar ${bar} has ${parts.length} chords; split a bar into 2 or 4.`,
      });
      return;
    }
    for (const numeral of parts) {
      const problem = checkNumeral(numeral, mode);
      if (problem) issues.push({ bar, message: `Bar ${bar}: ${problem}` });
      steps.push({ numeral, beats: BAR_BEATS / parts.length });
    }
  });
  return { steps, bars, issues };
}

/** Steps back to text, one bar per word: the inverse of `parseProgressionText`. */
export function progressionToText(steps: Progression['steps']): string {
  const words: string[] = [];
  let bar: string[] = [];
  let filled = 0;
  for (const s of steps) {
    bar.push(s.numeral);
    filled += s.beats;
    if (filled >= BAR_BEATS - 1e-9) {
      words.push(bar.join(','));
      bar = [];
      filled = 0;
    }
  }
  if (bar.length) words.push(bar.join(','));
  return words.join(' ');
}

const checked = new Map<string, string | null>();

/**
 * Why a numeral can't be used, or null when it realises to a known chord in
 * every key of the mode and every voicing style. Results are cached.
 */
export function checkNumeral(numeral: string, mode: Mode): string | null {
  const cacheKey = `${mode}:${numeral}`;
  const hit = checked.get(cacheKey);
  if (hit !== undefined) return hit;
  let problem: string | null = null;
  if (numeral.length > 16) problem = `"${numeral.slice(0, 16)}…" is too long for a numeral.`;
  else {
    try {
      for (const key of mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS) {
        const symbol = romanToChord(numeral, key, mode);
        if (key === 'C' || key === 'A')
          for (const s of VOICING_STYLES) voiceChord(symbol, { style: s.id, floor: 'C3' });
      }
    } catch {
      problem = `"${numeral}" isn't a numeral we can read. Try forms like vi, V7, ♭VII, ii7 or V7/V.`;
    }
  }
  checked.set(cacheKey, problem);
  return problem;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/**
 * Check something that claims to be a user progression (from storage or an
 * imported file). Returns the issues; an empty list means it is safe to use.
 */
export function progressionIssues(x: unknown): string[] {
  if (!isObj(x)) return ['Not a progression.'];
  const issues: string[] = [];
  if (typeof x.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(x.id)) issues.push('Missing id.');
  if (typeof x.name !== 'string' || !x.name.trim()) issues.push('Missing name.');
  else if (x.name.length > MAX_NAME) issues.push(`Name is over ${MAX_NAME} characters.`);
  if (x.description !== undefined && typeof x.description !== 'string')
    issues.push('Description should be text.');
  else if (typeof x.description === 'string' && x.description.length > MAX_DESCRIPTION)
    issues.push(`Description is over ${MAX_DESCRIPTION} characters.`);
  if (x.mode !== 'major' && x.mode !== 'minor') issues.push('Mode should be major or minor.');
  const meter = x.meter;
  if (!isObj(meter) || meter.beats !== 4 || meter.unit !== 4) issues.push('Meter should be 4/4.');
  if (!Array.isArray(x.steps) || x.steps.length === 0) issues.push('No chords.');
  else if (
    !x.steps.every(
      (s) =>
        isObj(s) &&
        typeof s.numeral === 'string' &&
        typeof s.beats === 'number' &&
        [1, 2, 4].includes(s.beats),
    )
  )
    issues.push('Chords should each have a numeral and 1, 2 or 4 beats.');
  if (issues.length) return issues;

  // Re-read the steps as text so bar splits and numerals get the same checks as typing.
  const steps = x.steps as Progression['steps'];
  const parsed = parseProgressionText(progressionToText(steps), x.mode as Mode);
  issues.push(...parsed.issues.map((i) => i.message));
  if (!issues.length && JSON.stringify(parsed.steps) !== JSON.stringify(steps))
    issues.push('Bars should be filled evenly: one, two or four chords each.');
  return issues;
}
