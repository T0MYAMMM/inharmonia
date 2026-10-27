import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'normal' | 'small';

/**
 * Button classes, for links that should look like buttons. `icon` makes a
 * round button as wide as it is tall, for a lone icon with an aria-label.
 */
export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'normal',
  extra?: string,
  icon = false,
): string {
  return [
    styles.button,
    variant === 'primary' && styles.primary,
    variant === 'ghost' && styles.ghost,
    size === 'small' && styles.small,
    icon && styles.icon,
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}
