import { useSyncExternalStore } from 'react';

/** Whether the service worker has cached everything needed to work offline. */
let offlineReady = false;
const listeners = new Set<() => void>();

export function markOfflineReady(): void {
  offlineReady = true;
  for (const l of listeners) l();
}

export function useOfflineReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => offlineReady,
  );
}

/**
 * Register the service worker (production builds only). It precaches the app,
 * fonts and piano samples, updates itself in the background, and once a worker
 * controls the page the app is ready offline.
 */
export async function registerServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true, onOfflineReady: markOfflineReady });
  if (navigator.serviceWorker.controller) markOfflineReady();
}
