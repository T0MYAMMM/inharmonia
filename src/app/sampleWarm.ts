import {
  browserSampleFormat,
  SAMPLE_CACHE,
  SAMPLE_CACHE_PREFIX,
  sampleUrls,
  type SampleFormat,
} from '@/core/audio/samples';

export interface WarmChoice {
  baseUrl: string;
  /** The format this browser plays. */
  format: SampleFormat;
  /** The browser asks to save data (Save-Data, Lite mode). */
  saveData: boolean;
  /** Paths already in the sample cache. */
  cached: ReadonlySet<string>;
}

/**
 * Which piano samples to fetch ahead, so the piano works offline after the
 * first visit: this browser's format only, none when it asks to save data,
 * and none already cached.
 */
export function samplesToWarm({ baseUrl, format, saveData, cached }: WarmChoice): string[] {
  if (saveData) return [];
  return Object.values(sampleUrls(baseUrl, format)).filter((url) => !cached.has(url));
}

function saveDataOn(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  return nav.connection?.saveData === true;
}

/**
 * Fill the sample cache, one file at a time, and drop caches from older
 * sample versions. Stops at the first failure (offline, say); the next visit
 * carries on. The service worker reads the cache first, so the piano plays
 * from it, online or off.
 */
export async function warmSamples(
  baseUrl: string = import.meta.env.BASE_URL,
  store: CacheStorage = caches,
): Promise<void> {
  for (const name of await store.keys())
    if (name.startsWith(SAMPLE_CACHE_PREFIX) && name !== SAMPLE_CACHE) await store.delete(name);
  const cache = await store.open(SAMPLE_CACHE);
  const cached = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  const urls = samplesToWarm({
    baseUrl,
    format: browserSampleFormat(),
    saveData: saveDataOn(),
    cached,
  });
  for (const url of urls) await cache.add(url);
}

let scheduled = false;

/** The installed service worker, when this build has one. */
function workerReady(): Promise<unknown> | null {
  return import.meta.env.PROD && 'serviceWorker' in navigator
    ? navigator.serviceWorker.ready
    : null;
}

/**
 * Warm the samples once a room that plays has opened (armAudio calls this),
 * at most once per page load: when the service worker is installed and the
 * page is idle. A visit that never opens such a room fetches no samples,
 * which matters on metered mobile data.
 */
export function scheduleSampleWarm(
  ready: Promise<unknown> | null = workerReady(),
  warm: () => Promise<void> = () => warmSamples(),
): void {
  if (scheduled || !ready) return;
  scheduled = true;
  void ready.then(() => whenIdle(() => void warm().catch(() => undefined)));
}

/** Run when the page is idle, or after a short wait where idle callbacks don't exist. */
export function whenIdle(run: () => void): void {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 10_000 });
  else setTimeout(run, 3000);
}
