/** What a section does in the song, for logic; the label people see is kept as written. */
export type SectionType =
  | 'intro'
  | 'verse'
  | 'prechorus'
  | 'chorus'
  | 'postchorus'
  | 'bridge'
  | 'interlude'
  | 'solo'
  | 'hook'
  | 'breakdown'
  | 'tag'
  | 'outro'
  | 'custom';

/** Header words (lower case, spaces and hyphens removed) and the type each one means. */
const WORDS: Record<string, SectionType> = {
  intro: 'intro',
  int: 'intro',
  verse: 'verse',
  bait: 'verse',
  prechorus: 'prechorus',
  prereff: 'prechorus',
  preref: 'prechorus',
  chorus: 'chorus',
  reff: 'chorus',
  ref: 'chorus',
  refrain: 'chorus',
  postchorus: 'postchorus',
  bridge: 'bridge',
  interlude: 'interlude',
  musik: 'interlude',
  music: 'interlude',
  instrumental: 'interlude',
  solo: 'solo',
  hook: 'hook',
  breakdown: 'breakdown',
  tag: 'tag',
  outro: 'outro',
  ending: 'outro',
  coda: 'outro',
};

export const SECTION_NAMES: Record<SectionType, string> = {
  intro: 'Intro',
  verse: 'Verse',
  prechorus: 'Pre-chorus',
  chorus: 'Chorus',
  postchorus: 'Post-chorus',
  bridge: 'Bridge',
  interlude: 'Interlude',
  solo: 'Solo',
  hook: 'Hook',
  breakdown: 'Breakdown',
  tag: 'Tag',
  outro: 'Outro',
  custom: 'Section',
};

export const MAX_LABEL = 24;

export interface SectionHeader {
  /** As written, without brackets, colon or repeat mark: "Bait 2", "Pre Reff". */
  label: string;
  type: SectionType;
  /** "Reff 2x", "Chorus x2": play it this many times. */
  repeat: number;
  /** Anything after the colon on the same line ("Intro: | C | G |"). */
  rest: string;
}

const REPEAT = /(?:^|\s)(?:x\s?(\d)|(\d)\s?x)$/i;

/** The type for a label: "Bait 2" → verse, "Pre Reff" → prechorus; unknown words are custom. */
export function sectionTypeOf(label: string): SectionType {
  const word = label
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[\s.\-_]+/g, '');
  return WORDS[word] ?? 'custom';
}

/**
 * Read a section header line: "[Verse]", "Chorus:", "Reff 2x", "Bait 2", "(Intro)",
 * "Int.", "Pre-Reff:". Known words in any case, with an optional number, repeat
 * mark and colon. A label in square brackets can be anything (a custom section).
 * Returns null for anything else.
 */
export function parseHeader(line: string): SectionHeader | null {
  const t = line.trim();
  if (!t) return null;
  // [Anything] or (Known) on its own, optionally followed by a repeat mark.
  const bracket = /^\[([^\]]{1,40})\]\s*(x\s?\d|\d\s?x)?\s*:?\s*(.*)$/i.exec(t);
  const paren = /^\(([^)]{1,40})\)\s*:?\s*(.*)$/.exec(t);
  let inner: string;
  let rest: string;
  let tail = '';
  if (bracket) {
    inner = bracket[1]!.trim();
    tail = bracket[2] ?? '';
    rest = bracket[3] ?? '';
  } else if (paren) {
    inner = paren[1]!.trim();
    rest = paren[2] ?? '';
    if (sectionTypeOf(stripRepeat(inner).label) === 'custom') return null;
  } else {
    const colon = t.indexOf(':');
    inner = (colon >= 0 ? t.slice(0, colon) : t).trim();
    rest = colon >= 0 ? t.slice(colon + 1) : '';
    // Without brackets, only known words count, so a lyric line is never a header.
    if (inner.length > MAX_LABEL || sectionTypeOf(stripRepeat(inner).label) === 'custom')
      return null;
    if (!/^[\p{L}][\p{L}\s.\-_]*\d*\s*(?:x\s?\d|\d\s?x)?$/iu.test(inner)) return null;
  }
  const { label, repeat } = stripRepeat(`${inner} ${tail}`.trim());
  if (!label || label.length > MAX_LABEL) return null;
  return { label, type: sectionTypeOf(label), repeat, rest: rest.trim() };
}

function stripRepeat(s: string): { label: string; repeat: number } {
  const m = REPEAT.exec(s);
  if (!m) return { label: s.trim(), repeat: 1 };
  return { label: s.slice(0, m.index).trim(), repeat: Number(m[1] ?? m[2]) };
}
