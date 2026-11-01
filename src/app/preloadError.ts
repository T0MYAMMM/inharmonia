/** Set for the rest of the session once the app has reloaded for a missing chunk. */
export const RELOADED_KEY = 'inharmonia:reloaded-for-chunk';

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * A tab left open across a deploy can ask for a room's code under a name the
 * new build no longer has. Vite reports that as `vite:preloadError`; reload
 * once per session to pick up the new build. If that doesn't help, the error
 * is left to the route error boundary, so the page never reloads in a loop.
 */
export function reloadOnPreloadError(
  target: Window = window,
  store: Storage | null = sessionStore(),
): void {
  target.addEventListener('vite:preloadError', (event) => {
    try {
      if (!store || store.getItem(RELOADED_KEY)) return;
      store.setItem(RELOADED_KEY, '1');
    } catch {
      return;
    }
    event.preventDefault();
    target.location.reload();
  });
}
