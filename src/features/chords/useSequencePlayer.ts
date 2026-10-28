import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { PATTERNS } from '@/content/patterns';
import { audio, getTransport, lights } from '@/app/services';
import {
  chartToLesson,
  EMPTY_SEQUENCE,
  sequenceChart,
  sequenceView,
  type ChordSequence,
} from '@/core/charts';
import { compileLesson } from '@/core/content/compile';
import { SequencePlayer, type SequenceSnapshot } from './SequencePlayer';

export interface SequencePlayback extends SequenceSnapshot {
  play: () => void;
  stop: () => void;
}

/**
 * Play a sequence: compiled as a chart whenever its chords or style change,
 * at its tempo and loop setting. Stops when the page goes.
 */
export function useSequencePlayer(seq: ChordSequence): SequencePlayback {
  const [player] = useState(() => new SequencePlayer({ transport: getTransport(), audio, lights }));
  const snap = useSyncExternalStore(player.subscribe, () => player.snapshot);
  const { bars, meter, style } = seq;
  // The tempo plays from the transport, so changing it compiles nothing.
  const compiled = useMemo(() => {
    if (!bars.length) return null;
    const chordsOnly = { ...EMPTY_SEQUENCE, bars, meter, style };
    return compileLesson(
      chartToLesson('chord-sequence', sequenceChart(chordsOnly), sequenceView(chordsOnly)),
      PATTERNS,
    );
  }, [bars, meter, style]);

  useEffect(() => () => player.detach(), [player]);
  useEffect(() => player.load(compiled), [player, compiled]);
  useEffect(() => player.setTempo(seq.tempo), [player, seq.tempo]);
  useEffect(() => player.setLoop(seq.loop), [player, seq.loop]);

  return { ...snap, play: () => player.play(), stop: () => player.stop() };
}
