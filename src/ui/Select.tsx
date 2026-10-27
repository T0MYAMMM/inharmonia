import type { CSSProperties, SelectHTMLAttributes } from 'react';
import { controlClass, type ControlSize } from './controlClass';
import { useFieldControl } from './field';
import styles from './Control.module.css';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: ControlSize;
  /** Text colour. Use dusk only when the options are chords. */
  tone?: 'ink' | 'dusk';
  /** Classes and style go on the wrapper, for sizing and placing the control. */
  className?: string;
  style?: CSSProperties;
}

/** A native select in the shared control box, with its own arrow. */
export function Select({ size = 'normal', tone = 'ink', className, style, ...rest }: SelectProps) {
  const field = useFieldControl(rest);
  return (
    <span className={[styles.select, className].filter(Boolean).join(' ')} style={style}>
      <select
        className={controlClass(size, tone === 'dusk' ? styles.dusk : undefined)}
        {...rest}
        {...field}
      />
    </span>
  );
}
