import { forwardRef } from 'react';
import styles from './ProgressTrack.module.css';

/**
 * Thin progress line. The fill is driven imperatively (transform: scaleX) from
 * a requestAnimationFrame loop, so it never causes React renders.
 * Use `setProgress(ref.current, 0..1)` from `ui/progress`.
 */
export const ProgressTrack = forwardRef<HTMLDivElement, { label: string }>(function ProgressTrack(
  { label },
  ref,
) {
  return (
    <div className={styles.track} role="presentation" aria-label={label}>
      <div ref={ref} className={styles.fill} />
    </div>
  );
});
