import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * A page whose code loads the first time its route renders. Pages keep their
 * named exports; this picks the one named out of the module for React.lazy.
 */
export function lazyPage<K extends string, P extends object>(
  load: () => Promise<Record<K, ComponentType<P>>>,
  name: K,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => {
    const module: Record<K, ComponentType<P>> | undefined = await load();
    // No module: its chunk failed and preloadError.ts is reloading the page.
    // Stay loading rather than flash the error before the reload.
    if (!module) return new Promise<never>(() => undefined);
    return { default: module[name] };
  });
}
