'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small helper for sticking a piece of UI state into localStorage so the
 * workspace reopens the way the user left it (open/closed panels, toggles,
 * that kind of thing).
 *
 * Always renders with `defaultValue` on the server and on the first client
 * paint so SSR/hydration markup stays in sync. The saved value is read once
 * after mount in an effect.
 *
 * Anything stored here is per-browser — UI chrome only, not user-critical data.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(defaultValue);
  // Skip the first persist write — we haven't restored from storage yet.
  const skipPersist = useRef(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // ignore corrupt or blocked storage
    }
  }, [key]);

  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage might be full or disabled (private mode)
    }
  }, [key, value]);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    skipPersist.current = false;
    setValue((prev) => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next));
  }, []);

  return [value, set];
}
