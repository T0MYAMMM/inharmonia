import type { ChartView } from '../charts/types';
import type { SectionType } from '../charts/sections';
import type { ContentSource, Meter, SongLevel } from '../content/types';
import type { Mode } from '../theory';

/**
 * The Inharmonia file format, version 2: one readable envelope for songs,
 * chord charts and progressions. Values are what a musician reads (note names,
 * chord symbols, Roman numerals, beats); nothing derived (timelines, cached
 * voicings, MIDI numbers) is written. See docs/format/README.md.
 */
export const FORMAT = 'inharmonia';
export const FORMAT_VERSION = 2;

export type ItemKind = 'song' | 'chart' | 'progression';

export interface FileKey {
  tonic: string;
  mode: Mode;
}

export interface FileNote {
  /** "F#4", or "r" for a rest. */
  note: string;
  beats: number;
  /** Holds into the next note of the same hand. */
  tie?: true;
}

export interface FileSongBar {
  section?: string;
  chords: { symbol: string; beats: number; voicing?: string[] }[];
  /** Melody notes ("F#4") and rests ("r"); `tie` holds into the next note. */
  melody: FileNote[];
  /** Left-hand notes written out for this bar, in place of the figure or pattern. */
  left?: FileNote[];
}

/** One step of a left-hand figure: when, how long, and which chord voices. */
export interface FileFigureStep {
  at: number;
  /** Beats, or "chord" to hold until the chord changes. */
  dur: number | 'chord';
  /** Voicing indexes (0 = lowest, negative from the top), "all", "root" or "fifth". */
  voices: (number | 'all' | 'root' | 'fifth')[];
  accent?: true;
}

/** A piece's own left-hand figure, applied to each chord like a pattern. */
export interface FileFigure {
  name: string;
  cycleBeats: number;
  steps: FileFigureStep[];
}

export interface FileSong {
  key: FileKey;
  meter: Meter;
  tempo: { default: number; min: number; max: number };
  lhPattern: string;
  /** Used instead of `lhPattern` when present. */
  lhFigure?: FileFigure;
  /** Library pieces: the piece this is a version of, and which version. */
  piece?: string;
  level?: SongLevel;
  /** Which part of the original it covers ("bars 1–16"). */
  covers?: string;
  summary?: string;
  bars: FileSongBar[];
}

export interface FileChartSection {
  id: string;
  label: string;
  type: SectionType;
  repeat: number;
  /** One bar per string in chart syntax: "C", "Am F", "C . . G", "N.C.". */
  bars: string[];
}

export interface FileChart {
  key: FileKey;
  tempo: number;
  meter: Meter;
  sections: FileChartSection[];
  form: string[];
  notes: string;
}

export interface FileProgression {
  mode: Mode;
  meter: Meter;
  steps: { numeral: string; beats: number }[];
  description?: string;
}

interface ItemBase {
  id: string;
  title: string;
  source: ContentSource;
  /** When it was last changed, ISO 8601 (your own songs and charts). */
  updated?: string;
}

export type FileItem =
  | (ItemBase & { kind: 'song'; song: FileSong })
  | (ItemBase & { kind: 'chart'; chart: FileChart; view: ChartView })
  | (ItemBase & { kind: 'progression'; progression: FileProgression });

/** A kept Studio recording, only when asked for; base64, after the music. */
export interface FileAsset {
  kind: 'recording';
  /** The song item it belongs to. */
  for: string;
  sampleRate: number;
  beat0: number;
  traceStart: number;
  traceHop: number;
  traceShift: number;
  /** Mono 16-bit little-endian PCM, base64. */
  samples: string;
  /** Float32 little-endian pitch trace (NaN where unvoiced), base64. */
  trace: string;
}

export interface InharmoniaFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  items: FileItem[];
  assets?: FileAsset[];
}

export const FILE_LIMITS = {
  /** Characters in a file (recordings make files large). */
  bytes: 64 * 1024 * 1024,
  items: 500,
  songBars: 64,
  title: 80,
  summary: 140,
} as const;
