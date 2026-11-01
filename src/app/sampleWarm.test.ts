import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_CACHE, sampleNotes, sampleUrls } from '@/core/audio/samples';
import { samplesToWarm, warmSamples } from './sampleWarm';

/** A fresh copy of the module, so "once per page load" starts over. */
async function freshSchedule() {
  vi.resetModules();
  return (await import('./sampleWarm')).scheduleSampleWarm;
}

const BASE = '/inharmonia/';
const all = (format: 'ogg' | 'mp3') => Object.values(sampleUrls(BASE, format));

describe('samplesToWarm', () => {
  it("takes every sample in this browser's format, and none in the other", () => {
    const ogg = samplesToWarm({ baseUrl: BASE, format: 'ogg', saveData: false, cached: new Set() });
    expect(ogg).toHaveLength(sampleNotes().length);
    expect(ogg.every((u) => u.startsWith('/inharmonia/samples/') && u.endsWith('.ogg'))).toBe(true);
    const mp3 = samplesToWarm({ baseUrl: BASE, format: 'mp3', saveData: false, cached: new Set() });
    expect(mp3).toEqual(all('mp3'));
  });

  it('takes nothing when the browser asks to save data', () => {
    expect(
      samplesToWarm({ baseUrl: BASE, format: 'ogg', saveData: true, cached: new Set() }),
    ).toEqual([]);
  });

  it('skips what is already cached', () => {
    const [first, second, ...rest] = all('ogg');
    const cached = new Set([first!, second!]);
    expect(samplesToWarm({ baseUrl: BASE, format: 'ogg', saveData: false, cached })).toEqual(rest);
    expect(
      samplesToWarm({ baseUrl: BASE, format: 'ogg', saveData: false, cached: new Set(all('ogg')) }),
    ).toEqual([]);
  });
});

/** CacheStorage in memory: enough of it for warmSamples. */
function fakeCaches(initial: Record<string, string[]>) {
  const stores = new Map(Object.entries(initial).map(([k, v]) => [k, new Set(v)]));
  const added: string[] = [];
  let failAt = Infinity;
  const storage = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      const set = stores.get(name) ?? new Set<string>();
      stores.set(name, set);
      return {
        keys: async () => [...set].map((p) => ({ url: `https://example.test${p}` })),
        add: async (url: string) => {
          if (added.length >= failAt) throw new TypeError('Failed to fetch');
          added.push(url);
          set.add(url);
        },
      };
    },
  };
  return {
    storage: storage as unknown as CacheStorage,
    stores,
    added,
    failAfter: (n: number) => (failAt = n),
  };
}

describe('warmSamples', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const playsOgg = (yes: boolean) =>
    vi
      .spyOn(HTMLMediaElement.prototype, 'canPlayType')
      .mockImplementation((t) => (yes && t.includes('ogg') ? 'probably' : ''));

  it("caches the format this browser plays, keeps what it has, and drops older versions' caches", async () => {
    playsOgg(true);
    const [first, ...rest] = all('ogg');
    const fake = fakeCaches({ [SAMPLE_CACHE]: [first!], 'inharmonia-samples-v0': ['/old.ogg'] });
    await warmSamples(BASE, fake.storage);
    expect(fake.added).toEqual(rest);
    expect([...fake.stores.keys()]).toEqual([SAMPLE_CACHE]);
  });

  it('caches MP3 where Ogg will not play', async () => {
    playsOgg(false);
    const fake = fakeCaches({});
    await warmSamples(BASE, fake.storage);
    expect(fake.added).toEqual(all('mp3'));
  });

  it('caches nothing when the browser asks to save data', async () => {
    playsOgg(true);
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    const fake = fakeCaches({});
    await warmSamples(BASE, fake.storage);
    expect(fake.added).toEqual([]);
  });

  it('stops at the first failure and keeps what it cached', async () => {
    playsOgg(true);
    const fake = fakeCaches({});
    fake.failAfter(3);
    await expect(warmSamples(BASE, fake.storage)).rejects.toThrow('Failed to fetch');
    expect(fake.stores.get(SAMPLE_CACHE)!.size).toBe(3);
  });
});

describe('scheduleSampleWarm', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('warms once per page load, after the worker is ready and the page is idle', async () => {
    vi.useFakeTimers();
    const schedule = await freshSchedule();
    const warm = vi.fn(async () => undefined);
    schedule(Promise.resolve(), warm);
    schedule(Promise.resolve(), warm);
    expect(warm).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a service worker', async () => {
    vi.useFakeTimers();
    const schedule = await freshSchedule();
    const warm = vi.fn(async () => undefined);
    schedule(null, warm);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(warm).not.toHaveBeenCalled();
  });

  it('keeps a failed warm to itself', async () => {
    vi.useFakeTimers();
    const schedule = await freshSchedule();
    const warm = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    schedule(Promise.resolve(), warm);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(warm).toHaveBeenCalledTimes(1);
  });
});
