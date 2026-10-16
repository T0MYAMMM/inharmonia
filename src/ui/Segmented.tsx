import { useRef, type KeyboardEvent } from 'react';
import styles from './Segmented.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Shown but not selectable; arrow keys skip it. */
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  /** id of an element that explains the group, e.g. why options are disabled. */
  describedBy?: string;
}

/** Pill-shaped radio group. Arrow keys move between options, like native radios. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  describedBy,
}: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const firstEnabled = options.findIndex((o) => !o.disabled);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    let next = i;
    for (let step = 0; step < options.length; step++) {
      next = (next + delta + options.length) % options.length;
      if (!options[next]!.disabled) break;
    }
    if (next === i) return;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      className={[styles.group, className].filter(Boolean).join(' ')}
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        // With nothing chosen yet, the first option takes the tab stop.
        const tabStop = checked || (i === firstEnabled && !options.some((x) => x.value === value));
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={o.disabled || undefined}
            tabIndex={tabStop ? 0 : -1}
            className={styles.option}
            onClick={() => !o.disabled && onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
