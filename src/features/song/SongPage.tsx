import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { PATTERNS } from '@/content/patterns';
import { getSong } from '@/content/lessons';
import { compileLesson } from '@/core/content/compile';
import { keyName } from '@/core/notation';
import { NotFoundPage } from '../not-found/NotFoundPage';
import { LessonPlayer } from './LessonPlayer';
import styles from './SongPage.module.css';

export function SongPage() {
  const { songId = '' } = useParams();
  const lesson = getSong(songId);
  const compiled = useMemo(() => (lesson ? compileLesson(lesson, PATTERNS) : null), [lesson]);
  if (!lesson || !compiled) return <NotFoundPage />;
  return (
    <>
      <div className={styles.header}>
        <p className={styles.meta}>
          <Link to="/songs">Songs</Link>
        </p>
        <h1>{lesson.title}</h1>
        <p className={styles.meta}>
          {keyName(lesson.key)}, {lesson.meter.beats}/{lesson.meter.unit}, {lesson.bars.length} bars
        </p>
      </div>
      <LessonPlayer key={lesson.id} compiled={compiled} recordId={lesson.id} variant="song" />
    </>
  );
}
