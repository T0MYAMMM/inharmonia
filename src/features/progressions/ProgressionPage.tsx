import { useMemo } from 'react';
import { useMediaQuery } from '@/app/hooks';
import { Link, useParams, useSearchParams } from 'react-router';
import { PATTERN_LIST, PATTERNS, ARPEGGIO_8THS } from '@/content/patterns';
import { getProgression } from '@/content/progressions';
import { compileLesson } from '@/core/content/compile';
import { MAJOR_KEYS, MINOR_KEYS, realizeProgression } from '@/core/content/realize';
import { prettyAccidentals, prettyNumerals } from '@/core/notation';
import { VOICING_STYLES, type VoicingStyle } from '@/core/theory';
import { useUserProgressions } from '@/state/userProgressions';
import { Segmented } from '@/ui/Segmented';
import { Toggle } from '@/ui/Toggle';
import { LessonPlayer } from '../song/LessonPlayer';
import { NotFoundPage } from '../not-found/NotFoundPage';
import songStyles from '../song/SongPage.module.css';
import styles from './progressions.module.css';

function parseStyle(v: string | null): VoicingStyle {
  const found = VOICING_STYLES.find((s) => s.id === v);
  return found ? found.id : 'close';
}

export function ProgressionPage() {
  const { progressionId = '' } = useParams();
  const saved = useUserProgressions((s) => s.get(progressionId));
  const progression = getProgression(progressionId) ?? saved;
  const [params, setParams] = useSearchParams();

  const keys = progression?.mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
  const key = (keys as readonly string[]).includes(params.get('key') ?? '')
    ? params.get('key')!
    : 'C';
  const pattern = PATTERNS[params.get('pattern') ?? ''] ?? ARPEGGIO_8THS;
  const style = parseStyle(params.get('voicing'));
  const smooth = params.get('smooth') !== '0';

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: true });
  };

  const compiled = useMemo(
    () =>
      progression
        ? compileLesson(
            realizeProgression(progression, {
              key,
              style,
              voiceLeading: smooth,
              pattern,
              repeats: 2,
            }),
            PATTERNS,
          )
        : null,
    [progression, key, style, smooth, pattern],
  );
  const small = useMediaQuery('(max-width: 600px)');
  if (!progression || !compiled) return <NotFoundPage />;

  const keyLabel = (k: string) =>
    `${prettyAccidentals(k)}${progression.mode === 'minor' ? ' minor' : ''}`;

  const summary = [
    keyLabel(key),
    pattern.name,
    VOICING_STYLES.find((v) => v.id === style)!.name,
    smooth ? 'Smooth' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const fields = (
    <div className={styles.settings}>
      <label className={styles.field}>
        Key
        <select
          className={styles.select}
          value={key}
          onChange={(e) => update({ key: e.target.value })}
          data-testid="key"
        >
          {keys.map((k) => (
            <option key={k} value={k}>
              {keyLabel(k)}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        Pattern
        <select
          className={styles.select}
          value={pattern.id}
          onChange={(e) => update({ pattern: e.target.value })}
          data-testid="pattern"
        >
          {PATTERN_LIST.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <Segmented
        label="Voicing"
        value={style}
        options={VOICING_STYLES.map((v) => ({ value: v.id, label: v.name }))}
        onChange={(v) => update({ voicing: v })}
      />
      <Toggle pressed={smooth} onChange={(v) => update({ smooth: v ? '1' : '0' })}>
        Smooth voice leading
      </Toggle>
      {pattern.description ? (
        <span className={styles.patternNote}>{pattern.description}</span>
      ) : null}
    </div>
  );

  // On phones the settings fold into one line so the player stays in view.
  const settings = small ? (
    <details className={styles.details}>
      <summary className={styles.summary}>{summary}</summary>
      {fields}
    </details>
  ) : (
    fields
  );

  return (
    <>
      <div className={songStyles.header}>
        <p className={songStyles.meta}>
          <Link to="/progressions">Progressions</Link>
          {' · '}
          {saved ? (
            <Link to={`/progressions/${progression.id}/edit`}>Edit</Link>
          ) : (
            <Link to={`/progressions/new?from=${progression.id}`}>Make a copy to edit</Link>
          )}
        </p>
        <h1>{progression.name}</h1>
        <p className={songStyles.meta}>
          {prettyNumerals(progression.steps)}
          {progression.description ? `. ${progression.description}` : ''}
        </p>
      </div>
      <LessonPlayer
        key={progression.id}
        compiled={compiled}
        recordId={`progression:${progression.id}`}
        variant="progression"
        settings={settings}
      />
    </>
  );
}
