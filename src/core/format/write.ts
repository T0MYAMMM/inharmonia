import { formatBars } from '../charts/syntax';
import type { ChartView, ChordChart } from '../charts/types';
import type { ContentSource, Lesson, Progression } from '../content/types';
import type { UserRecording } from '../songs/library';
import {
  FORMAT,
  FORMAT_VERSION,
  type FileAsset,
  type FileItem,
  type InharmoniaFile,
} from './types';

/** Readable file name part for a title: "Sore di Taman" → "sore-di-taman". */
export function slugify(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'untitled'
  );
}

/** File name for an export: one item by kind and title, several by date. */
export function exportFileName(
  items: readonly Pick<FileItem, 'kind' | 'title'>[],
  now: Date,
): string {
  if (items.length === 1) return `inharmonia-${items[0]!.kind}-${slugify(items[0]!.title)}.json`;
  return `inharmonia-export-${now.toISOString().slice(0, 10)}.json`;
}

/** Source with its fields in a fixed order. */
function source(s: ContentSource): ContentSource {
  switch (s.kind) {
    case 'original':
      return s.author ? { kind: 'original', author: s.author } : { kind: 'original' };
    case 'public-domain':
      return { kind: 'public-domain', composer: s.composer, year: s.year };
    default:
      return { kind: s.kind };
  }
}

const iso = (ms: number | undefined) =>
  ms === undefined ? {} : { updated: new Date(ms).toISOString() };

/**
 * A song as a file item. Explicit voicings are written only when they were
 * chosen by hand (`voicings`); Studio songs have theirs worked out again on import.
 */
export function songItem(input: {
  id: string;
  source: ContentSource;
  lesson: Lesson;
  updatedAt?: number;
  voicings: boolean;
}): FileItem {
  const l = input.lesson;
  return {
    kind: 'song',
    id: input.id,
    title: l.title,
    source: source(input.source),
    ...iso(input.updatedAt),
    song: {
      key: { tonic: l.key.tonic, mode: l.key.mode },
      meter: { beats: l.meter.beats, unit: l.meter.unit },
      tempo: { default: l.tempo.default, min: l.tempo.min, max: l.tempo.max },
      lhPattern: l.lhPattern ?? 'arpeggio-8ths',
      ...(l.summary ? { summary: l.summary } : {}),
      bars: l.bars.map((b) => ({
        ...(b.section ? { section: b.section } : {}),
        chords: b.chords.map((c) => ({
          symbol: c.symbol,
          beats: c.beats,
          ...(input.voicings && c.voicing && 'notes' in c.voicing
            ? { voicing: [...c.voicing.notes] }
            : {}),
        })),
        melody: (b.rh ?? []).map((n) => ({
          note: n.note,
          beats: n.beats,
          ...(n.tie ? { tie: true as const } : {}),
        })),
      })),
    },
  };
}

/** A chord chart as a file item: the chart exactly as entered, and how it is viewed. */
export function chartItem(input: {
  id: string;
  source?: ContentSource;
  chart: ChordChart;
  view: ChartView;
  updatedAt?: number;
}): FileItem {
  const c = input.chart;
  return {
    kind: 'chart',
    id: input.id,
    title: c.title,
    source: source(input.source ?? { kind: 'user' }),
    ...iso(input.updatedAt),
    chart: {
      key: { tonic: c.key.tonic, mode: c.key.mode },
      tempo: c.tempo,
      meter: { beats: c.meter.beats, unit: c.meter.unit },
      sections: c.sections.map((s) => ({
        id: s.id,
        label: s.label,
        type: s.type,
        repeat: s.repeat,
        bars: s.bars.map((b) => formatBars([b], c.meter.beats).replace(/^\| | \|$/g, '')),
      })),
      form: [...c.form],
      notes: c.notes,
    },
    view: {
      transpose: input.view.transpose,
      simplify: input.view.simplify,
      style: input.view.style,
      showFunction: input.view.showFunction,
    },
  };
}

export function progressionItem(p: Progression): FileItem {
  return {
    kind: 'progression',
    id: p.id,
    title: p.name,
    source: source(p.source),
    progression: {
      mode: p.mode,
      meter: { beats: p.meter.beats, unit: p.meter.unit },
      steps: p.steps.map((s) => ({ numeral: s.numeral, beats: s.beats })),
      ...(p.description ? { description: p.description } : {}),
    },
  };
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK)
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** Little-endian bytes of a typed array, whatever the platform. */
function littleEndian(a: Int16Array | Float32Array): Uint8Array {
  const out = new Uint8Array(a.length * a.BYTES_PER_ELEMENT);
  const view = new DataView(out.buffer);
  // Tell the arrays apart by element size: instanceof fails across realms.
  if (a.BYTES_PER_ELEMENT === 2) a.forEach((v, i) => view.setInt16(i * 2, v, true));
  else a.forEach((v, i) => view.setFloat32(i * 4, v, true));
  return out;
}

export function recordingAsset(r: UserRecording): FileAsset {
  return {
    kind: 'recording',
    for: r.songId,
    sampleRate: r.sampleRate,
    beat0: r.beat0,
    traceStart: r.traceStart,
    traceHop: r.traceHop,
    traceShift: r.traceShift,
    samples: toBase64(littleEndian(r.samples)),
    trace: toBase64(littleEndian(r.trace)),
  };
}

/** The whole file: items first, recordings (if any) after them. */
export function buildFile(
  items: readonly FileItem[],
  assets: readonly FileAsset[],
  now: Date,
): InharmoniaFile {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: now.toISOString(),
    items: [...items],
    ...(assets.length ? { assets: [...assets] } : {}),
  };
}

/** Two-space JSON with keys in the order they were built, ending in a newline. */
export function stringifyFile(file: InharmoniaFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
