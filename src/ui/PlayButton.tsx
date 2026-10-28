import { Button, type ButtonProps } from './Button';
import styles from './PlayButton.module.css';

export interface PlayButtonProps extends Omit<ButtonProps, 'children'> {
  playing: boolean;
  /** What it says while playing: Pause, or Stop. */
  stopLabel: string;
}

/** Play, as wide as its other label, so the row doesn't move when it changes. */
export function PlayButton({ playing, stopLabel, ...rest }: PlayButtonProps) {
  return (
    <Button variant="primary" {...rest}>
      <span className={styles.swap}>
        <span>{playing ? stopLabel : 'Play'}</span>
        <span aria-hidden="true">{playing ? 'Play' : stopLabel}</span>
      </span>
    </Button>
  );
}
