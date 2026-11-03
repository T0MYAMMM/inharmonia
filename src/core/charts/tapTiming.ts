import { withLyric } from './lyrics';
import { rebar, type TimedChord } from './rebar';
import { LIMITS, type ChartBar, type ChartChord } from './types';

/**
 * Tap timing: set a section's chord lengths by tapping along as it plays.
 * Times here are seconds on whatever clock the taps were read from; beats
 * count from the section's first downbeat, beat 0.
 */

/** Beats every `period` seconds, beat 0 at `downbeat`. */
export interface BeatGrid {
  downbeat: number;
  period: number;
}

/** Tempos a tapped beat may come out at; outside them the taps were not a steady beat. */
export const TAP_TEMPO = { min: 30, max: 300 } as const;

/** Bars of beat taps that set the grid from a song file. */
export const BEAT_TAP_BARS = 2;

export const bpmOf = (grid: BeatGrid) => 60 / grid.period;

/** The grid of a steady tempo whose first downbeat is at `downbeat`. */
export function gridFromTempo(bpm: number, downbeat: number): BeatGrid {
  return { downbeat, period: 60 / bpm };
}

interface Point {
  beat: number;
  time: number;
}

/** The straight line through (beat, time) points: time = downbeat + beat × period. */
function fitGrid(points: readonly Point[]): BeatGrid | null {
  const n = points.length;
  if (n < 2) return null;
  const mb = points.reduce((s, p) => s + p.beat, 0) / n;
  const mt = points.reduce((s, p) => s + p.time, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.beat - mb) * (p.time - mt);
    den += (p.beat - mb) ** 2;
  }
  if (!(den > 0)) return null;
  const period = num / den;
  return period > 0 ? { downbeat: mt - period * mb, period } : null;
}

/**
 * The grid of a tapped beat, one tap a beat, the first on the first
 * downbeat. A straight line through the taps gives the tempo and where beat 0
 * falls, so a tap a little early or late moves neither much. Null when the
 * taps are too few or no steady beat (a beat missed or doubled among them).
 */
export function gridFromTaps(times: readonly number[]): BeatGrid | null {
  const grid = fitGrid(times.map((time, beat) => ({ beat, time })));
  if (!grid) return null;
  const bpm = bpmOf(grid);
  if (!(bpm >= TAP_TEMPO.min && bpm <= TAP_TEMPO.max)) return null;
  // Every tap within a third of a beat of its line: otherwise it was not one beat.
  const off = (t: number, beat: number) => Math.abs(t - (grid.downbeat + beat * grid.period));
  return times.every((t, beat) => off(t, beat) < grid.period / 3) ? grid : null;
}

/** The beat a time is nearest to. */
export const nearestBeat = (time: number, grid: BeatGrid) =>
  Math.round((time - grid.downbeat) / grid.period) || 0;

/**
 * Where each chord starts, in beats: the first on beat 0, then one per tap,
 * each tap on its nearest beat and at least a beat after the chord before.
 *
 * With `beatTaps`, the taps that made the grid, the grid follows the song:
 * each change, once snapped, joins them in the line the next is read
 * against, so a tempo a shade off, or a song that drifts, does not add up
 * over a long section.
 */
export function snapTaps(
  taps: readonly number[],
  grid: BeatGrid,
  beatTaps?: readonly number[],
): number[] {
  const points: Point[] = beatTaps?.map((time, beat) => ({ beat, time })) ?? [];
  let now = grid;
  const starts = [0];
  for (const time of taps) {
    const beat = Math.max(starts.at(-1)! + 1, nearestBeat(time, now));
    starts.push(beat);
    if (!beatTaps) continue;
    points.push({ beat, time });
    now = fitGrid(points) ?? now;
  }
  return starts;
}

/**
 * A section's chords in order, as you would hear them change: a chord written
 * again in the next bar (C | C) is one chord held, so it is tapped once.
 * Beats as they are now, which may be half beats.
 */
export function tapChords(bars: readonly ChartBar[]): ChartChord[] {
  const out: ChartChord[] = [];
  for (const bar of bars)
    for (const c of bar.chords) {
      const last = out.at(-1);
      if (last && last.symbol === c.symbol) last.beats += c.beats;
      else out.push({ symbol: c.symbol, beats: c.beats });
    }
  return out;
}

/**
 * The chords with their tapped lengths. `starts` is from `snapTaps`, one per
 * chord reached. A chord that has a start after it lasts until then; the last
 * chord runs to the end of its bar. Stopped early, the chord last reached and
 * those after it keep their lengths, in whole beats.
 */
export function timedFromStarts(
  chords: readonly ChartChord[],
  starts: readonly number[],
  beatsPerBar: number,
): TimedChord[] {
  const out: TimedChord[] = [];
  let at = 0;
  chords.forEach((c, i) => {
    const start = i < starts.length ? starts[i]! : at;
    const last = i === chords.length - 1;
    const beats = last
      ? (Math.floor(start / beatsPerBar) + 1) * beatsPerBar - start
      : i + 1 < starts.length
        ? starts[i + 1]! - start
        : Math.max(1, Math.ceil(c.beats));
    out.push({ symbol: c.symbol, beats });
    at = start + beats;
  });
  return out;
}

/**
 * The section's bars with the new lengths. Lyrics move with the music: a
 * bar's words go to the bar where its first beat lands in the new timing,
 * and words that land in the same bar are joined.
 */
export function retime(
  bars: readonly ChartBar[],
  timed: readonly TimedChord[],
  beatsPerBar: number,
): ChartBar[] {
  const out = rebar(timed, beatsPerBar);
  const old = tapChords(bars);
  if (!out.length || old.length !== timed.length) return out;
  const oldStarts = old.map((_, i) => old.slice(0, i).reduce((s, c) => s + c.beats, 0));
  const newStarts = timed.map((_, i) => timed.slice(0, i).reduce((s, c) => s + c.beats, 0));
  const words: string[][] = out.map(() => []);
  let at = 0;
  for (const bar of bars) {
    if (bar.lyric) {
      // The chord sounding at the bar's first beat, and how far into it.
      let k = old.length - 1;
      while (k > 0 && oldStarts[k]! > at + 1e-9) k--;
      const into = (at - oldStarts[k]!) / old[k]!.beats;
      const lands = newStarts[k]! + into * timed[k]!.beats;
      const n = Math.min(out.length - 1, Math.floor(lands / beatsPerBar + 1e-9));
      words[n]!.push(bar.lyric);
    }
    at += bar.chords.reduce((s, c) => s + c.beats, 0);
  }
  return out.map((b, i) => (words[i]!.length ? withLyric(b, words[i]!.join(' ')) : b));
}

/** Does this timing fit in a section? */
export const fitsSection = (bars: readonly ChartBar[]) => bars.length <= LIMITS.barsPerSection;
