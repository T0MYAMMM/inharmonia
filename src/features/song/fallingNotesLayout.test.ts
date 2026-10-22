import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@/core/audio/timeline';
import { swingBeat } from '@/core/audio/swing';
import { fallingKeyPositions, fallingKeyRange, fallingNotesAt } from './fallingNotesLayout';

const note = (
  id: string,
  beat: number,
  dur: number,
  midi: number,
  channel: TimelineEvent['channel'] = 'rh',
): TimelineEvent => ({ id, beat, dur, midi, channel, velocity: 0.75 });

describe('falling note projection', () => {
  it('places notes at the strike line on their audible onset and keeps duration visible', () => {
    const events = [note('a', 2, 1, 72)];
    expect(fallingNotesAt(events, 0, 4, 'both')).toEqual([
      { id: 'a', midi: 72, hand: 'rh', top: 0.25, bottom: 0.5, active: false },
    ]);
    expect(fallingNotesAt(events, 2, 4, 'both')).toEqual([
      { id: 'a', midi: 72, hand: 'rh', top: 0.75, bottom: 1, active: true },
    ]);
    expect(fallingNotesAt(events, 2.5, 4, 'both')[0]).toMatchObject({
      top: 0.875,
      bottom: 1,
      active: true,
    });
    expect(fallingNotesAt(events, 3, 4, 'both')).toEqual([]);
    expect(fallingNotesAt(events, -3, 4, 'both')).toEqual([]);
  });

  it('preserves swing timing and filters the displayed hand without changing the event data', () => {
    const events = [note('rh', 0.5, 0.25, 72), note('lh', 0, 1, 48, 'lh')];
    const warp = (beat: number) => swingBeat(beat, 1);
    const justBefore = fallingNotesAt(events, 0.6, 4, 'rh', warp);
    expect(justBefore[0]?.active).toBe(false);
    const atOnset = fallingNotesAt(events, warp(0.5), 4, 'rh', warp);
    expect(atOnset).toHaveLength(1);
    expect(atOnset[0]?.active).toBe(true);
    expect(atOnset[0]?.bottom).toBe(1);
    expect(fallingNotesAt(events, 0.2, 4, 'lh', warp).map((n) => n.midi)).toEqual([48]);
    expect(events).toHaveLength(2);
  });

  it('shows simultaneous chord tones and fill-ins from the original timeline', () => {
    const events = [
      note('chord-c', 0, 3, 48, 'lh'),
      note('chord-e', 0, 3, 52, 'lh'),
      note('fill', 1.5, 0.25, 79, 'rh'),
    ];
    const notes = fallingNotesAt(events, 1.5, 4, 'both');
    expect(notes.map((n) => [n.midi, n.active])).toEqual([
      [48, true],
      [52, true],
      [79, true],
    ]);
  });

  it('maintains a consistent pitch-to-x alignment for left and right hands', () => {
    const range = fallingKeyRange([note('low', 0, 1, 38, 'lh'), note('high', 0, 1, 83)], 'both');
    const geometry = fallingKeyPositions(...range, 20);
    const key38 = geometry.keys.find((k) => k.midi === 38)!;
    const key83 = geometry.keys.find((k) => k.midi === 83)!;
    expect(range[0]).toBeLessThanOrEqual(38);
    expect(range[1]).toBeGreaterThanOrEqual(83);
    expect(key38.x).toBeLessThan(key83.x);
    expect(geometry.width).toBeGreaterThan(0);
    const rightRange = fallingKeyRange([note('low', 0, 1, 38, 'lh'), note('high', 0, 1, 83)], 'rh');
    expect(rightRange[0]).toBeGreaterThan(range[0]);
  });
});
