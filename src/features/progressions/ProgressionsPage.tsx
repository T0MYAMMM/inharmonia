import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { PROGRESSIONS } from '@/content/progressions';
import type { Progression } from '@/core/content/types';
import { prettyNumerals } from '@/core/notation';
import { useUserProgressions, type ImportResult } from '@/state/userProgressions';
import { Button } from '@/ui/Button';
import { buttonClass } from '@/ui/buttonClass';
import page from '../page.module.css';
import styles from './progressions.module.css';

export function ProgressionsPage() {
  const mine = useUserProgressions((s) => s.items);
  return (
    <>
      <div className={page.hero}>
        <h1>Progressions</h1>
        <p className={page.lede}>
          Common chord progressions, written as Roman numerals. Play them in any key, with any
          voicing and comping pattern, then practice them or play along in time.
        </p>
      </div>

      <div className={styles.sectionHead}>
        <h2>Yours</h2>
        <Link to="/progressions/new" className={buttonClass('primary', 'small')}>
          New progression
        </Link>
        <span className={styles.spacer} />
        <ImportExport hasAny={mine.length > 0} />
      </div>
      {mine.length ? (
        <ProgressionList items={mine} />
      ) : (
        <div className={styles.empty}>
          <p>
            Nothing saved yet. Write your own in Roman numerals, or open any progression below and
            make a copy to change. They're kept in this browser.
          </p>
        </div>
      )}

      <div className={styles.sectionHead}>
        <h2>Common progressions</h2>
      </div>
      <ProgressionList items={PROGRESSIONS} />
    </>
  );
}

function ProgressionList({ items }: { items: readonly Progression[] }) {
  return (
    <ul className={styles.list}>
      {items.map((p) => (
        <li key={p.id}>
          <Link to={`/progressions/${p.id}`} className={styles.card}>
            <span className={styles.title}>{p.name}</span>
            <span className={styles.numerals}>{prettyNumerals(p.steps)}</span>
            {p.description ? <span className={styles.desc}>{p.description}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function describe(r: ImportResult): { text: string; problem: boolean } {
  const parts: string[] = [];
  if (r.added) parts.push(`Added ${r.added} progression${r.added === 1 ? '' : 's'}.`);
  if (r.duplicates)
    parts.push(`${r.duplicates} ${r.duplicates === 1 ? 'was' : 'were'} already saved.`);
  if (r.rejected.length) parts.push(`Skipped: ${r.rejected.join(' ')}`);
  if (!parts.length) parts.push('That file had no progressions in it.');
  return { text: parts.join(' '), problem: r.added === 0 && r.duplicates === 0 };
}

/** Save progressions to a file, or bring them in from one (another browser, a friend). */
function ImportExport({ hasAny }: { hasAny: boolean }) {
  const exportFile = useUserProgressions((s) => s.exportFile);
  const importFile = useUserProgressions((s) => s.importFile);
  const input = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<{ text: string; problem: boolean } | null>(null);

  const onExport = () => {
    const blob = new Blob([exportFile()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inharmonia-progressions.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 512 * 1024) {
      setNotice({ text: 'That file is too big to be a progressions export.', problem: true });
      return;
    }
    setNotice(describe(importFile(await file.text())));
  };

  return (
    <>
      <span className={styles.fileActions}>
        <Button size="small" variant="ghost" onClick={() => input.current?.click()}>
          Import
        </Button>
        <Button size="small" variant="ghost" onClick={onExport} disabled={!hasAny}>
          Export
        </Button>
      </span>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className={styles.visuallyHidden}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onFile(e)}
        data-testid="import-file"
      />
      <p
        className={styles.notice}
        data-tone={notice?.problem ? 'problem' : undefined}
        role="status"
      >
        {notice?.text}
      </p>
    </>
  );
}
