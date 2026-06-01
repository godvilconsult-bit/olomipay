/**
 * chatState — lightweight global shared state for chat unread count.
 *
 * Uses a simple pub/sub pattern so BottomNav, Sidebar, and ChatNotifier
 * all stay in sync without React Context overhead.
 *
 * Works entirely client-side (module-level singleton).
 */

type Listener = (count: number) => void;

let _unread   = 0;
const _listeners = new Set<Listener>();

export const chatState = {
  getUnread(): number {
    return _unread;
  },

  setUnread(n: number) {
    _unread = Math.max(0, n);
    _listeners.forEach(fn => fn(_unread));
  },

  increment(by = 1) {
    chatState.setUnread(_unread + by);
  },

  clear() {
    chatState.setUnread(0);
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};

/** React hook that subscribes to chatState and re-renders on change */
import { useState, useEffect } from 'react';
export function useChatUnread(): number {
  const [count, setCount] = useState<number>(0);
  useEffect(() => {
    setCount(chatState.getUnread());
    return chatState.subscribe(setCount);
  }, []);
  return count;
}
