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

// Reflect the unread count on the installed-app/PWA icon (Badging API). Shows
// the number on the icon even before the app is opened. No-op where unsupported.
function setAppBadge(n: number) {
  try {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav) return;
    if (n > 0 && typeof nav.setAppBadge === 'function') nav.setAppBadge(n);
    else if (typeof nav.clearAppBadge === 'function')   nav.clearAppBadge();
  } catch { /* ignore */ }
}

export const chatState = {
  getUnread(): number {
    return _unread;
  },

  setUnread(n: number) {
    _unread = Math.max(0, n);
    setAppBadge(_unread);
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
