import type { CompiledLesson } from '@/core/content/compile';
import type { MidiProject, MidiTrack } from './smf';

/** Convert any playable InHarmonia lesson to a real Standard MIDI File. */
export function compiledToMidi(compiled: CompiledLesson): MidiProject {
  const tracks: MidiTrack[] = (['rh', 'lh'] as const)
    .map((hand, i) => ({
      id: hand,
      name: hand === 'rh' ? 'Right hand · melody' : 'Left hand · accompaniment',
      channel: i,
      program: 0,
      muted: false,
      notes: compiled.events.filter((n) => n.channel === hand).map((n, j) => ({
        id: hand + j,
        startBeat: n.beat,
        beats: n.dur,
        midi: n.midi,
        velocity: Math.max(1, Math.min(127, Math.round(n.velocity * 127))),
      })),
    }))
    .filter((track) => track.notes.length);
  const tempo = compiled.lesson.tempo.default;
  const { beats, unit } = compiled.lesson.meter;
  return {
    title: compiled.lesson.title,
    ppq: 480,
    tempo,
    meter: { beats, unit },
    tempos: [{ beat: 0, bpm: tempo }],
    meters: [{ beat: 0, numerator: beats, denominator: unit }],
    tracks,
  };
}

/** A MIDI project's full polyphony, not a lossy monophonic score reduction. */
export function midiEvents(project: MidiProject) {
  return project.tracks.flatMap((track, index) =>
    track.notes.map((n) => ({
      id: track.id + '-' + n.id,
      beat: n.startBeat,
      dur: n.beats,
      midi: n.midi,
      velocity: n.velocity / 127,
      channel: (index === 0 ? 'rh' : 'lh') as 'rh' | 'lh',
    })),
  ).sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}

export function blankMidiProject(): MidiProject {
  return {
    title: 'Untitled MIDI',
    ppq: 480,
    tempo: 120,
    meter: { beats: 4, unit: 4 },
    tempos: [{ beat: 0, bpm: 120 }],
    meters: [{ beat: 0, numerator: 4, denominator: 4 }],
    tracks: [
      { id: 'melody', name: 'Piano · melody', channel: 0, program: 0, muted: false, notes: [] },
    ],
  };
}
