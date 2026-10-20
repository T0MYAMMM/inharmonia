import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BASE_MIDI } from '@/core/input';
import { audio, lights, notes } from '@/app/services';
import { useComputerKeys } from '@/app/hooks';
import { useSettings } from '@/state/settings';
import { Keyboard } from './Keyboard';
import { DOCK_RANGE, keyName } from './layout';
import { MidiStatus } from './MidiStatus';
import styles from './KeyboardDock.module.css';

export interface KeyboardDockProps {
  focus?: [number, number];
  low?: number;
  high?: number;
  /** Extra legend items, e.g. a target swatch. */
  extra?: ReactNode;
  showTarget?: boolean;
  /** Falling-note layer above the same sticky interactive keyboard. */
  roll?: ReactNode;
  /** Play/pause and restart controls to retain while the dock fills the screen. */
  fullScreenControls?: ReactNode;
}

export function KeyboardDock({
  focus,
  low = DOCK_RANGE[0],
  high = DOCK_RANGE[1],
  extra,
  showTarget = false,
  roll,
  fullScreenControls,
}: KeyboardDockProps) {
  const shift = useComputerKeys();
  const showHints = useSettings((s) => s.showKeyHints);
  const base = BASE_MIDI + 12 * shift;
  const dockRef = useRef<HTMLElement>(null);
  const [screenMode, setScreenMode] = useState<'normal' | 'native' | 'fallback'>('normal');
  const fullScreen = screenMode !== 'normal';

  // Escape or the browser's own fullscreen exit must restore the floating dock.
  useEffect(() => {
    const sync = () =>
      setScreenMode((current) =>
        document.fullscreenElement === dockRef.current
          ? 'native'
          : current === 'native'
            ? 'normal'
            : current,
      );
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // Browsers that disallow the Fullscreen API (notably some mobile browsers)
  // still get an immersive viewport-filling overlay, with Escape to exit.
  useEffect(() => {
    if (screenMode !== 'fallback') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setScreenMode('normal');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [screenMode]);

  // Switching away from Falling Notes must never strand the user fullscreen.
  useEffect(() => {
    if (roll || screenMode === 'normal') return;
    if (document.fullscreenElement === dockRef.current) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    setScreenMode('normal');
  }, [roll, screenMode]);

  useEffect(() => {
    const dock = dockRef.current;
    return () => {
      if (document.fullscreenElement === dock) {
        void document.exitFullscreen?.().catch(() => undefined);
      }
    };
  }, []);

  const toggleFullScreen = () => {
    const dock = dockRef.current;
    if (!dock) return;
    if (fullScreen) {
      if (document.fullscreenElement === dock) {
        void document.exitFullscreen().then(
          () => setScreenMode('normal'),
          () => setScreenMode('normal'),
        );
      } else {
        setScreenMode('normal');
      }
      return;
    }
    if (!dock.requestFullscreen) {
      setScreenMode('fallback');
      return;
    }
    try {
      void dock.requestFullscreen().then(
        () => setScreenMode('native'),
        () => setScreenMode('fallback'),
      );
    } catch {
      setScreenMode('fallback');
    }
  };

  return (
    <aside
      ref={dockRef}
      className={styles.dock}
      aria-label="Keyboard"
      data-dock
      data-falling={roll ? 'true' : undefined}
      data-immersive={fullScreen ? 'true' : undefined}
    >
      <div className={styles.inner}>
        <div className={styles.legend}>
          <span className={styles.swatch} style={{ '--c': 'var(--amber)' } as CSSProperties}>
            {showTarget ? 'Right hand, target' : 'Right hand'}
          </span>
          <span className={styles.swatch} style={{ '--c': 'var(--dusk)' } as CSSProperties}>
            Left hand
          </span>
          {extra}
          <span className={styles.spacer} />
          {roll ? (
            <button
              className={styles.fullScreenButton}
              type="button"
              data-testid="falling-fullscreen"
              aria-pressed={fullScreen}
              onClick={toggleFullScreen}
            >
              {fullScreen ? 'Exit Full Screen' : 'Full Screen'}
            </button>
          ) : null}
          <MidiStatus />
          <span className={styles.keysHint} data-testid="keys-range">
            Keys A to ' play {keyName(base)} to {keyName(base + 17)}, Z and X shift octave
          </span>
        </div>
        {fullScreen && fullScreenControls ? (
          <div className={styles.immersiveControls} data-testid="falling-fullscreen-controls">
            {fullScreenControls}
          </div>
        ) : null}
        <Keyboard
          low={low}
          high={high}
          roll={roll}
          stream={notes}
          lights={lights}
          octaveShift={shift}
          showHints={showHints}
          focus={focus ?? [base, base + 17]}
          onGesture={() => void audio.unlock()}
        />
      </div>
    </aside>
  );
}
