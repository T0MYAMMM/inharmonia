import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { recordingBytes, recordingSamples, type UserRecording, type UserSong } from '@/core/songs';
import { getRecording, getSong } from '@/state/mySongs';
import songStyles from '../song/SongPage.module.css';
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
  if (!song)
    return (
      <div className={songStyles.header}>
        <h1>Song not found</h1>
        <p>
          <Link to="/songs">Back to Songs</Link>
        </p>
      </div>
    );
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
      <div className={songStyles.header}>
        <p className={songStyles.meta}>
          <Link to={`/songs/mine/${song.id}`}>← Back to the song</Link>
        </p>
        <h1>Edit {song.lesson.title}</h1>
      </div>
      <SongEditor
        initial={song.draft}
        song={song}
        take={take}
        hasKeptRecording={!!recording}
        recordingBytes={recording ? recordingBytes(recording) : 0}
        onSaved={() => undefined}
      />
    </>
  );
}
