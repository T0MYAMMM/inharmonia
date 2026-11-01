import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './sendTo.module.css';

/**
 * A step before sending, as a modal dialog: a key to choose, a title to
 * give. Escape or Cancel closes it, and focus goes back to where it was,
 * the Send to button.
 */
export function SendDialog({
  open,
  title,
  onClose,
  children,
  testId,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      data-testid={testId}
    >
      {open ? (
        <div className={styles.body}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
