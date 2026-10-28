import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import styles from './Toggle.module.css';

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  /** Dot colour when on. Use amber or dusk only when the toggle is about that hand. */
  tone?: 'ink' | 'amber' | 'dusk';
  /** Small, beside small Buttons in a page's actions. */
  size?: 'normal' | 'small';
}

export function Toggle({
  pressed,
  onChange,
  tone = 'ink',
  size = 'normal',
  children,
  className,
  ...rest
}: ToggleProps) {
  const style = { '--dot-color': `var(--${tone})` } as CSSProperties;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={[styles.toggle, size === 'small' && styles.small, className]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onClick={() => onChange(!pressed)}
      {...rest}
    >
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </button>
  );
}
