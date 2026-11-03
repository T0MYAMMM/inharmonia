/**
 * Turns your own chord charts into one Inharmonia file, with the app's own
 * readers, so chord-align reads a pasted sheet exactly as the app's Paste does:
 *
 * - a chord sheet as `.txt` (chords over lyrics, inline [C] chords, or bar
 *   lines), read with `parseSheet` and `sheetToChart`, each line's lengths
 *   estimated from the lyrics under it;
 * - a research JSON: a `chart` string in chart syntax (bar lines go through
 *   `parseBars`), plus `title`, `artist`, `originalKey`, `meter` and `bpm`.
 *
 * Lyrics are dropped as they are read: the file holds chords, section names
 * and form only. On stdout, one line of JSON says which chart came from which
 * file, and which files were skipped and why.
 *
 *     npx tsx --tsconfig tsconfig.app.json tools/chord-align/to-file.ts out.json sheet.txt song.json [...]
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { parseSheet, sheetToChart } from '../../src/core/charts/paste';
import { suggestKeys } from '../../src/core/charts/key';
import { DEFAULT_VIEW, emptyChart, LIMITS, type ChordChart } from '../../src/core/charts/types';
import { MAJOR_KEYS, MINOR_KEYS } from '../../src/core/content/realize';
import { buildFile, chartItem, slugify, stringifyFile } from '../../src/core/format/write';
import type { FileItem } from '../../src/core/format/types';

/** Larger than any chord sheet: refuse it before reading. */
const MAX_BYTES = 1024 * 1024;
/** A research chart with no bpm: 90, as pm/chords/to-inharmonia.ts has always made it. */
const RESEARCH_TEMPO = 90;

interface ResearchSong {
  title?: unknown;
  artist?: unknown;
  originalKey?: unknown;
  meter?: unknown;
  bpm?: unknown;
  chart?: unknown;
}

interface Read {
  source: string;
  id: string;
  title: string;
  artist: string | null;
}

type Key = ChordChart['key'];

const TONIC = /^([A-G](?:#|b)?)/;
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pitchClass = (n: string): number =>
  (PC[n[0]!]! + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0) + 12) % 12;

/** The app's own spelling of a key (D# minor → Eb minor, Gb major → F#). */
function spellKey(tonic: string, mode: Key['mode']): string {
  const allowed: readonly string[] = mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
  if (allowed.includes(tonic)) return tonic;
  return allowed.find((k) => pitchClass(k) === pitchClass(tonic)) ?? tonic;
}

/** "C# minor (sheet key…)" → C# minor; null when the text names no key. */
function keyOf(text: unknown): Key | null {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  const m = TONIC.exec(t);
  if (!m) return null;
  const rest = t.slice(m[1]!.length).trim().toLowerCase();
  const mode =
    rest.startsWith('m') && !rest.startsWith('maj') && !rest.startsWith('mix') ? 'minor' : 'major';
  return { tonic: spellKey(m[1]!, mode), mode };
}

/** The best key for the chords, as the chart editor suggests it; C major if none fits. */
function guessKey(sections: ChordChart['sections']): Key {
  const best = suggestKeys(sections)[0];
  return best ? { tonic: best.tonic, mode: best.mode } : { tonic: 'C', mode: 'major' };
}

const text = (x: unknown, max: number): string | null =>
  typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null;

/** A chart from sheet text: sections and form by the app's Paste reader, lyrics dropped. */
function chartFrom(sheet: string, beats: 3 | 4, title: string): ChordChart | null {
  const parsed = parseSheet(sheet, beats);
  const { sections, form } = sheetToChart(parsed, { beatsPerBar: beats });
  if (sections.every((s) => s.bars.length === 0)) return null;
  return {
    ...emptyChart(title),
    meter: { beats, unit: 4 },
    sections,
    form,
    key: guessKey(sections),
  };
}

function fromResearch(raw: string): { chart: ChordChart; artist: string | null } | string {
  let song: ResearchSong;
  try {
    song = JSON.parse(raw) as ResearchSong;
  } catch {
    return 'not JSON';
  }
  if (typeof song !== 'object' || song === null) return 'not a research chart';
  const name = text(song.title, LIMITS.title);
  if (typeof song.chart !== 'string' || !name) return 'no chart or no title';
  const artist = text(song.artist, LIMITS.title);
  const beats = typeof song.meter === 'string' && song.meter.startsWith('3/') ? 3 : 4;
  // The chart's title as Paste would name it: "Laskar Pelangi (Nidji)".
  const title = (artist ? `${name} (${artist})` : name).slice(0, LIMITS.title);
  const chart = chartFrom(song.chart, beats, title);
  if (!chart) return 'no bars';
  const bpm = song.bpm;
  return {
    chart: {
      ...chart,
      key: keyOf(song.originalKey) ?? chart.key,
      tempo: typeof bpm === 'number' && bpm >= 30 && bpm <= 240 ? Math.round(bpm) : RESEARCH_TEMPO,
    },
    artist,
  };
}

function main(): void {
  const [outPath, ...inputs] = process.argv.slice(2);
  if (!outPath || inputs.length === 0) {
    console.error('usage: to-file.ts <out.json> <sheet.txt | research.json> [...]');
    process.exit(2);
  }
  const items: FileItem[] = [];
  const read: Read[] = [];
  const skipped: { source: string; reason: string }[] = [];
  const ids = new Set<string>();
  for (const file of inputs) {
    if (statSync(file).size > MAX_BYTES) {
      skipped.push({ source: file, reason: 'too large to be a chord sheet' });
      continue;
    }
    const raw = readFileSync(file, 'utf8');
    const sheet = extname(file).toLowerCase() === '.txt';
    let chart: ChordChart;
    let artist: string | null = null;
    if (sheet) {
      const title = basename(file, extname(file)).trim().slice(0, LIMITS.title) || 'Untitled';
      const got = chartFrom(raw, 4, title);
      if (!got) {
        skipped.push({ source: file, reason: 'no chords found' });
        continue;
      }
      chart = got;
    } else {
      const got = fromResearch(raw);
      if (typeof got === 'string') {
        skipped.push({ source: file, reason: got });
        continue;
      }
      ({ chart, artist } = got);
    }
    const base = `${sheet ? 'sheet' : 'research'}-${slugify(chart.title)}`;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    // Lyrics stay out: none were kept by the reader, and the item is written without them.
    items.push(chartItem({ id, chart, view: DEFAULT_VIEW, lyrics: false }));
    const name =
      artist && chart.title.endsWith(` (${artist})`)
        ? chart.title.slice(0, -artist.length - 3)
        : chart.title;
    read.push({ source: file, id, title: name, artist });
  }
  if (items.length) writeFileSync(outPath, stringifyFile(buildFile(items, [], new Date())));
  console.log(JSON.stringify({ items: read, skipped }));
  // exitCode, not exit(): exit() can cut a long stdout short when it is a pipe.
  process.exitCode = items.length ? 0 : 1;
}

main();
