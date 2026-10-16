import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useEffect, useId, useRef, useState } from 'react';
import { Segmented } from '@/ui/Segmented';
import { useSettings, type ThemeChoice } from '@/state/settings';
import type { NotationSystem } from '@/core/notation';
import styles from './Layout.module.css';

const THEMES = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: ThemeChoice; label: string }[];

const NOTATIONS = [
  { value: 'letter', label: 'Letters' },
  { value: 'roman', label: 'Roman' },
  { value: 'angka', label: 'Not angka' },
] as const satisfies readonly { value: NotationSystem; label: string }[];

const NAV = [
  { to: '/songs', label: 'Songs', end: false },
  { to: '/chords', label: 'Chords', end: false },
  { to: '/progressions', label: 'Progressions', end: false },
  { to: '/fills', label: 'Fills', end: false },
  { to: '/keyboard', label: 'Keyboard', end: false },
  { to: '/about', label: 'About', end: false },
];

export function Layout() {
  const theme = useSettings((s) => s.theme);
  const notation = useSettings((s) => s.notation);
  const set = useSettings((s) => s.set);
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const first = useRef(true);
  const [displayOpen, setDisplayOpen] = useState(false);
  const controlsId = useId();

  // Move focus to the page on navigation so screen readers announce the new page.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand}>
            Inharmonia
          </Link>
          <nav className={styles.nav} aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={styles.navLink}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className={styles.displayToggle}
            aria-expanded={displayOpen}
            aria-controls={controlsId}
            onClick={() => setDisplayOpen((o) => !o)}
          >
            Display
          </button>
          <div id={controlsId} className={styles.controls} data-open={displayOpen || undefined}>
            <Segmented
              label="Note names"
              value={notation}
              options={NOTATIONS}
              onChange={(v) => set({ notation: v })}
            />
            <Segmented
              label="Theme"
              value={theme}
              options={THEMES}
              onChange={(v) => set({ theme: v })}
            />
          </div>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
