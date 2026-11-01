import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BUILT_IN_ENTRIES } from '@/content/builtInIndex';
import { SONG_LEVELS, type SongLevel } from '@/core/content/types';
import type { CatalogueEntry } from '@/core/library/catalogue';
import {
  LIBRARY_MESSAGES,
  loadCatalogue,
  problemOf,
  useCatalogue,
  type LibraryProblem,
} from '@/state/catalogue';
import { downloadPiece } from '@/state/download';
import { hasUpdate, removePiece, useDownloads, type DownloadedPiece } from '@/state/downloads';
import { loadProgress, type ProgressState } from '@/state/progress';
import { BetaBadge } from '@/ui/BetaBadge';
import { Button } from '@/ui/Button';
import { buttonClass } from '@/ui/buttonClass';
import { Field } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { MySongsSection } from '../mysongs/MySongsSection';
import { PageHeader } from '../PageHeader';
import { LEVEL_NAMES } from './credit';
import { paginate } from './paginate';
import { SongCard } from './SongCard';
import styles from './SongsPage.module.css';

type LevelFilter = 'all' | SongLevel;
type Say = (words: string) => void;

const byTitle = (a: CatalogueEntry, b: CatalogueEntry) => a.title.localeCompare(b.title);

/**
 * Songs, in three parts: your songs (built in, downloaded, then made by you),
 * a way into Studio, and the catalogue to download from. One polite status
 * region says what downloads and removals did; each card has its own alert.
 */
export function SongsPage() {
  const progress = loadProgress().exercises;
  const kept = useDownloads();
  const listed = useCatalogue();
  const [said, setSaid] = useState('');
  const latest = new Map(listed.entries.map((e) => [e.piece, e]));
  const keptBy = new Map(kept.pieces.map((p) => [p.piece, p]));

  return (
    <>
      <PageHeader
        title="Songs"
        lede="Listen through a piece, then practise it note by note at your own pace. Your songs play offline; download more from the catalogue, or make your own."
      />
      <YourSongs
        kept={kept.pieces}
        latest={latest}
        progress={progress}
        say={setSaid}
        madeByYou={<MySongsSection />}
      />
      <MakeYourOwn />
      <Catalogue
        entries={listed.entries}
        status={listed.status}
        problem={listed.problem}
        keptBy={keptBy}
        progress={progress}
        say={setSaid}
      />
      <p role="status" className="visually-hidden" data-testid="songs-status">
        {said}
      </p>
    </>
  );
}

/** A download, update or removal on one card: whether it is under way, and what went wrong. */
function useCardAction() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<LibraryProblem | null>(null);
  const run = async (work: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      return true;
    } catch (e) {
      setProblem(problemOf(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const alert = (
    <div role="alert" className={styles.alert}>
      {problem ? <p className={styles.problem}>{LIBRARY_MESSAGES[problem]}</p> : null}
    </div>
  );
  return { busy, run, alert };
}

function YourSongs({
  kept,
  latest,
  progress,
  say,
  madeByYou,
}: {
  kept: readonly DownloadedPiece[];
  latest: ReadonlyMap<string, CatalogueEntry>;
  progress: ProgressState['exercises'];
  say: Say;
  madeByYou: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const songs = [
    ...BUILT_IN_ENTRIES.map((entry) => ({ entry, kept: undefined })),
    ...kept.map((k) => ({ entry: k.entry, kept: k })),
  ].sort((a, b) => byTitle(a.entry, b.entry));
  return (
    <section className={styles.section} aria-labelledby="your-songs-title">
      <h2 id="your-songs-title" ref={heading} tabIndex={-1}>
        Your songs
      </h2>
      <p className={styles.note}>On this device, so they play offline too.</p>
      <ul className={styles.list} data-testid="your-songs">
        {songs.map(({ entry, kept: k }) => (
          <li key={entry.piece}>
            {k ? (
              <KeptCard
                kept={k}
                latest={latest.get(k.piece)}
                progress={progress}
                say={say}
                onRemoved={() => heading.current?.focus()}
              />
            ) : (
              <SongCard entry={entry} progress={progress} />
            )}
          </li>
        ))}
      </ul>
      {madeByYou}
    </section>
  );
}

/** A downloaded piece: Update when the catalogue has a newer file, and Remove, which asks first. */
function KeptCard({
  kept,
  latest,
  progress,
  say,
  onRemoved,
}: {
  kept: DownloadedPiece;
  latest: CatalogueEntry | undefined;
  progress: ProgressState['exercises'];
  say: Say;
  onRemoved: () => void;
}) {
  const { busy, run, alert } = useCardAction();
  const [confirm, setConfirm] = useState(false);
  const title = kept.entry.title;
  const update = async () => {
    say(`Updating ${title}…`);
    if (await run(() => downloadPiece(latest!))) say(`${title} is up to date.`);
    else say('');
  };
  const remove = async () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    if (await run(() => removePiece(kept.piece))) {
      say(`${title} is no longer on this device. Your progress on it is kept.`);
      onRemoved();
    }
  };
  return (
    <SongCard
      entry={kept.entry}
      progress={progress}
      alert={alert}
      actions={
        <>
          {hasUpdate(kept, latest) ? (
            <Button
              size="small"
              onClick={() => void update()}
              disabled={busy}
              aria-label={`Update ${title}`}
            >
              Update
            </Button>
          ) : null}
          <Button
            size="small"
            variant="ghost"
            onClick={() => void remove()}
            onBlur={() => setConfirm(false)}
            disabled={busy}
            aria-label={confirm ? `Remove ${title} from this device?` : `Remove ${title}`}
          >
            {confirm ? 'Remove from this device?' : 'Remove'}
          </Button>
        </>
      }
    />
  );
}

/** The way into Studio, between your songs and the catalogue. */
function MakeYourOwn() {
  return (
    <section className={`${styles.section} ${styles.make}`} aria-labelledby="make-title">
      <h2 id="make-title" className={styles.makeTitle}>
        Make your own <BetaBadge />
      </h2>
      <p className={styles.note}>
        Sing a tune, play it on a piano roll or bring in a MIDI file: Studio makes it a song to
        practise.
      </p>
      <Link to="/studio" className={buttonClass('primary')}>
        Open Studio
      </Link>
    </section>
  );
}

/** Whether the browser says it is online, kept up to date. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

function Catalogue({
  entries,
  status,
  problem,
  keptBy,
  progress,
  say,
}: {
  entries: readonly CatalogueEntry[];
  status: 'idle' | 'loading' | 'ready' | 'failed';
  problem: LibraryProblem | null;
  keptBy: ReadonlyMap<string, DownloadedPiece>;
  progress: ProgressState['exercises'];
  say: Say;
}) {
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const composers = [...new Set(entries.map((e) => e.composer))].sort((a, b) => a.localeCompare(b));
  const level = (SONG_LEVELS as readonly string[]).includes(params.get('level') ?? '')
    ? (params.get('level') as SongLevel)
    : 'all';
  const composer = composers.includes(params.get('composer') ?? '') ? params.get('composer')! : '';
  const query = params.get('q') ?? '';
  const listRef = useRef<HTMLUListElement>(null);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    // A new filter starts again from the first page.
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const goTo = (n: number) => {
    set('page', n > 1 ? String(n) : '');
    const list = listRef.current;
    if (list && list.getBoundingClientRect().top < 0) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      list.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }
  };

  const q = query.trim().toLowerCase();
  const matching = entries.filter((e) => {
    if (level !== 'all' && !e.levels.some((l) => l.level === level)) return false;
    if (composer && e.composer !== composer) return false;
    if (q && !`${e.title} ${e.composer}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const paged = paginate(matching, Number(params.get('page') ?? 1));

  return (
    <section className={styles.section} aria-labelledby="catalogue-title">
      <h2 id="catalogue-title">Catalogue</h2>
      <p className={styles.note}>
        More songs to download. Each stays on this device once downloaded.
      </p>
      {status === 'failed' ? (
        <div className={styles.unreachable} data-testid="catalogue-unreachable">
          <p>The catalogue couldn't be reached. {LIBRARY_MESSAGES[problem ?? 'network']}</p>
          <Button size="small" onClick={() => void loadCatalogue()}>
            Try again
          </Button>
        </div>
      ) : status !== 'ready' ? (
        <p className={styles.note} aria-busy="true">
          Looking at the catalogue…
        </p>
      ) : (
        <>
          {online ? null : (
            <p className={styles.offline} data-testid="catalogue-offline">
              {LIBRARY_MESSAGES.offline}
            </p>
          )}
          <div className={styles.filters}>
            <Field label="Level" group>
              <Segmented<LevelFilter>
                label="Level"
                value={level}
                options={[
                  { value: 'all', label: 'All' },
                  ...SONG_LEVELS.map((l) => ({ value: l, label: LEVEL_NAMES[l] })),
                ]}
                onChange={(v) => set('level', v === 'all' ? '' : v)}
              />
            </Field>
            <Field label="Composer">
              <Select
                value={composer}
                onChange={(e) => set('composer', e.target.value)}
                data-testid="songs-composer"
              >
                <option value="">Everyone</option>
                {composers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Search">
              <TextInput
                type="search"
                value={query}
                placeholder="Title or composer"
                onChange={(e) => set('q', e.target.value)}
                data-testid="songs-search"
              />
            </Field>
          </div>
          {matching.length === 0 ? (
            <p className={styles.meta} data-testid="songs-empty">
              No songs match. <Link to="/songs">Show them all</Link>
            </p>
          ) : null}
          <ul ref={listRef} className={styles.list} data-testid="songs">
            {paged.items.map((entry) => (
              <li key={entry.piece}>
                <CatalogueCard
                  entry={entry}
                  kept={keptBy.get(entry.piece)}
                  level={level === 'all' ? undefined : level}
                  progress={progress}
                  say={say}
                />
              </li>
            ))}
          </ul>
          {paged.pages > 1 ? (
            <nav className={styles.pager} aria-label="Song pages">
              <button
                type="button"
                className={styles.pageButton}
                aria-label="Previous page"
                disabled={paged.page === 1}
                onClick={() => goTo(paged.page - 1)}
                data-testid="songs-prev"
              >
                <Chevron direction="left" />
              </button>
              <span className={styles.pageStatus} aria-live="polite" data-testid="songs-page">
                Page {paged.page} of {paged.pages}
              </span>
              <button
                type="button"
                className={styles.pageButton}
                aria-label="Next page"
                disabled={paged.page === paged.pages}
                onClick={() => goTo(paged.page + 1)}
                data-testid="songs-next"
              >
                <Chevron direction="right" />
              </button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}

/** A catalogue piece: Download, Update, or a word that it is on this device already. */
function CatalogueCard({
  entry,
  kept,
  level,
  progress,
  say,
}: {
  entry: CatalogueEntry;
  kept: DownloadedPiece | undefined;
  level: SongLevel | undefined;
  progress: ProgressState['exercises'];
  say: Say;
}) {
  const { busy, run, alert } = useCardAction();
  const title = useRef<HTMLAnchorElement>(null);
  const update = kept !== undefined && hasUpdate(kept, entry);
  const word = busy ? (update ? 'Updating' : 'Downloading') : update ? 'Update' : 'Download';
  const download = async () => {
    say(`${update ? 'Updating' : 'Downloading'} ${entry.title}…`);
    if (await run(() => downloadPiece(entry))) {
      say(
        update
          ? `${entry.title} is up to date.`
          : `${entry.title} is on this device now, in Your songs.`,
      );
      // The button is gone: the piece's own link is the next thing to use.
      title.current?.focus();
    } else say('');
  };
  return (
    <SongCard
      entry={entry}
      level={level}
      progress={progress}
      titleRef={title}
      alert={alert}
      actions={
        kept && !update ? (
          <span className={styles.onDevice} data-testid="on-device">
            On this device
          </span>
        ) : (
          <Button
            size="small"
            onClick={() => void download()}
            disabled={busy}
            aria-label={`${word} ${entry.title}`}
          >
            {busy ? `${word}…` : word}
          </Button>
        )
      }
    />
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
