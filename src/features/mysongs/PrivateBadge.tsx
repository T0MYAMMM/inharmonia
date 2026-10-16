import styles from './mysongs.module.css';

/** Marks a song as yours: kept in this browser, never uploaded or shared. */
export function PrivateBadge() {
  return (
    <span
      className={styles.badge}
      title="Kept in this browser on this device. Never uploaded or shared."
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <rect x="2" y="5.5" width="8" height="5.5" rx="1.2" fill="currentColor" />
        <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      Private
    </span>
  );
}
