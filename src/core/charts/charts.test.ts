import { describe, expect, it } from 'vitest';
import { compileLesson, validateLesson } from '../content/compile';
import {
  chartIssues,
  chartToLesson,
  CHART_VERSION,
  emptyChart,
  expandForm,
  formatBars,
  isChordLine,
  migrateChart,
  NO_CHORD,
  normalizeChord,
  parseBars,
  parseHeader,
  parseSheet,
  RH_RANGE,
  sheetToChart,
  suggestKeys,
  type ChordChart,
} from '.';

// Every fixture here is invented: made-up progressions and placeholder lyric text.
const LYRIC_WORDS = ['la', 'lyric', 'line', 'here', 'placeholder', 'words'];

/** Every string anywhere inside a value. */
function strings(x: unknown): string[] {
  if (typeof x === 'string') return [x];
  if (Array.isArray(x)) return x.flatMap(strings);
  // Line kinds ("lyric", "chords") are labels, not text from the sheet.
  if (x && typeof x === 'object')
    return Object.entries(x).flatMap(([k, v]) => (k === 'kind' ? [] : strings(v)));
  return [];
}

function expectNoLyrics(x: unknown) {
  for (const s of strings(x))
    for (const w of s.toLowerCase().split(/[^a-z]+/))
      expect(LYRIC_WORDS, `"${s}" carries lyric text`).not.toContain(w);
}

const chart = (patch: Partial<ChordChart> = {}): ChordChart => ({
  ...emptyChart('Test'),
  sections: [
    {
      id: 'v',
      label: 'Verse',
      type: 'verse',
      repeat: 1,
      bars: [
        { chords: [{ symbol: 'C', beats: 4 }] },
        { chords: [{ symbol: 'G/B', beats: 4 }] },
        {
          chords: [
            { symbol: 'Am', beats: 2 },
            { symbol: 'F', beats: 2 },
          ],
        },
        { chords: [{ symbol: NO_CHORD, beats: 4 }] },
      ],
    },
    {
      id: 'c',
      label: 'Reff',
      type: 'chorus',
      repeat: 2,
      bars: [{ chords: [{ symbol: 'F', beats: 4 }] }, { chords: [{ symbol: 'G', beats: 4 }] }],
    },
  ],
  form: ['v', 'c', 'v', 'c'],
  ...patch,
});

describe('chord symbols', () => {
  it.each([
    ['Cmaj7', 'Cmaj7'],
    ['CM7', 'CM7'],
    ['C△7', 'Cmaj7'],
    ['CΔ7', 'Cmaj7'],
    ['CΔ', 'Cmaj7'],
    ['CMA7', 'Cmaj7'],
    ['Cm', 'Cm'],
    ['C-', 'C-'],
    ['C-7', 'C-7'],
    ['Cmi7', 'Cm7'],
    ['Bb', 'Bb'],
    ['B♭', 'Bb'],
    ['F♯m7', 'F#m7'],
    ['Cm7b5', 'Cm7b5'],
    ['Cm7♭5', 'Cm7b5'],
    ['Cø7', 'Cm7b5'],
    ['Cø', 'Cm7b5'],
    ['Cm7-5', 'Cm7b5'],
    ['C7-9', 'C7b9'],
    ['C7+5', 'C7#5'],
    ['C7(b9)', 'C7b9'],
    ['C(add9)', 'Cadd9'],
    ['Cm(maj7)', 'CmM7'],
    ['C6/9', 'C69'],
    ['Cdim', 'Cdim'],
    ['C°', 'C°'],
    ['Cdim7', 'Cdim7'],
    ['Caug', 'Caug'],
    ['C+', 'C+'],
    ['Csus4', 'Csus4'],
    ['Csus2', 'Csus2'],
    ['C7sus4', 'C7sus4'],
    ['Cadd9', 'Cadd9'],
    ['C6', 'C6'],
    ['C9', 'C9'],
    ['C11', 'C11'],
    ['C13', 'C13'],
    ['G/B', 'G/B'],
    ['Am7/G', 'Am7/G'],
    ['N.C.', NO_CHORD],
    ['NC', NO_CHORD],
    ['n.c.', NO_CHORD],
  ])('%s reads as %s', (input, out) => {
    expect(normalizeChord(input)).toBe(out);
  });

  it.each(['H7', 'am', 'la', 'Cxyz', '', '|', 'Go'])('%s is not a chord', (t) => {
    expect(normalizeChord(t)).toBeNull();
  });
});

describe('section headers', () => {
  it.each([
    ['[Verse]', 'Verse', 'verse', 1],
    ['Verse 2:', 'Verse 2', 'verse', 1],
    ['Bait', 'Bait', 'verse', 1],
    ['BAIT 2', 'BAIT 2', 'verse', 1],
    ['Chorus:', 'Chorus', 'chorus', 1],
    ['Reff', 'Reff', 'chorus', 1],
    ['Reff 2x', 'Reff', 'chorus', 2],
    ['Chorus x2', 'Chorus', 'chorus', 2],
    ['Ref:', 'Ref', 'chorus', 1],
    ['Pre-Reff', 'Pre-Reff', 'prechorus', 1],
    ['Pre Reff:', 'Pre Reff', 'prechorus', 1],
    ['Pre Chorus', 'Pre Chorus', 'prechorus', 1],
    ['PreChorus', 'PreChorus', 'prechorus', 1],
    ['pre-chorus', 'pre-chorus', 'prechorus', 1],
    ['Post-chorus', 'Post-chorus', 'postchorus', 1],
    ['Hook', 'Hook', 'hook', 1],
    ['Interlude', 'Interlude', 'interlude', 1],
    ['Musik:', 'Musik', 'interlude', 1],
    ['Int.', 'Int.', 'intro', 1],
    ['Intro', 'Intro', 'intro', 1],
    ['(Intro)', 'Intro', 'intro', 1],
    ['Ending', 'Ending', 'outro', 1],
    ['Outro:', 'Outro', 'outro', 1],
    ['Tag', 'Tag', 'tag', 1],
    ['Breakdown', 'Breakdown', 'breakdown', 1],
    ['Bridge', 'Bridge', 'bridge', 1],
    ['[Middle part]', 'Middle part', 'custom', 1],
  ])('%s', (line, label, type, repeat) => {
    expect(parseHeader(line)).toMatchObject({ label, type, repeat });
  });

  it.each(['la la la', 'Hook me up la la', 'Ending soon:', 'C G Am F', '(la la)'])(
    '%s is not a header',
    (line) => {
      expect(parseHeader(line)).toBeNull();
    },
  );

  it('keeps what follows the colon', () => {
    expect(parseHeader('Intro: | C | G |')).toMatchObject({ label: 'Intro', rest: '| C | G |' });
  });
});

describe('bar syntax', () => {
  it('reads bars, splits, repeats and no chord', () => {
    const { bars, issues } = parseBars('| C | G/B | Am7 | F |\n| C G | % | N.C. | x2', 4);
    expect(issues).toEqual([]);
    expect(bars.map((b) => b.chords.map((c) => `${c.symbol}:${c.beats}`).join(' '))).toEqual([
      'C:4',
      'G/B:4',
      'Am7:4',
      'F:4',
      'C:2 G:2',
      'C:2 G:2',
      'N.C.:4',
      'C:2 G:2',
      'C:2 G:2',
      'N.C.:4',
    ]);
  });

  it('reads dots as beats, and three chords in 3/4', () => {
    expect(parseBars('| C . . G |', 4).bars[0]!.chords).toEqual([
      { symbol: 'C', beats: 3 },
      { symbol: 'G', beats: 1 },
    ]);
    expect(parseBars('| Am F G |', 3).bars[0]!.chords.map((c) => c.beats)).toEqual([1, 1, 1]);
  });

  it('treats a line without bar lines as one chord per bar', () => {
    expect(parseBars('C G Am F', 4).bars).toHaveLength(4);
  });

  it('reports unknown chords, empty bars and wrong lengths, keeping what was typed', () => {
    const { bars, issues } = parseBars('| C | Hx | |\n| C . . . . G |\n| % |', 4);
    expect(issues.map((i) => i.message)).toEqual([
      '"Hx" is not a chord',
      'Empty bar',
      'This bar lasts 6 beats, not 4',
    ]);
    expect(bars[1]!.chords[0]!.symbol).toBe('Hx');
  });

  it('round-trips through text, uneven splits included', () => {
    const bars = parseBars('| C . . G | Am | F G | C |\n| N.C. |', 4).bars;
    const text = formatBars(bars, 4);
    expect(text).toBe('| C . . G | Am | F G | C |\n| N.C. |');
    expect(parseBars(text, 4).bars).toEqual(bars);
  });
});

describe('chord line detection', () => {
  it.each([
    ['C   G   Am   F', true],
    ['C G', true],
    ['   Am', true],
    ['Am      ', false],
    ['A', false],
    ['Am', false],
    ['Am I la la', false],
    ['| C | G |', true],
    ['N.C.  |  C', true],
    ['(Am)  (G)', true],
    ['C - G - Am x2', true],
    ['la la la lyric line here', false],
    ['C  la la', false],
  ])('%j → %s', (line, chords) => {
    expect(isChordLine(line)).toBe(chords);
  });
});

describe('pasting a chord sheet', () => {
  const OVER = [
    '[Intro]',
    'C   G   Am   F',
    '',
    '[Verse]',
    'C          G',
    'la la la lyric line here',
    'Am         F',
    'la la placeholder words',
    '',
    'Chorus:',
    'F    G    C    Am',
    'lyric line here la la',
    'F    G    C',
    'la la la',
    '',
    '[Chorus]',
  ].join('\n');

  it('reads chords over lyrics, drops the lyrics and reuses a repeated chorus', () => {
    const sheet = parseSheet(OVER, 4);
    expect(sheet.lyricLines).toBe(4);
    expect(sheet.lines.filter((l) => l.kind === 'lyric').map((l) => l.n)).toEqual([6, 8, 12, 14]);
    const { sections, form } = sheetToChart(sheet, { beatsPerBar: 4 });
    expect(
      sections.map((s) => [s.label, s.type, s.bars.map((b) => b.chords[0]!.symbol).join(' ')]),
    ).toEqual([
      ['Intro', 'intro', 'C G Am F'],
      ['Verse', 'verse', 'C G Am F'],
      ['Chorus', 'chorus', 'F G C Am F G C'],
    ]);
    expect(form.map((id) => sections.find((s) => s.id === id)!.label)).toEqual([
      'Intro',
      'Verse',
      'Chorus',
      'Chorus',
    ]);
    expectNoLyrics(sheet);
    expectNoLyrics({ sections, form });
  });

  it('reads inline chords, Indonesian headers and repeat marks', () => {
    const text = 'Bait 1:\n[C]la la [G]la la [Am]la [F]la\nReff 2x\n[F]lyric [G]line [C]here';
    const sheet = parseSheet(text, 4);
    expect(sheet.lines.map((l) => l.kind)).toEqual(['header', 'inline', 'header', 'inline']);
    expect(sheet.lyricLines).toBe(2);
    const { sections } = sheetToChart(sheet, { beatsPerBar: 4 });
    expect(sections.map((s) => [s.label, s.type, s.repeat])).toEqual([
      ['Bait 1', 'verse', 1],
      ['Reff', 'chorus', 2],
    ]);
    expectNoLyrics(sections);
  });

  it('keeps bar lines as typed, and chords after a header colon', () => {
    const sheet = parseSheet('Intro: | C | G/B | Am7 | F |\n[Verse]\n| C G | Am F | x2', 4);
    const { sections } = sheetToChart(sheet, { beatsPerBar: 4 });
    expect(sections[0]!.bars).toHaveLength(4);
    expect(sections[1]!.bars.map((b) => b.chords.length)).toEqual([2, 2, 2, 2]);
  });

  it('flags tokens it cannot read and offers two chords a bar on dense lines', () => {
    const sheet = parseSheet('C G Am Hx\nC G Am F C G Am F', 4);
    expect(sheet.lines[0]).toMatchObject({ kind: 'chords', unknown: ['Hx'] });
    expect(sheet.lines[1]!.dense).toBe(true);
    const one = sheetToChart(sheet, { beatsPerBar: 4 });
    const two = sheetToChart(sheet, { beatsPerBar: 4, twoPerBar: new Set([2]) });
    expect(one.sections[0]!.bars).toHaveLength(12);
    expect(two.sections[0]!.bars).toHaveLength(8);
    expect(two.sections[0]!.bars.at(-1)!.chords.map((c) => c.symbol)).toEqual(['Am', 'F']);
    // The unknown token stays only until fixed: the chart will not validate with it.
    const c = { ...emptyChart('x'), ...one };
    expect(chartIssues(c).map((i) => i.message)).toContain('"Hx" is not a chord');
  });

  it('does not take a one-word lyric line for a chord', () => {
    const sheet = parseSheet('[Verse]\nC   G\nA\nla la la\nAm\nlyric line here', 4);
    expect(sheet.lines.map((l) => l.kind)).toEqual([
      'header',
      'chords',
      'lyric',
      'lyric',
      'lyric',
      'lyric',
    ]);
    expect(sheet.lyricLines).toBe(4);
  });

  it('keeps N.C. as a bar', () => {
    const { sections } = sheetToChart(parseSheet('C   G   N.C.   F', 4), { beatsPerBar: 4 });
    expect(sections[0]!.bars.map((b) => b.chords[0]!.symbol)).toEqual(['C', 'G', NO_CHORD, 'F']);
  });

  it('starts an unnamed section for chords before any header', () => {
    const { sections } = sheetToChart(parseSheet('C   G\nla la', 4), { beatsPerBar: 4 });
    expect(sections[0]).toMatchObject({ label: 'Section', type: 'custom' });
  });
});

describe('key suggestion', () => {
  const sec = (symbols: string[]) => ({
    id: 'x',
    label: 'Verse',
    type: 'verse' as const,
    repeat: 1,
    bars: symbols.map((symbol) => ({ chords: [{ symbol, beats: 4 }] })),
  });

  it('finds the key of an invented progression', () => {
    expect(suggestKeys([sec(['G', 'Em', 'C', 'D', 'G'])])[0]).toMatchObject({
      tonic: 'G',
      mode: 'major',
    });
    expect(suggestKeys([sec(['Bb', 'Gm', 'Eb', 'F'])])[0]).toMatchObject({
      tonic: 'Bb',
      mode: 'major',
    });
  });

  it('tells a minor key from its relative major by where sections start and end', () => {
    expect(suggestKeys([sec(['Em', 'C', 'G', 'D', 'Em'])])[0]).toMatchObject({
      tonic: 'E',
      mode: 'minor',
    });
    expect(suggestKeys([sec(['Am', 'Dm', 'E7', 'Am'])])[0]).toMatchObject({
      tonic: 'A',
      mode: 'minor',
    });
  });

  it('ranks every key and ignores N.C. and unknown chords', () => {
    const ranked = suggestKeys([sec(['C', NO_CHORD, 'Hx', 'F', 'G', 'C'])]);
    expect(ranked).toHaveLength(24);
    expect(ranked[0]).toMatchObject({ tonic: 'C', mode: 'major' });
  });
});

describe('charts as lessons', () => {
  it('writes the form out with repeats and marks where sections start', () => {
    const rows = expandForm(chart());
    expect(rows).toHaveLength(4 + 4 + 4 + 4);
    const lesson = chartToLesson('mine-chart-1', chart());
    expect(validateLesson(lesson)).toEqual([]);
    expect(lesson.bars.map((b) => b.section ?? '')).toEqual([
      'Verse',
      '',
      '',
      '',
      'Reff',
      '',
      '',
      '',
      'Verse',
      '',
      '',
      '',
      'Reff',
      '',
      '',
      '',
    ]);
    expect(lesson).toMatchObject({
      kind: 'chart',
      source: { kind: 'user' },
      lhPattern: 'triad-root',
    });
  });

  it('voices the right hand around middle C, smoothly, with numerals', () => {
    const lesson = chartToLesson('x', chart());
    for (const bar of lesson.bars)
      for (const c of bar.chords) {
        if (c.symbol === NO_CHORD) continue;
        const notes = (c.voicing as { notes: string[] }).notes;
        expect(notes.length).toBe(3);
        expect(c.numeral).toBeTruthy();
      }
    const compiled = compileLesson(lesson, {
      'triad-root': {
        id: 'triad-root',
        name: 'x',
        cycleBeats: 64,
        steps: [
          { at: 0, dur: 'chord', voices: ['root'] },
          { at: 0, dur: 'chord', voices: ['all'] },
        ],
      },
    });
    for (const ch of compiled.chords)
      for (const n of ch.voicing) {
        expect(n.midi).toBeGreaterThanOrEqual(RH_RANGE[0]);
        expect(n.midi).toBeLessThanOrEqual(RH_RANGE[1]);
      }
    // G/B: the left hand plays the slash bass.
    const gb = compiled.chords.find((c) => c.symbol === 'G/B')!;
    const bass = compiled.events.find(
      (e) => e.channel === 'lh' && e.beat === gb.startBeat && e.midi < 48,
    )!;
    expect(bass.midi % 12).toBe(11);
    // N.C. is silent and not a practice target.
    const nc = compiled.chords.find((c) => c.symbol === NO_CHORD)!;
    expect(nc.voicing).toEqual([]);
    expect(compiled.events.some((e) => e.beat === nc.startBeat)).toBe(false);
  });

  it('checks every limit and chord', () => {
    expect(chartIssues(chart())).toEqual([]);
    const bad = chart({ tempo: 900, form: ['v', 'nope'] });
    bad.sections[0]!.bars[0] = { chords: [{ symbol: 'Hx', beats: 3 }] };
    expect(chartIssues(bad).map((i) => i.message)).toEqual([
      'Tempo must be 30 to 240 bpm',
      '"Hx" is not a chord',
      'Chords last 3 beats, not 4',
      'The form names a missing section',
    ]);
    const long = chart({ form: Array.from({ length: 40 }, () => 'c') });
    long.sections[1]!.repeat = 8;
    long.sections[1]!.bars = Array.from({ length: 2 }, () => ({
      chords: [{ symbol: 'C', beats: 4 }],
    }));
    expect(chartIssues(long).at(-1)!.message).toContain('640 bars');
  });

  it('migrates stored charts and refuses ones from a newer version', () => {
    const { notes: _drop, ...old } = chart();
    expect(migrateChart({ ...old, version: 1 })).toMatchObject({
      version: CHART_VERSION,
      notes: '',
    });
    expect(() => migrateChart({ ...chart(), version: CHART_VERSION + 1 })).toThrow('newer version');
  });
});
