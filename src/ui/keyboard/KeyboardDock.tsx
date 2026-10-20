import type { CSSProperties, ReactNode } from 'react';
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
  /** Place the normal playable keyboard directly below a shared-scroll note roll. */
  roll?: ReactNode;
  inline?: boolean;
}

export function KeyboardDock({
  focus,
  low = DOCK_RANGE[0],
  high = DOCK_RANGE[1],
  extra,
  showTarget = false,
  roll,
  inline = false,
}: KeyboardDockProps) {
  const shift = useComputerKeys();
  const showHints = useSettings((s) => s.showKeyHints);
  const base = BASE_MIDI + 12 * shift;
  return (
    <aside
      className={styles.dock}
      aria-label="Keyboard"
      data-dock
      data-inline={inline || undefined}
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
          <MidiStatus />
          <span className={styles.keysHint} data-testid="keys-range">
            Keys A to ' play {keyName(base)} to {keyName(base + 17)}, Z and X shift octave
          </span>
        </div>
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
