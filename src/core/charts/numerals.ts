import { checkNumeral, MAX_BARS, MAX_NAME } from '../content/progressionText';
import { prettyNumeral } from '../notation';
import type { Progression } from '../content/types';
import { chordToRoman, chroma, parseChord, romanToChord } from '../theory';
import { simplifyChord } from './simplify';
import { NO_CHORD } from './symbols';
import type { Key } from './transpose';
import { CHART_VERSION, evenBeats, type ChartBar, type ChordChart } from './types';

/** A progression the builder can open: the chords as Roman numerals, a bar a word. */
export interface NumeralsDraft {
  mode: Key['mode'];
  /** As the builder reads it: "I vi IV,V ii7"; four slots for an uneven bar, "I,I,I,V". */
  text: string;
  /** The changes in order, for a name: "I–vi–IV–V–ii7", "i–♭VII–♭VI–V7". */
  name: string;
  /** What did not come across as it was, each said once. */
  notes: string[];
}

const ascii = (numeral: string) => numeral.replace(/♭/g, 'b').replace(/♯/g, '#');

const tonesOf = (symbol: string) =>
  [...new Set(parseChord(symbol).tones.map((t) => chroma(t)))].sort((a, b) => a - b).join(',');

/**
 * A chord as a numeral the builder reads, and that sounds as the chord does
 * in the key: as written without its slash bass, then simplified, then as a
 * triad. Null when none of them reads.
 */
function numeralOf(symbol: string, key: Key): { numeral: string; exact: boolean } | null {
  let shape: string;
  try {
    shape = parseChord(symbol).symbol.replace(/\/.*$/, '');
  } catch {
    return null;
  }
  const tries = [
    shape,
    simplifyChord(shape, 'simplified').symbol,
    simplifyChord(shape, 'basic').symbol,
  ];
  for (const [i, chord] of tries.entries()) {
    try {
      const numeral = ascii(chordToRoman(chord, key.tonic, key.mode));
      if (checkNumeral(numeral, key.mode)) continue;
      if (tonesOf(romanToChord(numeral, key.tonic, key.mode)) !== tonesOf(chord)) continue;
      return { numeral, exact: i === 0 };
    } catch {
      /* the next, simpler, try */
    }
  }
  return null;
}

/** "bar 3", "bars 3 and 5", "bars 1, 3 and 5". */
function barsWord(bars: readonly number[]): string {
  if (bars.length === 1) return `bar ${bars[0]}`;
  return `bars ${bars.slice(0, -1).join(', ')} and ${bars.at(-1)}`;
}

/** Collected per bar, then said once each. */
class Notes {
  private byText = new Map<string, number[]>();
  add(what: string, bar: number) {
    const bars = this.byText.get(what) ?? [];
    if (!bars.includes(bar)) bars.push(bar);
    this.byText.set(what, bars);
  }
  each<T>(f: (what: string, bars: number[]) => T): T[] {
    return [...this.byText].map(([what, bars]) => f(what, bars));
  }
}

/**
 * Bars of a chord chart or the chord sequence as a progression in a key, for
 * the builder. Every 4/4 bar comes across as it is: one chord, two even
 * halves, or four quarters ("I,I,I,V" for three beats and one). A 3/4 bar
 * becomes a 4/4 bar with its chords split evenly, as the meter switch does,
 * since progressions are in 4/4. N.C. has no numeral and is left out, its
 * beats going to the chord before it; so is a chord with no numeral the
 * builder can read. A bar with nothing left is left out. Each is said in
 * `notes`.
 */
export function chordsToProgression(
  bars: readonly ChartBar[],
  beatsPerBar: 3 | 4,
  key: Key,
): NumeralsDraft {
  const words: string[] = [];
  const changes: string[] = [];
  const silent: number[] = [];
  const unread = new Notes();
  const nearest = new Notes();
  bars.forEach((bar, b) => {
    const at = b + 1;
    const kept: { numeral: string; beats: number }[] = [];
    let carry = 0;
    for (const c of bar.chords) {
      const read = c.symbol === NO_CHORD ? null : numeralOf(c.symbol, key);
      if (c.symbol === NO_CHORD) {
        if (!silent.includes(at)) silent.push(at);
      } else if (!read) unread.add(c.symbol, at);
      else if (!read.exact) nearest.add(`${c.symbol} is written ${read.numeral}`, at);
      const last = kept.at(-1);
      if (!read) {
        // Its beats go to the chord before it, or the one after it in a bar's first slot.
        if (last) last.beats += c.beats;
        else carry += c.beats;
      } else if (last && last.numeral === read.numeral) last.beats += c.beats;
      else {
        kept.push({ numeral: read.numeral, beats: c.beats + carry });
        carry = 0;
      }
    }
    if (!kept.length) return;
    const beats = beatsPerBar === 4 ? kept.map((k) => k.beats) : evenBeats(kept.length, 4);
    const slots =
      kept.length === 1
        ? [kept[0]!.numeral]
        : beats.length === 2 && beats[0] === 2 && beats[1] === 2
          ? kept.map((k) => k.numeral)
          : kept.flatMap((k, i) => Array.from({ length: beats[i]! }, () => k.numeral));
    words.push(slots.join(','));
    for (const k of kept) if (changes.at(-1) !== k.numeral) changes.push(k.numeral);
  });

  const notes: string[] = [];
  if (beatsPerBar === 3 && words.length)
    notes.push('Progressions are in 4/4: each 3/4 bar is a 4/4 bar here, its chords split evenly.');
  if (silent.length)
    notes.push(`N.C. in ${barsWord(silent)} is left out: a progression has no silent bars.`);
  notes.push(
    ...unread.each(
      (symbol, at) => `${symbol} in ${barsWord(at)} has no numeral the builder reads: left out.`,
    ),
    ...nearest.each((what, at) => `${what} in ${barsWord(at)}, the nearest numeral it reads.`),
  );
  if (words.length > MAX_BARS)
    notes.push(`Only the first ${MAX_BARS} bars: a progression holds up to ${MAX_BARS}.`);

  // As the library names its progressions: "I–vi–IV–V", "i–♭VII–♭VI–V".
  let name = '';
  for (const n of changes) {
    const next = name ? `${name}–${prettyNumeral(n)}` : prettyNumeral(n);
    if (next.length > MAX_NAME) {
      name = `${name.slice(0, MAX_NAME - 1)}…`;
      break;
    }
    name = next;
  }
  return { mode: key.mode, text: words.slice(0, MAX_BARS).join(' '), name, notes };
}

/**
 * A progression's steps as chart bars in a key: a bar each four beats, the
 * chords as symbols. A numeral that does not read becomes N.C., so every bar
 * still adds up.
 */
export function progressionBars(
  steps: Progression['steps'],
  tonic: string,
  mode: Key['mode'],
): ChartBar[] {
  const bars: ChartBar[] = [];
  let bar: ChartBar = { chords: [] };
  let filled = 0;
  for (const s of steps) {
    let symbol: string;
    try {
      symbol = romanToChord(s.numeral, tonic, mode);
    } catch {
      symbol = NO_CHORD;
    }
    bar.chords.push({ symbol, beats: s.beats });
    filled += s.beats;
    if (filled >= 4 - 1e-9) {
      bars.push(bar);
      bar = { chords: [] };
      filled = 0;
    }
  }
  if (bar.chords.length) bars.push(bar);
  return bars;
}

/** A new chart to build a song on, from a progression in a key: one verse of it. */
export function progressionChart(p: Progression, tonic: string): ChordChart {
  return {
    version: CHART_VERSION,
    title: p.name,
    key: { tonic, mode: p.mode },
    tempo: 80,
    meter: { beats: 4, unit: 4 },
    sections: [
      {
        id: 'verse',
        label: 'Verse',
        type: 'verse',
        repeat: 1,
        bars: progressionBars(p.steps, tonic, p.mode),
      },
    ],
    form: ['verse'],
    notes: '',
  };
}
