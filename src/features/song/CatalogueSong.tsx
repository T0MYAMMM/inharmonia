import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { CatalogueEntry } from '@/core/library/catalogue';
import { keyName, prettyAccidentals } from '@/core/notation';
import { formatBytes } from '@/core/songs/recording';
import {
  LIBRARY_MESSAGES,
  loadCatalogue,
  problemOf,
  useCatalogue,
  type LibraryProblem,
} from '@/state/catalogue';
import { downloadPiece, findDownloaded, songsOf } from '@/state/download';
import { hasUpdate, useDownloads } from '@/state/downloads';
import { Button } from '@/ui/Button';
import { NotFoundPage } from '../not-found/NotFoundPage';
import page from '../page.module.css';
import { PageHeader } from '../PageHeader';
import { LEVEL_NAMES, LEVEL_NOTES } from './credit';
import { SongView } from './SongView';
import { useOnline } from '@/app/hooks';
import styles from './SongPage.module.css';

/** Why Download is off, on a song page while the browser is offline. */
export const OFFLINE = "You're offline. This song downloads when you're back online.";

/**
 * A song that isn't built in: played from this device when it was
 * downloaded (with Update when the catalogue has a newer file), or offered
 * for download when the catalogue lists it. After a download the player
 * appears in place, focus moves to Play, and the status region says so.
 */
export function CatalogueSong({ songId }: { songId: string }) {
  const kept = useDownloads();
  const listed = useCatalogue();
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState<LibraryProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const [arrived, setArrived] = useState(false);
  const found = kept.status === 'ready' ? findDownloaded(kept.pieces, songId) : undefined;
  const entry = listed.entries.find((e) => e.levels.some((l) => l.id === songId));

  useEffect(() => {
    // The player has just replaced the offer: Play is what to do next.
    if (arrived && found) document.querySelector<HTMLElement>('main [data-testid="play"]')?.focus();
  }, [arrived, found]);

  const download = async (e: CatalogueEntry, update: boolean) => {
    setBusy(true);
    setProblem(null);
    setSaid(update ? `Updating ${e.title}…` : `Downloading ${e.title}…`);
    try {
      await downloadPiece(e);
      setArrived(!update);
      setSaid(
        update
          ? `${e.title} is up to date.`
          : `${e.title} is on this device now, and plays offline too.`,
      );
    } catch (err) {
      setSaid('');
      setProblem(problemOf(err));
    } finally {
      setBusy(false);
    }
  };

  const alert = (
    <div role="alert" data-testid="download-problem">
      {problem ? <p className={styles.problem}>{LIBRARY_MESSAGES[problem]}</p> : null}
    </div>
  );
  let body;
  if (kept.status === 'loading') body = <div className={styles.waiting} aria-busy="true" />;
  else if (found)
    body = (
      <SongView
        lesson={found.song}
        versions={songsOf(found.kept)}
        notice={alert}
        actions={
          entry && hasUpdate(found.kept, entry) ? (
            <Button
              size="small"
              onClick={() => void download(entry, true)}
              disabled={busy}
              aria-label={`${busy ? 'Updating' : 'Update'} ${entry.title}`}
              data-testid="song-update"
            >
              {busy ? 'Updating…' : 'Update'}
            </Button>
          ) : null
        }
      />
    );
  else if (entry)
    body = (
      <DownloadOffer
        entry={entry}
        songId={songId}
        busy={busy}
        onDownload={() => void download(entry, false)}
        alert={alert}
      />
    );
  else if (listed.status === 'failed')
    body = (
      <PageHeader
        crumb={{ to: '/songs', label: 'Songs' }}
        title="This song isn't on this device."
        lede={`The catalogue couldn't be reached to find it. ${LIBRARY_MESSAGES[listed.problem ?? 'network']}`}
        actions={
          <Button size="small" onClick={() => void loadCatalogue()}>
            Try again
          </Button>
        }
      />
    );
  else if (listed.status === 'ready') body = <NotFoundPage />;
  else body = <div className={styles.waiting} aria-busy="true" />;

  return (
    <>
      {body}
      <p role="status" className="visually-hidden" data-testid="download-status">
        {said}
      </p>
    </>
  );
}

/**
 * A catalogue song not on this device: what it is, its versions, its size, and
 * Download. Offline, Download waits, disabled, until the browser is back
 * online; it never starts by itself.
 */
function DownloadOffer({
  entry,
  songId,
  busy,
  onDownload,
  alert,
}: {
  entry: CatalogueEntry;
  songId: string;
  busy: boolean;
  onDownload: () => void;
  alert: ReactNode;
}) {
  const version = entry.levels.find((l) => l.id === songId)!;
  const online = useOnline();
  const offlineId = useId();
  const moved =
    version.key.tonic !== entry.key.tonic || version.key.mode !== entry.key.mode
      ? ` (written in ${prettyAccidentals(keyName(entry.key))})`
      : '';
  return (
    <>
      <PageHeader
        crumb={{ to: '/songs', label: 'Songs' }}
        title={entry.title}
        lede={
          <>
            <p data-testid="song-credit">{entry.credit}</p>
            <p>
              {prettyAccidentals(keyName(version.key))}
              {moved}, {entry.meter.beats}/{entry.meter.unit}, {version.bars} bars
            </p>
            {entry.levels.length > 1 ? (
              <nav className={styles.levels} aria-label="Versions" data-testid="song-levels">
                {entry.levels.map((l) => (
                  <Link
                    key={l.id}
                    to={`/songs/${l.id}`}
                    className={styles.level}
                    aria-current={l.id === songId ? 'page' : undefined}
                  >
                    {LEVEL_NAMES[l.level]}
                  </Link>
                ))}
              </nav>
            ) : null}
            <p className={page.small}>{LEVEL_NOTES[version.level]}</p>
            {entry.summary ? <p>{entry.summary}</p> : null}
            <p data-testid="download-offer">
              {`In the catalogue, not on this device yet. Download it once (${formatBytes(entry.bytes)}, every version) to play it here, offline too.`}
            </p>
            {online ? null : (
              <p id={offlineId} data-testid="download-offline">
                {OFFLINE}
              </p>
            )}
          </>
        }
        actions={
          <Button
            variant="primary"
            onClick={onDownload}
            disabled={busy || !online}
            aria-describedby={online ? undefined : offlineId}
            aria-label={`${busy ? 'Downloading' : 'Download'} ${entry.title}`}
            data-testid="song-download"
          >
            {busy ? 'Downloading…' : 'Download'}
          </Button>
        }
      />
      {alert}
    </>
  );
}
