import { useEffect, useState } from 'react';
import { useAudioState, useOnline, useTouchOnly } from '@/app/hooks';
import { midi } from '@/app/services';
import styles from './AudioNotice.module.css';
import { audioNotice, midiNotice, NOTICE_MS } from './noticeWords';

/**
 * One muted line, always mounted as a polite live region, that says what the
 * sound is doing (the synth while the piano loads, the piano landing, the
 * piano failing) and, in the dock, a MIDI keyboard coming or going. A moment's
 * notice takes the line for a few seconds, then the sound's state returns.
 */
export function AudioNotice({ midi: withMidi = true }: { midi?: boolean }) {
  const sound = useAudioState();
  const online = useOnline();
  const touchOnly = useTouchOnly();
  // "Piano ready" has had its moment (the piano lands once, so this never resets).
  const [readyPassed, setReadyPassed] = useState(false);
  // A MIDI keyboard came or went, said from the MIDI store's own events.
  const [moment, setMoment] = useState('');

  useEffect(() => {
    if (sound.status !== 'ready') return;
    const t = setTimeout(() => setReadyPassed(true), NOTICE_MS.ready);
    return () => clearTimeout(t);
  }, [sound.status]);

  useEffect(() => {
    if (!withMidi) return;
    let before = midi.state;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = midi.subscribe((after) => {
      const text = midiNotice(before, after, touchOnly);
      before = after;
      if (!text) return;
      setMoment(text);
      clearTimeout(timer);
      timer = setTimeout(() => setMoment(''), NOTICE_MS.midi);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [withMidi, touchOnly]);

  const said = sound.status === 'ready' && readyPassed ? '' : audioNotice(sound.status, online);
  return (
    <p className={styles.notice} role="status" aria-live="polite" data-testid="dock-notice">
      {moment || said}
    </p>
  );
}
