import type { NoteStream } from './noteStream';

/**
 * Pointer input for an on-screen keyboard. Keys are any descendants with a
 * `data-midi` attribute. Supports multi-touch (one note per pointer) and
 * glissando: dragging a pressed pointer across keys moves the note with it.
 * Velocity comes from how far down the key you press (lower = louder), the
 * way a real key responds more the closer you strike to its front edge.
 *
 * Notes sustain while held, so every way a release can be lost ends the note:
 * pointerup, pointercancel (the browser took the gesture, e.g. to scroll),
 * lostpointercapture (capture was taken away), window blur, and unbinding.
 */
export function bindPointerInput(
  container: HTMLElement,
  stream: NoteStream,
  opts: { onGesture?: () => void } = {},
): () => void {
  const active = new Map<number, number>(); // pointerId → midi

  const keyAt = (x: number, y: number): HTMLElement | null => {
    const el = document.elementFromPoint?.(x, y);
    const key = el instanceof Element ? el.closest<HTMLElement>('[data-midi]') : null;
    return key && container.contains(key) ? key : null;
  };

  const velocityFor = (key: HTMLElement, y: number): number => {
    const r = key.getBoundingClientRect();
    if (r.height <= 0) return 0.75;
    const depth = Math.min(1, Math.max(0, (y - r.top) / r.height));
    return 0.45 + 0.5 * depth;
  };

  const start = (key: HTMLElement, e: PointerEvent) => {
    const midi = Number(key.dataset.midi);
    if (!Number.isFinite(midi)) return;
    active.set(e.pointerId, midi);
    stream.noteOn(midi, velocityFor(key, e.clientY), 'pointer');
  };

  const end = (pointerId: number) => {
    const midi = active.get(pointerId);
    if (midi === undefined) return;
    active.delete(pointerId);
    stream.noteOff(midi, 'pointer');
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const key = (e.target as Element | null)?.closest<HTMLElement>('[data-midi]');
    if (!key || !container.contains(key)) return;
    opts.onGesture?.();
    e.preventDefault();
    // Capture on the keyboard itself (touch would otherwise capture to the
    // pressed key). Moves keep arriving here and are hit-tested against the key
    // under the finger, which is what makes glissando work; losing this capture
    // means the release will not arrive, so it ends the note.
    try {
      container.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    start(key, e);
  };

  const onMove = (e: PointerEvent) => {
    const current = active.get(e.pointerId);
    if (current === undefined) return;
    const key = keyAt(e.clientX, e.clientY);
    const midi = key ? Number(key.dataset.midi) : null;
    if (midi === current) return;
    end(e.pointerId);
    if (key) start(key, e);
  };

  const onEnd = (e: PointerEvent) => end(e.pointerId);
  const releaseAll = () => {
    for (const id of [...active.keys()]) end(id);
  };

  container.addEventListener('pointerdown', onDown);
  container.addEventListener('lostpointercapture', onEnd);
  container.addEventListener('pointercancel', onEnd);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onEnd);
  window.addEventListener('pointercancel', onEnd);
  window.addEventListener('blur', releaseAll);
  return () => {
    releaseAll();
    container.removeEventListener('pointerdown', onDown);
    container.removeEventListener('lostpointercapture', onEnd);
    container.removeEventListener('pointercancel', onEnd);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', onEnd);
    window.removeEventListener('blur', releaseAll);
  };
}
