import type { ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './page.module.css';

/**
 * The way up or back, above the title: a link to the page above, or a button
 * that leaves a view on the same page (Studio's editors). Both look the same.
 */
export type Crumb =
  | { to: string; label: string; testId?: string }
  | { onClick: () => void; label: string; testId?: string };

export interface PageHeaderProps {
  crumb?: Crumb;
  /** The page's one h1. */
  title: ReactNode;
  /** Badges at the start of the lede's first line, like Private and Chart. */
  tags?: ReactNode;
  /** What the page is for, or the facts of what is on it: a string, or paragraphs. */
  lede?: ReactNode;
  /** What you can do here, in one row that wraps. */
  actions?: ReactNode;
}

/**
 * Every page's header, in one order: the way up, the title, the lede, the
 * actions. The spacing and the measure of the text are set here, so pages
 * don't set their own.
 */
export function PageHeader({ crumb, title, tags, lede, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {crumb ? (
        <p className={styles.crumb}>
          <CrumbControl crumb={crumb} />
        </p>
      ) : null}
      <h1>{title}</h1>
      {tags || lede ? (
        <div className={styles.lede}>
          {tags ? <span className={styles.tags}>{tags}</span> : null}
          {typeof lede === 'string' ? <p>{lede}</p> : lede}
        </div>
      ) : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

function CrumbControl({ crumb }: { crumb: Crumb }) {
  const content = (
    <>
      <span aria-hidden="true">← </span>
      {crumb.label}
    </>
  );
  return 'to' in crumb ? (
    <Link to={crumb.to} data-testid={crumb.testId}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      className={styles.crumbButton}
      onClick={crumb.onClick}
      data-testid={crumb.testId}
    >
      {content}
    </button>
  );
}
