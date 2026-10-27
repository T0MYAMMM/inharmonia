import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass';
import styles from './Menu.module.css';

/** Lets a chosen item close its menu. */
const CloseMenu = createContext<() => void>(() => undefined);

const itemsIn = (list: HTMLElement | null) => [
  ...(list?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
];

export interface MenuProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The button's content. A button that shows only an icon needs an aria-label. */
  label: ReactNode;
  /** MenuItem and MenuSeparator. */
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A round button for a lone icon, like Button's. */
  icon?: boolean;
  /** Which edge of the button the menu lines up with. */
  align?: 'start' | 'end';
}

/**
 * A button that opens a list of actions (the WAI-ARIA menu button). Enter,
 * Space or ArrowDown opens it at the first item, ArrowUp at the last; the
 * arrow keys, Home and End move through it. Escape, Tab or choosing an item
 * closes it and puts focus back on the button; a press outside closes it too.
 */
export function Menu({
  label,
  children,
  variant = 'secondary',
  size = 'normal',
  icon = false,
  align = 'start',
  className,
  id,
  onClick,
  onKeyDown,
  ...rest
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<'first' | 'last'>('first');
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const auto = useId();
  const buttonId = id ?? `${auto}-button`;
  const menuId = `${auto}-menu`;

  const show = (at: 'first' | 'last') => {
    setFrom(at);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  // Once open, focus the first or the last item.
  useEffect(() => {
    if (!open) return;
    const items = itemsIn(listRef.current);
    items[from === 'last' ? items.length - 1 : 0]?.focus();
  }, [open, from]);

  // A press outside closes the menu and leaves focus where it lands.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      show(e.key === 'ArrowUp' ? 'last' : 'first');
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Keys pressed in an open menu are the menu's, not the page's.
    e.stopPropagation();
    const items = itemsIn(listRef.current);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to =
      e.key === 'ArrowDown'
        ? (at + 1) % items.length
        : e.key === 'ArrowUp'
          ? at <= 0
            ? items.length - 1
            : at - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : null;
    if (to !== null) {
      e.preventDefault();
      items[to]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      // Back on the button, Tab carries on from there.
      close();
    }
  };

  return (
    <span className={styles.menu} ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        id={buttonId}
        className={buttonClass(variant, size, className, icon)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          onClick?.(e);
          if (open) setOpen(false);
          else show('first');
        }}
        onKeyDown={onButtonKey}
        {...rest}
      >
        {label}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          className={styles.list}
          data-align={align}
          ref={listRef}
          onKeyDown={onMenuKey}
        >
          <CloseMenu.Provider value={close}>{children}</CloseMenu.Provider>
        </div>
      ) : null}
    </span>
  );
}

export interface MenuItemProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onSelect' | 'disabled'
> {
  onSelect: () => void;
  /** Shown and reachable with the arrow keys, but does nothing. */
  disabled?: boolean;
}

/** One action in a Menu. Choosing it closes the menu first. */
export function MenuItem({ onSelect, disabled, className, ...rest }: MenuItemProps) {
  const close = useContext(CloseMenu);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      className={[styles.item, className].filter(Boolean).join(' ')}
      onClick={() => {
        if (disabled) return;
        close();
        onSelect();
      }}
      {...rest}
    />
  );
}

/** A line between groups of items. */
export function MenuSeparator() {
  return <div role="separator" className={styles.separator} />;
}
