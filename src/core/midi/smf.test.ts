import { joinTinyRetriggers } from './cleanup';
import { describe, expect, it } from 'vitest';
import { parseMidi, writeMidi, cleanMidiProject, type MidiProject } from './smf';
import { compiledToMidi, midiEvents } from './adapters';
import { compileLesson } from '../content/compile';
import { PATTERNS } from '@/content/patterns';
import { PROGRESSIONS } from '@/content/progressions';
import { getSong } from '@/content/lessons';
import { chartToLesson, DEFAULT_VIEW, progressionChart } from '../charts';
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
      77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 77, 84, 114, 107, 0, 0, 0, 11, 0, 0x90, 60,
      95, 0x60, 60, 0, 0, 0xff, 0x2f, 0,
    ]);
    const loaded = parseMidi(bytes, 'format-zero.mid');
    expect(loaded.tracks).toHaveLength(1);
    expect(loaded.tracks[0]!.notes[0]).toMatchObject({
      midi: 60,
      velocity: 95,
      startBeat: 0,
      beats: 1,
    });
  });
  it('joins only tiny fragmented retriggers and can be undone by keeping the source', () => {
    const source = {
      ...project.tracks[0]!,
      notes: [
        { id: 'a', midi: 60, startBeat: 0, beats: 0.125, velocity: 70 },
        { id: 'b', midi: 60, startBeat: 0.13, beats: 0.125, velocity: 80 },
        { id: 'c', midi: 60, startBeat: 1, beats: 1, velocity: 90 },
        { id: 'd', midi: 60, startBeat: 2, beats: 1, velocity: 90 },
      ],
    };
    const fixed = joinTinyRetriggers(source);
    expect(fixed.notes).toHaveLength(3);
    expect(fixed.notes[0]).toMatchObject({ startBeat: 0, beats: 0.255, velocity: 80 });
    expect(source.notes).toHaveLength(4);
  });
  it('rejects corrupted files, SMPTE, oversized files and bad saved MIDI JSON', () => {
    expect(() => parseMidi(new Uint8Array([0, 1, 2]))).toThrow();
    const bad = writeMidi(project);
    bad[12] = 0xe7; // SMPTE instead of PPQ
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
    expect(compiled.bars.length).toBe(1); // Four quarter-note beats form one 4/4 bar.
    expect(compiled.events).toHaveLength(4);
    expect(compiled.events.filter((n) => n.beat === 0)).toHaveLength(3);
    expect(compiled.events.find((n) => n.midi === 36)?.channel).toBe('lh');
    expect(midiEvents(project)).toHaveLength(4);
    expect(compiledToMidi(compiled).tracks).toHaveLength(2);
  });

  it("names a chart's one part Chords, and a song's two by hand", () => {
    const chart = compileLesson(
      chartToLesson('c', progressionChart(PROGRESSIONS[0]!, 'G'), DEFAULT_VIEW),
      PATTERNS,
    );
    expect(compiledToMidi(chart).tracks.map((t) => t.name)).toEqual(['Chords']);
    const song = compileLesson(getSong('twinkle-twinkle-easy')!, PATTERNS);
    expect(compiledToMidi(song).tracks.map((t) => t.name)).toEqual([
      'Right hand · melody',
      'Left hand · accompaniment',
    ]);
  });
});

/** A Standard MIDI File from raw track bodies: each body is the bytes of one MTrk. */
function smf(ppq: number, tracks: number[][]): Uint8Array {
  const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (type: string, body: number[]) => [
    ...[...type].map((c) => c.charCodeAt(0)),
    ...be32(body.length),
    ...body,
  ];
  return Uint8Array.from([
    ...chunk('MThd', [0, 1, 0, tracks.length, (ppq >> 8) & 255, ppq & 255]),
    ...tracks.flatMap((t) => chunk('MTrk', [...t, 0, 0xff, 0x2f, 0])),
  ]);
}

describe('a MIDI file Studio opens comes back from what it saves', () => {
  it('keeps tempo changes in the range a saved project is read back in', () => {
    // 400 bpm (150000 µs a beat) at the start, then 10 bpm (6000000 µs) a bar later.
    const tempo = (us: number) => [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255];
    const bytes = smf(480, [
      [0, ...tempo(150000), 0x83, 0x60, ...tempo(6000000)],
      [0, 0x90, 60, 90, 0x83, 0x60, 0x80, 60, 0],
    ]);
    const parsed = parseMidi(bytes);
    expect(parsed.tempos.map((t) => t.bpm)).toEqual([300, 20]);
    expect(typeof cleanMidiProject(parsed)).toBe('object');
  });

  it('reads back a file whose channels make more than 96 tracks', () => {
    // 7 track chunks, each playing a note on all 16 channels: 112 tracks once split.
    const chunkOf16 = Array.from({ length: 16 }, (_, ch) => [
      0,
      0x90 | ch,
      48 + ch,
      80,
      0x60,
      0x80 | ch,
      48 + ch,
      0,
    ]).flat();
    const parsed = parseMidi(
      smf(
        480,
        Array.from({ length: 7 }, () => chunkOf16),
      ),
    );
    expect(parsed.tracks).toHaveLength(112);
    const back = cleanMidiProject(JSON.parse(JSON.stringify(parsed)));
    expect(typeof back === 'object' && back.tracks).toHaveLength(112);
  });
});
