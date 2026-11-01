import { useEffect, type RefObject } from 'react';

export interface DismissHandlers {
  /** A press anywhere outside the element. Focus goes where the press put it. */
  onOutside: () => void;
  /** Escape, from anywhere on the page. Leave it out where the element handles its own keys. */
  onEscape?: () => void;
}

/**
 * Close a menu or popover when you press outside it or press Escape, while
 * `open` is true. Shared by Menu, the settings popover and How to play.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  { onOutside, onEscape }: DismissHandlers,
): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOutside();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape?.();
    };
    window.addEventListener('pointerdown', onDown);
    if (onEscape) window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [ref, open, onOutside, onEscape]);
}
