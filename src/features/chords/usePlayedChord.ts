import { useEffect, useState } from 'react';
import { notes } from '@/app/services';
import { PlayedChord, type Played } from '@/core/practice';

/** The chord being played on any input, or the last one played; null before any. */
export function usePlayedChord(): Played | null {
  const [tracker] = useState(() => new PlayedChord());
  const [played, setPlayed] = useState<Played | null>(null);
  useEffect(
    () =>
      notes.subscribe(() => {
        tracker.update(notes.held());
        setPlayed(tracker.current);
      }),
    [tracker],
  );
  return played;
}
