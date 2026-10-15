import { useId } from 'react';
import styles from './Slider.module.css';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = String,
}: SliderProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <div className={styles.top}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        <output htmlFor={id} className={styles.value}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        className={styles.range}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
