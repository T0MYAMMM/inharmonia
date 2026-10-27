import type { InputHTMLAttributes } from 'react';
import { useFieldControl } from './field';
import styles from './Control.module.css';

export interface RangeInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'min' | 'max'
> {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

/** A bare range input. Slider adds a label and a readout; inside a Field, use this. */
export function RangeInput({ value, onChange, className, ...rest }: RangeInputProps) {
  const field = useFieldControl(rest);
  return (
    <input
      type="range"
      className={[styles.slider, className].filter(Boolean).join(' ')}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      {...rest}
      {...field}
    />
  );
}
