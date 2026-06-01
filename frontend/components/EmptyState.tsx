'use client';

import { LucideIcon } from 'lucide-react';

interface Props {
  icon:     LucideIcon;
  title:    string;
  subtitle?: string;
  /** Optional call-to-action button */
  actionLabel?: string;
  onAction?:    () => void;
  /** Compact mode for inside cards/tabs */
  compact?: boolean;
}

/**
 * Friendly, consistent empty-state placeholder.
 * Use when a list/section has no data yet (e.g. backend table empty,
 * feature waiting on external API connection).
 */
export default function EmptyState({
  icon: Icon, title, subtitle, actionLabel, onAction, compact = false,
}: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${compact ? 'py-8' : 'py-14'}`}>
      <div className={`${compact ? 'w-14 h-14' : 'w-20 h-20'} rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center mb-4`}>
        <Icon className="text-primary" size={compact ? 26 : 36} strokeWidth={1.6} />
      </div>
      <h3 className={`font-bold ${compact ? 'text-base' : 'text-lg'} text-slate-700 dark:text-slate-200`}>
        {title}
      </h3>
      {subtitle && (
        <p className="text-sm text-slate-400 mt-1 max-w-xs leading-relaxed">{subtitle}</p>
      )}
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary mt-5 px-6">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
