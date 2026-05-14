import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SunMoon } from 'lucide-react';

import { Button } from '../components/ui/button';

export const READING_THEME_STORAGE_KEY = 'reading-theme';

export type ReadingTheme = 'night' | 'day';

export function applyReadingTheme(theme: ReadingTheme): void {
  const root = document.documentElement;
  if (theme === 'day') {
    root.setAttribute('data-reading-theme', 'day');
  } else {
    root.removeAttribute('data-reading-theme');
  }
  try {
    localStorage.setItem(READING_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

function readIsDay(): boolean {
  return document.documentElement.getAttribute('data-reading-theme') === 'day';
}

function useReadingThemeIsDay(): boolean {
  const [isDay, setIsDay] = React.useState(readIsDay);

  React.useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setIsDay(readIsDay()));
    obs.observe(el, { attributes: true, attributeFilter: ['data-reading-theme'] });
    return () => obs.disconnect();
  }, []);

  return isDay;
}

function ReadingThemeToggle(): React.JSX.Element {
  const isDay = useReadingThemeIsDay();

  const toggle = React.useCallback(() => {
    applyReadingTheme(isDay ? 'night' : 'day');
  }, [isDay]);

  return (
    <Button
      type="button"
      variant="ghost"
      data-slot="button"
      className="site-header__theme-toggle"
      onClick={toggle}
      aria-label={isDay ? 'Switch to night reading theme' : 'Switch to day reading theme'}
      aria-pressed={isDay}
    >
      <SunMoon className="site-header__theme-toggle-icon" size={18} strokeWidth={2} aria-hidden />
    </Button>
  );
}

const readingThemeRoots = new WeakMap<HTMLElement, Root>();

export function mountShadcnReadingThemeToggle(): void {
  const host = document.querySelector<HTMLElement>('#site-reading-theme-mount');
  if (!host) {
    return;
  }
  let root = readingThemeRoots.get(host);
  if (!root) {
    root = createRoot(host);
    readingThemeRoots.set(host, root);
  }
  root.render(<ReadingThemeToggle />);
}
