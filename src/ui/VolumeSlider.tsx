import { useSettings, VOLUME_RANGE } from '@/state/settings';
import { Slider } from './Slider';

const formatDb = (v: number) => (v === 0 ? 'Normal' : `${v > 0 ? '+' : ''}${v} dB`);

/** The app's volume, saved in settings and applied to every sound. */
export function VolumeSlider() {
  const volumeDb = useSettings((s) => s.volumeDb);
  const set = useSettings((s) => s.set);
  return (
    <Slider
      label="Volume"
      value={volumeDb}
      min={VOLUME_RANGE.min}
      max={VOLUME_RANGE.max}
      onChange={(v) => set({ volumeDb: v })}
      format={formatDb}
    />
  );
}
