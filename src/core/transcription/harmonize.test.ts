import { describe, expect, it } from 'vitest';
import { compileLesson, validateLesson } from '../content/compile';
import { spelled } from '../theory';
import { draftLesson, melodyBars } from './draftLesson';
import { harmonize, MelodyHarmonizer, type MelodyNote } from './harmonize';
import type { GridNote } from './types';

/** Original test melodies, written as "note:beats" per bar. */
function melody(bars: string[]): MelodyNote[] {
  const out: MelodyNote[] = [];
  bars.forEach((bar, i) => {
    let t = i * 4;
    for (const tok of bar.split(' ')) {
      const [name, beats] = tok.split(':') as [string, string];
      if (name !== 'r') out.push({ startBeat: t, beats: Number(beats), midi: spelled(name).midi });
      t += Number(beats);
    }
  });
  return out;
}

const timing = (bars: number, beats = 4) => ({ meter: { beats, unit: 4 }, bars });
const symbols = (h: { chords: { symbol: string }[] }) => h.chords.map((c) => c.symbol);

describe('harmonize', () => {
  const arpeggios = melody([
    'C4:1 E4:1 G4:1 E4:1',
    'F4:1 A4:1 C5:1 A4:1',
    'G4:1 B4:1 D5:1 B4:1',
    'C5:4',
  ]);

  it('finds I IV V I under arpeggios of those chords', () => {
    const [simple] = harmonize({
      notes: arpeggios,
      timing: timing(4),
      key: { tonic: 'C', mode: 'major' },
    });
    expect(simple!.style).toBe('simple');
    expect(symbols(simple!)).toEqual(['C', 'F', 'G', 'C']);
    expect(simple!.chords.map((c) => c.numeral)).toEqual(['I', 'IV', 'V', 'I']);
    expect(simple!.fit).toBe(1);
  });

  it('offers three different suggestions, each explained', () => {
    const all = harmonize({
      notes: arpeggios,
      timing: timing(4),
      key: { tonic: 'C', mode: 'major' },
    });
    expect(all.map((h) => h.style)).toEqual(['simple', 'diatonic', 'colour']);
    expect(new Set(all.map((h) => symbols(h).join(' '))).size).toBe(3);
    for (const h of all) {
      expect(h.explanation.length).toBeGreaterThanOrEqual(2);
      for (const c of h.chords) expect(c.why).toMatch(/\w/);
    }
    expect(all[0]!.explanation.join(' ')).toContain('V–I');
    expect(all[0]!.chords[1]!.why).toBe("The melody's F, A and C are in F.");
  });

  it('harmonizes in minor with the major V', () => {
    const [simple] = harmonize({
      notes: melody([
        'A4:1 C5:1 E5:1 C5:1',
        'D5:1 F5:1 A5:1 F5:1',
        'E5:1 G#5:1 B5:1 G#5:1',
        'A5:4',
      ]),
      timing: timing(4),
      key: { tonic: 'A', mode: 'minor' },
    });
    expect(symbols(simple!)).toEqual(['Am', 'Dm', 'E', 'Am']);
  });

  it('uses a secondary dominant when the melody asks for one, and resolves it', () => {
    const notes = melody([
      'C5:1 G4:1 E4:1 G4:1',
      'D4:1 F#4:1 A4:1 C5:1',
      'B4:1 G4:1 D4:1 G4:1',
      'C5:4',
    ]);
    const colour = harmonize({ notes, timing: timing(4), key: { tonic: 'C', mode: 'major' } }).find(
      (h) => h.style === 'colour',
    )!;
    const i = colour.chords.findIndex((c) => c.numeral === 'V7/V');
    expect(i).toBeGreaterThan(0);
    expect(colour.chords[i]!.symbol).toBe('D7');
    expect(colour.chords[i + 1]!.symbol).toMatch(/^G/);
    expect(colour.chords[i]!.why).toContain('Leans into G');
    expect(colour.explanation.join(' ')).toContain('D7');
  });

  it('treats short off-beat notes as passing tones', () => {
    const [simple] = harmonize({
      notes: melody(['C4:1 D4:0.5 E4:0.5 G4:2', 'G4:1 A4:0.5 B4:0.5 D5:2', 'C5:4']),
      timing: timing(3),
      key: { tonic: 'C', mode: 'major' },
    });
    expect(symbols(simple!)).toEqual(['C', 'G', 'C']);
  });

  it('keeps chords going under rests and handles 3/4', () => {
    const notes = [
      { startBeat: 0, beats: 3, midi: 67 },
      { startBeat: 6, beats: 3, midi: 72 },
    ];
    const all = harmonize({ notes, timing: timing(3, 3), key: { tonic: 'C', mode: 'major' } });
    for (const h of all) {
      expect(h.chords.reduce((s, c) => s + c.beats, 0)).toBe(9);
      expect(h.chords.every((c) => c.beats === 3)).toBe(true);
    }
    expect(all[0]!.chords[1]!.why).toBe('Keeps the harmony going under the rest.');
  });

  it('changes at most twice a bar in the colourful style, and covers every beat', () => {
    const colour = harmonize({
      notes: arpeggios,
      timing: timing(4),
      key: { tonic: 'C', mode: 'major' },
    }).at(-1)!;
    expect(colour.chords.reduce((s, c) => s + c.beats, 0)).toBe(16);
    for (const c of colour.chords) expect([2, 4]).toContain(c.beats);
    expect(colour.segments).toHaveLength(8);
  });

  it('ranks alternatives per segment behind the ChordEstimator interface', async () => {
    const est = new MelodyHarmonizer('diatonic');
    const segs = await est.estimate({
      notes: arpeggios,
      timing: { ...timing(4), tempo: 90, beat0: 0 },
      key: { tonic: 'C', mode: 'major' },
    });
    expect(segs.map((s) => s.candidates[0]!.symbol)).toEqual(['C', 'F', 'G', 'C']);
    for (const s of segs) {
      expect(s.candidates.length).toBe(4);
      const scores = s.candidates.map((c) => c.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });
});

describe('draft lessons', () => {
  const grid = (startBeat: number, beats: number, name: string): GridNote => ({
    startBeat,
    beats,
    midi: spelled(name).midi,
    note: spelled(name),
    uncertain: false,
  });

  it('fills rests and ties a note across the barline', () => {
    const bars = melodyBars([grid(1, 2, 'E4'), grid(3, 3, 'G4'), grid(6, 1, 'A4')], 4, 2);
    expect(bars).toEqual([
      [
        { note: 'r', beats: 1 },
        { note: 'E4', beats: 2 },
        { note: 'G4', beats: 1, tie: true },
      ],
      [
        { note: 'G4', beats: 2 },
        { note: 'A4', beats: 1 },
        { note: 'r', beats: 1 },
      ],
    ]);
  });

  it('splits a long note over several bars and clips at the end', () => {
    expect(melodyBars([grid(2, 9, 'C5')], 3, 3)).toEqual([
      [
        { note: 'r', beats: 2 },
        { note: 'C5', beats: 1, tie: true },
      ],
      [{ note: 'C5', beats: 3, tie: true }],
      [{ note: 'C5', beats: 3 }],
    ]);
  });

  it('makes a valid private song that plays the tie as one note', () => {
    const notes = [grid(0, 2, 'E4'), grid(2, 4, 'G4'), grid(6, 2, 'D4'), grid(8, 4, 'C4')];
    const [h] = harmonize({
      notes,
      timing: timing(3),
      key: { tonic: 'C', mode: 'major' },
    });
    const lesson = draftLesson({
      id: 'draft-1',
      title: 'My take',
      notes,
      timing: { tempo: 84, meter: { beats: 4, unit: 4 }, bars: 3 },
      key: { tonic: 'C', mode: 'major' },
      chords: h!.chords,
      lhPattern: 'block',
    });
    expect(lesson.source).toEqual({ kind: 'user' });
    expect(validateLesson(lesson)).toEqual([]);
    expect(lesson.bars[0]!.rh!.at(-1)).toEqual({ note: 'G4', beats: 2, tie: true });
    const compiled = compileLesson(lesson, {
      block: {
        id: 'block',
        name: 'Block',
        cycleBeats: 4,
        steps: [{ at: 0, dur: 'chord', voices: ['all'] }],
      },
    });
    const rh = compiled.events.filter((e) => e.channel === 'rh');
    expect(rh.map((e) => e.beat)).toEqual([0, 2, 6, 8]);
    for (const c of compiled.chords)
      for (const n of c.voicing) {
        expect(n.midi).toBeGreaterThanOrEqual(40);
        expect(n.midi).toBeLessThanOrEqual(59);
      }
  });
});
