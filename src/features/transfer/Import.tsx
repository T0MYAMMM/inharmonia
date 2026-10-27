import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  applyImport,
  previewImport,
  type DuplicateChoice,
  type ImportPreview,
} from '@/state/transfer';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { FilePicker } from '@/ui/FilePicker';
import { Select } from '@/ui/Select';
import { TextArea } from '@/ui/TextArea';
import styles from './transfer.module.css';

const KIND = { song: 'Song', chart: 'Chart', progression: 'Progression' } as const;

/**
 * Bring songs, charts and progressions in from a file: pick one, drop one on
 * `children`, or paste JSON. A preview shows what is new, what is already here
 * (skip, replace or keep both) and any problem, before anything is saved.
 */
export function ImportControls({
  children,
}: {
  /** Lays out the area that accepts dropped files; place the import buttons inside it. */
  children: (buttons: ReactNode) => ReactNode;
}) {
  const previewRef = useRef<HTMLDialogElement | null>(null);
  const pasteRef = useRef<HTMLDialogElement | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<number, DuplicateChoice>>({});
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState('');
  const [over, setOver] = useState(false);

  const show = (text: string) => {
    setPreview(previewImport(text));
    setChoices({});
    setResult('');
    previewRef.current?.showModal();
  };
  const readFile = async (f: File | undefined) => {
    if (f) show(await f.text());
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void readFile(e.dataTransfer.files[0]);
  };
  const doImport = async () => {
    if (!preview) return;
    try {
      const r = await applyImport(preview, choices);
      const parts = [
        r.added && `${r.added} added`,
        r.replaced && `${r.replaced} replaced`,
        r.skipped && `${r.skipped} skipped`,
      ].filter(Boolean);
      setResult(`Imported: ${parts.join(', ') || 'nothing'}.`);
      previewRef.current?.close();
    } catch (e) {
      setResult((e as Error).message);
    }
  };

  const fresh = preview?.rows.filter((r) => !r.existing).length ?? 0;
  const dupes = preview?.rows.filter((r) => r.existing) ?? [];
  const blocked =
    !preview || !!preview.fatal || preview.errors.length > 0 || preview.rows.length === 0;

  return (
    <div
      className={styles.drop}
      data-over={over || undefined}
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {children(
        <span className={styles.actions}>
          <FilePicker
            size="small"
            accept="application/json,.json"
            acceptDrop={false}
            onFiles={([file]) => void readFile(file)}
            data-testid="import-file"
            buttonTestId="import-open"
          >
            Import file
          </FilePicker>
          <Button
            size="small"
            variant="ghost"
            onClick={() => {
              setPasted('');
              pasteRef.current?.showModal();
            }}
            data-testid="import-paste"
          >
            Paste JSON
          </Button>
          <span className={styles.status} role="status" data-testid="import-result">
            {result}
          </span>
        </span>,
      )}

      <dialog ref={pasteRef} className={styles.dialog} aria-labelledby="paste-title">
        <div className={styles.body}>
          <h2 id="paste-title" className={styles.title}>
            Paste JSON
          </h2>
          <p className={styles.note}>
            Paste an Inharmonia export. You'll see what's in it before anything is saved.
          </p>
          <TextArea
            mono
            className={styles.textarea}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            aria-label="JSON to import"
            data-testid="import-text"
          />
          <div className={styles.actions}>
            <Button
              variant="primary"
              disabled={!pasted.trim()}
              onClick={() => {
                pasteRef.current?.close();
                show(pasted);
              }}
              data-testid="import-read"
            >
              Preview
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  setPasted(await navigator.clipboard.readText());
                } catch {
                  /* the browser said no: paste by hand */
                }
              }}
            >
              Paste from clipboard
            </Button>
            <Button variant="ghost" onClick={() => pasteRef.current?.close()}>
              Cancel
            </Button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={previewRef}
        className={styles.dialog}
        aria-labelledby="preview-title"
        data-testid="import-preview"
      >
        <div className={styles.body}>
          <h2 id="preview-title" className={styles.title}>
            Import
          </h2>
          {preview?.fatal ? (
            <p className={styles.status} data-tone="problem">
              {preview.fatal}
            </p>
          ) : preview ? (
            <>
              <p className={styles.note} data-testid="import-summary">
                {preview.rows.length + preview.errors.length} item
                {preview.rows.length + preview.errors.length === 1 ? '' : 's'} in this file
                {preview.version === 1 ? ' (an older format, upgraded)' : ''}: {fresh} new
                {dupes.length ? `, ${dupes.length} already here` : ''}
                {preview.errors.length ? `, ${preview.errors.length} with problems` : ''}.
              </p>
              <ul className={styles.list}>
                {preview.rows.map((r) => (
                  <li key={r.index} className={styles.row}>
                    <span className={styles.kind}>{KIND[r.kind]}</span>
                    <span className={styles.itemTitle}>
                      {r.title}
                      {r.recording ? ' (with its recording)' : ''}
                    </span>
                    {r.existing ? (
                      <Field label="Already here:" inline>
                        <Select
                          size="small"
                          value={choices[r.index] ?? 'skip'}
                          onChange={(e) =>
                            setChoices((c) => ({
                              ...c,
                              [r.index]: e.target.value as DuplicateChoice,
                            }))
                          }
                          data-testid={`import-choice-${r.index}`}
                        >
                          <option value="skip">Skip</option>
                          <option value="replace">Replace</option>
                          <option value="copy">Keep both</option>
                        </Select>
                      </Field>
                    ) : (
                      <span className={styles.note}>New</span>
                    )}
                  </li>
                ))}
              </ul>
              {preview.errors.length ? (
                <>
                  <p className={styles.status} data-tone="problem">
                    Fix these in the file, then try again. Nothing will be saved until it reads
                    cleanly.
                  </p>
                  <ul className={styles.errors} data-testid="import-errors">
                    {preview.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : null}
          <div className={styles.actions}>
            <Button
              variant="primary"
              onClick={() => void doImport()}
              disabled={blocked}
              data-testid="import-confirm"
            >
              Import
            </Button>
            <Button variant="ghost" onClick={() => previewRef.current?.close()}>
              Cancel
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
