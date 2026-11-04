import { expandForm, LIMITS, type ChartBar, type ChordChart } from './types';

/** Line breaks and other control characters: not part of a line of words. */
// eslint-disable-next-line no-control-regex
const NOT_TEXT = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/** One line of text, with nothing in it that isn't text. */
export const isOneLine = (text: string) => !new RegExp(NOT_TEXT.source).test(text);

/**
 * Lyrics as kept in a bar: one line, spaces evened out, nothing that isn't
 * text. Undefined when nothing is left. Not cut: `LIMITS.lyric` is checked.
 */
export function tidyLyric(text: string): string | undefined {
  return text.replace(NOT_TEXT, ' ').replace(/\s+/g, ' ').trim() || undefined;
}

/** Words to keep in a bar: one line, cut at a word to `LIMITS.lyric` characters. */
export function fitLyric(text: string): { words: string | undefined; cut: boolean } {
  const words = tidyLyric(text);
  if (!words || words.length <= LIMITS.lyric) return { words, cut: false };
  const head = words.slice(0, LIMITS.lyric + 1);
  const space = head.lastIndexOf(' ');
  return {
    words: (space > 0 ? head.slice(0, space) : words.slice(0, LIMITS.lyric)).trim(),
    cut: true,
  };
}

/** A bar with these words, or without any. */
export function withLyric(bar: ChartBar, lyric: string | undefined): ChartBar {
  const { lyric: _old, ...rest } = bar;
  const words = lyric === undefined ? undefined : tidyLyric(lyric);
  return words ? { ...rest, lyric: words } : rest;
}

/** Does any bar of the chart hold words? */
export function hasLyrics(chart: Pick<ChordChart, 'sections'>): boolean {
  return chart.sections.some((s) => s.bars.some((b) => !!b.lyric));
}

/** The words of each bar as it is played, the form written out (as the player numbers bars). */
export function playedLyrics(chart: Pick<ChordChart, 'form' | 'sections'>): (string | undefined)[] {
  return expandForm(chart)
    .slice(0, LIMITS.expandedBars)
    .map((r) => r.bar.lyric);
}

/** The chart with every bar's words taken out. */
export function withoutLyrics(chart: ChordChart): ChordChart {
  return {
    ...chart,
    sections: chart.sections.map((s) => ({
      ...s,
      bars: s.bars.map((b) => withLyric(b, undefined)),
    })),
  };
}
