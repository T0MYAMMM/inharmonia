import { describe, expect, it } from 'vitest';
import { FILLS, getFill } from '@/content/fills';
import { MAJOR_KEYS, MINOR_KEYS } from './realize';
import {
  CHANGE_BEAT,
  compileFillExercise,
  FILL_CHANGES,
  fillIssues,
  realizeFill,
  realizePitch,
} from './fills';

const names = (fillId: string, ctx: Parameters<typeof realizeFill>[1]) =>
  realizeFill(getFill(fillId)!, ctx).map((h) => h.notes.map((n) => n.name).join('+'));

const C_V_I = { key: 'C', mode: 'major' as const, from: 'G7', to: 'C' };

describe('realizePitch', () => {
  it('places roots in the hand’s register and walks the scale', () => {
    expect(realizePitch({ ref: 'to' }, C_V_I, 'rh').name).toBe('C4');
    expect(realizePitch({ ref: 'from' }, C_V_I, 'rh').name).toBe('G4');
    expect(realizePitch({ ref: 'to' }, C_V_I, 'lh').name).toBe('C2');
    expect(realizePitch({ ref: 'to', step: -1 }, C_V_I, 'rh').name).toBe('B3');
    expect(realizePitch({ ref: 'to', step: 2 }, C_V_I, 'rh').name).toBe('E4');
    expect(realizePitch({ ref: 'from', tone: 'third' }, C_V_I, 'rh').name).toBe('B4');
    expect(realizePitch({ ref: 'to', octave: 1 }, C_V_I, 'rh').name).toBe('C5');
  });

  it('spells half steps below as sharps and above as flats', () => {
    const toA = { ...C_V_I, from: 'E7', to: 'Am' };
    expect(realizePitch({ ref: 'to', semis: -1 }, toA, 'rh').name).toBe('G#4');
    expect(realizePitch({ ref: 'to', semis: 1 }, toA, 'rh').name).toBe('Bb4');
    expect(realizePitch({ ref: 'to', tone: 'third' }, toA, 'rh').name).toBe('C5');
  });

  it('walks from chords that are off the scale', () => {
    const toBb = { ...C_V_I, from: 'C', to: 'Bb' };
    expect(realizePitch({ ref: 'to', step: -1 }, toBb, 'rh').name).toBe('A4');
    // The key's scale, so B natural sits right above B♭ in C major.
    expect(realizePitch({ ref: 'to', step: 1 }, toBb, 'rh').name).toBe('B4');
  });

  it('walks the pentatonic scale', () => {
    const pent = (step: number) => realizePitch({ ref: 'to', step }, C_V_I, 'rh', 'pentatonic');
    expect([-4, -3, -2, -1].map((s) => pent(s).name)).toEqual(['D3', 'E3', 'G3', 'A3']);
  });
});

describe('fills', () => {
  it('sound right in C, V7 → I', () => {
    expect(names('step-up', C_V_I)).toEqual(['A3', 'B3', 'C4']);
    expect(names('enclosure', C_V_I)).toEqual(['D4', 'B3', 'C4']);
    expect(names('run-up', C_V_I)).toEqual(['D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4']);
    expect(names('rising-sixths', C_V_I)).toEqual(['A3+F4', 'B3+G4', 'C4+A4', 'D4+B4', 'E4+C5']);
    expect(names('sixths-slide', C_V_I)).toEqual(['B3+G4', 'C4+A4', 'D#4+B4', 'E4+C5']);
    expect(names('walk-home', C_V_I)).toEqual(['G4', 'F#4', 'F4', 'E4', 'D4', 'C4']);
    expect(names('bass-octaves', C_V_I)).toEqual(['E2+E3', 'D2+D3', 'C2+C3']);
  });

  it('turnaround descends from the flat seventh under the root', () => {
    expect(names('blues-turnaround', { ...C_V_I, from: 'C', to: 'G7' })).toEqual([
      'Bb4+C5',
      'A4+C5',
      'Ab4+C5',
      'G4+C5',
    ]);
  });

  it('place into-next fills before the change and mark the landing', () => {
    const hits = realizeFill(getFill('step-up')!, C_V_I);
    expect(hits.map((h) => h.beat)).toEqual([2, 3, CHANGE_BEAT]);
    expect(hits.map((h) => h.landing)).toEqual([false, false, true]);
  });

  it('every fill plays in every key on every change', () => {
    for (const fill of FILLS) {
      for (const mode of ['major', 'minor'] as const) {
        for (const key of mode === 'major' ? MAJOR_KEYS : MINOR_KEYS) {
          for (const change of [fill.suggested, ...FILL_CHANGES[mode]]) {
            if (mode === 'minor' && change === fill.suggested && !/^[iv]/i.test(change.from))
              continue;
            const ex = compileFillExercise(fill, { key, mode, change });
            expect(fillIssues(fill, ex.context), `${fill.id} ${key} ${mode}`).toEqual([]);
            for (const h of ex.hits)
              for (const n of h.notes) {
                expect(n.midi).toBeGreaterThanOrEqual(fill.hand === 'lh' ? 28 : 45);
                expect(n.midi).toBeLessThanOrEqual(fill.hand === 'lh' ? 64 : 88);
              }
          }
        }
      }
    }
  });

  it('have unique ids and suggested changes that parse', () => {
    expect(new Set(FILLS.map((f) => f.id)).size).toBe(FILLS.length);
    for (const f of FILLS)
      expect(() =>
        compileFillExercise(f, { key: 'C', mode: 'major', change: f.suggested }),
      ).not.toThrow();
  });
});

describe('compileFillExercise', () => {
  it('holds the chords in the other hand and adds the fill', () => {
    const ex = compileFillExercise(getFill('bass-octaves')!, {
      key: 'C',
      mode: 'major',
      change: { from: 'I', to: 'vi' },
    });
    expect(ex.chords.map((c) => c.symbol)).toEqual(['C', 'Am']);
    expect(ex.chords[0]!.voicing[0]!.name).toBe('C4');
    const channels = new Set(ex.events.map((e) => e.channel));
    expect(channels).toEqual(new Set(['lh', 'rh']));
    // C, B, A in octaves, walking down into Am.
    expect(ex.events.filter((e) => e.channel === 'lh').map((e) => e.midi)).toEqual([
      48, 60, 47, 59, 45, 57,
    ]);
    expect(ex.range).toEqual([45, 60]);
  });
});

describe('withFills', () => {
  it('puts the fill on every change that has room for it', async () => {
    const { PATTERNS, HELD } = await import('@/content/patterns');
    const { getProgression } = await import('@/content/progressions');
    const { compileLesson } = await import('./compile');
    const { realizeProgression } = await import('./realize');
    const { withFills } = await import('./fills');
    const lesson = realizeProgression(getProgression('ii-v-i')!, {
      key: 'C',
      style: 'close',
      voiceLeading: false,
      pattern: HELD,
    });
    const base = compileLesson(lesson, PATTERNS);
    const out = withFills(base, getFill('step-up')!, { tonic: 'C', mode: 'major' });
    // Dm7 → G7 → Cmaj7 → Cmaj7: three changes, three notes each.
    expect(out.fills!.map((f) => f.beat)).toEqual([2, 3, 4, 6, 7, 8, 10, 11, 12]);
    expect(out.fills!.slice(0, 3).map((f) => f.midis)).toEqual([[64], [65], [67]]); // E4 F4 into G4
    expect(out.events.length).toBe(base.events.length + 9);
    expect(out.events.every((e, i, a) => i === 0 || a[i - 1]!.beat <= e.beat)).toBe(true);

    // A bar-long fill skips the change where it would start on the last landing.
    const bar = withFills(base, getFill('walk-home')!, { tonic: 'C', mode: 'major' });
    expect(bar.fills!.map((f) => f.beat)).toEqual([0, 1, 2, 3, 3.5, 4, 8, 9, 10, 11, 11.5, 12]);

    // Two-beat chords: the second fill would start on the first one's landing.
    const split = realizeProgression(
      {
        ...getProgression('ii-v-i')!,
        steps: [
          { numeral: 'ii7', beats: 2 },
          { numeral: 'V7', beats: 2 },
          { numeral: 'I', beats: 4 },
        ],
      },
      { key: 'C', style: 'close', voiceLeading: false, pattern: HELD },
    );
    const short = withFills(compileLesson(split, PATTERNS), getFill('step-up')!, {
      tonic: 'C',
      mode: 'major',
    });
    expect(short.fills!.map((f) => f.beat)).toEqual([0, 1, 2]);
    // And a bar-long fill doesn't fit two-beat chords at all.
    const walk = withFills(compileLesson(split, PATTERNS), getFill('walk-home')!, {
      tonic: 'C',
      mode: 'major',
    });
    expect(walk.fills).toEqual([]);
  });
});
