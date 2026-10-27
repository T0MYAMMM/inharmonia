import { useState, type CSSProperties, type InputHTMLAttributes } from 'react';
import { controlClass, type ControlSize } from './controlClass';
import { useFieldControl } from './field';
import styles from './Control.module.css';

export interface NumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'min' | 'max' | 'size'
> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: ControlSize;
  /** Show the allowed range after the number. On by default. */
  showRange?: boolean;
}

const clamp = (n: number, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, n));

function rangeText(min?: number, max?: number) {
  if (min !== undefined && max !== undefined) return `${min}–${max}`;
  if (min !== undefined) return `≥ ${min}`;
  if (max !== undefined) return `≤ ${max}`;
  return null;
}

/**
 * A number in the shared control box, with its range beside it. Typing is
 * free; a number in range is sent as you type, and on blur or Enter the
 * value is clamped into range (or put back, if it isn't a number).
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  size = 'normal',
  showRange = true,
  className,
  onBlur,
  onKeyDown,
  ...rest
}: NumberInputProps) {
  const field = useFieldControl(rest);
  // What the person is typing, until it is committed.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    const next = draft.trim() === '' || !Number.isFinite(n) ? value : clamp(n, min, max);
    if (next !== value) onChange(next);
    setDraft(null);
  };
  const range = showRange ? rangeText(min, max) : null;
  const digits = Math.max(
    2,
    ...[min, max, value].filter((n) => n !== undefined).map((n) => String(n).length),
  );
  return (
    <span
      className={controlClass(size, [styles.number, className].filter(Boolean).join(' '))}
      style={{ '--digits': digits } as CSSProperties}
    >
      <input
        type="number"
        className={styles.numberInput}
        min={min}
        max={max}
        value={draft ?? String(value)}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const n = Number(text);
          if (text.trim() !== '' && Number.isFinite(n) && n === clamp(n, min, max)) onChange(n);
        }}
        onBlur={(e) => {
          commit();
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          onKeyDown?.(e);
        }}
        {...rest}
        {...field}
      />
      {range ? (
        <span className={styles.range} aria-hidden="true">
          {range}
        </span>
      ) : null}
    </span>
  );
}
