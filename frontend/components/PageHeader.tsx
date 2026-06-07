'use client';

/**
 * PageHeader — one consistent, premium header for every back-button screen.
 * Frosted glass + hairline border so content scrolls elegantly behind it,
 * matching the app's premium-dark + aurora identity. Optional eyebrow,
 * subtitle, a right-side action slot, and children rendered below the title
 * row (e.g. filter chips) inside the same sticky container.
 */
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export default function PageHeader({
  title, eyebrow, subtitle, right, children, onBack,
}: {
  title:     string;
  eyebrow?:  ReactNode;
  subtitle?: ReactNode;
  right?:    ReactNode;
  children?: ReactNode;
  onBack?:   () => void;
}) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-40 bg-white/80 dark:bg-[#0a1120]/75 backdrop-blur-2xl backdrop-saturate-150
                    border-b border-black/5 dark:border-white/10"
         style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-md mx-auto flex items-center gap-2.5 px-3 py-2.5">
        <button onClick={onBack ?? (() => router.back())} aria-label="Back"
          className="p-2 -ml-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition
                     min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 dark:text-slate-200">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          {eyebrow && <p className="ds-eyebrow !text-[10px] !tracking-[0.12em] text-slate-400 leading-tight">{eyebrow}</p>}
          <h1 className="text-lg font-bold leading-tight truncate text-slate-900 dark:text-white">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400 truncate leading-tight">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
