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
    // 1) Scroll the focused field into view (after the keyboard settles)
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      // Don't fight inputs inside already-fixed bottom bars (chat composer)
      const fixedAncestor = t.closest('.fixed, [data-no-kb-scroll]');
      if (fixedAncestor) return;
      setTimeout(() => {
        try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
      }, 280);
    };

    // 2) Expose keyboard inset as --kb-inset for sticky bottom bars
    const vv: VisualViewport | undefined = (window as any).visualViewport;
    const applyInset = () => {
      if (!vv) return;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb-inset', `${inset}px`);
    };

    document.addEventListener('focusin', onFocusIn);
    vv?.addEventListener('resize', applyInset);
    vv?.addEventListener('scroll', applyInset);
    applyInset();

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      vv?.removeEventListener('resize', applyInset);
      vv?.removeEventListener('scroll', applyInset);
    };
  }, []);

  return null;
}
