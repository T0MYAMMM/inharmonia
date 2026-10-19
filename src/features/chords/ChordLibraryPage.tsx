import { useEffect, useMemo, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MIX, mixVelocity } from '@config/mix';
import { audio, lights } from '@/app/services';
import { useHeldNotes } from '@/app/hooks';
import { formatNote, prettyChord, type KeyContext } from '@/core/notation';
import { ALL_ROOTS, chordTarget, inversionName, matchChord } from '@/core/practice';
import {
  CHORD_QUALITIES,
  inversionCount,
  parseChord,
  VOICING_STYLES,
  voiceChord,
  type VoicingStyle,
} from '@/core/theory';
import { useSettings } from '@/state/settings';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { NoteLabel } from '@/ui/NoteLabel';
import { Segmented } from '@/ui/Segmented';
import { KeyboardDock } from '@/ui/keyboard';
import page from '../page.module.css';
import styles from './chords.module.css';

const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Triads', ids: ['major', 'minor', 'dim', 'aug', 'sus2', 'sus4'] },
  { title: 'Sixths and sevenths', ids: ['6', 'maj7', '7', 'm7', 'm7b5', 'dim7'] },
  { title: 'Extended', ids: ['add9', '9', 'maj9', 'm9', '11', '13'] },
];

const INVERSION_SHORT = ['Root', '1st', '2nd', '3rd', '4th', '5th'];

function parseStyle(v: string | null): VoicingStyle {
  const found = VOICING_STYLES.find((s) => s.id === v);
  return found ? found.id : 'close';
}

/** Note slots in "How it is built": the most tones any quality has, so no chord resizes it. */
const TONE_SLOTS = Math.max(...CHORD_QUALITIES.map((q) => parseChord(`C${q.suffix}`).tones.length));

const prettyRoot = (r: string) => r.replace('#', '♯').replace(/(?<=[A-G])b/, '♭');

export function ChordLibraryPage() {
  const [params, setParams] = useSearchParams();
  const root = ALL_ROOTS.includes(params.get('root') as (typeof ALL_ROOTS)[number])
    ? params.get('root')!
    : 'C';
  const quality =
    CHORD_QUALITIES.find((q) => q.id === params.get('quality')) ?? CHORD_QUALITIES[0]!;
  const style = parseStyle(params.get('voicing'));
  const symbol = `${root}${quality.suffix}`;
  const count = inversionCount(symbol, style);
  const inversion = Math.min(Number(params.get('inversion') ?? 0) || 0, count - 1);

  const update = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, String(v));
    setParams(next, { replace: true });
  };

  const info = useMemo(() => parseChord(symbol), [symbol]);
  const floor = info.tones.length >= 5 ? 'C3' : 'G3';
  const voicing = voiceChord(symbol, { style, inversion, floor });
  const voicingKey = voicing.map((n) => n.midi).join(',');
  const notation = useSettings((s) => s.notation);
  const accidentalStyle = useSettings((s) => s.accidentalStyle);
  const key: KeyContext = { tonic: root, mode: 'major' };
  const angka = notation === 'angka';

  // Light the voicing in dusk (chord tones).
  useEffect(() => {
    lights.setExactly('lh', voicingKey.split(',').map(Number));
    return () => lights.clear('lh');
  }, [voicingKey]);

  const held = useHeldNotes();
  const target = chordTarget(voicing);
  const status = matchChord(held, target, 'pitch-class').status;

  const play = (broken: boolean) => {
    void audio.unlock();
    const { velocity, lengthSec, brokenGapSec } = MIX.chords;
    const t0 = audio.now() + 0.01;
    voicing.forEach((n, i) =>
      audio.playAt(
        n.midi,
        t0 + (broken ? i * brokenGapSec : 0),
        lengthSec + (broken ? (voicing.length - i) * brokenGapSec : 0),
        mixVelocity('lh', velocity),
      ),
    );
  };

  const feedback =
    status === 'match'
      ? "That's it."
      : status === 'wrong'
        ? 'Something in there is not in the chord.'
        : status === 'partial'
          ? 'Keep going.'
          : 'Play it on the keyboard: any octave, any inversion.';

  return (
    <>
      <div className={page.hero}>
        <h1>Chords</h1>
        <p className={page.lede}>
          Pick a root and a quality. See how the chord is built, hear it, and play it back.{' '}
          <Link to={`/chords/drill`}>Drill chords</Link> ·{' '}
          <Link to="/chords/known">Chords you know</Link>
        </p>
      </div>
      <div className={styles.layout}>
        <div className={`${styles.side} ${styles.areaSide}`}>
          <div className={styles.group} role="group" aria-label="Root">
            <span className={styles.groupTitle}>Root</span>
            <div className={styles.pills}>
              {ALL_ROOTS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={styles.pill}
                  aria-pressed={r === root}
                  onClick={() => update({ root: r })}
                >
                  {prettyRoot(r)}
                </button>
              ))}
            </div>
          </div>
          {GROUPS.map((g) => (
            <div key={g.title} className={styles.group} role="group" aria-label={g.title}>
              <span className={styles.groupTitle}>{g.title}</span>
              <div className={styles.pills}>
                {g.ids.map((id) => {
                  const q = CHORD_QUALITIES.find((x) => x.id === id)!;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={styles.pill}
                      aria-pressed={id === quality.id}
                      title={q.name}
                      onClick={() => update({ quality: id, inversion: 0 })}
                    >
                      {q.suffix ? prettyChord(`C${q.suffix}`).slice(1) : 'maj'}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className={`${styles.head} ${styles.areaHead}`}>
          <Card className={styles.symbolCard}>
            <div className={styles.headSymbol} data-testid="chord-symbol">
              {prettyChord(symbol)}
            </div>
            <p className={styles.name}>
              {prettyRoot(root)} {quality.name.toLowerCase()}
            </p>
          </Card>

          <Card className={styles.builtCard}>
            <h2 className={styles.builtTitle}>How it is built</h2>
            <div
              className={styles.slots}
              style={{ '--slots': TONE_SLOTS } as CSSProperties}
              data-testid="chord-tones"
            >
              {info.tones.map((pc, i) => {
                const n = voicing.find((v) => v.name.replace(/-?\d+$/, '') === pc) ?? voicing[0]!;
                return (
                  <div key={pc} className={styles.slot} title={info.intervalNames[i]}>
                    <span className={styles.toneNote}>
                      <NoteLabel
                        label={formatNote(n, key, { system: notation, accidentalStyle })}
                        angka={angka}
                        accidentalStyle={accidentalStyle}
                      />
                    </span>
                    <span className={styles.toneDegree}>{info.formula[i]}</span>
                    <span className="visually-hidden">{info.intervalNames[i]}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <Card title="Voicing" className={styles.areaVoicing}>
          <div className={page.prose} style={{ gap: 'var(--space-3)', maxWidth: 'none' }}>
            <Segmented
              label="Voicing style"
              value={style}
              options={VOICING_STYLES.map((v) => ({ value: v.id, label: v.name }))}
              onChange={(v) => update({ voicing: v, inversion: 0 })}
            />
            <Segmented
              label="Inversion"
              value={String(inversion)}
              options={Array.from({ length: count }, (_, i) => ({
                value: String(i),
                label: INVERSION_SHORT[i] ?? String(i),
              }))}
              onChange={(v) => update({ inversion: v })}
            />
            <p className={styles.voicingNotes} data-testid="voicing-notes">
              {inversionName(inversion)[0]!.toUpperCase() + inversionName(inversion).slice(1)}:{' '}
              {voicing.map((n) => prettyChord(n.name)).join(' ')}
            </p>
            <div className={styles.row}>
              <Button variant="primary" onClick={() => play(false)}>
                Hear it
              </Button>
              <Button onClick={() => play(true)}>Hear it broken</Button>
            </div>
            <p
              className={styles.feedback}
              role="status"
              aria-live="polite"
              data-ok={status === 'match' || undefined}
            >
              {feedback}
            </p>
          </div>
        </Card>
      </div>
      <KeyboardDock focus={[voicing[0]!.midi, voicing.at(-1)!.midi]} />
    </>
  );
}
