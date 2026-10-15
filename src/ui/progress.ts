/** Set a ProgressTrack fill (0..1) imperatively, e.g. from a requestAnimationFrame loop. */
export function setProgress(el: HTMLElement | null, fraction: number): void {
  if (!el) return;
  const f = Math.max(0, Math.min(1, fraction));
  el.style.transform = `scaleX(${f})`;
}
