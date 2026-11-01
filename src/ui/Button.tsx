import type { ButtonHTMLAttributes } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Only an icon: round, as wide as it is tall. Give it an aria-label. */
  icon?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'normal',
  icon = false,
  className,
  ...rest
}: ButtonProps) {
  return <button type="button" className={buttonClass(variant, size, className, icon)} {...rest} />;
}
