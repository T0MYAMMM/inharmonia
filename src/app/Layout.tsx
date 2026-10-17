import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useEffect, useId, useRef, useState } from 'react';
import { BetaBadge } from '@/ui/BetaBadge';
import { Segmented } from '@/ui/Segmented';
import { VolumeSlider } from '@/ui/VolumeSlider';
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

const NAV: { to: string; label: string; end: boolean; beta?: boolean }[] = [
  { to: '/songs', label: 'Songs', end: false },
  { to: '/chords', label: 'Chords', end: false },
  { to: '/progressions', label: 'Progressions', end: false },
  { to: '/fills', label: 'Fills', end: false },
  { to: '/ear', label: 'Ear training', end: false },
  { to: '/studio', label: 'Studio', end: false, beta: true },
  { to: '/progress', label: 'Progress', end: false },
];

export function Layout() {
  const theme = useSettings((s) => s.theme);
  const notation = useSettings((s) => s.notation);
  const set = useSettings((s) => s.set);
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const first = useRef(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const controlsId = useId();
  const offline = useOfflineReady();
  const settingsRef = useRef<HTMLDivElement>(null);

  // The settings menu closes on Escape, on a click elsewhere, and on navigation.
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSettingsOpen(false);
      settingsRef.current?.querySelector('button')?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [settingsOpen]);
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    if (settingsOpen) setSettingsOpen(false);
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
                {n.beta ? <BetaBadge /> : null}
              </NavLink>
            ))}
          </nav>
          <div className={styles.settings} ref={settingsRef}>
            <button
              type="button"
              className={styles.settingsToggle}
              aria-label="Settings"
              title="Settings"
              aria-expanded={settingsOpen}
              aria-controls={controlsId}
              onClick={() => setSettingsOpen((o) => !o)}
            >
              <GearIcon />
            </button>
            <div
              id={controlsId}
              className={styles.controls}
              data-open={settingsOpen || undefined}
              role="group"
              aria-label="Settings"
            >
              <div className={styles.controlGroup}>
                <VolumeSlider />
              </div>
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

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
