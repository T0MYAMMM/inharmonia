import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { PATTERNS } from '@/content/patterns';
import { keyName } from '@/core/notation';
import { formatBytes } from '@/core/songs';
import { exportSongs, importSongs, useMySongs } from '@/state/mySongs';
import { Button } from '@/ui/Button';
import { buttonClass } from '@/ui/buttonClass';
import list from '../song/SongsPage.module.css';
import { PrivateBadge } from './PrivateBadge';
import styles from './mysongs.module.css';

const PATTERN_IDS = new Set(Object.keys(PATTERNS));

/** Today's date as 2026-10-16, for the export file name. */
const today = () => new Date().toISOString().slice(0, 10);

/** Songs you made in Studio, with backup to a file and restore from one. */
export function MySongsSection() {
  const { status, songs, recordings } = useMySongs();
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const download = async () => {
    const text = await exportSongs();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `inharmonia-my-songs-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(
      `Exported ${songs.length} song${songs.length === 1 ? '' : 's'}. Recordings stay on this device.`,
    );
  };

  const load = async (file: File) => {
    const result = await importSongs(await file.text(), PATTERN_IDS, 'arpeggio-8ths');
    if ('error' in result) return setMessage(result.error);
    const parts = [
      result.added && `${result.added} added`,
      result.updated && `${result.updated} updated`,
      result.kept && `${result.kept} already here`,
      result.skipped.length &&
        `${result.skipped.length} skipped (${result.skipped.map((s) => `${s.title}: ${s.reason}`).join('; ')})`,
    ].filter(Boolean);
    setMessage(`Imported: ${parts.join(', ') || 'nothing new'}.`);
  };

  return (
    <section className={styles.section} aria-labelledby="my-songs-title">
      <div className={styles.sectionHead}>
        <h2 id="my-songs-title" className={styles.sectionTitle}>
          My songs
        </h2>
        <div className={styles.actions}>
          <Button
            size="small"
            onClick={() => void download()}
            disabled={songs.length === 0}
            data-testid="export-songs"
          >
            Export
          </Button>
          <label className={buttonClass('secondary', 'small')}>
            Import
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className={styles.file}
              data-testid="import-songs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void load(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
      <p className={styles.note}>
        Songs you make in Studio stay in this browser on this device. They are never uploaded or
        shared. Export them to a file to back them up or move them to another device.
      </p>
      {message ? (
        <p className={styles.result} role="status" data-testid="my-songs-status">
          {message}
        </p>
      ) : null}
      {status === 'unavailable' ? (
        <p className={styles.note}>
          This browser is not letting Inharmonia store songs (site data may be blocked, or this is a
          private window).
        </p>
      ) : status === 'ready' && songs.length === 0 ? (
        <p className={styles.note}>
          Nothing yet. <Link to="/studio">Sing one in Studio</Link>.
        </p>
      ) : (
        <ul className={list.list} data-testid="my-songs">
          {songs.map((s) => (
            <li key={s.id}>
              <Link to={`/songs/mine/${s.id}`} className={list.card}>
                <span className={list.title}>{s.lesson.title}</span>
                <PrivateBadge />
                <span className={list.meta}>
                  {keyName(s.lesson.key)}, {s.lesson.bars.length} bars
                </span>
                {recordings[s.id] ? (
                  <span className={list.meta}>
                    Recording kept, {formatBytes(recordings[s.id]!)}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
