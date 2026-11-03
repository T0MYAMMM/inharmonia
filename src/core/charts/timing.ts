import type { TimedChord } from './rebar';

// Packing timed chords into bars belongs with timing them.
export { rebar, type TimedChord } from './rebar';

/**
 * Estimate how long each chord on a chord sheet lasts, from where it sits over
 * the lyric line under it. Pure and deterministic: the same steps are ported
 * to other tools and checked against `timing.vectors.json`, so every step
 * below uses only + − × ÷ and comparisons on doubles. "Round" means
 * floor(x + 0.5), and every tie goes to the candidate tried first.
 *
 * Input: the sheet's lines of chords that have words (lines without words are
 * left alone: a bar a chord). Each line is its chords in order, each with its
 * symbol and the column it starts at, and the lyric line under it. Then beats
 * per bar (3 or 4), and a scale (1; ½ halves every length, 2 doubles it). Both
 * lines of a pair must have their tabs expanded the same way first
 * (`expandTabs`: stops every 4 columns). Steps 1 to 6 are per line; step 7
 * looks at the whole sheet, because a song has one speed.
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
 * 7. Bar counts, with one speed for the sheet.
 *    a. For each line and each B in BARS (in that order), skipping any with
 *       fewer beats than chords: T = B × beatsPerBar beats; ρ = T / the line's
 *       total weight, the speed (beats a syllable) that B means for the line;
 *       the chords' ideal starts are their summed weights × ρ. Place them on
 *       whole beats (step 8), and give B the line cost
 *         PRIOR[B]
 *         + W_CHORD × outside(T / chords, CHORD_LOW, CHORD_HIGH)
 *         + W_PLACE × (mean |start − ideal| / ρ)
 *       where outside(x, lo, hi) is lo/x − 1 below lo, x/hi − 1 above hi, else 0.
 *    b. The sheet's speed r is one of those ρ, tried line by line and B by B
 *       in the same order. Each line costs its cheapest B at r, adding
 *       W_FIT × apart(ρ, r) to each B's line cost, where apart(x, y) is x/y − 1
 *       when x ≥ y, else y/x − 1. The sheet costs the sum over its lines plus
 *       lines × W_RATE × apart(r, RATE): songs are sung at about RATE beats a
 *       syllable, so of two speeds a factor of 2 apart, the one nearer RATE
 *       wins. The cheapest r wins.
 *    c. Each line takes its cheapest B at r × scale, as in b. The scale
 *       changes the sheet's speed, not each line: halved or doubled, a line
 *       refits its bars, so one too crowded to halve keeps its length.
 *    Doubling every length (2 bars of quarter notes or 4 of half notes) can't
 *    be told apart from the words, so PRIOR doesn't favour 2 or 4: that is what
 *    the scale, Half and Double in the paste review, is for.
 *
 * 8. Placing on beats (dynamic programming). The first chord starts on beat 0.
 *    Each later chord starts on a whole beat after the previous one, leaving
 *    at least one beat for each chord still to come. A start q costs
 *    |q − ideal| + grid(q), where grid is 0 on a bar line, then in 4/4
 *    GRID_HALF on beat 3 and GRID_OFF on beats 2 and 4, and in 3/4 GRID_OFF on
 *    beats 2 and 3. Keep the cheapest path; on a tie the earlier start wins.
 *    Each chord lasts until the next starts; the last until beat T.
 *
 * 9. Confidence, per line, is "good" when its runner-up B at r (as in 7b)
 *    costs at least MARGIN more and its mean placing error (as in 7a) is at
 *    most CLOSE; else "rough".
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

/** A line of chords and the words under it, for `estimateSheetTiming`. */
export interface TimingLine {
  chords: readonly LineChord[];
  lyric: string;
}

/** Tuning, named in the steps above. Set on the "tune" fixtures only. */
export const TIMING = {
  HOLD: 3,
  TAIL: 3,
  MIN_SPAN: 0.5,
  BARS: [2, 4, 1, 8],
  PRIOR: { 1: 1, 2: 0, 4: 0, 8: 0.6 } as Record<number, number>,
  RATE: 0.9,
  CHORD_LOW: 2,
  CHORD_HIGH: 16,
  W_RATE: 2,
  W_FIT: 2,
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
const apart = (x: number, y: number) => (x >= y ? x / y - 1 : y / x - 1);

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

/** One way to time a line: B bars, its speed, its starts and its cost (step 7a). */
interface Option {
  bars: number;
  rho: number;
  starts: number[];
  cost: number;
  error: number;
}

/** Steps 1 to 7a for one line: its options, or none when it has no words. */
function lineOptions(line: TimingLine, beatsPerBar: number): Option[] | null {
  const { chords } = line;
  const words = wordsOf(line.lyric);
  if (words.length === 0) return null;
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

  const options: Option[] = [];
  for (const bars of TIMING.BARS) {
    const T = bars * beatsPerBar;
    if (T < chords.length) continue;
    const rho = T / sum;
    const ideal = marks.map((m) => m * rho);
    const starts = place(ideal, T, beatsPerBar);
    let off = 0;
    for (let i = 0; i < starts.length; i++) off += Math.abs(starts[i]! - ideal[i]!);
    const error = off / chords.length / rho;
    const cost =
      TIMING.PRIOR[bars]! +
      TIMING.W_CHORD * outside(T / chords.length, TIMING.CHORD_LOW, TIMING.CHORD_HIGH) +
      TIMING.W_PLACE * error;
    options.push({ bars, rho, starts, cost, error });
  }
  return options;
}

/** A line's cheapest option at speed r, and what the runner-up costs (step 7b). */
function pick(options: readonly Option[], r: number) {
  let best: Option | null = null;
  let bestCost = Infinity;
  let runnerUp = Infinity;
  for (const o of options) {
    const cost = o.cost + TIMING.W_FIT * apart(o.rho, r);
    if (cost < bestCost) {
      runnerUp = bestCost;
      best = o;
      bestCost = cost;
    } else if (cost < runnerUp) runnerUp = cost;
  }
  return { best: best!, cost: bestCost, runnerUp };
}

export interface SheetTimingOptions {
  /** ½ halves every length, 2 doubles it (step 7c). Default 1. */
  scale?: number;
}

/**
 * How long each chord lasts on each line of chords over words in a sheet, and
 * how many bars each line takes, with one speed for the whole sheet. See the
 * steps at the top of this file. Lines with no words get a bar a chord.
 */
export function estimateSheetTiming(
  lines: readonly TimingLine[],
  beatsPerBar: number,
  { scale = 1 }: SheetTimingOptions = {},
): LineTiming[] {
  const all = lines.map((l) => (l.chords.length === 0 ? null : lineOptions(l, beatsPerBar)));
  const timed = all.filter((o): o is Option[] => !!o && o.length > 0);

  // Step 7b: the sheet's speed.
  let r = 1;
  let best = Infinity;
  for (const options of timed)
    for (const { rho } of options) {
      let cost = timed.length * TIMING.W_RATE * apart(rho, TIMING.RATE);
      for (const o of timed) cost += pick(o, rho).cost;
      if (cost < best) {
        best = cost;
        r = rho;
      }
    }

  return lines.map((line, i) => {
    const options = all[i];
    if (line.chords.length === 0) return { chords: [], bars: 0, confidence: 'rough' };
    if (!options?.length) return oneABar(line.chords, beatsPerBar);
    // Step 7c, then 8 and 9.
    const { best: o, cost, runnerUp } = pick(options, r * scale);
    const T = o.bars * beatsPerBar;
    const chords = line.chords.map((c, k) => ({
      symbol: c.symbol,
      beats: (o.starts[k + 1] ?? T) - o.starts[k]!,
    }));
    const good = runnerUp - cost >= TIMING.MARGIN && o.error <= TIMING.CLOSE;
    return { chords, bars: o.bars, confidence: good ? 'good' : 'rough' };
  });
}

/** One line on its own: a sheet of one line (see `estimateSheetTiming`). */
export function estimateLineTiming(
  chords: readonly LineChord[],
  lyric: string,
  beatsPerBar: number,
): LineTiming {
  return estimateSheetTiming([{ chords, lyric }], beatsPerBar)[0]!;
}
