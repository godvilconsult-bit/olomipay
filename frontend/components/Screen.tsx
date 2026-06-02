'use client';

import { useEffect, useRef } from 'react';

/**
 * Screen — a responsive, overflow-proof page scaffold (the web equivalent of a
 * SwiftUI ScrollView + GeometryReader + safe-area insets).
 *
 * Guarantees:
 *  • Vertically scrollable — content never gets cut off on short screens.
 *  • No horizontal overflow — children can't push the layout sideways.
 *  • Safe-area aware — clears notches, status bars and the home indicator.
 *  • Keyboard aware — the focused input scrolls into view when the on-screen
 *    keyboard opens (mobile), using the VisualViewport API.
 *  • Adaptive width — content centres and widens gracefully phone→tablet→desktop.
 *
 * Usage:
 *   <Screen header={<MyHeader/>} bottomBar={<MyCTA/>} width="md">
 *     ...page content...
 *   </Screen>
 */

type Width = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const WIDTH: Record<Width, string> = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-2xl',
  xl:   'max-w-4xl',
  full: 'max-w-none',
};

export default function Screen({
  children,
  header,
  bottomBar,
  width = 'md',
  center = false,
  padded = true,
  className = '',
}: {
  children:   React.ReactNode;
  /** Sticky top bar (stays fixed while body scrolls). */
  header?:    React.ReactNode;
  /** Sticky bottom action bar (e.g. a primary CTA). */
  bottomBar?: React.ReactNode;
  /** Content max width — adapts across breakpoints. */
  width?:     Width;
  /** Vertically centre the content (for short forms / empty states). */
  center?:    boolean;
  /** Apply default horizontal padding to the content column. */
  padded?:    boolean;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Keyboard-aware: scroll the focused field into view when the keyboard opens
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      // Wait for the keyboard/viewport to settle, then reveal the field.
      setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);

  // ── Track the visual viewport so content height follows the keyboard inset
  useEffect(() => {
    const vv = (window as any).visualViewport;
    if (!vv) return;
    const apply = () => {
      // Expose the keyboard inset as a CSS var for the bottom bar to respect.
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb-inset', `${inset}px`);
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
    return () => { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply); };
  }, []);

  return (
    // Fills the viewport; flex column so header/body/bottomBar stack predictably.
    <div className={`flex h-[100dvh] flex-col overflow-hidden ${className}`}>
      {/* Sticky header — safe-area top padding for notches/status bars */}
      {header && (
        <div
          className="flex-shrink-0"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          {header}
        </div>
      )}

      {/* Scrollable body — the ScrollView. Never clips; x-overflow impossible. */}
      <div
        ref={scrollRef}
        className="thin-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <div
          className={`mx-auto w-full ${WIDTH[width]} ${padded ? 'px-4 sm:px-6' : ''} ${
            center ? 'flex min-h-full flex-col justify-center' : ''
          }`}
          style={{
            // Bottom breathing room = safe area + (sticky bar height handled below)
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
          }}
        >
          {children}
        </div>
      </div>

      {/* Sticky bottom bar — lifts above the keyboard and the home indicator */}
      {bottomBar && (
        <div
          className="flex-shrink-0 border-t border-white/10 bg-[#0a1120]/85 backdrop-blur-xl"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom) + var(--kb-inset, 0px))',
          }}
        >
          <div className={`mx-auto w-full ${WIDTH[width]} ${padded ? 'px-4 sm:px-6' : ''} py-3`}>
            {bottomBar}
          </div>
        </div>
      )}
    </div>
  );
}
