import { describe, expect, it } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { compileLesson, validateLesson } from '../content/compile';
import { voiceChord } from '../theory';
import {
  CHART_STYLES,
  chartToLesson,
  chordComplexity,
  chordId,
  cleanView,
  DEFAULT_VIEW,
  describeChange,
  easierKeys,
  emptyChart,
  isKnownEntry,
  KNOWN_RULE,
  nearestShift,
  NO_CHORD,
  playedChords,
  rankKeys,
  RH_RANGE,
  shiftLabel,
  simplifyChord,
  transposeChord,
  transposeKey,
  withPlay,
  type ChartView,
  type ChordChart,
  type SimplifyLevel,
} from '.';

// Every progression here is invented for the tests.
const bar = (...symbols: string[]) => ({
  chords: symbols.map((symbol) => ({ symbol, beats: 4 / symbols.length })),
});

const chartOf = (
  tonic: string,
  rows: string[][],
  mode: 'major' | 'minor' = 'major',
): ChordChart => ({
  ...emptyChart('Invented'),
  key: { tonic, mode },
  sections: [
    { id: 's', label: 'Verse', type: 'verse', repeat: 1, bars: rows.map((r) => bar(...r)) },
  ],
  form: ['s'],
});

const view = (patch: Partial<ChartView> = {}): ChartView => ({ ...DEFAULT_VIEW, ...patch });

describe('simplify levels', () => {
  const cases: [string, string, string][] = [
    // symbol, Simplified, Basic
    ['Cmaj9', 'Cmaj7', 'C'],
    ['Dm11', 'Dm7', 'Dm'],
    ['G13', 'G7', 'G'],
    ['G7#9', 'G7', 'G'],
    ['Fadd9', 'F', 'F'],
    ['F69', 'F6', 'F'],
    ['Asus4', 'A', 'A'],
    ['Esus2', 'E', 'E'],
    ['D7sus4', 'D7', 'D'],
    ['Bm7b5', 'Bm7b5', 'Bdim'],
    ['C#dim7', 'C#dim7', 'C#dim'],
    ['Bdim', 'Bdim', 'Bdim'],
    ['Ebaug', 'Ebaug', 'Ebaug'],
    ['Am7', 'Am7', 'Am'],
    ['CM7', 'CM7', 'C'],
    ['Bbm', 'Bbm', 'Bbm'],
  ];
  it.each(cases)('%s → %s → %s', (symbol, simplified, basic) => {
    expect(simplifyChord(symbol, 'original')).toEqual({ symbol });
    expect(simplifyChord(symbol, 'simplified')).toEqual({ symbol: simplified });
    expect(simplifyChord(symbol, 'basic')).toEqual({ symbol: basic });
  });

  it('keeps the slash bass for the left hand at Simplified and drops it at Basic', () => {
    expect(simplifyChord('G/B', 'simplified')).toEqual({ symbol: 'G', bass: 'B' });
    expect(simplifyChord('Am7/G', 'simplified')).toEqual({ symbol: 'Am7', bass: 'G' });
    expect(simplifyChord('Fmaj9/A', 'simplified')).toEqual({ symbol: 'Fmaj7', bass: 'A' });
    expect(simplifyChord('G/B', 'basic')).toEqual({ symbol: 'G' });
    expect(simplifyChord('C/C', 'simplified')).toEqual({ symbol: 'C' });
  });

  it('leaves N.C. alone and never makes a chord more complex', () => {
    expect(simplifyChord(NO_CHORD, 'basic')).toEqual({ symbol: NO_CHORD });
    for (const s of ['C', 'Cm7', 'G13', 'Fadd9', 'Bm7b5', 'D/F#', 'Esus4', 'A7#5'])
      for (const level of ['simplified', 'basic'] as SimplifyLevel[])
        expect(chordComplexity(simplifyChord(s, level).symbol)).toBeLessThanOrEqual(
          chordComplexity(s),
        );
  });
});

describe('transposing', () => {
  it('spells chords for the new key, by function', () => {
    const up = (symbols: string[], to: string, from = 'C') =>
      symbols.map((s) => transposeChord(s, from, to)).join(' ');
    expect(up(['C', 'G/B', 'Am', 'F', 'Bb', 'E7'], 'Eb')).toBe('Eb Bb/D Cm Ab Db G7');
    expect(up(['C', 'F', 'G7', 'Dm7'], 'F#')).toBe('F# B C#7 G#m7');
    expect(up(['C', 'F', 'G7'], 'Gb')).toBe('Gb Cb Db7');
    expect(up(['C', 'Ab', 'Bb'], 'Eb')).toBe('Eb B Db');
    expect(up(['E', 'B', 'C#m', 'A'], 'C', 'E')).toBe('C G Am F');
    expect(transposeChord('Am', 'A', 'F#', 'minor')).toBe('F#m');
    expect(transposeChord(NO_CHORD, 'C', 'D')).toBe(NO_CHORD);
  });

  it('names keys the usual way and labels the move', () => {
    expect(transposeKey({ tonic: 'C', mode: 'major' }, 3)).toEqual({ tonic: 'Eb', mode: 'major' });
    expect(transposeKey({ tonic: 'C', mode: 'major' }, -1)).toEqual({ tonic: 'B', mode: 'major' });
    expect(transposeKey({ tonic: 'A', mode: 'minor' }, 1)).toEqual({ tonic: 'Bb', mode: 'minor' });
    expect(transposeKey({ tonic: 'E', mode: 'minor' }, 4)).toEqual({ tonic: 'G#', mode: 'minor' });
    expect(shiftLabel(-3)).toBe('3 semitones lower');
    expect(shiftLabel(1)).toBe('1 semitone higher');
    expect(shiftLabel(0)).toBe('original key');
    expect([7, -7, 6, 12, -1].map(nearestShift)).toEqual([-5, 5, -6, 0, -1]);
  });
});

describe('the chart as the view plays it', () => {
  const song = chartOf('C', [['C'], ['G/B'], ['Am7', 'Fmaj9'], [NO_CHORD], ['Dm7', 'G7sus4']]);

  it('transposes and simplifies without touching the chart', () => {
    const before = JSON.stringify(song);
    const played = playedChords(song, view({ transpose: 2, simplify: 'simplified' })).flat();
    expect(played.map((c) => c.symbol)).toEqual(['D', 'A', 'Bm7', 'Gmaj7', NO_CHORD, 'Em7', 'A7']);
    expect(played[1]).toMatchObject({ original: 'A/C#', bass: 'C#' });
    expect(played[3]).toMatchObject({ original: 'Gmaj9' });
    expect(played[0]!.original).toBeUndefined();
    expect(JSON.stringify(song)).toBe(before);
  });

  it('keeps the right hand around middle C and moves it little', () => {
    const long = chartOf('C', [
      ['C'],
      ['Am'],
      ['F'],
      ['G'],
      ['Em'],
      ['A7'],
      ['Dm7'],
      ['G7'],
      ['E/G#'],
      ['Am'],
      ['D7/F#'],
      ['G'],
    ]);
    for (const t of [-6, -2, 0, 3, 5]) {
      const played = playedChords(long, view({ transpose: t })).flat();
      for (const c of played)
        for (const n of c.voicing) {
          expect(n.midi).toBeGreaterThanOrEqual(RH_RANGE[0]);
          expect(n.midi).toBeLessThanOrEqual(RH_RANGE[1]);
        }
      for (let i = 1; i < played.length; i++) {
        const change = describeChange(played[i - 1]!.voicing, played[i]!.voicing);
        expect(change.moves.every((m) => Math.abs(m.semitones) <= 5)).toBe(true);
      }
    }
  });

  it('plays a simplified slash chord over its bass in the left hand', () => {
    const lesson = chartToLesson('t', song, view({ simplify: 'simplified', style: 'triad-root' }));
    expect(lesson.bars[1]!.chords[0]).toMatchObject({ symbol: 'G', bass: 'B', original: 'G/B' });
    const lowest = (l: typeof lesson) =>
      Math.min(...compileLesson(l, PATTERNS).bars[1]!.lh.map((n) => n.note!.midi)) % 12;
    expect(lowest(lesson)).toBe(11);
    expect(lowest(chartToLesson('t', song, view({ simplify: 'basic' })))).toBe(7);
  });

  it('compiles in every style, level and key', () => {
    const minor = chartOf('A', [['Am'], ['Dm7'], ['E7'], ['Fmaj7', 'G/B']], 'minor');
    for (const c of [song, minor])
      for (const style of CHART_STYLES.map((s) => s.id))
        for (const simplify of ['original', 'simplified', 'basic'] as SimplifyLevel[])
          for (const transpose of [-5, 0, 4]) {
            const lesson = chartToLesson('t', c, view({ style, simplify, transpose }));
            expect(validateLesson(lesson)).toEqual([]);
            expect(() => compileLesson(lesson, PATTERNS)).not.toThrow();
          }
  });

  it('numbers chords in the new key', () => {
    const lesson = chartToLesson('t', song, view({ transpose: 5 }));
    expect(lesson.key).toEqual({ tonic: 'F', mode: 'major' });
    expect(lesson.bars.map((b) => b.chords[0]!.numeral ?? '-')).toEqual([
      'I',
      'V⁶',
      'vi7',
      '-',
      'ii7',
    ]);
  });

  it('accepts only the chart styles in a view', () => {
    expect(cleanView({ style: 'bossa' }).style).toBe('triad-root');
    expect(cleanView({ style: 'held' }).style).toBe('held');
    expect(CHART_STYLES.every((s) => PATTERNS[s.id])).toBe(true);
  });
});

describe('voicing changes in words', () => {
  const v = (s: string, inversion = 0) => voiceChord(s, { inversion, floor: 'C4' });

  it('says what stays and what moves', () => {
    expect(describeChange(v('C'), v('F', 2)).text).toBe(
      'keep C, move E up 1 semitone to F and G up 2 semitones to A',
    );
    expect(describeChange(v('C'), v('Am', 1)).text).toBe(
      'keep C and E, move G up 2 semitones to A',
    );
    expect(describeChange(v('C'), v('C')).text).toBe('same notes: hold them');
  });

  it('adds and lifts notes when the size changes', () => {
    const change = describeChange(v('C'), v('C7'));
    expect(change.stays.map((n) => n.name)).toEqual(['C4', 'E4', 'G4']);
    expect(change.adds.map((n) => n.name)).toEqual(['Bb4']);
    expect(change.text).toBe('keep C, E and G, add Bb');
    const back = describeChange(v('C7'), v('C'));
    expect(back.lifts.map((n) => n.name)).toEqual(['Bb4']);
  });
});

describe('known chords', () => {
  it('gives spellings of one chord one id', () => {
    expect(chordId('A#m7')).toBe(chordId('Bbm7'));
    expect(chordId('CM7')).toBe(chordId('Cmaj7'));
    expect(chordId('D/F#')).toBe(chordId('D'));
    expect(chordId('Gb')).toBe('F#');
    expect(chordId(NO_CHORD)).toBeNull();
    expect(chordId('Hx')).toBeNull();
  });

  it('needs 3 clean plays over 2 days, and a manual mark always wins', () => {
    let e = withPlay(undefined, '2026-01-01');
    e = withPlay(e, '2026-01-01');
    e = withPlay(e, '2026-01-01');
    expect(isKnownEntry(e)).toBe(false);
    e = withPlay(e, '2026-01-02');
    expect(isKnownEntry(e)).toBe(true);
    expect(isKnownEntry({ ...e, manual: false })).toBe(false);
    expect(isKnownEntry({ manual: true, plays: [] })).toBe(true);
    expect(withPlay({ manual: false, plays: [] }, '2026-01-03').manual).toBe(false);
    let many = withPlay(undefined, 'd0');
    for (let i = 1; i < 30; i++) many = withPlay(many, `d${i}`);
    expect(many.plays.length).toBe(KNOWN_RULE.keep);
  });
});

describe('finding an easier key', () => {
  // An invented four-chord loop written in E major.
  const loop = chartOf('E', [['E'], ['B'], ['C#m'], ['A'], ['E'], ['B'], ['A'], ['E']]);
  const knows =
    (...ids: string[]) =>
    (s: string) =>
      ids.includes(chordId(s) ?? '');

  it('moves to the key whose chords you know', () => {
    const top = easierKeys(loop, DEFAULT_VIEW, knows('C', 'G', 'Am', 'F'));
    expect(top).toHaveLength(3);
    expect(top[0]).toMatchObject({
      transpose: -4,
      key: { tonic: 'C', mode: 'major' },
      shift: '4 semitones lower',
      chords: ['C', 'G', 'Am', 'F'],
      unknown: [],
      knownShare: 1,
    });
  });

  it('prefers fewer black keys and a short move when nothing is known yet', () => {
    const ranked = rankKeys(loop, DEFAULT_VIEW, () => false);
    expect(ranked).toHaveLength(12);
    const original = ranked.find((k) => k.transpose === 0)!;
    expect(ranked[0]!.blackKeys).toBeLessThan(original.blackKeys);
    // F (one up, two Bb chords) edges out C (four down, all white keys).
    expect(ranked.slice(0, 3).map((k) => k.key.tonic)).toEqual(['F', 'C', 'G']);
  });

  it('counts the chords at the current simplify level', () => {
    const fancy = chartOf('C', [['Cmaj9'], ['Am11'], ['Fadd9'], ['G13']]);
    const basic = easierKeys(fancy, view({ simplify: 'basic' }), knows('C', 'Am', 'F', 'G'));
    expect(basic[0]).toMatchObject({ transpose: 0, chords: ['C', 'Am', 'F', 'G'], knownShare: 1 });
    const original = easierKeys(fancy, DEFAULT_VIEW, knows('C', 'Am', 'F', 'G'));
    expect(original[0]!.knownShare).toBe(0);
  });
});
