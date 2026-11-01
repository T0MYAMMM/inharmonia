import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import type { Handoff, HandoffKind } from '@/core/handoff';
import { arrive, leave, type Arrival } from '@/state/handoff';
import { ARRIVAL, LANDING } from './names';

/** Send something to the room that takes it: keep it for the landing page, then go there. */
export function useSend(): (handoff: Handoff) => void {
  const navigate = useNavigate();
  return (handoff) => {
    const id = leave(handoff);
    void navigate(`${LANDING[handoff.kind]}?sent=${id}`);
  };
}

/** This page's path and search, for the way back to it. */
export function useHere(): string {
  const { pathname, search } = useLocation();
  return `${pathname}${search}`;
}

/**
 * What was sent to this page, when its address names something, with its
 * id; and what to say when that is no longer there or can't be read.
 */
export function useArrival<K extends HandoffKind>(
  kind: K,
): Arrival<K> & { id: string | null; problem: string | null } {
  const [params] = useSearchParams();
  const id = params.get('sent');
  return useMemo(() => {
    const a = arrive(kind, id);
    const problem =
      a.status === 'gone' ? ARRIVAL.gone : a.status === 'unreadable' ? ARRIVAL.unreadable : null;
    return { ...a, id, problem };
  }, [kind, id]);
}
