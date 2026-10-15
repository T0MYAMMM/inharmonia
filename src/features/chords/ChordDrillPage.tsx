import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { audio, lights, notes } from '@/app/services';
import { CHORD_QUALITIES } from '@/core/theory';
import type { Strictness } from '@/core/content/types';
import { recordAttempt } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Segmented } from '@/ui/Segmented';
import { Toggle } from '@/ui/Toggle';
import { KeyboardDock } from '@/ui/keyboard';
import page from '../page.module.css';
import { DrillController } from './DrillController';
import styles from './chords.module.css';

const STRICTNESS = [
  { value: 'pitch-class', label: 'Any voicing' },
  { value: 'inversion', label: 'Right bass' },
  { value: 'exact', label: 'Exact notes' },
] as const satisfies readonly { value: Strictness; label: string }[];

const STRICTNESS_NOTES: Record<Strictness, string> = {
  'pitch-class': 'All the chord tones, in any octave or inversion.',
  inversion: 'All the chord tones, with the asked-for note at the bottom.',
  exact: 'Exactly the notes shown, starting from the lowest note given.',
};

const ROOTS = [
  { value: 'naturals', label: 'Naturals' },
  { value: 'all', label: 'All 12 roots' },
] as const;

export const CHORD_DRILL_ID = 'chord-drill';

export function ChordDrillPage() {
  const [ctrl] = useState(
    () =>
      new DrillController({
        audio,
        lights,
        notes,
        onRoundDone: (s) =>
          recordAttempt(CHORD_DRILL_ID, { hits: s.clean, misses: s.total - s.clean }),
      }),
  );
  const snap = useSyncExternalStore(ctrl.subscribe, () => ctrl.snapshot);
  const drill = useSettings((s) => s.drill);
  const set = useSettings((s) => s.set);

  useEffect(() => {
    ctrl.attach();
    return () => ctrl.detach();
  }, [ctrl]);

  const setDrill = (patch: Partial<typeof drill>) => set({ drill: { ...drill, ...patch } });
  const toggleQuality = (id: string) => {
    const has = drill.qualityIds.includes(id);
    const next = has ? drill.qualityIds.filter((q) => q !== id) : [...drill.qualityIds, id];
    if (next.length) setDrill({ qualityIds: next });
  };

  return (
    <>
      <div className={page.hero}>
        <h1>Chord drill</h1>
        <p className={page.lede}>
          Ten chords a round. Play each one and hold it; take as long as you need.{' '}
          <Link to="/chords">Back to chords</Link>
        </p>
      </div>

      {!snap.running ? (
        <Card title="What to practice">
          <div className={styles.side}>
            <div className={styles.group} role="group" aria-label="Chord qualities">
              <span className={styles.groupTitle}>Chords</span>
              <div className={styles.pills}>
                {CHORD_QUALITIES.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    className={styles.pill}
                    aria-pressed={drill.qualityIds.includes(q.id)}
                    onClick={() => toggleQuality(q.id)}
                  >
                    {q.name}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.row}>
              <Segmented
                label="Roots"
                value={drill.naturalsOnly ? 'naturals' : 'all'}
                options={ROOTS}
                onChange={(v) => setDrill({ naturalsOnly: v === 'naturals' })}
              />
              <Toggle pressed={drill.inversions} onChange={(v) => setDrill({ inversions: v })}>
                Inversions
              </Toggle>
            </div>
            <div className={styles.group}>
              <Segmented
                label="How strict"
                value={drill.strictness}
                options={STRICTNESS}
                onChange={(v) => setDrill({ strictness: v })}
                describedBy="strictness-note"
              />
              <span id="strictness-note" className={page.muted}>
                {STRICTNESS_NOTES[drill.strictness]}
              </span>
            </div>
            <div>
              <Button variant="primary" onClick={() => ctrl.start(drill)} data-testid="start-drill">
                Start
              </Button>
            </div>
          </div>
        </Card>
      ) : snap.summary ? (
        <Card title="Round done">
          <div className={styles.summary}>
            <p className={styles.big} data-testid="drill-summary">
              {snap.summary.clean} of {snap.summary.total} clean
            </p>
            <p className={styles.stats}>
              <span>
                {snap.summary.misses} wrong note{snap.summary.misses === 1 ? '' : 's'}
              </span>
              {snap.summary.skipped ? <span>{snap.summary.skipped} skipped</span> : null}
              {snap.summary.averageMs !== null ? (
                <span>{(snap.summary.averageMs / 1000).toFixed(1)} s per chord</span>
              ) : null}
            </p>
            <div className={styles.row}>
              <Button variant="primary" onClick={() => ctrl.again()}>
                Go again
              </Button>
              <Button onClick={() => ctrl.stop()}>Change chords</Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className={styles.main}>
          <div
            className={styles.prompt}
            data-correct={snap.correct || undefined}
            data-testid="drill-prompt"
          >
            <span className={styles.promptLabel}>
              Chord {snap.index + 1} of {snap.roundLength}
            </span>
            <span className={styles.promptChord}>{snap.prompt?.chord}</span>
            {snap.prompt?.inversion ? (
              <span className={styles.promptDetail}>
                {snap.prompt.inversion}
                {snap.prompt.lowest
                  ? `, from ${snap.prompt.lowest.replace('#', '♯').replace(/(?<=[A-G])b/, '♭')}`
                  : ''}
              </span>
            ) : null}
            <p className={styles.feedback} data-testid="drill-hint">
              {snap.correct ? 'Yes.' : snap.hint}
            </p>
          </div>
          <div className={styles.row}>
            <Button variant="primary" onClick={() => ctrl.hearIt()}>
              Hear it
            </Button>
            <Button onClick={() => ctrl.showMe()} aria-pressed={snap.showing}>
              {snap.showing ? 'Hide' : 'Show me'}
            </Button>
            <Button onClick={() => ctrl.skip()}>Skip</Button>
            <Button variant="ghost" onClick={() => ctrl.stop()}>
              Change chords
            </Button>
          </div>
          <p className={styles.stats}>
            <span>{snap.clean} clean so far</span>
          </p>
        </div>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        {snap.announcement}
      </p>
      <KeyboardDock {...(snap.running && snap.range ? { focus: snap.range } : {})} />
    </>
  );
}
