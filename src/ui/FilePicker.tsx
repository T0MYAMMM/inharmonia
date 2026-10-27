import { useState, type DragEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass';
import styles from './FilePicker.module.css';

export interface FilePickerProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'size' | 'children'
> {
  /** The button's text. */
  children: ReactNode;
  onFiles: (files: File[]) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show the chosen file's name beside the button. On by default. */
  showName?: boolean;
  /** Take files dropped on the button. Turn off when a larger area around it takes them. */
  acceptDrop?: boolean;
  /** data-testid for the button; `data-testid` goes on the file input. */
  buttonTestId?: string;
}

/** Whether a file matches an accept list like ".mid,audio/midi,image/*". */
function accepts(file: File, accept: string | undefined): boolean {
  if (!accept?.trim()) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .some((a) =>
      a.startsWith('.')
        ? name.endsWith(a)
        : a.endsWith('/*')
          ? type.startsWith(a.slice(0, -1))
          : a === type,
    );
}

/**
 * A file input that looks like a Button. The native input stays in the tab
 * order (visually hidden), so Tab reaches it and Space or Enter opens the
 * file chooser; the button shows its focus ring.
 */
export function FilePicker({
  children,
  onFiles,
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
  const [name, setName] = useState('');
  const [over, setOver] = useState(false);
  // The chooser treats `accept` as a hint, so chosen files are taken as they
  // are; dropped files, which nothing has filtered, must match it.
  const take = (files: File[]) => {
    const picked = multiple ? files : files.slice(0, 1);
    if (!picked.length) return;
    setName(picked.map((f) => f.name).join(', '));
    onFiles(picked);
  };
  const drop = acceptDrop && !disabled;
  const hasFiles = (e: DragEvent) => [...e.dataTransfer.items].some((i) => i.kind === 'file');
  return (
    <span className={[styles.picker, className].filter(Boolean).join(' ')}>
      <label
        className={buttonClass(variant, size, styles.button)}
        data-over={over || undefined}
        data-disabled={disabled || undefined}
        data-testid={buttonTestId}
        onDragOver={
          drop
            ? (e) => {
                if (!hasFiles(e)) return;
                e.preventDefault();
                setOver(true);
              }
            : undefined
        }
        onDragLeave={drop ? () => setOver(false) : undefined}
        onDrop={
          drop
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                setOver(false);
                take([...e.dataTransfer.files].filter((f) => accepts(f, accept)));
              }
            : undefined
        }
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
      {showName ? (
        <span className={styles.name} aria-live="polite">
          {name}
        </span>
      ) : null}
    </span>
  );
}
