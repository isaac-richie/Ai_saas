export const HISTORY_LIMIT = 60;
export const COALESCE_MS = 800;

export interface History<T> {
  past: T[];
  future: T[];
  lastKey: string | null;
  lastAt: number;
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], lastKey: null, lastAt: 0 };
}

/**
 * Records the state before an edit. Repeated edits with the same key in quick succession
 * (a slider drag, a run of nudges) share one undo step.
 */
export function record<T>(h: History<T>, before: T, key: string, now: number): History<T> {
  if (h.lastKey === key && now - h.lastAt < COALESCE_MS) {
    return { ...h, future: [], lastAt: now };
  }
  return {
    past: [...h.past, before].slice(-HISTORY_LIMIT),
    future: [],
    lastKey: key,
    lastAt: now,
  };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; state: T } | null {
  if (h.past.length === 0) return null;
  const state = h.past[h.past.length - 1];
  return {
    state,
    history: { past: h.past.slice(0, -1), future: [current, ...h.future].slice(0, HISTORY_LIMIT), lastKey: null, lastAt: 0 },
  };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; state: T } | null {
  if (h.future.length === 0) return null;
  const [state, ...rest] = h.future;
  return {
    state,
    history: { past: [...h.past, current].slice(-HISTORY_LIMIT), future: rest, lastKey: null, lastAt: 0 },
  };
}
