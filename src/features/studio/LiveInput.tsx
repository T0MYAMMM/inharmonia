import { useEffect, useRef } from 'react';
import type { StudioController } from './StudioController';
import styles from './studio.module.css';

const TRACE_SECONDS = 4;
const LOW = 40;
const HIGH = 84;

/**
 * Live input level and pitch trace, drawn on a canvas from the controller's
 * level listener (no React renders). The last few seconds scroll right to left.
 */
export function LiveInput({ ctrl }: { ctrl: StudioController }) {
  const meter = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const draw = () => {
      const lvl = Math.min(1, ctrl.level * 1.4);
      if (meter.current) meter.current.style.transform = `scaleX(${lvl})`;
      const c = canvas.current;
      const g = c?.getContext('2d');
      if (!c || !g) return;
      const w = (c.width = c.clientWidth * devicePixelRatio);
      const h = (c.height = c.clientHeight * devicePixelRatio);
      g.clearRect(0, 0, w, h);
      const css = getComputedStyle(c);
      g.strokeStyle = css.getPropertyValue('--line').trim() || '#ccc';
      g.lineWidth = 1;
      for (let m = 48; m <= 84; m += 12) {
        const y = h - ((m - LOW) / (HIGH - LOW)) * h;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      const frames = ctrl.trace;
      const end = frames.length ? frames[frames.length - 1]!.time : 0;
      g.strokeStyle = css.getPropertyValue('--ink').trim() || '#000';
      g.lineWidth = 2 * devicePixelRatio;
      g.beginPath();
      let pen = false;
      for (const f of frames) {
        const x = w - ((end - f.time) / TRACE_SECONDS) * w;
        if (x < 0) continue;
        if (f.midi === null || f.clarity < 0.85 || f.midi < LOW || f.midi > HIGH) {
          pen = false;
          continue;
        }
        const y = h - ((f.midi - LOW) / (HIGH - LOW)) * h;
        if (pen) g.lineTo(x, y);
        else g.moveTo(x, y);
        pen = true;
      }
      g.stroke();
    };
    return ctrl.onLevel(draw);
  }, [ctrl]);

  return (
    <div className={styles.live}>
      <div className={styles.meter} role="img" aria-label="Input level">
        <div ref={meter} className={styles.meterFill} />
      </div>
      <canvas ref={canvas} className={styles.trace} aria-hidden="true" />
      <p className={styles.hint}>Sing or hum: the line follows your pitch.</p>
    </div>
  );
}
