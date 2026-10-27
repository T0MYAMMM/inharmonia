import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './Control.module.css';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'checked' | 'onChange'
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /**
   * The label. Without one the box stands alone and needs an aria-label;
   * with one, className goes on the label.
   */
  children?: ReactNode;
}

function Check({
  type,
  checked,
  onChange,
  children,
  className,
  ...rest
}: CheckboxProps & { type: 'checkbox' | 'radio' }) {
  const input = (
    <input
      type={type}
      className={children ? styles.box : [styles.box, className].filter(Boolean).join(' ')}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      {...rest}
    />
  );
  if (!children) return input;
  return (
    <label className={[styles.check, className].filter(Boolean).join(' ')}>
      {input}
      {children}
    </label>
  );
}

export function Checkbox(props: CheckboxProps) {
  return <Check type="checkbox" {...props} />;
}

/** A single radio. Give radios that belong together the same name. */
export function Radio(props: CheckboxProps) {
  return <Check type="radio" {...props} />;
}
