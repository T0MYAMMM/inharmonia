import type { ButtonSize } from './buttonClass';
import styles from './Control.module.css';

/** Controls come in the same two sizes as buttons: 40px and 32px tall. */
export type ControlSize = ButtonSize;

/** The box every text-like control shares: Select, TextInput, NumberInput and TextArea. */
export function controlClass(size: ControlSize = 'normal', extra?: string): string {
  return [styles.control, size === 'small' && styles.small, extra].filter(Boolean).join(' ');
}
