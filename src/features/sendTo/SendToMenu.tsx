import { useEffect, useState } from 'react';
import { Menu, MenuItem } from '@/ui/Menu';
import { ChevronDownIcon } from '../studio/icons';
import { ROOMS, SEND_TO, type Room } from './names';
import styles from './sendTo.module.css';

export interface SendToItem {
  room: Room;
  /** What it will do from here, or why it can't. */
  note: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * Send to: the rooms what is on this page can go to, each with what it
 * will do. What the last choice could not do is said beside it.
 */
export function SendToMenu({
  items,
  about,
  status = '',
  testId = 'send-to',
}: {
  items: readonly SendToItem[];
  /** Said after "Send to" to a screen reader where there are several: "the Verse". */
  about?: string;
  status?: string;
  testId?: string;
}) {
  return (
    <span className={styles.sendTo}>
      <Menu
        size="small"
        label={
          <>
            {SEND_TO}
            {about ? <span className="visually-hidden"> {about}</span> : null} <ChevronDownIcon />
          </>
        }
        data-testid={testId}
      >
        {items.map((item) => (
          <MenuItem
            key={item.room}
            note={item.note}
            disabled={item.disabled}
            onSelect={item.onSelect}
            data-testid={`${testId}-${item.room}`}
          >
            {ROOMS[item.room]}
          </MenuItem>
        ))}
      </Menu>
      <span className={styles.status} role="status">
        {status}
      </span>
    </span>
  );
}

/**
 * Said once a page has arrived: shown at once, and put in a live region a
 * moment later, so a screen reader says it after the page itself.
 */
export function ArrivalNote({
  text,
  spoken = text,
  className,
  testId,
}: {
  text: string;
  /** What a screen reader hears, when it is more than what is shown. */
  spoken?: string;
  className?: string;
  testId?: string;
}) {
  const [said, setSaid] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setSaid(spoken), 150);
    return () => window.clearTimeout(t);
  }, [spoken]);
  return (
    <>
      <p className={className} data-testid={testId}>
        {text}
      </p>
      <p className="visually-hidden" role="status">
        {said}
      </p>
    </>
  );
}
