import type { AppSettings } from '@/core/types';

export type ThemePreference = AppSettings['theme'];

export function resolveThemeClass(theme: ThemePreference): 'light' | 'dark' {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function applyThemeClass(theme: ThemePreference) {
  if (typeof document === 'undefined') return;
  const resolved = resolveThemeClass(theme);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function readPersistedTheme(): ThemePreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('openscene-settings');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { settings?: { theme?: ThemePreference } } };
    return parsed.state?.settings?.theme ?? null;
  } catch {
    return null;
  }
}
