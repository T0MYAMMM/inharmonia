import { compiledToMidi } from '@/core/midi/adapters';
import { downloadMidi } from '@/core/midi/smf';
import { Button } from '@/ui/Button';
import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { FILLS } from '@/content/fills';
import { PATTERN_LIST, PATTERNS } from '@/content/patterns';
import { getSong, versionsOf } from '@/content/lessons';
import {
  compileSongArrangement,
  type SongArrangementOptions,
} from '@/core/content/songArrangement';
import { keyName, prettyAccidentals } from '@/core/notation';
import { VOICING_STYLES } from '@/core/theory';
import { exportItems } from '@/state/transfer';
import { Button } from '@/ui/Button';
import { NotFoundPage } from '../not-found/NotFoundPage';
import { ExportButtons } from '../transfer/Export';
import { creditLine, LEVEL_NAMES, LEVEL_NOTES } from './credit';
import { LessonPlayer } from './LessonPlayer';
import styles from './SongPage.module.css';

const octaveLabel = (octave: number) =>
  octave === 0 ? 'Original register' : `${octave > 0 ? '+' : ''}${octave} octave`;

export function SongPage() {
  const { songId = '' } = useParams();
  const lesson = getSong(songId);
  const [params, setParams] = useSearchParams();
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
  const compiled = useMemo(
    () => (lesson ? compileSongArrangement(lesson, options) : null),
    [lesson, options],
  );
  if (!lesson || !compiled) return <NotFoundPage />;
  const compatiblePatterns = PATTERN_LIST.filter(
    (candidate) => !candidate.beatsPerBar || candidate.beatsPerBar === lesson.meter.beats,
  );
  const versions = lesson.piece ? versionsOf(lesson.piece) : [];
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
        <label>
          Accompaniment
          <select
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
          </select>
        </label>
        <label>
          Chord octave
          <select
            data-testid={fullscreen ? 'fullscreen-song-octave' : 'song-octave'}
            value={options.chordOctave}
            onChange={(e) => update('octave', e.target.value)}
          >
            {[-2, -1, 0, 1, 2].map((n) => (
              <option key={n} value={n}>
                {octaveLabel(n)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chord voicing
          <select
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
          </select>
        </label>
        <label>
          Inversion
          <select
            data-testid={fullscreen ? 'fullscreen-song-inversion' : 'song-inversion'}
            value={options.inversion}
            onChange={(e) => update('inversion', e.target.value)}
          >
            <option value="original">Original</option>
            <option value="0">Root position</option>
            <option value="1">First inversion</option>
            <option value="2">Second inversion</option>
          </select>
        </label>
        <label>
          Fill-ins
          <select
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
          </select>
        </label>
        <Button onClick={() => setParams(new URLSearchParams(), { replace: true })}>
          Reset arrangement
        </Button>
      </div>
      <p className={styles.note}>
        These settings affect playback and practice only; the original song stays unchanged.
        Fill-ins play only where they do not overlap the melody.
      </p>
    </details>
  );
  return (
    <>
      <div className={styles.header}>
        <p className={styles.meta}>
          <Link to="/songs">Songs</Link>
        </p>
        <h1>{lesson.title}</h1>
        <p className={styles.meta} data-testid="song-credit">
          {creditLine(lesson.source)}
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
        {lesson.level ? <p className={styles.note}>{LEVEL_NOTES[lesson.level]}</p> : null}
        <p className={styles.meta}>
          {prettyAccidentals(keyName(lesson.key))}
          {moved ? ` (written in ${prettyAccidentals(keyName(written))})` : ''},{' '}
          {lesson.meter.beats}/{lesson.meter.unit}, {lesson.bars.length} bars
          {lesson.covers ? `: ${lesson.covers} of the original` : ''}
        </p>
        {lesson.source.kind === 'public-domain' ? (
          <p className={styles.note} data-testid="song-edition">
            Notes from {lesson.source.edition}.
          </p>
        ) : null}
        <ExportButtons build={() => exportItems({ builtInSongs: [lesson] })} />
        <Button size="small" variant="ghost" onClick={() => downloadMidi(compiledToMidi(compiled))} data-testid="song-midi-export">Export .mid</Button>
      </div>
      <LessonPlayer
        key={lesson.id}
        compiled={compiled}
        recordId={lesson.id}
        variant="song"
        settings={arrangementControls(false)}
        fullScreenSettings={arrangementControls(true)}
      />
    </>
  );
}
