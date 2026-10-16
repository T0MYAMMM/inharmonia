import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'normal' | 'small';

/** Button classes, for links that should look like buttons. */
export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'normal',
  extra?: string,
): string {
  return [
    styles.button,
    variant === 'primary' && styles.primary,
    variant === 'ghost' && styles.ghost,
    size === 'small' && styles.small,
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}
