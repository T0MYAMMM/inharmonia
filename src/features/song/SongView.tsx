import { Button } from '@/ui/Button';
import { compiledToMidi } from '@/core/midi/adapters';
import { downloadMidi } from '@/core/midi/smf';
import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { FILLS } from '@/content/fills';
import { PATTERN_LIST, PATTERNS } from '@/content/patterns';
import {
  compileSongArrangement,
  type SongArrangementOptions,
} from '@/core/content/songArrangement';
import type { Lesson } from '@/core/content/types';
import { keyName, prettyAccidentals } from '@/core/notation';
import { VOICING_STYLES } from '@/core/theory';
import { exportItems } from '@/state/transfer';
import { Field } from '@/ui/Field';
import { Select } from '@/ui/Select';
import page from '../page.module.css';
import { PageHeader } from '../PageHeader';
import { ExportMenu } from '../transfer/Export';
import { sentTitle } from '@/core/handoff';
import { NOTES, sentToStudio } from '../sendTo/names';
import { SendToMenu } from '../sendTo/SendToMenu';
import { useHere, useSend } from '../sendTo/useHandoff';
import { creditLine, LEVEL_NAMES, LEVEL_NOTES } from './credit';
import { LessonPlayer } from './LessonPlayer';
import styles from './SongPage.module.css';

const octaveLabel = (octave: number) =>
  octave === 0 ? 'Original register' : `${octave > 0 ? '+' : ''}${octave} octave`;

export interface SongViewProps {
  lesson: Lesson;
  /** Its piece's versions, Easy to Advanced. */
  versions: readonly Lesson[];
  /** More to do with it, after Send to and Export (Update, for a download). */
  actions?: ReactNode;
  /** Said between the header and the player (a download's problems). */
  notice?: ReactNode;
}

/** The song player for a song, with its versions, arrangement, Send to and Export. */
export function SongView({ lesson, versions, actions, notice }: SongViewProps) {
  const [params, setParams] = useSearchParams();
  const send = useSend();
  const here = useHere();
  const option = (name: string) => params.get(name) ?? '';
  const pattern = option('pattern');
  const octave = Number(option('octave'));
  const inversion = option('inversion');
  const voicing = option('voicing');
  const fill = option('fill');
  const options = useMemo<SongArrangementOptions>(
    () => ({
      pattern: pattern === 'original' || PATTERNS[pattern] ? pattern : 'original',
      chordOctave: [-2, -1, 0, 1, 2].includes(octave)
        ? (octave as SongArrangementOptions['chordOctave'])
        : 0,
      voicing: VOICING_STYLES.some((v) => v.id === voicing)
        ? (voicing as SongArrangementOptions['voicing'])
        : 'original',
      inversion: ['0', '1', '2'].includes(inversion)
        ? (Number(inversion) as 0 | 1 | 2)
        : 'original',
      fill: FILLS.some((f) => f.id === fill && f.hand === 'rh') ? fill : '',
    }),
    [pattern, octave, voicing, inversion, fill],
  );
  const update = (field: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === '' || value === 'original' || (field === 'octave' && value === '0'))
      next.delete(field);
    else next.set(field, value);
    setParams(next, { replace: true });
  };
  const compiled = useMemo(() => compileSongArrangement(lesson, options), [lesson, options]);
  const compatiblePatterns = PATTERN_LIST.filter(
    (candidate) => !candidate.beatsPerBar || candidate.beatsPerBar === lesson.meter.beats,
  );
  const written = versions.find((v) => v.level === 'advanced')?.key;
  const moved = written && (written.tonic !== lesson.key.tonic || written.mode !== lesson.key.mode);
  // Render the same controlled, URL-backed arrangement in the normal player
  // and the immersive falling-notes controls. Both always reflect the same values.
  const arrangementControls = (fullscreen: boolean) => (
    <details
      className={styles.arrangement}
      data-testid={fullscreen ? 'fullscreen-song-arrangement' : 'song-arrangement'}
    >
      <summary>Playing style &amp; arrangement</summary>
      <div className={styles.arrangementFields}>
        <Field label="Accompaniment">
          <Select
            size={fullscreen ? 'small' : 'normal'}
            data-testid={fullscreen ? 'fullscreen-song-pattern' : 'song-pattern'}
            value={options.pattern}
            onChange={(e) => update('pattern', e.target.value)}
          >
            <option value="original">Original arrangement</option>
            {compatiblePatterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chord octave">
          <Select
            size={fullscreen ? 'small' : 'normal'}
            data-testid={fullscreen ? 'fullscreen-song-octave' : 'song-octave'}
            value={options.chordOctave}
            onChange={(e) => update('octave', e.target.value)}
          >
            {[-2, -1, 0, 1, 2].map((n) => (
              <option key={n} value={n}>
                {octaveLabel(n)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chord voicing">
          <Select
            size={fullscreen ? 'small' : 'normal'}
            data-testid={fullscreen ? 'fullscreen-song-voicing' : 'song-voicing'}
            value={options.voicing}
            onChange={(e) => update('voicing', e.target.value)}
          >
            <option value="original">Original</option>
            {VOICING_STYLES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Inversion">
          <Select
            size={fullscreen ? 'small' : 'normal'}
            data-testid={fullscreen ? 'fullscreen-song-inversion' : 'song-inversion'}
            value={options.inversion}
            onChange={(e) => update('inversion', e.target.value)}
          >
            <option value="original">Original</option>
            <option value="0">Root position</option>
            <option value="1">First inversion</option>
            <option value="2">Second inversion</option>
          </Select>
        </Field>
        <Field label="Fill-ins">
          <Select
            size={fullscreen ? 'small' : 'normal'}
            data-testid={fullscreen ? 'fullscreen-song-fill' : 'song-fill'}
            value={options.fill}
            onChange={(e) => update('fill', e.target.value)}
          >
            <option value="">None</option>
            {FILLS.filter((f) => f.hand === 'rh').map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className={styles.arrangementFoot}>
        <p className={styles.note}>
          These settings affect playback and practice only; the original song stays unchanged.
          Fill-ins play only where they do not overlap the melody.
        </p>
        <Button size="small" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
          Reset arrangement
        </Button>
      </div>
    </details>
  );
  const level = lesson.level ? LEVEL_NAMES[lesson.level] : null;
  // The arrangement settings are in the address only when changed.
  const arranged = ['pattern', 'octave', 'voicing', 'inversion', 'fill'].some((k) => params.has(k));
  const toStudio = () =>
    send({
      kind: 'studio',
      from: { to: here, label: lesson.title },
      project: {
        ...compiledToMidi(compiled),
        title: sentTitle(lesson.title, level ? `song, ${level}` : 'song'),
      },
      said: sentToStudio(
        `the song ${lesson.title}`,
        [
          prettyAccidentals(keyName(lesson.key)),
          level ? `the ${level} version` : null,
          arranged ? 'with the arrangement chosen here' : 'with its own arrangement',
        ]
          .filter(Boolean)
          .join(', '),
        'the song',
      ),
    });
  return (
    <>
      <PageHeader
        crumb={{ to: '/songs', label: 'Songs' }}
        title={lesson.title}
        lede={
          <>
            <p data-testid="song-credit">{creditLine(lesson.source)}</p>
            <p>
              {prettyAccidentals(keyName(lesson.key))}
              {moved ? ` (written in ${prettyAccidentals(keyName(written))})` : ''},{' '}
              {lesson.meter.beats}/{lesson.meter.unit}, {lesson.bars.length} bars
              {lesson.covers ? `: ${lesson.covers} of the original` : ''}
            </p>
            {versions.length > 1 ? (
              <nav className={styles.levels} aria-label="Versions" data-testid="song-levels">
                {versions.map((v) => (
                  <Link
                    key={v.id}
                    to={`/songs/${v.id}`}
                    className={styles.level}
                    aria-current={v.id === lesson.id ? 'page' : undefined}
                  >
                    {LEVEL_NAMES[v.level!]}
                  </Link>
                ))}
              </nav>
            ) : null}
            {lesson.level ? <p className={page.small}>{LEVEL_NOTES[lesson.level]}</p> : null}
          </>
        }
        actions={
          <>
            <SendToMenu items={[{ room: 'studio', note: NOTES.studio, onSelect: toStudio }]} />
            <ExportMenu
              build={() => exportItems({ builtInSongs: [lesson] })}
              midi={{
                download: () => downloadMidi(compiledToMidi(compiled)),
                testId: 'song-midi-export',
              }}
            />
            {actions}
          </>
        }
      />
      {notice}
      <LessonPlayer
        key={lesson.id}
        compiled={compiled}
        recordId={lesson.id}
        variant="song"
        settings={arrangementControls(false)}
        fullScreenSettings={arrangementControls(true)}
      />
      {/* Attribution, not something to read before playing: at the end of the page. */}
      {lesson.source.kind === 'public-domain' ? (
        <p className={styles.source} data-testid="song-edition">
          Source: {lesson.source.edition}.
        </p>
      ) : null}
    </>
  );
}
