import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass';
import { useDismiss } from './useDismiss';
import styles from './Menu.module.css';

/** Lets a chosen item close its menu. */
const CloseMenu = createContext<() => void>(() => undefined);

/** Room kept between an open menu and the edge of the screen, px. */
const EDGE = 8;

const itemsIn = (list: HTMLElement | null) => [
  ...(list?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]') ?? []),
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

  // Where the list goes, from its own edge: measured first where it can't
  // widen the page (fixed, unseen), then lined up with its button's edge, or
  // its other edge when that one runs off the screen, or else just inside
  // the screen. Placed before it shows, it never makes a phone zoom out to fit it.
  // Null while measuring; 'edge' where nothing is laid out to measure.
  const [left, setLeft] = useState<number | 'edge' | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    const root = rootRef.current;
    if (!open || !list || !root) return;
    const width = list.getBoundingClientRect().width;
    const at = root.getBoundingClientRect();
    const screen = document.documentElement.clientWidth;
    // Its own edge first, then the other edge of the button, then just inside the screen.
    const edges = align === 'end' ? [at.right - width, at.left] : [at.left, at.right - width];
    const wanted = edges.find((x) => x >= EDGE && x + width <= screen - EDGE) ?? edges[0]!;
    const placed = Math.max(EDGE, Math.min(wanted, screen - EDGE - width));
    setLeft(width ? Math.round(placed - at.left) : 'edge');
    return () => setLeft(null);
  }, [open, align]);
  const measuring = open && left === null;

  // Once open and placed, focus the first or the last item.
  useEffect(() => {
    if (!open || measuring) return;
    const items = itemsIn(listRef.current);
    items[from === 'last' ? items.length - 1 : 0]?.focus();
  }, [open, from, measuring]);

  // A press outside closes the menu and leaves focus where it lands. Escape
  // is the menu's own key (below), so it can put focus back on the button.
  useDismiss(rootRef, open, { onOutside: () => setOpen(false) });

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
          data-measuring={measuring || undefined}
          style={typeof left === 'number' ? { left, right: 'auto' } : undefined}
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
  /**
   * A line under the item saying what it will do here, or why it can't.
   * The item is named by its own words; the note describes it.
   */
  note?: ReactNode;
}

/** One action in a Menu. Choosing it closes the menu first. */
export function MenuItem({
  onSelect,
  disabled,
  note,
  className,
  children,
  ...rest
}: MenuItemProps) {
  const close = useContext(CloseMenu);
  const id = useId();
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      aria-labelledby={note ? `${id}-label` : undefined}
      aria-describedby={note ? `${id}-note` : undefined}
      className={[styles.item, className].filter(Boolean).join(' ')}
      onClick={() => {
        if (disabled) return;
        close();
        onSelect();
      }}
      {...rest}
    >
      {note ? (
        <span className={styles.itemText}>
          <span id={`${id}-label`}>{children}</span>
          <span id={`${id}-note`} className={styles.itemNote}>
            {note}
          </span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export interface MenuCheckItemProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** A line under the item saying what being ticked means, like MenuItem's. */
  note?: ReactNode;
}

/**
 * A choice in a Menu that is ticked or not (the WAI-ARIA menuitemcheckbox).
 * A click, Space or Enter ticks or unticks it and the menu stays open, so the
 * items after it run with the choice made. Its box is ink, never a hand's colour.
 */
export function MenuCheckItem({
  checked,
  onChange,
  note,
  className,
  children,
  ...rest
}: MenuCheckItemProps) {
  const id = useId();
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={-1}
      aria-labelledby={`${id}-label`}
      aria-describedby={note ? `${id}-note` : undefined}
      className={[styles.item, className].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className={styles.box} aria-hidden="true" />
      <span className={styles.itemText}>
        <span id={`${id}-label`}>{children}</span>
        {note ? (
          <span id={`${id}-note`} className={styles.itemNote}>
            {note}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** A line between groups of items. */
export function MenuSeparator() {
  return <div role="separator" className={styles.separator} />;
}
