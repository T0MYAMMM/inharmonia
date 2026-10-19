import { FILLS } from '@/content/fills';
import { PATTERNS } from '@/content/patterns';
import { sortTimeline } from '../audio/timeline';
import { transposeNote, voiceChord, type VoicingStyle } from '../theory';
import { compileLesson, resolveVoicing, soundingSpans, type CompiledLesson } from './compile';
import { withFills } from './fills';
import { NO_CHORD, type Lesson } from './types';
/** Playback-only arrangement choices. The authored song and its exported file stay unchanged. */
export interface SongArrangementOptions {
  /** 'original' keeps the song's written/assigned left hand. */
  pattern: string;
  /** Shift chord voicings, not the right-hand melody. */
  chordOctave: -2 | -1 | 0 | 1 | 2;
  voicing: 'original' | VoicingStyle;
  inversion: 'original' | 0 | 1 | 2;
  /** A right-hand fill, inserted only where the written melody is silent. */
  fill: string;
}

export const DEFAULT_SONG_ARRANGEMENT: SongArrangementOptions = {
  pattern: 'original',
  chordOctave: 0,
  voicing: 'original',
  inversion: 'original',
  fill: '',
};

const EPS = 1e-9;

/**
 * Compile a song with temporary performance settings.
 * Never alter its melody, chord symbols or the original lesson object.
 */
export function compileSongArrangement(
  lesson: Lesson,
  options: SongArrangementOptions,
): CompiledLesson {
  const chosen = PATTERNS[options.pattern];
  const usePattern =
    options.pattern !== 'original' &&
    !!chosen &&
    (chosen.beatsPerBar === undefined || chosen.beatsPerBar === lesson.meter.beats);
  const revoice =
    options.chordOctave !== 0 || options.voicing !== 'original' || options.inversion !== 'original';

  const arranged: Lesson = {
    ...lesson,
    bars: lesson.bars.map((bar) => {
      const copy = { ...bar };
      if (usePattern) delete copy.lh; // explicit left-hand notes otherwise override a pattern
      if (revoice)
        copy.chords = bar.chords.map((chord) => {
          if (chord.symbol === NO_CHORD) return chord;
          const notes =
            options.voicing === 'original' && options.inversion === 'original'
              ? resolveVoicing(chord.symbol, chord.voicing)
              : voiceChord(chord.symbol, {
                  style: options.voicing === 'original' ? 'close' : options.voicing,
                  ...(options.inversion === 'original' ? {} : { inversion: options.inversion }),
                  floor: 'C3',
                });
          return {
            ...chord,
            voicing: {
              notes: notes.map((note) => transposeNote(note, options.chordOctave * 12).name),
            },
          };
        });
      return copy;
    }),
  };
  if (usePattern) {
    delete arranged.lhFigure;
    arranged.lhPattern = chosen.id;
  }
  const compiled = compileLesson(arranged, PATTERNS);

  const fill = FILLS.find((candidate) => candidate.id === options.fill && candidate.hand === 'rh');
  // N.C. cannot be used as a fill's harmonic source or destination.
  if (!fill || compiled.chords.some((c) => c.symbol === NO_CHORD)) return compiled;

  const decorated = withFills(compiled, fill, lesson.key);
  const added = decorated.events.filter((event) => event.id.startsWith('fill-'));
  const melody = soundingSpans(compiled.bars.flatMap((b) => b.rh)).map((n) => ({
    start: n.startBeat,
    end: n.startBeat + n.beats,
  }));

  // A transition is either entirely safe or entirely omitted; don't leave partial runs.
  const blocked = new Set<string>();
  for (const event of added) {
    const transition = /^fill-(\d+)-/.exec(event.id)?.[1];
    if (
      transition !== undefined &&
      melody.some(
        (note) => event.beat < note.end - EPS && event.beat + event.dur > note.start + EPS,
      )
    )
      blocked.add(transition);
  }
  const safe = added.filter((event) => {
    const transition = /^fill-(\d+)-/.exec(event.id)?.[1];
    return transition !== undefined && !blocked.has(transition);
  });
  const visible = decorated.fills?.filter((hit) =>
    safe.some((event) => Math.abs(event.beat - hit.beat) < EPS && hit.midis.includes(event.midi)),
  );
  return {
    ...compiled,
    events: sortTimeline([...compiled.events, ...safe]),
    ...(visible?.length ? { fills: visible } : {}),
  };
}
