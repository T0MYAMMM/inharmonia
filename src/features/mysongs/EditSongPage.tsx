import { MidiWorkspace } from '../studio/MidiWorkspace';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { recordingBytes, recordingSamples, type UserRecording, type UserSong } from '@/core/songs';
import { getRecording, getSong } from '@/state/mySongs';
import { PageHeader } from '../PageHeader';
import { SongEditor } from '../studio/SongEditor';
import styles from './mysongs.module.css';

type Loaded = { id: string; song: UserSong | null; recording: UserRecording | null };

/** Edit a saved song, with its kept recording when there is one. */
export function EditSongPage() {
  const { songId = '' } = useParams();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([getSong(songId), getRecording(songId)])
      .then(
        ([song, recording]) =>
          live && setLoaded({ id: songId, song: song ?? null, recording: recording ?? null }),
      )
      .catch(() => live && setLoaded({ id: songId, song: null, recording: null }));
    return () => {
      live = false;
    };
  }, [songId]);

  if (!loaded || loaded.id !== songId) return <p className={styles.note}>Loading…</p>;
  const { song, recording } = loaded;
  if (!song) return <PageHeader crumb={{ to: '/songs', label: 'Songs' }} title="Song not found" />;
  const take = recording
    ? {
        audio: {
          samples: recordingSamples(recording),
          sampleRate: recording.sampleRate,
          beat0: recording.beat0,
        },
        trace: {
          values: recording.trace,
          start: recording.traceStart,
          hop: recording.traceHop,
          beat0: recording.beat0,
          tempo: song.draft.tempo,
          shift: recording.traceShift,
        },
      }
    : null;
  return (
    <>
      <PageHeader
        crumb={{ to: `/songs/mine/${song.id}`, label: song.lesson.title }}
        title={`Edit ${song.lesson.title}`}
      />
      {song.draft.midi ? (
        <MidiWorkspace key={song.id} initial={song.draft.midi} song={song} />
      ) : (
        <SongEditor
          initial={song.draft}
          song={song}
          take={take}
          hasKeptRecording={!!recording}
          recordingBytes={recording ? recordingBytes(recording) : 0}
          onSaved={() => undefined}
        />
      )}
    </>
  );
}
