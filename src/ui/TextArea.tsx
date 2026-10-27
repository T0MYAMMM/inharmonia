import type { TextareaHTMLAttributes } from 'react';
import { controlClass } from './controlClass';
import { useFieldControl } from './field';
import styles from './Control.module.css';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Monospace, for pasted sheets and JSON where columns matter. */
  mono?: boolean;
}

export function TextArea({ mono, className, ...rest }: TextAreaProps) {
  const field = useFieldControl(rest);
  const cls = [styles.textarea, mono && styles.mono, className].filter(Boolean).join(' ');
  return <textarea className={controlClass('normal', cls)} {...rest} {...field} />;
}
