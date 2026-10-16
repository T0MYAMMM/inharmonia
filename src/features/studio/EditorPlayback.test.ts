import { describe, expect, it, vi } from 'vitest';
import { FakeClock, Transport } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import { compileLesson } from '@/core/content/compile';
import { toLesson, type SongDraft } from '@/core/songs';
import { EditorPlayback } from './EditorPlayback';

const draft: SongDraft = {
  title: 'T',
  key: { tonic: 'C', mode: 'major' },
  tempo: 120,
  meter: { beats: 4, unit: 4 },
  bars: 1,
  notes: [
    { id: 'n1', startBeat: 0, beats: 2, midi: 64 },
    { id: 'n2', startBeat: 2, beats: 2, midi: 67 },
  ],
  chords: [{ startBeat: 0, beats: 4, symbol: 'C' }],
  lhPattern: 'block',
};
const compiled = compileLesson(toLesson(draft, 'x'), {
  block: {
    id: 'block',
    name: 'Block',
    cycleBeats: 4,
    steps: [{ at: 0, dur: 'chord', voices: ['all'] }],
  },
});

function setup() {
  const clock = new FakeClock();
  const played: { midi: number; channel: string }[] = [];
  const transport = new Transport({
    clock,
    ticker: clock,
    sink: {
      note: (n) => played.push({ midi: n.midi, channel: n.channel }),
      click: () => {},
      silence: () => {},
    },
    startDelay: 0,
  });
  const rec = { stop: vi.fn(), setGain: vi.fn() };
  const audio = {
    unlock: vi.fn(async () => {}),
    now: () => clock.now(),
    outputLatency: () => 0,
    playRecording: vi.fn(() => rec),
  };
  const pb = new EditorPlayback({ transport, audio: audio as unknown as AudioEngine });
  return { clock, transport, audio, rec, pb, played };
}

const take = { samples: new Float32Array(48000), sampleRate: 48000, beat0: 0.75 };

describe('editor playback', () => {
  it('plays the take in sync from the same beat, starting at beat 0 of the recording', () => {
    const { pb, audio, transport } = setup();
    pb.play(compiled, take, 2);
    const [, , when, gain, offset] = audio.playRecording.mock.calls[0] as unknown as number[];
    expect(when).toBeCloseTo(transport.timeAtBeat(2));
    expect(gain).toBe(0); // B (the notes) by default
    expect(offset).toBeCloseTo(0.75 + 2 * 0.5); // beat 0 of the take, plus two beats at 120 bpm
  });

  it('plays only your take when A is chosen: the melody is muted, the chords play', () => {
    const { pb, clock, played, audio } = setup();
    pb.play(compiled, take);
    pb.setSource('take');
    pb.stop();
    played.length = 0;
    pb.play(compiled, take);
    clock.advance(2.5);
    expect((audio.playRecording.mock.calls[1] as unknown as number[])[3]).toBe(0.9);
    expect(played.filter((n) => n.channel === 'rh')).toEqual([]);
    expect(played.some((n) => n.channel === 'lh')).toBe(true);
  });

  it('switches between your take and the notes while playing', () => {
    const { pb, rec, transport, clock, played } = setup();
    pb.play(compiled, take);
    pb.setSource('take');
    expect(rec.setGain).toHaveBeenLastCalledWith(0.9);
    expect(transport.isMuted('rh')).toBe(true);
    clock.advance(0.3);
    // Back to the notes before G4 (beat 2, one second in) is scheduled: it plays.
    pb.setSource('notes');
    expect(rec.setGain).toHaveBeenLastCalledWith(0);
    clock.advance(1.5);
    expect(played.some((n) => n.channel === 'rh' && n.midi === 67)).toBe(true);
  });

  it('can leave the chords out, and tidies up when it stops', () => {
    const { pb, rec, transport } = setup();
    pb.play(compiled, take);
    pb.setChords(false);
    expect(transport.isMuted('lh')).toBe(true);
    pb.stop();
    expect(rec.stop).toHaveBeenCalled();
    expect(transport.state).toBe('stopped');
    expect(transport.isMuted('lh')).toBe(false);
    expect(transport.isMuted('rh')).toBe(false);
  });

  it('plays only the notes when there is no take', () => {
    const { pb, audio } = setup();
    pb.setSource('take');
    pb.play(compiled, null);
    expect(audio.playRecording).not.toHaveBeenCalled();
    expect(pb.source).toBe('notes');
  });
});
