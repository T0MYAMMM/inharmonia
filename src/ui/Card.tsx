import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export function Card({
  title,
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { title?: ReactNode }) {
  return (
    <section className={[styles.card, className].filter(Boolean).join(' ')} {...rest}>
      {title ? <h3 className={styles.title}>{title}</h3> : null}
      {children}
    </section>
  );
}
