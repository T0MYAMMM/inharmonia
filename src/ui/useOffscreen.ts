import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether the element has left the viewport (or the part of it `rootMargin`
 * keeps), so a control can follow it into reach. False until it is known, and
 * always false where IntersectionObserver does not exist.
 */
export function useOffscreen(ref: RefObject<Element | null>, rootMargin = '0px'): boolean {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setOff(!last.isIntersecting);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);
  return off;
}
