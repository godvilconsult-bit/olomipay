'use client';

/**
 * ChunkGuard — self-heals "dead" navigations after a new deploy.
 *
 * In hosted mode the native WebView (and PWAs / long-lived browser tabs) can
 * hold an older build in memory. When the user navigates to a route whose JS
 * chunk only exists in the NEW build, the lazy import 404s and Next silently
 * aborts the navigation — the screen just doesn't change ("button does nothing").
 *
 * We listen for that specific failure and force ONE full reload, which pulls
 * the fresh build so the route works. Guarded so it can never loop.
 */
import { useEffect } from 'react';

const FLAG = 'olomipay_chunk_reloaded_at';
const isChunkError = (msg: string) =>
  /ChunkLoadError|Loading chunk [\w-]+ failed|Importing a module script failed|error loading dynamically imported module/i.test(msg);

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(FLAG) ?? 0);
    // Don't reload more than once per 30s — avoids any chance of a refresh loop.
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(FLAG, String(Date.now()));
  } catch { /* sessionStorage blocked — still safe to reload once */ }
  window.location.reload();
}

export default function ChunkGuard() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isChunkError(e.message || String(e.error?.message ?? ''))) reloadOnce();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: any = e.reason;
      if (isChunkError(String(reason?.message ?? reason ?? ''))) reloadOnce();
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
