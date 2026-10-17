import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { PATTERNS } from '@/content/patterns';
import { getSong, versionsOf } from '@/content/lessons';
import { compileLesson } from '@/core/content/compile';
import { keyName, prettyAccidentals } from '@/core/notation';
import { NotFoundPage } from '../not-found/NotFoundPage';
import { exportItems } from '@/state/transfer';
import { ExportButtons } from '../transfer/Export';
import { creditLine, LEVEL_NAMES, LEVEL_NOTES } from './credit';
import { LessonPlayer } from './LessonPlayer';
import styles from './SongPage.module.css';

export function SongPage() {
  const { songId = '' } = useParams();
  const lesson = getSong(songId);
  const compiled = useMemo(() => (lesson ? compileLesson(lesson, PATTERNS) : null), [lesson]);
  if (!lesson || !compiled) return <NotFoundPage />;
  const versions = lesson.piece ? versionsOf(lesson.piece) : [];
  const written = versions.find((v) => v.level === 'advanced')?.key;
  const moved = written && (written.tonic !== lesson.key.tonic || written.mode !== lesson.key.mode);
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
      </div>
      <LessonPlayer key={lesson.id} compiled={compiled} recordId={lesson.id} variant="song" />
    </>
  );
}
