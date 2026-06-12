'use client';

import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function formatTzs(v: number | string): string {
  return `TZS ${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cn('tabular-nums font-semibold', className)}>{formatTzs(value)}</span>;
}

// ── Button ───────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'leaf' | 'ghost' | 'danger' | 'outline';
export function Button(
  { variant = 'primary', loading, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean },
) {
  // Text always fits on ONE horizontal line at any screen size: nowrap, tight
  // padding, and the label auto-shrinks a step on very narrow buttons (EN/SW
  // labels differ in length). Icons never shrink; the text truncates only as a
  // last-resort safety net so a long label can never break the layout.
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-2xl font-semibold text-[13px] sm:text-sm leading-none min-h-touch px-3 min-w-0 whitespace-nowrap overflow-hidden transition active:scale-[.98] disabled:opacity-50 disabled:active:scale-100 [&>svg]:shrink-0';
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-grad-brand text-white shadow-ds-btn',
    leaf:    'bg-grad-leaf text-white shadow-ds-btn',
    ghost:   'bg-black/5 dark:bg-white/10 text-ink dark:text-sand',
    outline: 'border border-flame/40 text-flame bg-transparent',
    danger:  'bg-danger text-white',
  };
  return (
    <button className={cn(base, styles[variant], className)} disabled={loading || rest.disabled} {...rest}>
      {loading && <Loader2 className="animate-spin" size={18} />}
      {children}
    </button>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-ds-xl bg-white dark:bg-ink-2 border border-black/5 dark:border-white/5 shadow-ds-card p-3.5',
        onClick && 'cursor-pointer hover:shadow-lg transition',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Field ────────────────────────────────────────────────────────────────────
export function Field(
  { label, hint, className, ...rest }:
  InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string },
) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-medium text-ink/70 dark:text-sand/70">{label}</span>}
      <input
        className={cn(
          'w-full min-h-touch rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-ink-2 px-4 text-ink dark:text-sand outline-none focus:border-flame focus:ring-2 focus:ring-flame/20',
          className,
        )}
        {...rest}
      />
      {hint && <span className="mt-1 block text-xs text-ink/50">{hint}</span>}
    </label>
  );
}

// ── Pill / Badge ─────────────────────────────────────────────────────────────
export function Pill({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition',
        active ? 'bg-flame text-white' : 'bg-black/5 dark:bg-white/10 text-ink/70 dark:text-sand/70',
      )}
    >
      {children}
    </button>
  );
}

const STATUS_COLORS: Record<string, string> = {
  PLACED: 'bg-amber-100 text-amber-700', ALERTED: 'bg-amber-100 text-amber-700',
  ACCEPTED: 'bg-blue-100 text-blue-700', BROADCAST: 'bg-violet-100 text-violet-700',
  CLAIMED: 'bg-blue-100 text-blue-700', PICKED: 'bg-indigo-100 text-indigo-700',
  DELIVERED: 'bg-leaf/15 text-leaf-dark', COMPLETED: 'bg-leaf/15 text-leaf-dark',
  CANCELLED: 'bg-red-100 text-red-700', PENDING: 'bg-amber-100 text-amber-700',
  PAID: 'bg-leaf/15 text-leaf-dark', ONLINE: 'bg-leaf/15 text-leaf-dark', OFFLINE: 'bg-black/10 text-ink/60',
};
export function Badge({ status }: { status: string }) {
  return <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_COLORS[status] ?? 'bg-black/10 text-ink/60')}>{status}</span>;
}

export function Spinner() {
  return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-flame" size={28} /></div>;
}

export function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className={cn('rounded-ds-xl p-4', accent ? 'bg-grad-brand text-white' : 'bg-white dark:bg-ink-2 border border-black/5 dark:border-white/5')}>
      <div className={cn('text-2xl font-extrabold tabular-nums', accent ? 'text-white' : 'text-ink dark:text-sand')}>{value}</div>
      <div className={cn('text-xs mt-0.5', accent ? 'text-white/80' : 'text-ink/50')}>{label}</div>
    </div>
  );
}

export function EmptyState({ icon, title, sub }: { icon?: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-3 text-flame/60">{icon}</div>}
      <p className="font-semibold text-ink dark:text-sand">{title}</p>
      {sub && <p className="mt-1 text-sm text-ink/50 max-w-xs">{sub}</p>}
    </div>
  );
}
