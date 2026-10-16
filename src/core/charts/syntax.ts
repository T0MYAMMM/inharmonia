import { normalizeChord } from './symbols';
import { evenBeats, LIMITS, type ChartBar } from './types';

export interface SyntaxIssue {
  /** 1-based line and bar within the text. */
  line: number;
  bar?: number;
  token?: string;
  message: string;
}

export interface ParsedBars {
  bars: ChartBar[];
  issues: SyntaxIssue[];
}

const REPEAT_MARK = /^(?:x\s?(\d+)|(\d+)\s?x)$/i;

/**
 * Read bars typed in chart syntax, one or more lines:
 *
 *     | C | G/B | Am7 | F |      one chord per bar
 *     | C G | Am F |             two chords split a bar evenly
 *     | C . . G |                dots add beats: C for 3, G for 1
 *     | % |                      the previous bar again
 *     | N.C. |                   no chord
 *     | C | G | x2               the line twice
 *
 * Without any "|" on a line, each chord is its own bar. Unknown chords are kept
 * as written and reported, so they can be fixed in place.
 */
export function parseBars(text: string, beatsPerBar: number): ParsedBars {
  const bars: ChartBar[] = [];
  const issues: SyntaxIssue[] = [];
  text.split(/\r?\n/).forEach((raw, li) => {
    const line = li + 1;
    // Double bar lines and repeat signs read as plain bar lines.
    let body = raw.trim().replace(/\|:|:\||\|{2,}/g, '|');
    if (!body) return;
    let times = 1;
    const tokens = body.split(/\s+/);
    const last = tokens.at(-1)!;
    const rep = REPEAT_MARK.exec(last);
    if (rep) {
      times = Number(rep[1] ?? rep[2]);
      if (times < 1 || times > LIMITS.repeat) {
        issues.push({ line, token: last, message: `Repeat ${last}: use x2 to x${LIMITS.repeat}` });
        times = Math.max(1, Math.min(LIMITS.repeat, times));
      }
      body = tokens.slice(0, -1).join(' ');
    }
    const cells = body.includes('|')
      ? body
          .split('|')
          .map((c) => c.trim())
          .filter((c, i, all) => c !== '' || (i > 0 && i < all.length - 1))
      : body.split(/\s+/).filter(Boolean);
    const lineBars: ChartBar[] = [];
    cells.forEach((cell, ci) => {
      const barNo = ci + 1;
      if (cell === '%') {
        const prev = lineBars.at(-1) ?? bars.at(-1);
        if (prev) lineBars.push(structuredClone(prev));
        else issues.push({ line, bar: barNo, token: '%', message: 'Nothing to repeat yet' });
        return;
      }
      const bar = parseCell(cell, beatsPerBar, (token, message) =>
        issues.push({ line, bar: barNo, ...(token ? { token } : {}), message }),
      );
      if (bar) lineBars.push(bar);
    });
    for (let i = 0; i < times; i++) bars.push(...structuredClone(lineBars));
  });
  return { bars, issues };
}

function parseCell(
  cell: string,
  beatsPerBar: number,
  report: (token: string | null, message: string) => void,
): ChartBar | null {
  const tokens = cell.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    report(null, 'Empty bar');
    return null;
  }
  const slots: { symbol: string; dots: number }[] = [];
  for (const t of tokens) {
    if (/^\.+$/.test(t) || t === '/') {
      const last = slots.at(-1);
      if (last) last.dots += t === '/' ? 1 : t.length;
      continue;
    }
    // "N.C." ends in a dot that is not a beat mark.
    const whole = normalizeChord(t);
    const m = whole ? [t, t, ''] : /^(.*?)(\.*)$/.exec(t)!;
    const sym = whole ?? normalizeChord(m[1]!);
    if (!sym) report(m[1]!, `"${m[1]}" is not a chord`);
    slots.push({ symbol: sym ?? m[1]!, dots: m[2]!.length });
  }
  if (slots.length > LIMITS.chordsPerBar) {
    report(null, `A bar holds up to ${LIMITS.chordsPerBar} chords`);
    slots.length = LIMITS.chordsPerBar;
  }
  const dotted = slots.some((s) => s.dots > 0);
  const even = evenBeats(slots.length, beatsPerBar);
  const beats = dotted ? slots.map((s) => 1 + s.dots) : even;
  const total = beats.reduce((a, b) => a + b, 0);
  if (dotted && total !== beatsPerBar) {
    report(null, `This bar lasts ${total} beats, not ${beatsPerBar}`);
    return { chords: slots.map((s, i) => ({ symbol: s.symbol, beats: even[i]! })) };
  }
  return { chords: slots.map((s, i) => ({ symbol: s.symbol, beats: beats[i]! })) };
}

/** Write bars back as syntax, four to a line; uneven splits use dots. */
export function formatBars(bars: readonly ChartBar[], beatsPerBar: number, perLine = 4): string {
  const cell = (b: ChartBar) => {
    const even = evenBeats(b.chords.length, beatsPerBar);
    const isEven = b.chords.every((c, i) => c.beats === even[i]);
    return b.chords
      .map((c) =>
        isEven || !Number.isInteger(c.beats)
          ? c.symbol
          : [c.symbol, ...Array.from({ length: c.beats - 1 }, () => '.')].join(' '),
      )
      .join(' ');
  };
  const lines: string[] = [];
  for (let i = 0; i < bars.length; i += perLine)
    lines.push(
      `| ${bars
        .slice(i, i + perLine)
        .map(cell)
        .join(' | ')} |`,
    );
  return lines.join('\n');
}
