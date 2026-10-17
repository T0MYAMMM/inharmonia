import styles from './BetaBadge.module.css';

/** Marks a feature that is still being built and evaluated. */
export function BetaBadge() {
  return (
    <span className={styles.badge} title="Still in development: it may change or misbehave.">
      Beta
    </span>
  );
}
