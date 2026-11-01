import { describe, expect, it } from 'vitest';
import { MIX, dbToGain, mixVelocity, type Mix } from '@config/mix';
import { PATTERNS } from '@/content/patterns';
import { getSong } from '@/content/lessons';
import { compileLesson } from './compile';

describe('mix config', () => {
  it('defaults to the prototype levels', () => {
    expect(MIX.melody).toMatchObject({ velocity: 0.4, legato: 0.95, gainDb: 0 });
    expect(MIX.leftHand).toMatchObject({ accentVelocity: 0.26, velocity: 0.13, gainDb: 0 });
  });

  it('applies channel gain to velocity and caps at full', () => {
    const mix: Mix = { ...MIX, leftHand: { ...MIX.leftHand, gainDb: -6 } };
    expect(mixVelocity('lh', 0.5, mix)).toBeCloseTo(0.5 * dbToGain(-6));
    expect(mixVelocity('rh', 0.5, mix)).toBe(0.5);
    const loud: Mix = { ...MIX, melody: { ...MIX.melody, gainDb: 12 } };
    expect(mixVelocity('rh', 0.8, loud)).toBe(1);
    expect(dbToGain(0)).toBe(1);
  });

  it('drives compiled velocities and legato, so tuning needs no content edits', () => {
    const mix: Mix = {
      ...MIX,
      melody: { ...MIX.melody, velocity: 0.5, legato: 0.9 },
      leftHand: { ...MIX.leftHand, accentVelocity: 0.3, velocity: 0.2 },
    };
    // Ode to Joy, Easy, with the broken chord: bar 1 is C twice, each accented.
    const ode = { ...getSong('ode-to-joy-easy')!, lhPattern: 'arpeggio-8ths' };
    const c = compileLesson(ode, PATTERNS, { mix });
    // The first melody note is a half note: two beats at 0.9 legato.
    expect(c.events.find((e) => e.channel === 'rh')).toMatchObject({ velocity: 0.5, dur: 1.8 });
    const lh = c.events.filter((e) => e.channel === 'lh' && e.beat < 4).map((e) => e.velocity);
    expect(lh).toEqual([0.3, 0.2, 0.2, 0.2, 0.3, 0.2, 0.2, 0.2]);
  });
});
