import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useEffect, useId, useRef, useState } from 'react';
import { Segmented } from '@/ui/Segmented';
import { useSettings, type ThemeChoice } from '@/state/settings';
import { useOfflineReady } from './pwa';
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
  { to: '/ear', label: 'Ear training', end: false },
  { to: '/studio', label: 'Studio', end: false },
  { to: '/progress', label: 'Progress', end: false },
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
  const offline = useOfflineReady();
  const displayRef = useRef<HTMLDivElement>(null);

  // The display menu closes on Escape, on a click elsewhere, and on navigation.
  useEffect(() => {
    if (!displayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setDisplayOpen(false);
      displayRef.current?.querySelector('button')?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!displayRef.current?.contains(e.target as Node)) setDisplayOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [displayOpen]);
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    if (displayOpen) setDisplayOpen(false);
  }

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
          <div className={styles.display} ref={displayRef}>
            <button
              type="button"
              className={styles.displayToggle}
              aria-expanded={displayOpen}
              aria-controls={controlsId}
              onClick={() => setDisplayOpen((o) => !o)}
            >
              Display
            </button>
            <div
              id={controlsId}
              className={styles.controls}
              data-open={displayOpen || undefined}
              role="group"
              aria-label="Display settings"
            >
              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>Note names</span>
                <Segmented
                  label="Note names"
                  value={notation}
                  options={NOTATIONS}
                  onChange={(v) => set({ notation: v })}
                />
              </div>
              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>Theme</span>
                <Segmented
                  label="Theme"
                  value={theme}
                  options={THEMES}
                  onChange={(v) => set({ theme: v })}
                />
              </div>
            </div>
          </div>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <nav className={styles.footerNav} aria-label="More">
            <Link to="/keyboard">Keyboard</Link>
            <Link to="/about">About</Link>
          </nav>
          <p>
            Everything you do here stays in this browser.
            {offline ? ' Ready to use offline.' : ''}
          </p>
        </div>
      </footer>
    </div>
  );
}
