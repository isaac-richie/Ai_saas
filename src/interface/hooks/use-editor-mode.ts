'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

/**
 * Simple shows what a creator needs; Pro adds precision tools (frame timecode, zoom slider,
 * row mute/lock, beat ruler, exact lengths, shortcuts). The choice is remembered per browser.
 */
export type EditorMode = 'simple' | 'pro';

const KEY = 'visiowave.editor-mode';
const listeners = new Set<() => void>();
// Used when the browser refuses storage, so the switch still works for this visit.
let memory: EditorMode | null = null;

function read(): EditorMode {
  if (memory) return memory;
  try {
    return window.localStorage.getItem(KEY) === 'pro' ? 'pro' : 'simple';
  } catch {
    return 'simple';
  }
}

export function useEditorModeState(): [EditorMode, (mode: EditorMode) => void] {
  const subscribe = useCallback((notify: () => void) => {
    // A change made in another tab wins over this tab's remembered choice.
    const onStorage = () => {
      memory = null;
      notify();
    };
    listeners.add(notify);
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(notify);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const mode = useSyncExternalStore(subscribe, read, () => 'simple' as EditorMode);
  const setMode = useCallback((next: EditorMode) => {
    memory = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Private windows may refuse storage; `memory` keeps the choice for this visit.
    }
    for (const notify of listeners) notify();
  }, []);
  return [mode, setMode];
}

export const EditorModeContext = createContext<EditorMode>('simple');

export function useIsPro(): boolean {
  return useContext(EditorModeContext) === 'pro';
}
