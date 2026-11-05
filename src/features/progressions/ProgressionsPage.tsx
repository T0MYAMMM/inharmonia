import { Link } from 'react-router';
import { PROGRESSIONS } from '@/content/progressions';
import type { Progression } from '@/core/content/types';
import { prettyNumerals } from '@/core/notation';
import { exportItems } from '@/state/transfer';
import { useUserProgressions } from '@/state/userProgressions';
import { CardArt } from '@/ui/art/CardArt';
import { VoiceLines } from '@/ui/art/VoiceLines';
import { buttonClass } from '@/ui/buttonClass';
import { PageHeader } from '../PageHeader';
import { ExportDialog } from '../transfer/Export';
import { ImportControls } from '../transfer/Import';
import styles from './progressions.module.css';

export function ProgressionsPage() {
  const mine = useUserProgressions((s) => s.items);
  return (
    <>
      <PageHeader
        title="Progressions"
        lede="Common chord progressions, written as Roman numerals: each names a chord by its place in the key, so a progression is the same in every key. Play them in any key, with any voicing and comping pattern (the left hand's accompaniment), then practise them or play along in time."
      />

      <ImportControls>
        {(importButtons) => (
          <>
            <div className={styles.sectionHead}>
              <h2>Yours</h2>
              <div className={styles.sectionActions}>
                <Link to="/progressions/new" className={buttonClass('primary', 'small')}>
                  New progression
                </Link>
                <ExportDialog
                  candidates={mine.map((p) => ({
                    key: p.id,
                    kind: 'progression' as const,
                    title: p.name,
                  }))}
                  build={(keys) =>
                    exportItems({ progressions: mine.filter((p) => keys.has(p.id)) })
                  }
                />
                {importButtons}
              </div>
            </div>
            {mine.length ? (
              <ProgressionList items={mine} />
            ) : (
              <div className={styles.empty}>
                <p>
                  Nothing saved yet. Write your own in Roman numerals, or open any progression below
                  and make a copy to change. They're kept in this browser. Drop an export here to
                  bring it in.
                </p>
              </div>
            )}
          </>
        )}
      </ImportControls>

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
            <CardArt>
              <VoiceLines numerals={p.steps.map((s) => s.numeral)} mode={p.mode} />
            </CardArt>
            <span className={styles.title}>{p.name}</span>
            <span className={styles.numerals}>{prettyNumerals(p.steps)}</span>
            {p.description ? <span className={styles.desc}>{p.description}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
