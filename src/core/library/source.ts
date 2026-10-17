import { normalizeChord } from '../charts/symbols';
import {
  NO_CHORD,
  SONG_METERS,
  meterName,
  songMeter,
  type ChordSpec,
  type NoteSpec,
  type PatternSpec,
  type PatternVoice,
} from '../content/types';
import { isValidChord, spelled, type Mode } from '../theory';

/**
 * The compact source format for library pieces (`*.piece`), documented in
 * docs/format/source.md. A piece is written once, as in the edition it comes
 * from; the generator turns it into Easy, Medium and Advanced versions.
 */

export interface PieceSourceMeta {
  title: string;
  piece: string;
  /** The day the piece was added ("2026-10-17"); the generated file's date. */
  added: string;
  source:
    | { kind: 'original'; author: string }
    | {
        kind: 'public-domain';
        composer: string;
        composerDied: number | null;
        firstPublished: number;
        edition: string;
        editor?: { name: string; died: number | null; additionsUsed: boolean };
        contributors: { role: string; name: string; died: number }[];
      };
  key: { tonic: string; mode: Mode };
  meter: { beats: number; unit: number };
  tempo: number;
  summary?: string;
  /** Advanced left hand: an app pattern id, or the piece's own figure. */
  figure: string | PatternSpec;
  /** Medium left hand, an app pattern id (default by meter). */
  mediumFigure?: string;
  /** Easy key, when the nearest easy key is not the right one. */
  easyKey?: string;
  /** Bars of the main sections (1-based, counted over those sections) that Easy keeps as written. */
  easyKeep: number[];
}

export interface SourceBar {
  chords: ChordSpec[];
  melody: NoteSpec[];
  /** Left hand written out, for Advanced. */
  left?: NoteSpec[];
}

export interface SourceSection {
  label: string;
  /** Part of the main theme: Easy and Medium play only these. */
  main: boolean;
  /** Bar numbers in the original ("1-16"), for the "covers" line. */
  original?: string;
  bars: SourceBar[];
}

export interface PieceSource {
  meta: PieceSourceMeta;
  sections: SourceSection[];
}

export class SourceError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(`Line ${line}: ${message}`);
  }
}

const DURATIONS: Record<string, number> = { w: 16, h: 8, q: 4, e: 2, s: 1, t: 0.5 };

/** Length of a duration code in beats of the meter: "q" in 4/4 is 1, "e." in 3/8 is 1.5. */
export function durationBeats(code: string, unit: number): number | null {
  const m = /^([whqest])(\.{0,2})(3?)$/.exec(code);
  if (!m) return null;
  // In sixteenths, then beats: a beat is 16/unit sixteenths long.
  let len = DURATIONS[m[1]!]!;
  let add = len;
  for (let i = 0; i < m[2]!.length; i++) {
    add /= 2;
    len += add;
  }
  if (m[3]) len = (len * 2) / 3;
  return len / (16 / unit);
}

const NOTE_TOKEN = /^(r|[A-G](?:##|bb|#|b)?-?\d)((?:[whqest]\.{0,2}3?)|:\d+(?:\.\d+)?)?(~?)$/;

/** A melody or left-hand line: bars split by "|", notes like "F#4q", "Bb3e.", "r", "C5h~". */
export function parseNotes(text: string, unit: number, line: number): NoteSpec[][] {
  const bars: NoteSpec[][] = [];
  let beats = 1;
  for (const cell of splitBars(text)) {
    const notes: NoteSpec[] = [];
    for (const tok of cell.split(/\s+/).filter(Boolean)) {
      const m = NOTE_TOKEN.exec(tok);
      if (!m) throw new SourceError(line, `"${tok}" is not a note (try C4q, F#4e., r, C5h~)`);
      if (m[2]) {
        const b = m[2].startsWith(':') ? Number(m[2].slice(1)) : durationBeats(m[2], unit);
        if (b === null || !(b > 0)) throw new SourceError(line, `"${tok}": unknown length`);
        beats = b;
      }
      if (m[1] !== 'r') {
        try {
          spelled(m[1]!);
        } catch {
          throw new SourceError(line, `"${tok}" is not a note`);
        }
      }
      notes.push({ note: m[1]!, beats, ...(m[3] ? { tie: true } : {}) });
    }
    bars.push(notes);
  }
  return bars;
}

/** A chord line: bars split by "|", chords split evenly unless given ":beats"; "%" repeats a bar. */
export function parseChords(text: string, beatsPerBar: number, line: number): ChordSpec[][] {
  const bars: ChordSpec[][] = [];
  for (const cell of splitBars(text)) {
    if (cell.trim() === '%') {
      const prev = bars.at(-1);
      if (!prev) throw new SourceError(line, '"%" with no bar before it');
      bars.push(prev.map((c) => ({ ...c })));
      continue;
    }
    const toks = cell.split(/\s+/).filter(Boolean);
    if (toks.length === 0 || toks.length > 4)
      throw new SourceError(line, `a bar needs 1 to 4 chords, not "${cell.trim()}"`);
    const parsed = toks.map((tok) => {
      const [sym, len] = tok.split(':');
      const symbol = normalizeChord(sym!);
      if (!symbol || (symbol !== NO_CHORD && !isValidChord(symbol)))
        throw new SourceError(line, `"${sym}" is not a chord`);
      return { symbol, beats: len === undefined ? null : Number(len) };
    });
    const given = parsed.reduce((s, c) => s + (c.beats ?? 0), 0);
    const open = parsed.filter((c) => c.beats === null).length;
    const share = open ? (beatsPerBar - given) / open : 0;
    const chords = parsed.map((c) => ({ symbol: c.symbol, beats: c.beats ?? share }));
    if (
      chords.some((c) => !(c.beats > 0)) ||
      Math.abs(chords.reduce((s, c) => s + c.beats, 0) - beatsPerBar) > 1e-9
    )
      throw new SourceError(line, `chords in "${cell.trim()}" do not fill ${beatsPerBar} beats`);
    bars.push(chords);
  }
  return bars;
}

function splitBars(text: string): string[] {
  const t = text.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) throw new Error('Bars start and end with "|"');
  return t.slice(1, -1).split('|');
}

const num = (s: string, line: number, what: string) => {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new SourceError(line, `${what} should be a number, not "${s}"`);
  return n;
};

/** "Alberti | cycle 2 | 0 .5 0! | .5 .5 -1 | 1 .5 1 | 1.5 .5 -1": steps of "at length voices[!]". */
export function parseFigure(text: string, line: number): PatternSpec {
  const parts = text.split('|').map((p) => p.trim());
  const [name, cycle, ...rest] = parts;
  const c = /^cycle\s+(\S+)$/.exec(cycle ?? '');
  if (!name || !c || rest.length === 0)
    throw new SourceError(line, 'a figure is "Name | cycle <beats> | <at> <length> <voices> | …"');
  const steps = rest.map((s) => {
    const [at, dur, voices, ...extra] = s.split(/\s+/);
    if (!at || !dur || !voices || extra.length)
      throw new SourceError(line, `figure step "${s}" should be "<at> <length> <voices>"`);
    const accent = voices.endsWith('!');
    const list = (accent ? voices.slice(0, -1) : voices).split(',').map((v): PatternVoice => {
      if (v === 'all' || v === 'root' || v === 'fifth') return v;
      const n = Number(v);
      if (!Number.isInteger(n)) throw new SourceError(line, `figure voice "${v}" is not known`);
      return n;
    });
    return {
      at: num(at, line, 'a step start'),
      dur: dur === 'chord' ? ('chord' as const) : num(dur, line, 'a step length'),
      voices: list,
      ...(accent ? { accent: true } : {}),
    };
  });
  return { id: 'figure', name, cycleBeats: num(c[1]!, line, 'the cycle'), steps };
}

const REQUIRED = ['title', 'piece', 'added', 'source', 'key', 'meter', 'tempo', 'figure'] as const;

/** Read a `.piece` source. Throws a SourceError naming the line on the first problem. */
export function parsePiece(text: string): PieceSource {
  const head = new Map<string, { value: string; line: number }>();
  const contributors: { value: string; line: number }[] = [];
  const sections: SourceSection[] = [];
  type Pending = { key: 'melody' | 'chords' | 'left'; text: string; line: number };
  type RawSection = {
    label: string;
    main: boolean;
    original?: string;
    line: number;
    lines: Pending[];
  };
  let current: RawSection | null = null;
  const raw: RawSection[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((full, i) => {
    const line = i + 1;
    // Only whole lines are comments: "#" also appears in values ("IMSLP #23019").
    const body = full.replace(/^\s*#.*$/, '').trimEnd();
    if (!body.trim()) return;
    const sec = /^\[([^\]]{1,24})\](.*)$/.exec(body.trim());
    if (sec) {
      const flags = sec[2]!.trim().split(/\s+/).filter(Boolean);
      const main = flags.includes('main');
      const original = flags.find((f) => /^\d+(-\d+)?$/.test(f));
      for (const f of flags)
        if (f !== 'main' && f !== original)
          throw new SourceError(
            line,
            `unknown section flag "${f}" (use "main" and bar numbers like 1-16)`,
          );
      current = { label: sec[1]!.trim(), main, ...(original ? { original } : {}), line, lines: [] };
      raw.push(current);
      return;
    }
    if (/^\s/.test(full) || body.trim().startsWith('|')) {
      const last = current?.lines.at(-1);
      if (!last)
        throw new SourceError(
          line,
          'a continued line needs "melody:", "chords:" or "left:" before it',
        );
      // "| A | B |" then "| C |" on the next line share one bar line.
      last.text = body.trim().startsWith('|')
        ? `${last.text.replace(/\|\s*$/, '')} ${body.trim()}`
        : `${last.text} ${body.trim()}`;
      return;
    }
    const kv = /^([a-z-]+):\s*(.*)$/.exec(body);
    if (!kv)
      throw new SourceError(line, `expected "name: value" or a [Section], not "${body.trim()}"`);
    const [, k, v] = kv as unknown as [string, string, string];
    if (current) {
      if (k !== 'melody' && k !== 'chords' && k !== 'left')
        throw new SourceError(line, `in a section, use melody:, chords: or left:, not ${k}:`);
      current.lines.push({ key: k, text: v, line });
      return;
    }
    if (k === 'contributor') contributors.push({ value: v, line });
    else if (head.has(k)) throw new SourceError(line, `"${k}" is given twice`);
    else head.set(k, { value: v.trim(), line });
  });

  for (const k of REQUIRED) if (!head.get(k)?.value) throw new SourceError(1, `missing "${k}:"`);
  const get = (k: string) => head.get(k)?.value;
  const at = (k: string) => head.get(k)?.line ?? 1;

  const meterM = /^(\d+)\/(\d+)$/.exec(get('meter')!);
  const found = meterM ? songMeter(Number(meterM[1]), Number(meterM[2])) : undefined;
  if (!found)
    throw new SourceError(at('meter'), `meter must be ${SONG_METERS.map(meterName).join(', ')}`);
  const meter = { ...found };
  const keyM = /^([A-G](?:#|b)?)\s+(major|minor)$/.exec(get('key')!);
  if (!keyM) throw new SourceError(at('key'), 'key is like "G major" or "A minor"');
  const piece = get('piece')!;
  if (!/^[a-z0-9-]{1,60}$/.test(piece))
    throw new SourceError(at('piece'), 'piece is a short id: lowercase letters, digits, dashes');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(get('added')!))
    throw new SourceError(at('added'), 'added is a date like 2026-10-17');

  const editorOf = () => {
    const died = get('editor-died');
    if (!died)
      throw new SourceError(at('editor'), 'an editor needs "editor-died:" (a year, or unknown)');
    const additions = get('editor-additions') ?? 'not used';
    if (additions !== 'used' && additions !== 'not used')
      throw new SourceError(at('editor-additions'), 'editor-additions is "used" or "not used"');
    return {
      name: get('editor')!,
      died: died === 'unknown' ? null : num(died, at('editor-died'), 'editor-died'),
      additionsUsed: additions === 'used',
    };
  };
  let source: PieceSourceMeta['source'];
  if (get('source') === 'original') {
    source = { kind: 'original', author: get('author') ?? 'Inharmonia' };
  } else if (get('source') === 'public-domain') {
    for (const k of ['composer', 'composer-died', 'first-published', 'edition'])
      if (!get(k)) throw new SourceError(at('source'), `a public-domain piece needs "${k}:"`);
    const died = get('composer-died')!;
    source = {
      kind: 'public-domain',
      composer: get('composer')!,
      composerDied: died === 'unknown' ? null : num(died, at('composer-died'), 'composer-died'),
      firstPublished: num(get('first-published')!, at('first-published'), 'first-published'),
      edition: get('edition')!,
      ...(get('editor') ? { editor: editorOf() } : {}),
      contributors: contributors.map(({ value, line }) => {
        const [role, name, d] = value.split(';').map((s) => s.trim());
        if (!role || !name || !d)
          throw new SourceError(line, 'contributor is "role; name; year of death"');
        return { role, name, died: num(d, line, 'a year of death') };
      }),
    };
  } else throw new SourceError(at('source'), 'source is "original" or "public-domain"');

  const fig = get('figure')!;
  const figure = fig.includes('|') ? parseFigure(fig, at('figure')) : fig;
  const easyKeep = (get('easy-keep') ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => num(s, at('easy-keep'), 'an easy-keep bar'));

  for (const r of raw) {
    const find = (k: Pending['key']) => r.lines.find((l) => l.key === k);
    const mel = find('melody');
    const ch = find('chords');
    if (!mel || !ch) throw new SourceError(r.line, `[${r.label}] needs melody: and chords:`);
    const wrap = <T>(p: Pending, fn: () => T): T => {
      try {
        return fn();
      } catch (e) {
        if (e instanceof SourceError) throw e;
        throw new SourceError(p.line, (e as Error).message);
      }
    };
    const melody = wrap(mel, () => parseNotes(mel.text, meter.unit, mel.line));
    const chords = wrap(ch, () => parseChords(ch.text, meter.beats, ch.line));
    const leftP = find('left');
    const left = leftP ? wrap(leftP, () => parseNotes(leftP.text, meter.unit, leftP.line)) : null;
    if (chords.length !== melody.length)
      throw new SourceError(
        ch.line,
        `[${r.label}] has ${melody.length} melody bars but ${chords.length} chord bars`,
      );
    if (left && left.length !== melody.length)
      throw new SourceError(
        leftP!.line,
        `[${r.label}] has ${melody.length} melody bars but ${left.length} left-hand bars`,
      );
    const sum = (xs: NoteSpec[]) => xs.reduce((s, n) => s + n.beats, 0);
    melody.forEach((m, bi) => {
      if (Math.abs(sum(m) - meter.beats) > 1e-6)
        throw new SourceError(
          mel.line,
          `[${r.label}] bar ${bi + 1}: melody lasts ${sum(m)} beats, not ${meter.beats}`,
        );
      if (left && Math.abs(sum(left[bi]!) - meter.beats) > 1e-6)
        throw new SourceError(
          leftP!.line,
          `[${r.label}] bar ${bi + 1}: left hand lasts ${sum(left[bi]!)} beats, not ${meter.beats}`,
        );
    });
    sections.push({
      label: r.label,
      main: r.main,
      ...(r.original ? { original: r.original } : {}),
      bars: melody.map((m, bi) => ({
        chords: chords[bi]!,
        melody: m,
        ...(left ? { left: left[bi]! } : {}),
      })),
    });
  }
  if (sections.length === 0) throw new SourceError(lines.length, 'add at least one [Section]');
  if (!sections.some((s) => s.main))
    throw new SourceError(1, 'mark the main theme with "main" on its [Section]');

  return {
    meta: {
      title: get('title')!,
      piece,
      added: get('added')!,
      source,
      key: { tonic: keyM[1]!, mode: keyM[2] as Mode },
      meter,
      tempo: num(get('tempo')!, at('tempo'), 'tempo'),
      ...(get('summary') ? { summary: get('summary')! } : {}),
      figure,
      ...(get('medium-figure') ? { mediumFigure: get('medium-figure')! } : {}),
      ...(get('easy-key') ? { easyKey: get('easy-key')! } : {}),
      easyKeep,
    },
    sections,
  };
}
