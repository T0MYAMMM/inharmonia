import { useSyncExternalStore } from 'react';
import { warmSamples, whenIdle } from './sampleWarm';

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
 * Register the service worker (production builds only). It precaches the app
 * and its fonts and updates itself in the background; once a worker controls
 * the page the app is ready offline. When it is installed and the page is
 * idle, this browser's piano samples are cached too.
 */
export async function registerServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true, onOfflineReady: markOfflineReady });
  if (navigator.serviceWorker.controller) markOfflineReady();
  void navigator.serviceWorker.ready.then(() =>
    whenIdle(() => void warmSamples().catch(() => undefined)),
  );
}
