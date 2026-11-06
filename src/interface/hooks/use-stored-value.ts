'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A small per-browser preference (a panel open, a height) kept in localStorage.
 * Reads go through useSyncExternalStore so the server render and first paint agree.
 */
const listeners = new Map<string, Set<() => void>>();
// Used when the browser refuses storage, so a choice still holds for this visit.
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStoredValue<T>(key: string, fallback: T, parse: (raw: string) => T | null): [T, (value: T) => void] {
  const subscribe = useCallback(
    (notify: () => void) => {
      const set = listeners.get(key) ?? new Set();
      set.add(notify);
      listeners.set(key, set);
      return () => set.delete(notify);
    },
    [key],
  );
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  const parsed = raw === null ? null : parse(raw);
  const value = parsed === null ? fallback : parsed;
  const setValue = useCallback(
    (next: T) => {
      const text = String(next);
      memory.set(key, text);
      try {
        window.localStorage.setItem(key, text);
      } catch {
        // Private windows may refuse storage; `memory` keeps the choice for this visit.
      }
      for (const notify of listeners.get(key) ?? []) notify();
    },
    [key],
  );
  return [value, setValue];
}
