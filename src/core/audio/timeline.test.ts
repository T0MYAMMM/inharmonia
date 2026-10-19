import { describe, expect, it } from 'vitest';
import { swingBeat } from './swing';
import { activeEventMidis, sortTimeline, type TimelineEvent } from './timeline';

const event = (
  id: string,
  beat: number,
  dur: number,
  midi: number,
  channel: TimelineEvent['channel'] = 'lh',
): TimelineEvent => ({ id, beat, dur, midi, channel, velocity: 0.7 });

describe('activeEventMidis', () => {
  it('lights only notes whose scheduled attacks have started and releases have not passed', () => {
    const notes = sortTimeline([
      event('first', 0, 2, 48),
      event('second', 0.5, 1, 52),
      event('third', 1.5, 0.5, 55),
      event('melody', 0, 4, 72, 'rh'),
    ]);
    expect(activeEventMidis(notes, 'lh', -0.1)).toEqual([]);
    expect(activeEventMidis(notes, 'lh', 0)).toEqual([48]);
    expect(activeEventMidis(notes, 'lh', 0.5)).toEqual([48, 52]);
    expect(activeEventMidis(notes, 'lh', 1.5)).toEqual([48, 55]);
    expect(activeEventMidis(notes, 'lh', 2)).toEqual([]);
    expect(activeEventMidis(notes, 'rh', 1)).toEqual([72]);
  });

  it('holds sustained notes across beats and only lights overlapping notes once', () => {
    const notes = sortTimeline([event('a', 0, 4, 48), event('a-again', 1, 0.9, 48)]);
    expect(activeEventMidis(notes, 'lh', 1.5)).toEqual([48]);
    expect(activeEventMidis(notes, 'lh', 3.9)).toEqual([48]);
    expect(activeEventMidis(notes, 'lh', 4)).toEqual([]);
  });

  it('uses the same swing-warped note timings as the transport', () => {
    const notes = [event('offbeat', 0.5, 0.25, 50)];
    const warp = (beat: number) => swingBeat(beat, 1);
    expect(activeEventMidis(notes, 'lh', 0.6, warp)).toEqual([]);
    expect(activeEventMidis(notes, 'lh', 2 / 3, warp)).toEqual([50]);
    expect(activeEventMidis(notes, 'lh', warp(0.75), warp)).toEqual([]);
  });
});
