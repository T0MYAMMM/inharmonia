import type { MidiNote, MidiTrack } from './smf';

/**
 * Repair fragmented short notes from automatic audio-to-MIDI converters.
 * Explicit opt-in: deliberate longer repeated notes are left untouched.
 * Pure, so Undo in the Studio restores exactly the original notes.
 */
export function joinTinyRetriggers(track: MidiTrack, gapBeats = 0.125): MidiTrack {
  const notes = [...track.notes].sort((a, b) => a.midi - b.midi || a.startBeat - b.startBeat);
  const joined: MidiNote[] = [];
  for (const note of notes) {
    const previous = joined.at(-1);
    if (previous && previous.midi === note.midi &&
      note.startBeat <= previous.startBeat + previous.beats + gapBeats &&
      (note.beats <= gapBeats || previous.beats <= gapBeats)) {
      previous.beats = Math.max(previous.beats, note.startBeat + note.beats - previous.startBeat);
      previous.velocity = Math.max(previous.velocity, note.velocity);
    } else joined.push({ ...note });
  }
  return { ...track, notes: joined.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi) };
}
