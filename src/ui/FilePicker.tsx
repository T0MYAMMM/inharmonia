import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass';
import { useFileDrop } from './useFileDrop';
import styles from './FilePicker.module.css';

export interface FilePickerProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'size' | 'children'
> {
  /** The button's text. */
  children: ReactNode;
  onFiles: (files: File[]) => void;
  /**
   * Dropped files that don't match `accept`. Without it, the picker says
   * beside the button that it can't use them.
   */
  onReject?: (files: File[]) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show the chosen file's name beside the button. On by default. */
  showName?: boolean;
  /** Take files dropped on the button. Turn off when a larger area around it takes them. */
  acceptDrop?: boolean;
  /** data-testid for the button; `data-testid` goes on the file input. */
  buttonTestId?: string;
}

/**
 * A file input that looks like a Button. The native input stays in the tab
 * order (visually hidden), so Tab reaches it and Space or Enter opens the
 * file chooser; the button shows its focus ring.
 */
export function FilePicker({
  children,
  onFiles,
  onReject,
  variant = 'secondary',
  size = 'normal',
  showName = true,
  acceptDrop = true,
  buttonTestId,
  className,
  accept,
  multiple,
  disabled,
  ...rest
}: FilePickerProps) {
  // The chosen file's name, or why dropped files weren't taken.
  const [note, setNote] = useState('');
  // The chooser treats `accept` as a hint, so chosen files are taken as they
  // are; dropped files, which nothing has filtered, must match it.
  const take = (files: File[]) => {
    const picked = multiple ? files : files.slice(0, 1);
    if (!picked.length) return;
    setNote(showName ? picked.map((f) => f.name).join(', ') : '');
    onFiles(picked);
  };
  const { over, dropProps } = useFileDrop({
    accept,
    multiple,
    disabled: !acceptDrop || disabled,
    onFiles: take,
    onReject:
      onReject ??
      ((files) => setNote(`${files.map((f) => f.name).join(', ')} can't be used here.`)),
  });
  return (
    <span className={[styles.picker, className].filter(Boolean).join(' ')}>
      <label
        className={buttonClass(variant, size, styles.button)}
        data-over={over || undefined}
        data-disabled={disabled || undefined}
        data-testid={buttonTestId}
        {...dropProps}
      >
        <input
          type="file"
          className={styles.input}
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            take([...(e.target.files ?? [])]);
            // Let the same file be picked again.
            e.target.value = '';
          }}
          {...rest}
        />
        {children}
      </label>
      <span className={styles.name} aria-live="polite">
        {note}
      </span>
    </span>
  );
}
