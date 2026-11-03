import type { TimedChord } from './rebar';

/**
 * Estimate how long each chord on one line of a chord sheet lasts, from where
 * it sits over the lyric line under it. Pure and deterministic: the same steps
 * are ported to other tools and checked against `timing.vectors.json`, so
 * every step below uses only + − × ÷ and comparisons on doubles. "Round" means
 * floor(x + 0.5), and every tie goes to the candidate tried first.
 *
 * Input: the chords in order, each with its symbol and the column it starts
 * at; the lyric line under them; beats per bar (3 or 4). Both lines must have
 * their tabs expanded the same way first (`expandTabs`: stops every 4 columns).
 *
 * 1. Words. Every run of letters in the lyric (apostrophes inside a run are
 *    kept, so "don't" is one word; hyphens and other marks split words) is a
 *    word with a start and end column. No words: fall back to one chord a bar.
 *
 * 2. Language, for the whole line. +1 for each word on the Indonesian list or
 *    with an Indonesian ending or prefix (ID_WORDS, ID_AFFIX), −1 for each on
 *    the English list or with English spelling (EN_WORDS, EN_SPELLING). Above
 *    0 is Indonesian; otherwise English.
 *
 * 3. Syllables per word (at least 1), lower-cased, letters a–z only.
 *    Indonesian: every vowel (a e i o u) is a syllable, except that ai, au, oi
 *    and ei at the end of a word count as one (pantai, pulau; ma-in, la-ut
 *    split). English: groups of vowels (y is a vowel unless it starts the word
 *    or comes before a vowel) are syllables, with ia and io split unless after
 *    c, g, s, t or x (chari-ot, but na-tion), and a vowel group ending in i
 *    before a final "ng" split (go-ing). Then a final e on its own is silent
 *    (grace, but not doodle's "le"), and so are the e of a final "es" (unless
 *    after c, g, s, x, z or h) and of a final "ed" (unless after t or d), as
 *    long as one syllable is left.
 *
 * 4. A syllable line. Syllables follow each other across the words; the gaps
 *    between words take no time. Inside a word of s syllables over columns
 *    [a, b), syllable k starts at a + k·(b − a)/s.
 *
 * 5. Each chord's place on that line, by its column c:
 *    - in a gap between words, or within 1 column of a word's start: that
 *      word's first syllable (so a chord nudged a column or two lands the same);
 *    - inside a word: its nearest syllable start, round(s·(c − a)/(b − a)); on
 *      the word's last column, the end of the word;
 *    - before the first word (an intro or a lead-in over blank space):
 *      −(firstStart − c)/cpsy, where cpsy is the line's columns per syllable,
 *      (lastEnd − firstStart)/syllables, at least 1;
 *    - after the last word (a tag after the words): the end of the words plus
 *      (c − lastEnd)/cpsy.
 *    Words before the first chord are a pickup into the line, which belongs to
 *    the previous line's last chord: the line starts at its first chord.
 *
 * 6. Each chord's weight: the distance to the next chord's place, at least
 *    MIN_SPAN. The last chord over the words gets the syllables left after it
 *    plus HOLD (a line ends on a held note); a chord after the words gets TAIL
 *    or its distance, whichever is larger.
 *
 * 7. The bar count. For each B in 4, 2, 1, 8 (in that order), skipping any
 *    with fewer beats than chords: T = B × beatsPerBar beats, r = T / total
 *    weight (beats a syllable), and the chords' ideal starts are their summed
 *    weights × r. Place them on whole beats (step 8), and cost B as
 *      PRIOR[B]
 *      + W_RATE × outside(r, RATE_LOW, RATE_HIGH)
 *      + W_CHORD × outside(T / chords, CHORD_LOW, CHORD_HIGH)
 *      + W_PLACE × (mean |start − ideal| / r)
 *    where outside(x, lo, hi) is lo/x − 1 below lo, x/hi − 1 above hi, else 0.
 *    The cheapest B wins.
 *
 * 8. Placing on beats (dynamic programming). The first chord starts on beat 0.
 *    Each later chord starts on a whole beat after the previous one, leaving
 *    at least one beat for each chord still to come. A start q costs
 *    |q − ideal| + grid(q), where grid is 0 on a bar line, then in 4/4
 *    GRID_HALF on beat 3 and GRID_OFF on beats 2 and 4, and in 3/4 GRID_OFF on
 *    beats 2 and 3. Keep the cheapest path; on a tie the earlier start wins.
 *    Each chord lasts until the next starts; the last until beat T.
 *
 * 9. Confidence is "good" when the runner-up bar count costs at least MARGIN
 *    more and the mean placing error (as in step 7) is at most CLOSE; else
 *    "rough".
 */

export interface LineChord {
  symbol: string;
  /** Column the chord starts at on its line, 0-based, tabs expanded. */
  col: number;
}

export interface LineTiming {
  /** The line's chords in order, each a whole number of beats, at least 1. */
  chords: TimedChord[];
  /** Whole bars the line lasts: the chords' beats add up to bars × beatsPerBar. */
  bars: number;
  confidence: 'good' | 'rough';
}

/** Tuning, named in the steps above. */
export const TIMING = {
  HOLD: 3,
  TAIL: 3,
  MIN_SPAN: 0.5,
  BARS: [4, 2, 1, 8],
  PRIOR: { 1: 1, 2: 0.2, 4: 0, 8: 0.6 } as Record<number, number>,
  RATE_LOW: 0.7,
  RATE_HIGH: 2.2,
  CHORD_LOW: 2,
  CHORD_HIGH: 16,
  W_RATE: 2,
  W_CHORD: 1,
  W_PLACE: 0.5,
  GRID_HALF: 0.4,
  GRID_OFF: 1,
  MARGIN: 0.25,
  CLOSE: 0.5,
} as const;

/** Tabs to spaces, with a stop every 4 columns. */
export function expandTabs(line: string): string {
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(4 - (out.length % 4));
    else out += ch;
  }
  return out;
}

const ID_WORDS = new Set(
  (
    'yang dan di ke dari ini itu aku kau kamu engkau dia ia kita kami mereka tak tidak ' +
    'akan sudah telah untuk dengan pada dalam ada saja juga lagi hanya bila jika karena ' +
    'cinta hati sayang selalu semua masih belum bukan apa siapa mana sini sana oh'
  ).split(' '),
);
/** Indonesian endings (-nya, -lah, -kan, -ku, -mu …) and prefixes (ber-, meng- …). */
const ID_AFFIX =
  /^(?:ber|meng|meny|peng|peny|mem|ter)[a-z]{3,}|[a-z]{2,}(?:nya|lah|kah|kan|ku|mu)$/;
const EN_WORDS = new Set(
  (
    'the and you your my me i a an to of in on is it for with oh be we he she they our ' +
    'are was will that this what how when where so all not but from at by his her love ' +
    'heart night day home there their thou art'
  ).split(' '),
);
/** Spellings Indonesian words don't have. */
const EN_SPELLING = /th|sh|ck|ee|oo|ght|wh|ph|qu|[qvxz]|[^aeiou]y$|[^aeiou]e$/;

/** Indonesian (true) or English (false), for a line of words. */
export function isIndonesian(words: readonly string[]): boolean {
  let score = 0;
  for (const raw of words) {
    const w = plain(raw);
    if (!w) continue;
    // "oh" is on both lists: it says nothing.
    if (ID_WORDS.has(w) && !EN_WORDS.has(w)) score++;
    else if (EN_WORDS.has(w) && !ID_WORDS.has(w)) score--;
    else if (ID_AFFIX.test(w)) score++;
    else if (EN_SPELLING.test(w)) score--;
  }
  return score > 0;
}

/** Lower case, a–z only (accents dropped, apostrophes gone). */
function plain(word: string): string {
  return word
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

const VOWELS = 'aeiou';
const isVowel = (c: string | undefined) => c !== undefined && VOWELS.includes(c);

/** Syllables in a word, at least 1 for any word with a letter, 0 for none. */
export function countSyllables(word: string, indonesian = false): number {
  const w = plain(word);
  if (!w) return 0;
  return Math.max(1, indonesian ? indonesianSyllables(w) : englishSyllables(w));
}

function indonesianSyllables(w: string): number {
  let n = 0;
  for (let i = 0; i < w.length; i++) {
    if (!isVowel(w[i])) continue;
    const pair = w[i]! + (w[i + 1] ?? '');
    // A closing diphthong at the end of the word is one syllable.
    if (i + 2 === w.length && /^(?:ai|au|oi|ei)$/.test(pair)) {
      n++;
      break;
    }
    n++;
  }
  return n;
}

function englishSyllables(w: string): number {
  const vowelAt = (i: number) => isVowel(w[i]) || (w[i] === 'y' && i > 0 && !isVowel(w[i + 1]));
  let n = 0;
  let i = 0;
  while (i < w.length) {
    if (!vowelAt(i)) {
      i++;
      continue;
    }
    n++;
    const start = i;
    i++;
    while (i < w.length && vowelAt(i)) {
      const prev = w[i - 1]!;
      const pair = prev + w[i]!;
      const before = w[i - 2] ?? '';
      // chari-ot, Indi-ana: split; na-tion, spe-cial: not.
      if ((pair === 'ia' || pair === 'io') && !'cgstx'.includes(before || '-')) break;
      i++;
    }
    // go-ing, be-ing: a group ending in i before a final "ng" splits.
    if (i - start >= 2 && w[i - 1] === 'i' && w.slice(i) === 'ng') n++;
  }
  const end = w.length;
  const lone = (k: number) => !vowelAt(k - 1) && vowelAt(k) && !vowelAt(k + 1);
  if (n > 1) {
    if (w.endsWith('e') && lone(end - 1) && !(w.endsWith('le') && !isVowel(w[end - 3]))) n--;
    else if (w.endsWith('es') && lone(end - 2) && !'cgsxzh'.includes(w[end - 3]!)) n--;
    else if (w.endsWith('ed') && lone(end - 2) && !'td'.includes(w[end - 3]!)) n--;
  }
  return n;
}

interface Word {
  start: number;
  end: number;
  syllables: number;
  /** Syllables before this word on the line. */
  before: number;
}

function wordsOf(lyric: string): Word[] {
  const runs = [...lyric.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu)];
  const indonesian = isIndonesian(runs.map((m) => m[0]));
  const words: Word[] = [];
  let before = 0;
  for (const m of runs) {
    const syllables = countSyllables(m[0], indonesian);
    if (syllables === 0) continue;
    words.push({ start: m.index, end: m.index + m[0].length, syllables, before });
    before += syllables;
  }
  return words;
}

/** Where a column falls on the syllable line (step 5). */
function placeOf(col: number, words: readonly Word[], total: number, cpsy: number): number {
  const first = words[0]!;
  const last = words.at(-1)!;
  if (col < first.start - 1) return -(first.start - col) / cpsy;
  if (col >= last.end) return total + (col - last.end) / cpsy;
  for (const w of words) {
    if (col < w.end) {
      if (col <= w.start + 1) return w.before;
      if (col === w.end - 1) return w.before + w.syllables;
      const k = Math.floor((w.syllables * (col - w.start)) / (w.end - w.start) + 0.5);
      return w.before + k;
    }
  }
  return total;
}

const outside = (x: number, lo: number, hi: number) =>
  x < lo ? lo / x - 1 : x > hi ? x / hi - 1 : 0;

function grid(q: number, beatsPerBar: number): number {
  const beat = q % beatsPerBar;
  if (beat === 0) return 0;
  if (beatsPerBar === 4 && beat === 2) return TIMING.GRID_HALF;
  return TIMING.GRID_OFF;
}

/** Whole-beat starts for these ideal starts, in T beats (step 8). */
function place(ideal: readonly number[], T: number, beatsPerBar: number): number[] {
  const n = ideal.length;
  const cost: number[][] = [];
  const from: number[][] = [];
  cost.push(Array.from({ length: T }, (_, q) => (q === 0 ? 0 : Infinity)));
  from.push(Array.from({ length: T }, () => -1));
  for (let i = 1; i < n; i++) {
    const row: number[] = [];
    const back: number[] = [];
    for (let q = 0; q < T; q++) {
      let best = Infinity;
      let arg = -1;
      if (q >= i && q <= T - (n - i)) {
        for (let p = 0; p < q; p++) {
          if (cost[i - 1]![p]! < best) {
            best = cost[i - 1]![p]!;
            arg = p;
          }
        }
        best += Math.abs(q - ideal[i]!) + grid(q, beatsPerBar);
      }
      row.push(best);
      back.push(arg);
    }
    cost.push(row);
    from.push(back);
  }
  let q = 0;
  for (let k = 0; k < T; k++) if (cost[n - 1]![k]! < cost[n - 1]![q]!) q = k;
  const starts = [q];
  for (let i = n - 1; i > 0; i--) {
    q = from[i]![q]!;
    starts.unshift(q);
  }
  return starts;
}

/** Today's rule: one chord a bar. */
function oneABar(chords: readonly LineChord[], beatsPerBar: number): LineTiming {
  return {
    chords: chords.map((c) => ({ symbol: c.symbol, beats: beatsPerBar })),
    bars: chords.length,
    confidence: 'rough',
  };
}

/**
 * How long each chord lasts on a line of chords over a line of lyrics, and how
 * many bars the line takes. See the steps at the top of this file.
 */
export function estimateLineTiming(
  chords: readonly LineChord[],
  lyric: string,
  beatsPerBar: number,
): LineTiming {
  if (chords.length === 0) return { chords: [], bars: 0, confidence: 'rough' };
  const words = wordsOf(lyric);
  if (words.length === 0) return oneABar(chords, beatsPerBar);
  const last = words.at(-1)!;
  const total = last.before + last.syllables;
  const cpsy = Math.max(1, (last.end - words[0]!.start) / total);

  // Steps 5 and 6: places, then weights.
  const at = chords.map((c) => placeOf(c.col, words, total, cpsy));
  const weights = at.map((p, i) => {
    if (i + 1 < at.length) return Math.max(TIMING.MIN_SPAN, at[i + 1]! - p);
    if (p > total) return Math.max(TIMING.TAIL, TIMING.MIN_SPAN);
    return Math.max(TIMING.MIN_SPAN, total - p) + TIMING.HOLD;
  });
  const sum = weights.reduce((s, w) => s + w, 0);
  const marks: number[] = [];
  let run = 0;
  for (const w of weights) {
    marks.push(run);
    run += w;
  }

  // Step 7: the bar count.
  let best: { bars: number; starts: number[]; cost: number; error: number } | null = null;
  let runnerUp = Infinity;
  for (const bars of TIMING.BARS) {
    const T = bars * beatsPerBar;
    if (T < chords.length) continue;
    const r = T / sum;
    const ideal = marks.map((m) => m * r);
    const starts = place(ideal, T, beatsPerBar);
    let off = 0;
    for (let i = 0; i < starts.length; i++) off += Math.abs(starts[i]! - ideal[i]!);
    const error = off / chords.length / r;
    const cost =
      TIMING.PRIOR[bars]! +
      TIMING.W_RATE * outside(r, TIMING.RATE_LOW, TIMING.RATE_HIGH) +
      TIMING.W_CHORD * outside(T / chords.length, TIMING.CHORD_LOW, TIMING.CHORD_HIGH) +
      TIMING.W_PLACE * error;
    if (!best || cost < best.cost) {
      if (best) runnerUp = Math.min(runnerUp, best.cost);
      best = { bars, starts, cost, error };
    } else runnerUp = Math.min(runnerUp, cost);
  }
  if (!best) return oneABar(chords, beatsPerBar);

  const T = best.bars * beatsPerBar;
  const timed = chords.map((c, i) => ({
    symbol: c.symbol,
    beats: (best.starts[i + 1] ?? T) - best.starts[i]!,
  }));
  const good = runnerUp - best.cost >= TIMING.MARGIN && best.error <= TIMING.CLOSE;
  return { chords: timed, bars: best.bars, confidence: good ? 'good' : 'rough' };
}
