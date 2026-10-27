import { useId, type ReactNode } from 'react';
import { FieldContext } from './field';
import styles from './Field.module.css';

export interface FieldProps {
  label: ReactNode;
  /** A line under the control that explains it. */
  hint?: ReactNode;
  /** What is wrong with the value. Marks the control invalid. */
  error?: ReactNode;
  /** Label beside the control instead of above it. */
  inline?: boolean;
  /**
   * For a control that is not a form element, like Segmented: the label
   * names a group instead of pointing at an input.
   */
  group?: boolean;
  /** The control's id; one is made up if not given. */
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A label, the control, and an optional hint and error. Select, TextInput,
 * NumberInput, TextArea and RangeInput inside pick up the label's id and are
 * described by the hint and error.
 */
export function Field({ label, hint, error, inline, group, id, className, children }: FieldProps) {
  const auto = useId();
  const controlId = id ?? auto;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const labelId = `${controlId}-label`;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const cls = [styles.field, inline && styles.inline, className].filter(Boolean).join(' ');
  const extra = (
    <>
      {hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      ) : null}
    </>
  );

  if (group) {
    return (
      <div role="group" aria-labelledby={labelId} aria-describedby={describedBy} className={cls}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {children}
        {extra}
      </div>
    );
  }
  return (
    <div className={cls}>
      <label htmlFor={controlId} className={styles.label}>
        {label}
      </label>
      <FieldContext.Provider value={{ id: controlId, describedBy, invalid: !!error }}>
        {children}
      </FieldContext.Provider>
      {extra}
    </div>
  );
}
