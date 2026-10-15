import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock';
import { swingBeat } from './swing';
import { TempoMap } from './tempoMap';
import type { TimelineEvent } from './timeline';
import { Transport, type TransportSink } from './transport';

function recorder() {
  const notes: { id: string; time: number; dur: number }[] = [];
  const clicks: { time: number; accent: boolean }[] = [];
  let silenced = 0;
  const sink: TransportSink = {
    note: (ev, time, dur) => notes.push({ id: ev.id, time, dur }),
    click: (time, accent) => clicks.push({ time, accent }),
    silence: () => {
      silenced++;
    },
  };
  return { sink, notes, clicks, silenced: () => silenced };
}

/** One quarter note per beat, ids "q0".."q{n-1}". */
function quarters(n: number): TimelineEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    beat: i,
    dur: 1,
    midi: 60,
    velocity: 0.8,
    channel: 'rh' as const,
  }));
}

function setup(bpm = 60) {
  const clock = new FakeClock();
  const rec = recorder();
  const t = new Transport({ clock, ticker: clock, sink: rec.sink, bpm, startDelay: 0.1 });
  return { clock, t, ...rec };
}

describe('TempoMap', () => {
  it('converts between time and beats', () => {
    const m = new TempoMap({ time: 1, beat: 0, bpm: 120 });
    expect(m.beatAt(2)).toBeCloseTo(2);
    expect(m.timeAt(4)).toBeCloseTo(3);
    expect(m.beatAt(0.5)).toBeCloseTo(-1); // extrapolates before start
  });

  it('stays continuous across tempo changes', () => {
    const m = new TempoMap({ time: 0, beat: 0, bpm: 60 });
    m.push({ time: 4, beat: m.beatAt(4), bpm: 120 });
    expect(m.beatAt(4)).toBeCloseTo(4);
    expect(m.beatAt(5)).toBeCloseTo(6);
    expect(m.beatAt(3)).toBeCloseTo(3);
    expect(m.timeAt(8)).toBeCloseTo(6);
  });

  it('prunes old segments but keeps the active one', () => {
    const m = new TempoMap({ time: 0, beat: 0, bpm: 60 });
    m.push({ time: 2, beat: 2, bpm: 90 });
    m.push({ time: 4, beat: 5, bpm: 120 });
    m.prune(3);
    expect(m.all).toHaveLength(2);
    expect(m.beatAt(3)).toBeCloseTo(3.5);
  });
});

describe('swing', () => {
  it('is identity when straight and fixes downbeats', () => {
    expect(swingBeat(1.5, 0)).toBe(1.5);
    expect(swingBeat(2, 1)).toBeCloseTo(2);
    expect(swingBeat(2.5, 1)).toBeCloseTo(2 + 2 / 3);
    expect(swingBeat(2.5, 0.5)).toBeCloseTo(2 + 0.5 + 1 / 12);
  });

  it('is monotonic', () => {
    let prev = -1;
    for (let b = 0; b < 4; b += 0.05) {
      const s = swingBeat(b, 0.7);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });
});

describe('Transport', () => {
  it('schedules events at exact times, ahead of the clock', () => {
    const { clock, t, notes } = setup(60);
    t.setTimeline(quarters(8), 8);
    t.play(0);
    clock.advance(3);
    // Start delay 0.1s, 60 bpm → beat n at 0.1 + n seconds.
    const times = notes.map((n) => n.time);
    expect(times.slice(0, 3)).toEqual([0.1, 1.1, 2.1].map((x) => expect.closeTo(x, 9)));
    // Never schedules more than the lookahead past now.
    expect(Math.max(...times)).toBeLessThanOrEqual(clock.now() + 0.1 + 1e-9);
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length); // no duplicates
    expect(notes[0]!.dur).toBeCloseTo(1);
  });

  it('changes tempo mid-playback without drift or duplicates', () => {
    const { clock, t, notes } = setup(60);
    t.setTimeline(quarters(64), 64);
    t.play(0);
    clock.advance(4.03);
    t.setTempo(120);
    clock.advance(30);
    const ids = notes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(quarters(ids.length).map((q) => q.id)); // in order, none skipped
    // Find where tempo took effect and check every later gap is exactly 0.5s.
    const gaps = notes.slice(1).map((n, i) => n.time - notes[i]!.time);
    const switchAt = gaps.findIndex((g) => Math.abs(g - 0.5) < 1e-9);
    expect(switchAt).toBeGreaterThan(2);
    // Before the change: 1s gaps. One transitional gap spans the change point.
    for (const g of gaps.slice(0, switchAt - 1)) expect(g).toBeCloseTo(1, 9);
    expect(gaps[switchAt - 1]).toBeGreaterThan(0.5);
    expect(gaps[switchAt - 1]).toBeLessThan(1);
    for (const g of gaps.slice(switchAt)) expect(g).toBeCloseTo(0.5, 9);
    // After 50 more beats at 120 the error is still zero, not accumulated.
    const last = notes[notes.length - 1]!;
    const first120 = notes[switchAt]!;
    const k = notes.length - 1 - switchAt;
    expect(last.time - first120.time).toBeCloseTo(k * 0.5, 9);
  });

  it('visual beat follows the clock across a tempo change', () => {
    const { clock, t } = setup(60);
    t.setTimeline(quarters(32), 32);
    t.play(0);
    clock.advance(2.1); // beat 2
    expect(t.beatAt()).toBeCloseTo(2, 6);
    t.setTempo(120);
    clock.advance(1);
    const b = t.beatAt();
    expect(b).toBeGreaterThan(3);
    expect(b).toBeLessThan(4.01);
  });

  it('loops seamlessly', () => {
    const { clock, t, notes } = setup(60);
    t.setTimeline(quarters(8), 8);
    t.setLoop({ start: 2, end: 4 });
    t.play(2);
    clock.advance(6.5);
    expect(notes.map((n) => n.id).slice(0, 6)).toEqual(['q2', 'q3', 'q2', 'q3', 'q2', 'q3']);
    const gaps = notes.slice(1).map((n, i) => n.time - notes[i]!.time);
    for (const g of gaps) expect(g).toBeCloseTo(1, 9);
    expect(t.state).toBe('playing');
  });

  it('starts from a bar', () => {
    const { clock, t, notes } = setup(120);
    t.setTimeline(quarters(16), 16);
    t.play(8);
    clock.advance(0.5);
    expect(notes[0]!.id).toBe('q8');
    expect(notes[0]!.time).toBeCloseTo(0.1);
  });

  it('pauses and resumes from the same beat', () => {
    const { clock, t, notes, silenced } = setup(60);
    t.setTimeline(quarters(16), 16);
    t.play(0);
    clock.advance(3.15); // between beat 3 and 4
    t.pause();
    expect(t.state).toBe('paused');
    expect(silenced()).toBe(1);
    const pausedBeat = t.beatAt();
    expect(pausedBeat).toBeCloseTo(3.05, 6);
    clock.advance(10);
    const before = notes.length;
    t.resume();
    clock.advance(2);
    const resumed = notes.slice(before).map((n) => n.id);
    // q4 is the first note not yet heard (q3 started before the pause).
    expect(resumed[0]).toBe('q4');
  });

  it('plays a count-in without playing content early', () => {
    const { clock, t, notes, clicks } = setup(60);
    t.setTimeline(quarters(8), 8);
    t.setMetronome(false, 1);
    t.play(0, { countInBars: 1 });
    clock.advance(3.5);
    expect(notes).toHaveLength(0);
    expect(clicks).toHaveLength(4);
    expect(clicks[0]!.accent).toBe(true);
    expect(clicks.slice(1).every((c) => !c.accent)).toBe(true);
    expect(t.countInRemaining()).toBeCloseTo(0.6, 6);
    clock.advance(1);
    expect(notes[0]!.id).toBe('q0');
    expect(notes[0]!.time).toBeCloseTo(4.1);
    expect(clicks).toHaveLength(4); // metronome off after count-in
  });

  it('clicks every beat with the metronome on, accenting downbeats', () => {
    const { clock, t, clicks } = setup(60);
    t.setTimeline([], 8);
    t.setMetronome(true, 0);
    t.play(0);
    clock.advance(7.5);
    expect(clicks.map((c) => c.accent)).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('mutes a channel', () => {
    const { clock, t, notes } = setup(60);
    const evs = quarters(4).map((e, i) => ({
      ...e,
      channel: i % 2 ? ('lh' as const) : ('rh' as const),
    }));
    t.setTimeline(evs, 4);
    t.setMuted('lh', true);
    t.play(0);
    clock.advance(4);
    expect(notes.map((n) => n.id)).toEqual(['q0', 'q2']);
  });

  it('applies swing to off-beat 8ths', () => {
    const { clock, t, notes } = setup(60);
    const eighths: TimelineEvent[] = [0, 0.5, 1, 1.5].map((beat, i) => ({
      id: `e${i}`,
      beat,
      dur: 0.5,
      midi: 60,
      velocity: 1,
      channel: 'rh',
    }));
    t.setTimeline(eighths, 2);
    t.setSwing(1);
    t.play(0);
    clock.advance(2);
    expect(notes.map((n) => n.time - 0.1)).toEqual(
      [0, 2 / 3, 1, 1 + 2 / 3].map((x) => expect.closeTo(x, 9)),
    );
    expect(notes[0]!.dur).toBeCloseTo(2 / 3);
    expect(notes[1]!.dur).toBeCloseTo(1 / 3);
  });

  it('stops at the end and notifies', () => {
    const { clock, t } = setup(120);
    let ended = 0;
    t.onEnd(() => ended++);
    t.setTimeline(quarters(4), 4);
    t.play(0);
    clock.advance(3);
    expect(t.state).toBe('stopped');
    expect(ended).toBe(1);
    expect(clock.running).toBe(false);
  });
});

describe('samples', () => {
  it('lists every minor third from A0 to C8', async () => {
    const { sampleNotes, sampleUrls, pickSampleFormat } = await import('./samples');
    const notes = sampleNotes();
    expect(notes).toHaveLength(30);
    expect(notes[0]).toBe('A0');
    expect(notes.at(-1)).toBe('C8');
    expect(sampleUrls('/inharmonia/', 'ogg')['D#4']).toBe(
      '/inharmonia/samples/salamander/v1/Ds4.ogg',
    );
    expect(pickSampleFormat(() => '')).toBe('mp3');
    expect(pickSampleFormat(() => 'probably')).toBe('ogg');
  });
});

describe('Transport count-in setting', () => {
  it('counts in from the setting even with the metronome off', () => {
    const clock = new FakeClock();
    const clicks: number[] = [];
    const t = new Transport({
      clock,
      ticker: clock,
      sink: { note: () => {}, click: (time) => clicks.push(time), silence: () => {} },
      bpm: 120,
    });
    t.setTimeline([], 8);
    t.setMetronome(false, 1);
    t.play(4);
    clock.advance(3);
    expect(clicks).toHaveLength(4);
  });
});
