'use client';

/**
 * Responsive reference screen — demonstrates the three layouts from the brief
 * (login form, dashboard grid, feed) inside the overflow-proof <Screen> scaffold.
 *
 * Everything here is fully responsive and pixel-overflow-proof:
 *   • Wrapped in <Screen> → scrollable ScrollView, safe-area + keyboard aware.
 *   • <AdaptiveGrid> → LazyVGrid-style reflow (1→N columns by available width).
 *   • Flex rows use min-w-0 / truncate so nothing ever pushes the layout sideways.
 *
 * Visit /responsive-demo to see it. Resize the window or rotate a device — the
 * sidebar appears, the grid reflows, the form stays centred, nothing clips.
 */

import { useState } from 'react';
import {
  Phone, Lock, ArrowRight, Send, ArrowDownCircle, ArrowUpCircle,
  PiggyBank, TrendingUp, CreditCard, MessageCircle, Wallet, Bell,
} from 'lucide-react';
import Screen from '../../components/Screen';
import AdaptiveGrid from '../../components/AdaptiveGrid';

export default function ResponsiveDemo() {
  const [view, setView] = useState<'login' | 'dashboard' | 'feed'>('dashboard');
  const [phone, setPhone] = useState('');
  const [pin, setPin]     = useState('');

  // ── Shared header (sticky, glass, safe-area aware via <Screen>) ──────────────
  const header = (
    <div className="border-b border-white/10 bg-[#0a1120]/85 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl items-center gap-2">
        {(['login', 'dashboard', 'feed'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
              view === v ? 'bg-gradient-to-r from-blue-500 to-emerald-500 text-white' : 'bg-white/5 text-slate-400'
            }`}>
            {v}
          </button>
        ))}
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // 1) LOGIN FORM — centred, keyboard-safe (focused field scrolls into view)
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'login') {
    return (
      <Screen header={header} width="sm" center>
        <div className="w-full space-y-6 py-8 text-white">
          <div className="text-center">
            <div className="anim-glow mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-emerald-500">
              <Wallet size={28} />
            </div>
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-sm text-slate-400">Sign in to continue</p>
          </div>

          <div className="glass space-y-4 rounded-3xl p-6">
            <Field icon={Phone} label="Phone number">
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+255 7XX XXX XXX"
                className="w-full bg-transparent py-3 text-base outline-none placeholder:text-slate-600" />
            </Field>
            <Field icon={Lock} label="PIN">
              <input type="password" inputMode="numeric" maxLength={6} value={pin}
                onChange={e => setPin(e.target.value)} placeholder="••••••"
                className="w-full bg-transparent py-3 text-base tracking-[0.4em] outline-none placeholder:text-slate-600" />
            </Field>
            <button className="cta-glow flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-emerald-500 py-4 font-semibold">
              Sign in <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </Screen>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2) DASHBOARD — balance card + adaptive action grid + recent list
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'dashboard') {
    const actions = [
      { icon: Send,            label: 'Send',     c: 'from-blue-500 to-indigo-500' },
      { icon: ArrowDownCircle, label: 'Deposit',  c: 'from-emerald-500 to-teal-500' },
      { icon: ArrowUpCircle,   label: 'Withdraw', c: 'from-amber-500 to-orange-500' },
      { icon: PiggyBank,       label: 'Save',     c: 'from-pink-500 to-rose-500' },
      { icon: TrendingUp,      label: 'Earn',     c: 'from-violet-500 to-purple-500' },
      { icon: CreditCard,      label: 'Card',     c: 'from-cyan-500 to-sky-500' },
      { icon: MessageCircle,   label: 'Chat',     c: 'from-blue-500 to-emerald-500' },
      { icon: Bell,            label: 'Alerts',   c: 'from-slate-500 to-slate-600' },
    ];
    return (
      <Screen header={header} width="xl">
        <div className="space-y-6 py-5 text-white">
          {/* Balance card — gradient, never overflows (min-w-0 + truncate) */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a3a6b] to-[#1a56db] p-6">
            <div className="anim-glow absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-400/20 blur-2xl" />
            <p className="text-sm text-white/70">Total balance</p>
            <p className="mt-1 text-4xl font-extrabold">$1,248.50</p>
            <p className="mt-1 text-sm text-white/60">≈ TZS 3,246,100</p>
          </div>

          {/* Adaptive action grid — LazyVGrid equivalent, reflows by width */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-400">Quick actions</h2>
            <AdaptiveGrid min={88} gap={12}>
              {actions.map(a => (
                <button key={a.label}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 active:scale-95">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${a.c}`}>
                    <a.icon size={20} />
                  </span>
                  <span className="text-xs font-medium text-slate-300">{a.label}</span>
                </button>
              ))}
            </AdaptiveGrid>
          </section>

          {/* Recent list — rows that truncate instead of overflowing */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-400">Recent</h2>
            <div className="glass divide-y divide-white/5 rounded-3xl">
              {[
                { t: 'Sent to Amina', s: 'Confirmed', a: '-$8.00', up: false },
                { t: 'M-Pesa Tanzania deposit', s: 'Confirmed', a: '+$25.00', up: true },
                { t: 'Savings interest', s: 'Confirmed', a: '+$0.42', up: true },
              ].map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${r.up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>
                    {r.up ? <ArrowDownCircle size={18} /> : <Send size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.t}</p>
                    <p className="text-xs text-slate-500">{r.s}</p>
                  </div>
                  <span className={`flex-shrink-0 text-sm font-semibold ${r.up ? 'text-emerald-400' : 'text-slate-300'}`}>{r.a}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </Screen>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 3) FEED — vertical list of cards (chat-like), each fluid & wrap-safe
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <Screen header={header} width="md"
      bottomBar={
        <div className="flex items-center gap-2">
          <input placeholder="Write a message…"
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500" />
          <button className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-emerald-500">
            <Send size={18} className="text-white" />
          </button>
        </div>
      }>
      <div className="space-y-3 py-5 text-white">
        {[
          { me: false, text: 'Hey! Did you get the invoice?' },
          { me: true,  text: 'Yes — sending the payment now 👇' },
          { me: true,  money: true },
          { me: false, text: 'Got it, asante sana! 🙏 This is so much faster than the bank, honestly I cannot believe it settled instantly.' },
        ].map((m, i) => (
          <div key={i} className={`flex ${m.me ? 'justify-end' : 'justify-start'}`}>
            {m.money ? (
              <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-gradient-to-br from-blue-500 to-emerald-500 p-0.5">
                <div className="rounded-[14px] bg-[#0b1426] px-4 py-3">
                  <p className="text-[11px] text-emerald-300">💸 You sent</p>
                  <p className="text-2xl font-bold">$8.00</p>
                  <p className="mt-1 text-[11px] text-slate-400">✓ Settled on-chain · 0.8s</p>
                </div>
              </div>
            ) : (
              <div className={`max-w-[78%] break-words rounded-2xl px-3.5 py-2 text-sm ${
                m.me ? 'rounded-br-sm bg-primary text-white' : 'rounded-bl-sm border border-white/10 bg-white/5 text-slate-200'
              }`}>
                {m.text}
              </div>
            )}
          </div>
        ))}
      </div>
    </Screen>
  );
}

// Reusable labelled input row (focus ring, never overflows)
function Field({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-400">{label}</label>
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 focus-within:border-blue-400/60">
        <Icon size={18} className="flex-shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
