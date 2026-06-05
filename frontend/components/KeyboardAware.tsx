'use client';

import { useEffect } from 'react';

/**
 * KeyboardAware — mounts once in the root layout and gives EVERY page the
 * keyboard/viewport guarantees from <Screen>, without restructuring any JSX:
 *
 *  • When an input/textarea/select is focused, it scrolls into view so the
 *    on-screen keyboard never hides what you're typing (login PIN, deposit
 *    amount, chat composer, send form, KYC, etc.).
 *  • Tracks the VisualViewport and exposes the keyboard height as the CSS var
 *    `--kb-inset`, so any fixed/sticky bottom bar can lift above the keyboard
 *    with `bottom: calc(env(safe-area-inset-bottom) + var(--kb-inset, 0px))`.
 *
 * Safe, framework-correct, zero layout changes — purely additive behaviour.
 */
export default function KeyboardAware() {
  useEffect(() => {
    const vv: VisualViewport | undefined = (window as any).visualViewport;

    // 1) Expose the visible viewport height (--app-vh) and keyboard inset
    //    (--kb-inset). Driving layout off the VisualViewport works even on
    //    iOS Safari, where the keyboard OVERLAYS content (innerHeight/dvh do
    //    not shrink) and fixed bottom bars would otherwise hide behind it.
    const root = document.documentElement;
    const KB_OPEN_PX = 80; // inset above this means the keyboard is up
    const applyInset = () => {
      if (!vv) return;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Guard against transient tiny readings (URL-bar transitions, backgrounding)
      // that would otherwise collapse keyboard-sized screens. Never go below 40%
      // of the layout viewport.
      const vh = Math.max(vv.height, window.innerHeight * 0.4);
      root.style.setProperty('--kb-inset', `${inset}px`);
      root.style.setProperty('--app-vh',  `${Math.round(vh)}px`);
      // Flag keyboard-open so CSS can hide the fixed bottom nav (stops it
      // jumping up over the field you're typing into). Resets on close.
      root.classList.toggle('kb-open', inset > KB_OPEN_PX);
    };

    // 2) Only scroll a focused field into view when it is ACTUALLY hidden
    //    behind the keyboard (or above the top), and scroll the MINIMUM amount
    //    (block:'nearest') so the page barely moves — no big jump that fails to
    //    return. Instant scroll so PIN entry (refocuses per digit) never bounces.
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (t.closest('[data-no-kb-scroll]')) return;
      setTimeout(() => {
        if (!vv) return;
        const r = t.getBoundingClientRect();
        const top    = vv.offsetTop + 8;
        const bottom = vv.offsetTop + vv.height - 8;
        if (r.bottom > bottom || r.top < top) {
          try { t.scrollIntoView({ block: 'nearest', behavior: 'auto' }); } catch {}
        }
      }, 300);
    };

    document.addEventListener('focusin', onFocusIn);
    vv?.addEventListener('resize', applyInset);
    vv?.addEventListener('scroll', applyInset);
    applyInset();

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      vv?.removeEventListener('resize', applyInset);
      vv?.removeEventListener('scroll', applyInset);
      root.classList.remove('kb-open');
    };
  }, []);

  return null;
}
