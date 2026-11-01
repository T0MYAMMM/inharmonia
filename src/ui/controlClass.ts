import type { ButtonSize } from './buttonClass';
import styles from './Control.module.css';

/**
 * Controls come in two sizes, named like buttons' but shorter: 40px and 32px
 * tall, where buttons are 44px and 36px.
 */
export type ControlSize = ButtonSize;

/** The box every text-like control shares: Select, TextInput, NumberInput and TextArea. */
export function controlClass(size: ControlSize = 'normal', extra?: string): string {
  return [styles.control, size === 'small' && styles.small, extra].filter(Boolean).join(' ');
}
