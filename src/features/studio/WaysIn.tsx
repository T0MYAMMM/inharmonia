import { useState, type HTMLAttributes, type ReactNode } from 'react';
import { parseMidi, type MidiProject } from '@/core/midi/smf';
import { CardArt } from '@/ui/art/CardArt';
import { MidiFilePage } from '@/ui/art/MidiFilePage';
import { TWINKLE } from '@/ui/art/previews';
import { SongRoll } from '@/ui/art/SongRoll';
import { SungToNotes } from '@/ui/art/SungToNotes';
import { Button } from '@/ui/Button';
import { FilePicker } from '@/ui/FilePicker';
import { useFileDrop } from '@/ui/useFileDrop';
import { ArrowDownIcon } from './icons';
import { MIDI_ACCEPT, NOT_MIDI } from './midiFiles';
import styles from './studio.module.css';

export interface WaysInProps {
  /** Go to the take setup, further down the page. */
  onSing: () => void;
  onNew: () => void;
  onOpen: (project: MidiProject) => void;
}

/** The three ways into Studio, alike in size and weight: sing, compose, or open a file. */
export function WaysIn({ onSing, onNew, onOpen }: WaysInProps) {
  const [error, setError] = useState('');
  const [refused, setRefused] = useState('');
  const open = async (file?: File) => {
    if (!file) return;
    setRefused('');
    try {
      onOpen(parseMidi(await file.arrayBuffer(), file.name));
      setError('');
    } catch (e) {
      // What went wrong, then what to do: a .mid as music software saves it.
      const why = e instanceof Error ? e.message : 'Invalid MIDI file.';
      setError(`${why} Choose a .mid file saved by your music software.`);
    }
  };
  // The whole card takes a dropped file, not only its button.
  const { over, dropProps } = useFileDrop({
    accept: MIDI_ACCEPT,
    onFiles: ([file]) => void open(file),
    onReject: () => {
      setError('');
      setRefused(NOT_MIDI);
    },
  });

  return (
    <div className={styles.ways}>
      <Way
        id="way-sing"
        title="Sing a take"
        text="Sing or hum a melody. Studio writes down the notes and suggests chords."
        art={<SungToNotes preview={TWINKLE} />}
      >
        <Button onClick={onSing}>
          Set up the take <ArrowDownIcon />
        </Button>
      </Way>
      <Way
        id="way-compose"
        title="Compose in MIDI"
        text="Start an empty multitrack piano roll, then draw the notes or play them in."
        art={<SongRoll preview={TWINKLE} />}
      >
        <Button onClick={onNew} data-testid="studio-new-midi">
          New MIDI
        </Button>
      </Way>
      <Way
        id="way-open"
        title="Edit a MIDI file"
        text="Bring in a .mid from a DAW or a converter, or drop it on this card."
        art={<MidiFilePage preview={TWINKLE} />}
        note={
          // Both regions are always there; only their text comes and goes.
          <>
            <div role="alert">{error ? <p className={styles.problem}>{error}</p> : null}</div>
            <p role="status" className={styles.refused}>
              {refused}
            </p>
          </>
        }
        data-over={over || undefined}
        data-testid="studio-open-card"
        {...dropProps}
      >
        <FilePicker
          accept={MIDI_ACCEPT}
          acceptDrop={false}
          showName={false}
          data-testid="studio-import-midi"
          onFiles={([file]) => void open(file)}
        >
          Open MIDI file
        </FilePicker>
      </Way>
    </div>
  );
}

interface WayProps extends HTMLAttributes<HTMLElement> {
  id: string;
  title: string;
  /** What this way in is for, in a sentence. */
  text: string;
  /** Said about the last try, above the action. */
  note?: ReactNode;
  /** The action, on the card's bottom edge. */
  children: ReactNode;
  /** A drawing of this way in, above the title. */
  art: ReactNode;
}

function Way({ id, title, text, note, children, art, ...rest }: WayProps) {
  return (
    <section className={styles.way} aria-labelledby={id} {...rest}>
      <CardArt>{art}</CardArt>
      <h2 id={id} className={styles.cardTitle}>
        {title}
      </h2>
      <p className={styles.wayText}>{text}</p>
      {note}
      <div className={styles.wayAction}>{children}</div>
    </section>
  );
}
