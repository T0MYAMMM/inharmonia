import { compiledToMidi } from '@/core/midi/adapters';
import { downloadMidi } from '@/core/midi/smf';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PATTERNS } from '@/content/patterns';
import { compileLesson } from '@/core/content/compile';
import { keyName } from '@/core/notation';
import { formatBytes, type UserSong } from '@/core/songs';
import { deleteRecording, deleteSong, getSong, useMySongs } from '@/state/mySongs';
import { Button } from '@/ui/Button';
import { buttonClass } from '@/ui/buttonClass';
import { exportItems } from '@/state/transfer';
import { Checkbox } from '@/ui/Checkbox';
import { LessonPlayer } from '../song/LessonPlayer';
import { ExportButtons } from '../transfer/Export';
import songStyles from '../song/SongPage.module.css';
import { PrivateBadge } from './PrivateBadge';
import styles from './mysongs.module.css';

/** One of your songs in the player, with edit, recording and delete controls. */
export function MySongPage() {
  const { songId = '' } = useParams();
  const { songs, recordings, status } = useMySongs();
  const listed = songs.find((s) => s.id === songId);
  const [loaded, setLoaded] = useState<{ id: string; song: UserSong | null } | null>(null);
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [withRecording, setWithRecording] = useState(false);

  // Fall back to reading the song directly (the list may still be loading).
  useEffect(() => {
    if (listed) return;
    let live = true;
    getSong(songId)
      .then((s) => live && setLoaded({ id: songId, song: s ?? null }))
      .catch(() => live && setLoaded({ id: songId, song: null }));
    return () => {
      live = false;
    };
  }, [songId, listed]);

  const song = listed ?? (loaded?.id === songId ? loaded.song : undefined);
  const compiled = useMemo(() => (song ? compileLesson(song.lesson, PATTERNS) : null), [song]);

  if (song === undefined && status !== 'unavailable')
    return <p className={styles.note}>Loading…</p>;
  if (!song || !compiled)
    return (
      <div className={songStyles.header}>
        <h1>Song not found</h1>
        <p className={styles.note}>
          It may have been deleted, or it was made in another browser. Songs stay in the browser
          they were made in; use export and import to move them.
        </p>
        <p>
          <Link to="/songs">Back to Songs</Link>
        </p>
      </div>
    );

  const bytes = recordings[song.id];
  return (
    <>
      <div className={songStyles.header}>
        <p className={songStyles.meta}>
          <Link to="/songs">Songs</Link>
        </p>
        <h1>{song.lesson.title}</h1>
        <PrivateBadge />
        <p className={songStyles.meta}>
          {keyName(song.lesson.key)}, {song.lesson.meter.beats}/{song.lesson.meter.unit},{' '}
          {song.lesson.bars.length} bars
        </p>
        <div className={styles.actions}>
          <Link to={`/studio/edit/${song.id}`} className={buttonClass('secondary', 'small')}>
            Edit
          </Link>
          {bytes ? (
            <>
              <span className={styles.note}>Recording kept, {formatBytes(bytes)}.</span>
              <Button
                size="small"
                variant="ghost"
                onClick={() => void deleteRecording(song.id)}
                data-testid="delete-recording"
              >
                Delete the recording
              </Button>
            </>
          ) : (
            <span className={styles.note}>No recording kept.</span>
          )}
        </div>
        <div className={styles.actions}>
          <Button
            size="small"
            variant="ghost"
            onClick={() => downloadMidi(song.draft.midi ?? compiledToMidi(compiled))}
            data-testid="my-song-midi-export"
          >
            Export .mid
          </Button>
          <ExportButtons
            build={() =>
              exportItems({ songs: [song], includeRecordings: !!bytes && withRecording })
            }
          />
          {bytes ? (
            <Checkbox className={styles.note} checked={withRecording} onChange={setWithRecording}>
              Include the recording
            </Checkbox>
          ) : null}
        </div>
      </div>
      <LessonPlayer key={song.id + song.updatedAt} compiled={compiled} variant="song" />
      <div className={styles.danger}>
        {confirm ? (
          <>
            <span>Delete “{song.lesson.title}” for good? This cannot be undone.</span>
            <Button
              size="small"
              onClick={() => void deleteSong(song.id).then(() => navigate('/songs'))}
              data-testid="confirm-delete"
            >
              Delete
            </Button>
            <Button size="small" variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button
            size="small"
            variant="ghost"
            onClick={() => setConfirm(true)}
            data-testid="delete-song"
          >
            Delete this song
          </Button>
        )}
      </div>
    </>
  );
}
