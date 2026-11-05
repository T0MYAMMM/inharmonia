import { useMemo } from 'react';
import { BREAKPOINTS, useMediaQuery } from '@/app/hooks';
import { Link, useParams, useSearchParams } from 'react-router';
import { PATTERN_LIST, PATTERNS, ARPEGGIO_8THS } from '@/content/patterns';
import { getProgression } from '@/content/progressions';
import { FILLS, getFill } from '@/content/fills';
import { compileLesson } from '@/core/content/compile';
import { withFills } from '@/core/content/fills';
import { MAJOR_KEYS, MINOR_KEYS, realizeProgression } from '@/core/content/realize';
import { prettyAccidentals, prettyNumerals } from '@/core/notation';
import { VOICING_STYLES, type VoicingStyle } from '@/core/theory';
import { useUserProgressions } from '@/state/userProgressions';
import { buttonClass } from '@/ui/buttonClass';
import { Field } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Select } from '@/ui/Select';
import { Toggle } from '@/ui/Toggle';
import { LessonPlayer } from '../song/LessonPlayer';
import { ExportMenu } from '../transfer/Export';
import { exportItems } from '@/state/transfer';
import { progressionBars, progressionChart } from '@/core/charts';
import { sentTitle } from '@/core/handoff';
import { compiledToMidi } from '@/core/midi/adapters';
import { NOTES, sentToStudio } from '../sendTo/names';
import { SendToMenu, type SendToItem } from '../sendTo/SendToMenu';
import { useHere, useSend } from '../sendTo/useHandoff';
import { NotFoundPage } from '../not-found/NotFoundPage';
import { PageHeader } from '../PageHeader';
import styles from './progressions.module.css';

/** Right-hand fills, which sit over the comping. */
const RH_FILLS = FILLS.filter((f) => f.hand === 'rh');

function parseStyle(v: string | null): VoicingStyle {
  const found = VOICING_STYLES.find((s) => s.id === v);
  return found ? found.id : 'close';
}

export function ProgressionPage() {
  const { progressionId = '' } = useParams();
  const saved = useUserProgressions((s) => s.get(progressionId));
  const progression = getProgression(progressionId) ?? saved;
  const [params, setParams] = useSearchParams();
  const send = useSend();
  const here = useHere();

  const keys = progression?.mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
  const key = (keys as readonly string[]).includes(params.get('key') ?? '')
    ? params.get('key')!
    : 'C';
  const pattern = PATTERNS[params.get('pattern') ?? ''] ?? ARPEGGIO_8THS;
  const style = parseStyle(params.get('voicing'));
  const smooth = params.get('smooth') !== '0';
  const fill = RH_FILLS.find((f) => f.id === params.get('fill')) ?? null;
  const fillId = fill?.id ?? '';

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: true });
  };

  const compiled = useMemo(() => {
    if (!progression) return null;
    const base = compileLesson(
      realizeProgression(progression, {
        key,
        style,
        voiceLeading: smooth,
        pattern,
        repeats: 2,
      }),
      PATTERNS,
    );
    const f = fillId ? getFill(fillId) : undefined;
    return f ? withFills(base, f, { tonic: key, mode: progression.mode }) : base;
  }, [progression, key, style, smooth, pattern, fillId]);
  const small = useMediaQuery(BREAKPOINTS.compact);
  if (!progression || !compiled) return <NotFoundPage />;

  const keyLabel = (k: string) =>
    `${prettyAccidentals(k)}${progression.mode === 'minor' ? ' minor' : ''}`;
  /** The key it plays in, in full: "G major". */
  const inKey = `${prettyAccidentals(key)} ${progression.mode}`;

  const summary = [
    keyLabel(key),
    pattern.name,
    VOICING_STYLES.find((v) => v.id === style)!.name,
    smooth ? 'Smooth' : null,
    fill ? fill.name : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const fields = (
    <div className={styles.settings}>
      <div className={styles.settingsRow}>
        <Field label="Key">
          <Select value={key} onChange={(e) => update({ key: e.target.value })} data-testid="key">
            {keys.map((k) => (
              <option key={k} value={k}>
                {keyLabel(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Pattern">
          <Select
            value={pattern.id}
            onChange={(e) => update({ pattern: e.target.value })}
            data-testid="pattern"
          >
            {PATTERN_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fill">
          <Select
            value={fillId}
            onChange={(e) => update({ fill: e.target.value })}
            data-testid="fill"
          >
            <option value="">None</option>
            {RH_FILLS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className={styles.settingsRow}>
        <Field label="Voicing" group>
          <Segmented
            label="Voicing"
            value={style}
            options={VOICING_STYLES.map((v) => ({ value: v.id, label: v.name }))}
            onChange={(v) => update({ voicing: v })}
          />
        </Field>
        <Toggle pressed={smooth} onChange={(v) => update({ smooth: v ? '1' : '0' })}>
          Smooth voice leading
        </Toggle>
      </div>
      {pattern.description ? (
        <span className={styles.patternNote}>{pattern.description}</span>
      ) : null}
    </div>
  );

  const from = { to: here, label: progression.name };
  const sendTo: SendToItem[] = [
    {
      room: 'studio',
      note: NOTES.studio,
      onSelect: () =>
        send({
          kind: 'studio',
          from,
          project: {
            ...compiledToMidi(compiled),
            title: sentTitle(progression.name, `progression, ${inKey}`),
          },
          said: sentToStudio(
            `the progression ${progression.name}`,
            [
              inKey,
              `the ${pattern.name} pattern`,
              `${VOICING_STYLES.find((v) => v.id === style)!.name} voicing`,
              smooth ? 'smooth voice leading' : null,
              fill ? `the ${fill.name} fill` : null,
              'twice through',
            ]
              .filter(Boolean)
              .join(', '),
            'the progression',
          ),
        }),
    },
    {
      room: 'chords',
      note: NOTES.chordsInKey(inKey),
      onSelect: () =>
        send({
          kind: 'chords',
          from,
          meter: { beats: 4, unit: 4 },
          bars: progressionBars(progression.steps, key, progression.mode),
          what: `${progression.name} in ${inKey}`,
        }),
    },
    {
      room: 'songs',
      note: NOTES.songsInKey(inKey),
      onSelect: () =>
        send({
          kind: 'chart',
          from,
          chart: progressionChart(progression, key),
          said: `Started from ${progression.name} in ${inKey}: one verse to build a song on.`,
        }),
    },
  ];

  // On phones the settings fold into one line so the player stays in view.
  const settings = small ? (
    <details className={styles.details}>
      <summary className={styles.summary}>{summary}</summary>
      {fields}
    </details>
  ) : (
    fields
  );

  // What else you can do with it. On a phone it goes after the score, so Play
  // is in the first screen and the row ends up where the dock no longer covers it.
  const actions = (
    <>
      {saved ? (
        <Link
          to={`/progressions/${progression.id}/edit`}
          className={buttonClass('secondary', 'small')}
        >
          Edit
        </Link>
      ) : (
        <Link
          to={`/progressions/new?from=${progression.id}`}
          className={buttonClass('secondary', 'small')}
        >
          Make a copy to edit
        </Link>
      )}
      <SendToMenu items={sendTo} />
      <ExportMenu build={() => exportItems({ progressions: [progression] })} />
    </>
  );

  return (
    <>
      <PageHeader
        crumb={{ to: '/progressions', label: 'Progressions' }}
        title={progression.name}
        lede={
          <>
            <p className={styles.numerals}>{prettyNumerals(progression.steps)}</p>
            {progression.description ? <p>{progression.description}</p> : null}
          </>
        }
        actions={small ? undefined : actions}
      />
      <LessonPlayer
        key={progression.id}
        compiled={compiled}
        recordId={`progression:${progression.id}`}
        variant="progression"
        settings={settings}
      />
      {small ? (
        <div className={styles.afterActions} data-testid="progression-actions">
          {actions}
        </div>
      ) : null}
    </>
  );
}
