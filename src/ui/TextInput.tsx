import type { InputHTMLAttributes } from 'react';
import { controlClass, type ControlSize } from './controlClass';
import { useFieldControl } from './field';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Text-like types only; numbers use NumberInput. */
  type?: 'text' | 'search' | 'email' | 'url' | 'tel' | 'password';
  size?: ControlSize;
}

export function TextInput({ type = 'text', size = 'normal', className, ...rest }: TextInputProps) {
  const field = useFieldControl(rest);
  return <input type={type} className={controlClass(size, className)} {...rest} {...field} />;
}
