import type { Key, ProgressionMatch, SectionHarmony } from '@/core/charts';
import { keyName, prettyAccidentals, prettyNumeral } from '@/core/notation';

/** The panel's id, for the way to it from the page's header. */
export const PANEL_ID = 'progressions-in-song';

const timesWord = (n: number) => (n === 2 ? 'twice' : `${n} times`);

/** A progression's page, in the key it was found in. */
export function progressionLink(m: ProgressionMatch, key: Key): string {
  return `/progressions/${m.id}?key=${encodeURIComponent((m.readIn ?? key).tonic)}`;
}

const range = (s: ProgressionMatch['spans'][number]) =>
  s.from === s.to ? `${s.from}` : `${s.from}–${s.to}`;

/** "bars 1–3 and 5–7"; "bars 1–8, twice"; "bars 1–4; bars 6–13, twice". */
function placesWord(spans: ProgressionMatch['spans']): string {
  if (spans.every((s) => s.times === 1)) {
    const ranges = spans.map(range);
    const list =
      ranges.length > 1 ? `${ranges.slice(0, -1).join(', ')} and ${ranges.at(-1)}` : ranges[0];
    return `${ranges.length === 1 && !ranges[0]!.includes('–') ? 'bar' : 'bars'} ${list}`;
  }
  return spans
    .map((s) => `bars ${range(s)}${s.times > 1 ? `, ${timesWord(s.times)}` : ''}`)
    .join('; ');
}

/** Where a match is and how: "the whole section, twice, started on vi", "bars 3–5". */
export function whereFound(m: ProgressionMatch): string {
  const parts = m.whole
    ? [
        'the whole section',
        m.spans[0]!.times > 1 ? timesWord(m.spans[0]!.times) : null,
        m.startsOn ? `started on ${prettyNumeral(m.startsOn)}` : null,
      ]
    : [placesWord(m.spans)];
  if (m.readIn) parts.push(`read in ${prettyAccidentals(keyName(m.readIn))}`);
  return parts.filter(Boolean).join(', ');
}

/**
 * The progressions to name for the whole chart, each once: those that start
 * where the section does. A loop found only started somewhere else is named
 * once, by the first name it has.
 */
export function songProgressions(sections: readonly SectionHarmony[]): ProgressionMatch[] {
  const out: ProgressionMatch[] = [];
  for (const s of sections) {
    const own = s.matches.filter((m) => !m.startsOn);
    const named = own.length ? own : s.matches.slice(0, 1);
    for (const m of named) if (!out.some((o) => o.id === m.id)) out.push(m);
  }
  return out;
}
