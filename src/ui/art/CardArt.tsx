import type { ReactNode } from 'react';
import s from './art.module.css';

/**
 * A drawing at the top of a card, on its room's tint: a preview of what the
 * card leads to. On a phone it runs across the card's top edge to edge.
 * The card must keep its --space-5 padding.
 */
export function CardArt({ children }: { children: ReactNode }) {
  return (
    <span className={s.cardArt} aria-hidden="true">
      {children}
    </span>
  );
}
