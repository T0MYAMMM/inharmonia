import { useEffect } from 'react';
import { useSettings } from '@/state/settings';

/** Mirror the theme setting onto <html data-theme>. "system" removes it so the media query decides. */
export function useThemeEffect(): void {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    const dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((m) => (m.content = dark ? '#121924' : '#E7ECEE'));
  }, [theme]);
}
