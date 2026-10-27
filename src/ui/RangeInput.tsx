import type { InputHTMLAttributes } from 'react';
import type { ControlSize } from './controlClass';
import { useFieldControl } from './field';
import styles from './Control.module.css';

export interface RangeInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'min' | 'max' | 'size'
> {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Matches the height of the controls beside it. */
  size?: ControlSize;
}

/** A bare range input. Slider adds a label and a readout; inside a Field, use this. */
export function RangeInput({
  value,
  onChange,
  size = 'normal',
  className,
  ...rest
}: RangeInputProps) {
  const field = useFieldControl(rest);
  return (
    <input
      type="range"
      className={[styles.slider, size === 'small' && styles.sliderSmall, className]
        .filter(Boolean)
        .join(' ')}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      {...rest}
      {...field}
    />
  );
}
