import { useId, useRef, useState } from 'react';
import { formatBytes } from '@/core/songs';
import { download, type ExportResult } from '@/state/transfer';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Menu, MenuCheckItem, MenuItem, MenuSeparator } from '@/ui/Menu';
import { ChevronDownIcon } from '../studio/icons';
import styles from './transfer.module.css';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const itemsWord = (n: number) => `${n} item${n === 1 ? '' : 's'}`;
const chartsWord = (n: number) => `${n} chart${n === 1 ? '' : 's'}`;

/**
 * What happened to lyrics in a file just made, said after what was saved:
 * for one chart "… Lyrics left out." or "…, with lyrics."; for several, how
 * many charts. Nothing when no chart has any.
 */
function lyricsNote(r: ExportResult, many: boolean): string {
  const { leftOut, included } = r.lyrics;
  if (many)
    return leftOut
      ? ` Lyrics left out of ${chartsWord(leftOut)}.`
      : included
        ? ` Lyrics included for ${chartsWord(included)}.`
        : '';
  return leftOut ? '. Lyrics left out.' : included ? ', with lyrics.' : '';
}

/**
 * Export for one item (a song, chart or progression page): one menu that
 * downloads or copies its JSON and, for songs, downloads its .mid. For a
 * chart with lyrics it has Include lyrics, unticked each time the menu
 * opens. What the last choice did is said beside the button, lyrics left
 * out included.
 */
export function ExportMenu({
  build,
  midi,
  lyrics = false,
}: {
  /** The file, with the chart's lyrics when asked for them. */
  build: (includeLyrics: boolean) => Promise<ExportResult>;
  /** A .mid download, for songs; its test id names the page it is on. */
  midi?: { download: () => void; testId: string };
  /** The item is a chart with lyrics: offer to include them. */
  lyrics?: boolean;
}) {
  const [status, setStatus] = useState('');
  const [withLyrics, setWithLyrics] = useState(false);
  const run = async (how: 'download' | 'copy') => {
    const r = await build(lyrics && withLyrics);
    const note = lyricsNote(r, false);
    if (how === 'download') {
      download(r.text, r.fileName);
      setStatus(`Saved ${r.fileName}${note}`);
    } else
      setStatus((await copy(r.text)) ? `Copied as JSON${note}` : 'Could not reach the clipboard');
  };
  return (
    <span className={styles.exportMenu}>
      <Menu
        size="small"
        label={
          <>
            Export <ChevronDownIcon />
          </>
        }
        // Each time it opens, lyrics start left out.
        onClick={() => setWithLyrics(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setWithLyrics(false);
        }}
        data-testid="export-menu"
      >
        <MenuItem onSelect={() => void run('download')} data-testid="export-download">
          Download .json
        </MenuItem>
        <MenuItem onSelect={() => void run('copy')} data-testid="export-copy">
          Copy as JSON
        </MenuItem>
        {midi ? (
          <>
            <MenuSeparator />
            <MenuItem onSelect={midi.download} data-testid={midi.testId}>
              Download .mid
            </MenuItem>
          </>
        ) : null}
        {lyrics ? (
          <>
            <MenuSeparator />
            <MenuCheckItem
              checked={withLyrics}
              onChange={setWithLyrics}
              note={
                withLyrics
                  ? 'In the file: keep it to yourself.'
                  : 'Left out: lyrics stay on this device.'
              }
              data-testid="export-lyrics"
            >
              Include lyrics
            </MenuCheckItem>
          </>
        ) : null}
      </Menu>
      <span className={styles.note} role="status">
        {status}
      </span>
    </span>
  );
}

export interface ExportCandidate {
  key: string;
  kind: 'song' | 'chart' | 'progression';
  title: string;
  /** Size of a kept recording, for songs that have one. */
  recordingBytes?: number;
  /** A chart with lyrics. */
  lyrics?: boolean;
}

/**
 * Export everything or a selection: a list to tick, optional "include
 * recordings" and "include lyrics" boxes (off unless asked, each time it
 * opens), then download or copy.
 */
export function ExportDialog({
  candidates,
  build,
  label = 'Export',
}: {
  candidates: readonly ExportCandidate[];
  build: (
    keys: ReadonlySet<string>,
    includeRecordings: boolean,
    includeLyrics: boolean,
  ) => Promise<ExportResult>;
  label?: string;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [recordings, setRecordings] = useState(false);
  const [lyrics, setLyrics] = useState(false);
  const [status, setStatus] = useState('');
  const lyricsNoteId = useId();
  const open = () => {
    setChosen(new Set(candidates.map((c) => c.key)));
    setRecordings(false);
    setLyrics(false);
    setStatus('');
    ref.current?.showModal();
  };
  const picked = candidates.filter((c) => chosen.has(c.key));
  const recBytes = picked.reduce((s, c) => s + (c.recordingBytes ?? 0), 0);
  const sung = picked.filter((c) => c.lyrics).length;
  const run = async (how: 'download' | 'copy') => {
    const r = await build(chosen, recordings && recBytes > 0, lyrics && sung > 0);
    if (how === 'download') {
      download(r.text, r.fileName);
      setStatus(`Saved ${r.fileName}: ${itemsWord(r.items)}.${lyricsNote(r, true)}`);
    } else
      setStatus(
        (await copy(r.text))
          ? `Copied ${itemsWord(r.items)} as JSON.${lyricsNote(r, true)}`
          : 'Could not reach the clipboard.',
      );
  };
  const toggle = (key: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <>
      <Button
        size="small"
        onClick={open}
        disabled={candidates.length === 0}
        data-testid="export-open"
      >
        {label}
      </Button>
      <dialog
        ref={ref}
        className={styles.dialog}
        aria-labelledby="export-title"
        data-testid="export-dialog"
      >
        <div className={styles.body}>
          <div className={styles.head}>
            <h2 id="export-title" className={styles.title}>
              Export
            </h2>
            <span className={styles.actions}>
              <Button
                size="small"
                variant="ghost"
                onClick={() => setChosen(new Set(candidates.map((c) => c.key)))}
              >
                All
              </Button>
              <Button size="small" variant="ghost" onClick={() => setChosen(new Set())}>
                None
              </Button>
            </span>
          </div>
          <p className={styles.note}>
            A readable JSON file for backup or another device. It stays with you: nothing is
            uploaded.
          </p>
          <ul className={styles.list}>
            {candidates.map((c) => (
              <li key={c.key}>
                <Checkbox
                  className={styles.row}
                  checked={chosen.has(c.key)}
                  onChange={() => toggle(c.key)}
                >
                  <span className={styles.kind}>{c.kind}</span>
                  <span className={styles.itemTitle}>{c.title}</span>
                </Checkbox>
              </li>
            ))}
          </ul>
          {recBytes > 0 ? (
            <Checkbox checked={recordings} onChange={setRecordings} data-testid="export-recordings">
              Include recordings ({formatBytes(recBytes)})
            </Checkbox>
          ) : null}
          {sung > 0 ? (
            <div className={styles.option}>
              <Checkbox
                checked={lyrics}
                onChange={setLyrics}
                aria-describedby={lyricsNoteId}
                data-testid="export-lyrics"
              >
                Include lyrics ({chartsWord(sung)})
              </Checkbox>
              <span id={lyricsNoteId} className={styles.note}>
                Left out unless you tick this: lyrics stay on this device.
              </span>
            </div>
          ) : null}
          <div className={styles.actions}>
            <Button
              variant="primary"
              onClick={() => void run('download')}
              disabled={chosen.size === 0}
              data-testid="export-download"
            >
              Download .json
            </Button>
            <Button
              onClick={() => void run('copy')}
              disabled={chosen.size === 0}
              data-testid="export-copy"
            >
              Copy as JSON
            </Button>
            <Button variant="ghost" onClick={() => ref.current?.close()}>
              Close
            </Button>
          </div>
          <p className={styles.status} role="status" data-testid="export-status">
            {status}
          </p>
        </div>
      </dialog>
    </>
  );
}
