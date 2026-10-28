import { describe, expect, it } from 'vitest';
import { PROGRESSIONS } from '@/content/progressions';
import { parseBars, progressionChart } from '../charts';
import { blankMidiProject } from '../midi/adapters';
import { cleanHandoff, sentTitle, type Handoff } from './handoff';

const from = { to: '/songs/charts/abc', label: 'Harbour lights' };
const project = {
  ...blankMidiProject(),
  title: 'Harbour lights (chart, G major)',
  tracks: [
    {
      id: 'lh',
      name: 'Chords',
      channel: 1,
      program: 0,
      muted: false,
      notes: [{ id: 'n1', startBeat: 0, beats: 4, midi: 55, velocity: 80 }],
    },
  ],
};
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const good: Handoff[] = [
  { kind: 'studio', from, project, said: 'Sent from your chart Harbour lights.' },
  {
    kind: 'progression',
    from,
    prefill: { name: 'I–vi–IV–V', mode: 'major', text: 'I vi IV V', previewKey: 'G' },
    said: 'From your chord sequence, read in G major.',
    notes: ['N.C. in bar 5 is left out: a progression has no silent bars.'],
  },
  {
    kind: 'chart',
    from,
    chart: progressionChart(PROGRESSIONS[0]!, 'G'),
    said: 'Started from I–V–vi–IV in G major.',
  },
  {
    kind: 'chords',
    from,
    meter: { beats: 4, unit: 4 },
    bars: parseBars('Am7 D7 Gmaj7 Gmaj7', 4).bars,
    what: 'ii–V–I in G major',
  },
];

describe('reading a handoff back', () => {
  it('takes each kind as it was written, through JSON', () => {
    for (const h of good) expect(cleanHandoff(copy(h), h.kind), h.kind).toEqual(h);
  });

  it('takes only the kind it was asked for', () => {
    expect(cleanHandoff(copy(good[0]), 'chart')).toBeNull();
    expect(cleanHandoff(null, 'studio')).toBeNull();
    expect(cleanHandoff('studio', 'studio')).toBeNull();
  });

  it('takes a way back only within the app', () => {
    for (const to of ['https://example.com', '//example.com/x', 'songs', ''])
      expect(
        cleanHandoff({ ...copy(good[0]!), from: { to, label: 'x' } }, 'studio'),
        to,
      ).toBeNull();
  });

  it('refuses a project it cannot read, or one with nothing to play', () => {
    const studio = copy(good[0]!) as Extract<Handoff, { kind: 'studio' }>;
    expect(
      cleanHandoff({ ...studio, project: { ...studio.project, tempo: 'fast' } }, 'studio'),
    ).toBeNull();
    expect(cleanHandoff({ ...studio, project: blankMidiProject() }, 'studio')).toBeNull();
    expect(cleanHandoff({ ...studio, said: 'x'.repeat(401) }, 'studio')).toBeNull();
  });

  it('refuses a progression without a mode; a key the mode lacks plays in C', () => {
    const p = copy(good[1]!) as Extract<Handoff, { kind: 'progression' }>;
    expect(
      cleanHandoff({ ...p, prefill: { ...p.prefill, mode: 'dorian' } }, 'progression'),
    ).toBeNull();
    const odd = cleanHandoff({ ...p, prefill: { ...p.prefill, previewKey: 'H' } }, 'progression');
    expect(odd?.kind === 'progression' && odd.prefill.previewKey).toBe('C');
  });

  it('refuses a chart that is not whole, or not valid', () => {
    const c = copy(good[2]!) as Extract<Handoff, { kind: 'chart' }>;
    expect(cleanHandoff({ ...c, chart: { ...c.chart, sections: 'verse' } }, 'chart')).toBeNull();
    const broken = copy(c);
    broken.chart.sections[0]!.bars[0]!.chords[0]!.beats = 3;
    expect(cleanHandoff(broken, 'chart')).toBeNull();
  });

  it('keeps the playable bars of chords, and refuses none', () => {
    const c = copy(good[3]!) as Extract<Handoff, { kind: 'chords' }>;
    const mixed = { ...c, bars: [...c.bars, { chords: [{ symbol: 'Hx', beats: 4 }] }] };
    expect(cleanHandoff(mixed, 'chords')).toEqual(c);
    expect(
      cleanHandoff({ ...c, bars: [{ chords: [{ symbol: 'Hx', beats: 4 }] }] }, 'chords'),
    ).toBeNull();
  });
});

describe('a title that names where it came from', () => {
  it('puts the source after the name', () => {
    expect(sentTitle('Harbour lights', 'chart, G major')).toBe('Harbour lights (chart, G major)');
    expect(sentTitle('  ', 'chart, C major')).toBe('Untitled (chart, C major)');
  });

  it('cuts a long name, so the whole title keeps to 80 characters', () => {
    const t = sentTitle('x'.repeat(100), 'chart, G major');
    expect(t).toHaveLength(80);
    expect(t.endsWith('… (chart, G major)')).toBe(true);
  });
});
