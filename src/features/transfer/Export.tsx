import { useRef, useState } from 'react';
import { formatBytes } from '@/core/songs';
import { download, type ExportResult } from '@/state/transfer';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
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

/** Download and copy buttons for one item (a song, chart or progression page). */
export function ExportButtons({
  build,
  label = 'Export',
}: {
  build: () => Promise<ExportResult>;
  label?: string;
}) {
  const [status, setStatus] = useState('');
  return (
    <span className={styles.actions} role="group" aria-label={label}>
      <Button
        size="small"
        variant="ghost"
        onClick={async () => {
          const r = await build();
          download(r.text, r.fileName);
          setStatus(`Saved ${r.fileName}`);
        }}
        data-testid="export-download"
      >
        Download .json
      </Button>
      <Button
        size="small"
        variant="ghost"
        onClick={async () => {
          const r = await build();
          setStatus((await copy(r.text)) ? 'Copied as JSON' : 'Could not reach the clipboard');
        }}
        data-testid="export-copy"
      >
        Copy as JSON
      </Button>
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
}

/**
 * Export everything or a selection: a list to tick, an optional "include
 * recordings" box (off unless asked), then download or copy.
 */
export function ExportDialog({
  candidates,
  build,
  label = 'Export',
}: {
  candidates: readonly ExportCandidate[];
  build: (keys: ReadonlySet<string>, includeRecordings: boolean) => Promise<ExportResult>;
  label?: string;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [recordings, setRecordings] = useState(false);
  const [status, setStatus] = useState('');
  const open = () => {
    setChosen(new Set(candidates.map((c) => c.key)));
    setRecordings(false);
    setStatus('');
    ref.current?.showModal();
  };
  const recBytes = candidates
    .filter((c) => chosen.has(c.key))
    .reduce((s, c) => s + (c.recordingBytes ?? 0), 0);
  const run = async (how: 'download' | 'copy') => {
    const r = await build(chosen, recordings && recBytes > 0);
    if (how === 'download') {
      download(r.text, r.fileName);
      setStatus(`Saved ${r.fileName}: ${itemsWord(r.items)}.`);
    } else
      setStatus(
        (await copy(r.text))
          ? `Copied ${itemsWord(r.items)} as JSON.`
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
