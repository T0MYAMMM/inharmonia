import { joinTinyRetriggers } from './cleanup';
import { describe, expect, it } from 'vitest';
import { parseMidi, writeMidi, cleanMidiProject, type MidiProject } from './smf';
import { compiledToMidi, midiEvents } from './adapters';
import { compileLesson } from '../content/compile';
import { PATTERNS } from '@/content/patterns';
import { midiToDraft, toLesson } from '../songs/draft';

const project: MidiProject = {
  title: 'Polyphony',
  ppq: 480,
  tempo: 96,
  meter: { beats: 4, unit: 4 },
  tempos: [
    { beat: 0, bpm: 96 },
    { beat: 8, bpm: 110 },
  ],
  meters: [{ beat: 0, numerator: 4, denominator: 4 }],
  tracks: [
    {
      id: 'one',
      name: 'RH',
      channel: 0,
      program: 0,
      muted: false,
      notes: [
        { id: 'n1', startBeat: 0, beats: 1, midi: 60, velocity: 90 },
        { id: 'n2', startBeat: 0, beats: 2, midi: 64, velocity: 85 },
        { id: 'n3', startBeat: 1, beats: 0.5, midi: 67, velocity: 72 },
      ],
    },
    {
      id: 'two',
      name: 'LH',
      channel: 1,
      program: 32,
      muted: false,
      notes: [{ id: 'n4', startBeat: 0, beats: 4, midi: 36, velocity: 101 }],
    },
  ],
};
describe('Standard MIDI File support', () => {
  it('imports and exports notes in multiple tracks without flattening chords or velocities', () => {
    const midi = writeMidi(project);
    expect(String.fromCharCode(...midi.slice(0, 4))).toBe('MThd');
    const loaded = parseMidi(midi, 'example.mid');
    expect(loaded.title).toBe('example');
    expect(loaded.ppq).toBe(480);
    expect(loaded.tempo).toBe(96);
    expect(loaded.tracks).toHaveLength(2);
    expect(loaded.tracks[0]!.notes.map((n) => [n.midi, n.startBeat, n.beats, n.velocity])).toEqual(
      project.tracks[0]!.notes.map((n) => [n.midi, n.startBeat, n.beats, n.velocity]),
    );
    expect(loaded.tracks[1]!.program).toBe(32);
    expect(loaded.tempos[1]!.bpm).toBeCloseTo(110, 2);
  });
  it('reads MIDI format 0 with running note-on/note-off status', () => {
    // One track, 96 ticks per beat; note-on C4, 96 ticks later running-status note-off.
    const bytes = Uint8Array.from([
      77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
      77, 84, 114, 107, 0, 0, 0, 12,
      0, 0x90, 60, 95, 0x60, 60, 0, 0, 0xff, 0x2f, 0,
    ]);
    const loaded = parseMidi(bytes, 'format-zero.mid');
    expect(loaded.tracks).toHaveLength(1);
    expect(loaded.tracks[0]!.notes[0]).toMatchObject({
      midi: 60, velocity: 95, startBeat: 0, beats: 1,
    });
  });
  it('joins only tiny fragmented retriggers and can be undone by keeping the source', () => {
    const source = { ...project.tracks[0]!, notes: [
      { id: 'a', midi: 60, startBeat: 0, beats: 0.125, velocity: 70 },
      { id: 'b', midi: 60, startBeat: 0.13, beats: 0.125, velocity: 80 },
      { id: 'c', midi: 60, startBeat: 1, beats: 1, velocity: 90 },
      { id: 'd', midi: 60, startBeat: 2, beats: 1, velocity: 90 },
    ] };
    const fixed = joinTinyRetriggers(source);
    expect(fixed.notes).toHaveLength(3);
    expect(fixed.notes[0]).toMatchObject({ startBeat: 0, beats: 0.255, velocity: 80 });
    expect(source.notes).toHaveLength(4);
  });
  it('rejects corrupted files, SMPTE, oversized files and bad saved MIDI JSON', () => {
    expect(() => parseMidi(new Uint8Array([0, 1, 2]))).toThrow();
    const bad = writeMidi(project);
    bad[13] = 0xe7; // SMPTE instead of PPQ
    expect(() => parseMidi(bad)).toThrow(/SMPTE/);
    expect(() => parseMidi(new Uint8Array(10 * 1024 * 1024 + 1))).toThrow();
    expect(
      cleanMidiProject({ ...project, tracks: [{ ...project.tracks[0], notes: [{ midi: 200 }] }] }),
    ).toBeTypeOf('string');
  });
  it('keeps complete MIDI playback alongside a monophonic representative teaching score', () => {
    const draft = midiToDraft(project);
    const lesson = toLesson(draft, 'mine-midi');
    const compiled = compileLesson(lesson, PATTERNS);
    expect(draft.midi?.tracks).toHaveLength(2);
    expect(compiled.bars.length).toBeGreaterThanOrEqual(2);
    expect(compiled.events).toHaveLength(4);
    expect(compiled.events.filter((n) => n.beat === 0)).toHaveLength(3);
    expect(compiled.events.find((n) => n.midi === 36)?.channel).toBe('lh');
    expect(midiEvents(project)).toHaveLength(4);
    expect(compiledToMidi(compiled).tracks).toHaveLength(2);
  });
});
