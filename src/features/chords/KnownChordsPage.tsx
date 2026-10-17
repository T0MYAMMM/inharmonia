import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MIX, mixVelocity } from '@config/mix';
import { audio, lights, notes } from '@/app/services';
import { chordId, isKnownEntry, KNOWN_RULE, knownProgress, type KnownEntry } from '@/core/charts';
import { prettyChord } from '@/core/notation';
import { ALL_ROOTS } from '@/core/practice';
import { voiceChord } from '@/core/theory';
import { recordCleanPlay, setKnown, useKnownChords } from '@/state/knownChords';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Segmented } from '@/ui/Segmented';
import { KeyboardDock } from '@/ui/keyboard';
import page from '../page.module.css';
import { KnownCheck, type CheckStatus } from './KnownCheck';
import styles from './chords.module.css';

/** The chords most songs are built from, in teaching order. */
const KINDS = [
  { id: 'major', suffix: '', label: 'Major' },
  { id: 'minor', suffix: 'm', label: 'Minor' },
  { id: '7', suffix: '7', label: '7' },
  { id: 'm7', suffix: 'm7', label: 'm7' },
  { id: 'maj7', suffix: 'maj7', label: 'maj7' },
  { id: 'sus4', suffix: 'sus4', label: 'sus4' },
  { id: 'dim', suffix: 'dim', label: 'dim' },
] as const;

function describe(entry: KnownEntry | undefined): string {
  if (entry?.manual === true) return 'Known: you marked it.';
  if (entry?.manual === false) return 'Not known yet: you marked it.';
  if (isKnownEntry(entry))
    return `Known: ${KNOWN_RULE.plays} clean plays over ${KNOWN_RULE.days} days.`;
  const p = knownProgress(entry);
  if (p.plays === 0) return 'Not known yet.';
  return `Learning: ${p.plays} of ${KNOWN_RULE.plays} clean plays, on ${p.days} of ${KNOWN_RULE.days} days.`;
}

const FEEDBACK: Record<CheckStatus, string> = {
  waiting: 'Play it on the keyboard: any octave, any inversion.',
  building: 'Keep going.',
  clean: 'Clean play. Counted. Let go to play it again.',
  helped: "That's it. Tries with Show me don't count; let go and play it from memory.",
  slipped: "That's it, after a wrong note, so this one doesn't count. Let go and try again.",
};

/** The chords you can already play: mark them by hand, or learn them with clean plays. */
export function KnownChordsPage() {
  const [params, setParams] = useSearchParams();
  const kind = KINDS.find((k) => k.id === params.get('kind')) ?? KINDS[0];
  const root = ALL_ROOTS.includes(params.get('root') as (typeof ALL_ROOTS)[number])
    ? params.get('root')!
    : 'C';
  const symbol = `${root}${kind.suffix}`;
  const voicing = useMemo(() => voiceChord(symbol, { floor: 'G3' }), [symbol]);
  const profile = useKnownChords();
  const entryOf = (s: string) => profile.chords[chordId(s) ?? ''];
  const entry = entryOf(symbol);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: true });
  };

  const [check] = useState(
    () => new KnownCheck({ notes, lights, onClean: (s) => recordCleanPlay(s) }),
  );
  const snap = useSyncExternalStore(check.subscribe, () => check.snapshot);
  useEffect(() => {
    check.attach();
    return () => check.detach();
  }, [check]);
  useEffect(() => check.setChord(symbol, voicing), [check, symbol, voicing]);

  const known = Object.values(profile.chords).filter(isKnownEntry).length;
  const mark: 'yes' | 'no' | 'auto' =
    entry?.manual === true ? 'yes' : entry?.manual === false ? 'no' : 'auto';

  const hear = () => {
    void audio.unlock();
    const t0 = audio.now() + 0.01;
    for (const n of voicing)
      audio.playAt(n.midi, t0, MIX.chords.lengthSec, mixVelocity('lh', MIX.chords.velocity));
  };

  return (
    <>
      <div className={page.hero}>
        <h1>Chords you know</h1>
        <p className={page.lede}>
          Mark the chords you can already play, or play them here. A chord counts as known after{' '}
          {KNOWN_RULE.plays} clean plays on at least {KNOWN_RULE.days} different days; chord drills
          count too. Your marks always win. Chord charts use this to find an easier key.{' '}
          <Link to="/chords">Chord library</Link>
        </p>
      </div>
      <div className={styles.knownLayout}>
        <div className={styles.side}>
          <p className={styles.knownCount} data-testid="known-count">
            {known === 1 ? '1 chord known' : `${known} chords known`}
          </p>
          <div className={styles.pills} role="group" aria-label="Chord kind">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={styles.pill}
                aria-pressed={k.id === kind.id}
                onClick={() => update({ kind: k.id })}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className={styles.knownGrid} role="group" aria-label={`${kind.label} chords`}>
            {ALL_ROOTS.map((r) => {
              const s = `${r}${kind.suffix}`;
              const e = entryOf(s);
              const isKnown = isKnownEntry(e);
              const p = knownProgress(e);
              return (
                <button
                  key={r}
                  type="button"
                  className={styles.knownChip}
                  aria-pressed={r === root}
                  data-known={isKnown || undefined}
                  data-testid={`known-${s}`}
                  onClick={() => update({ root: r })}
                >
                  <span className={styles.knownSymbol}>{prettyChord(s)}</span>
                  <span className={styles.knownState}>
                    {isKnown ? '✓ known' : p.plays ? `${p.plays}/${KNOWN_RULE.plays}` : ' '}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Card className={styles.knownDetail}>
          <div className={styles.symbol} data-testid="known-symbol">
            {prettyChord(symbol)}
          </div>
          <p className={styles.voicingNotes}>{voicing.map((n) => prettyChord(n.name)).join(' ')}</p>
          <p className={styles.knownStatus} data-testid="known-status">
            {describe(entry)}
          </p>
          <Segmented<'yes' | 'no' | 'auto'>
            label="Mark"
            value={mark}
            options={[
              { value: 'yes', label: 'I know it' },
              { value: 'no', label: 'Not yet' },
              { value: 'auto', label: 'From my plays' },
            ]}
            onChange={(v) => setKnown(symbol, v === 'yes' ? true : v === 'no' ? false : undefined)}
          />
          <div className={styles.row}>
            <Button onClick={hear}>Hear it</Button>
            <Button variant="ghost" onClick={() => check.showMe()} aria-pressed={snap.showing}>
              {snap.showing ? 'Hide' : 'Show me'}
            </Button>
          </div>
          <p
            className={styles.feedback}
            role="status"
            aria-live="polite"
            data-ok={snap.status === 'clean' || undefined}
            data-testid="known-feedback"
          >
            {FEEDBACK[snap.status]}
          </p>
        </Card>
      </div>
      <KeyboardDock focus={[voicing[0]!.midi, voicing.at(-1)!.midi]} />
    </>
  );
}
