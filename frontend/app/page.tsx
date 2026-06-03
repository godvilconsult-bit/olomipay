import Link from 'next/link';
import {
  ArrowRight, MessageCircle, TrendingUp, ShieldCheck, Globe2,
  Zap, Send, PiggyBank, Sparkles, Check, Clock, Eye, Lock, X,
} from 'lucide-react';
import Reveal from '../components/Reveal';
import CountUp from '../components/CountUp';
import SpeedRace from '../components/SpeedRace';

/* Pan-African rails we ride — proof of reach (scrolling ticker) */
const RAILS = [
  'M-Pesa', 'Airtel Money', 'MTN MoMo', 'Tigo Pesa', 'Orange Money',
  'Vodafone Cash', 'EcoCash', 'Zamtel', 'USDC', 'XLM', 'Bank Wire',
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#060b18] text-white">

      {/* ── Animated aurora background ───────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="anim-aurora absolute -top-1/4 -left-1/4 h-[60vmax] w-[60vmax] rounded-full bg-blue-600/30 blur-[120px]" />
        <div className="anim-aurora absolute top-1/3 -right-1/4 h-[55vmax] w-[55vmax] rounded-full bg-emerald-500/25 blur-[120px]" style={{ animationDelay: '-6s' }} />
        <div className="anim-aurora absolute bottom-0 left-1/4 h-[50vmax] w-[50vmax] rounded-full bg-cyan-500/20 blur-[120px]" style={{ animationDelay: '-12s' }} />
        {/* subtle grid */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <div className="hero-rise hd1 flex items-center gap-2.5">
          <img src="/logo.svg" alt="OlomiPay" className="h-9 w-9 anim-float" />
          <div>
            <p className="text-lg font-bold leading-tight">OlomiPay</p>
            <p className="text-[8px] uppercase tracking-[0.2em] text-blue-300/80">Building Trust Through Blockchain</p>
          </div>
        </div>
        <div className="hero-rise hd2 flex items-center gap-2">
          <Link href="/auth/login" className="px-4 py-2 text-sm text-slate-300 transition-colors hover:text-white">
            Sign in
          </Link>
          <Link href="/auth/register"
            className="cta-glow rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition-transform hover:scale-105">
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-5 pt-12 pb-20 text-center md:pt-20">
        <div className="hero-rise hd2 mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs backdrop-blur">
          <Sparkles size={13} className="text-cyan-300" />
          <span className="text-slate-200">Money + Messaging + Earning — one super app</span>
        </div>

        <h1 className="hero-rise hd3 ds-display max-w-3xl">
          Send money the way
          <br />
          you <span className="ds-text-gradient">chat</span>.
        </h1>

        <p className="hero-rise hd4 mt-6 max-w-xl text-lg text-slate-300/90">
          Others promise "98% within 10 minutes." We settle <span className="font-semibold text-white">100% in seconds</span> —
          on-chain, around the clock. Deposit from any mobile money or bank, then send cash
          right inside the conversation.
        </p>

        <div className="hero-rise hd5 mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/auth/register"
            className="cta-glow group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 px-8 py-4 text-base font-semibold shadow-2xl transition-transform hover:scale-105">
            Create free account
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <Link href="/auth/login"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-8 py-4 text-base font-semibold backdrop-blur transition-colors hover:bg-white/10">
            I have an account
          </Link>
        </div>

        {/* Floating hero mock — a live "money in chat" card */}
        <div className="hero-rise hd5 relative mt-16 w-full max-w-sm">
          {/* glow ring */}
          <div className="anim-glow absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-blue-500/40 to-emerald-500/40 blur-2xl" />

          <div className="glass anim-float rounded-[2rem] p-5 text-left shadow-2xl">
            {/* chat header */}
            <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 font-bold">A</div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Amina</p>
                <p className="text-[11px] text-emerald-300">● online</p>
              </div>
              <MessageCircle size={16} className="text-slate-400" />
            </div>

            {/* incoming bubble */}
            <div className="mb-2 max-w-[75%] rounded-2xl rounded-bl-sm bg-white/10 px-3.5 py-2 text-sm">
              Lunch was 8 bucks 😄
            </div>

            {/* money card bubble */}
            <div className="ml-auto max-w-[82%] rounded-2xl rounded-br-sm bg-gradient-to-br from-blue-500 to-emerald-500 p-0.5">
              <div className="rounded-[15px] bg-[#0b1426] px-4 py-3">
                <p className="text-[11px] text-emerald-300">💸 You sent</p>
                <p className="text-2xl font-bold">$8.00</p>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Check size={12} className="text-emerald-400" />
                  Settled on-chain · 0.8s
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-xs text-slate-400">
              <span className="flex-1">Type a message…</span>
              <Send size={14} className="text-blue-400" />
            </div>
          </div>

          {/* floating side chips */}
          <div className="anim-float-slow glass absolute -left-10 top-10 hidden rounded-2xl px-3 py-2 text-xs sm:block">
            <p className="text-emerald-300">+ 6.5% APY</p>
            <p className="text-slate-400">on savings</p>
          </div>
          <div className="anim-float-slow glass absolute -right-8 bottom-16 hidden rounded-2xl px-3 py-2 text-xs sm:block" style={{ animationDelay: '-4s' }}>
            <p className="text-cyan-300">1% flat</p>
            <p className="text-slate-400">no hidden fees</p>
          </div>
        </div>
      </section>

      {/* ── Rails marquee ────────────────────────────────────────────────────── */}
      <section className="relative z-10 border-y border-white/10 bg-white/[0.02] py-5">
        <p className="mb-3 text-center text-[11px] uppercase tracking-[0.25em] text-slate-500">
          One wallet · every rail in Africa
        </p>
        <div className="relative overflow-hidden">
          <div className="anim-marquee flex w-max gap-4">
            {[...RAILS, ...RAILS].map((rail, i) => (
              <span key={i} className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {rail}
              </span>
            ))}
          </div>
          {/* edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[#060b18] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-[#060b18] to-transparent" />
        </div>
      </section>

      {/* ── The fundamental difference: Speed · Security · Social ────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-24">
        <Reveal className="mx-auto mb-4 max-w-3xl text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-slate-300">
            <Sparkles size={13} className="text-cyan-300" /> The fundamental difference
          </p>
          <h2 className="text-3xl font-bold sm:text-5xl">
            Built different at the <span className="text-gradient-anim">core</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Transfer apps move money between strangers' bank pipes. OlomiPay rewires
            the rails themselves — so speed, security and connection aren't features, they're the foundation.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {[
            {
              icon: Clock,
              tag: 'SPEED',
              color: 'from-blue-500 to-cyan-500',
              headline: 'Seconds — guaranteed, not 98% of the time',
              them: '“98% arrive within 10 minutes.” The other 2% wait. It crawls at night, on weekends, on holidays — because the money hops through partner banks and payout networks.',
              us: 'Every transfer settles on-chain in 3–5 seconds. No intermediaries, no banking hours, no liquidity gaps. 100% of the time — even at 3AM on a Sunday. Finality is mathematics, not a promise.',
            },
            {
              icon: Eye,
              tag: 'SECURITY',
              color: 'from-indigo-500 to-blue-500',
              headline: 'Verify it yourself — don\'t just trust us',
              them: 'Your money sits inside a company\'s custody pipeline. Your messages live on their servers. Security is a promise you\'re asked to believe.',
              us: 'Every shilling settles on a public ledger with a receipt you can check yourself. Chats are end-to-end encrypted — even we can\'t read them. Your wallet is keyed to your phone. Provable, not promised.',
            },
            {
              icon: MessageCircle,
              tag: 'SOCIAL',
              color: 'from-emerald-500 to-teal-500',
              headline: 'Send money while you talk',
              them: 'You open the app, type an account number, send, and leave. The money is a transaction. The relationship ends at “sent.”',
              us: 'Money lives inside the conversation. Split a bill, request a loan from mum, pay a friend — all in the same thread you\'re chatting in. The transaction becomes part of the relationship.',
            },
          ].map((p, i) => (
            <Reveal key={p.tag} delay={(i + 1) as 1 | 2 | 3} className="glass flex flex-col rounded-3xl p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${p.color}`}>
                  <p.icon size={20} />
                </div>
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{p.tag}</span>
              </div>

              <h3 className="mb-4 text-lg font-semibold leading-snug">{p.headline}</h3>

              {/* Animated speed race — only on the SPEED pillar */}
              {p.tag === 'SPEED' && <SpeedRace />}

              {/* Them */}
              <div className="mb-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <X size={12} className="text-red-400/80" /> Transfer apps
                </div>
                <p className="text-sm leading-relaxed text-slate-400">{p.them}</p>
              </div>

              {/* Us */}
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                  <Check size={12} /> OlomiPay
                </div>
                <p className="text-sm leading-relaxed text-slate-200">{p.us}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Punch line */}
        <Reveal delay={2} className="mx-auto mt-12 max-w-3xl text-center">
          <p className="text-xl font-semibold leading-relaxed text-slate-200 sm:text-2xl">
            A transfer is an <span className="text-slate-500">event</span>.
            A conversation is a <span className="text-gradient-anim">relationship</span>.
            <br className="hidden sm:block" />
            People don&apos;t want to send money and leave — they want to send money while they talk.
          </p>
        </Reveal>
      </section>

      {/* ── Differentiators (what we have that Nala doesn't) ─────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-24">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">More than a transfer app</h2>
          <p className="mt-3 text-slate-400">
            Remittance apps stop at "send". OlomiPay lets your money chat, grow, and work for you.
          </p>
        </Reveal>

        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: MessageCircle, c: 'from-blue-500 to-cyan-500',  t: 'Chat & Pay', d: 'Send money inside a conversation — encrypted end-to-end. No account numbers, just a message.' },
            { icon: TrendingUp,    c: 'from-emerald-500 to-teal-500', t: 'Earn while you hold', d: 'Your balance earns interest automatically. Stake, save in a goal, or join a group Chama.' },
            { icon: ShieldCheck,   c: 'from-indigo-500 to-blue-500', t: 'On-chain trust', d: 'Every transfer settles transparently on blockchain. A flat 1% — see the exact fee before you confirm.' },
          ].map((f, i) => (
            <Reveal key={f.t} delay={(i + 1) as 1 | 2 | 3} className="glass group rounded-3xl p-6">
              <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${f.c}`}>
                <f.icon size={22} />
              </div>
              <h3 className="mb-1.5 text-lg font-semibold">{f.t}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.d}</p>
            </Reveal>
          ))}
        </div>

        {/* Secondary feature row */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Globe2,    t: 'Pan-African',   d: 'Every major MNO + bank' },
            { icon: Zap,       t: 'Instant',       d: 'Seconds, not days' },
            { icon: PiggyBank, t: 'Goals & Chama', d: 'Save together' },
            { icon: Send,      t: 'Payroll',       d: 'Pay teams in bulk' },
          ].map((f, i) => (
            <Reveal key={f.t} delay={(i + 1) as 1 | 2 | 3 | 4} className="glass rounded-2xl p-5">
              <f.icon size={20} className="mb-3 text-blue-300" />
              <p className="font-semibold">{f.t}</p>
              <p className="text-sm text-slate-400">{f.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────────── */}
      <section className="relative z-10 border-y border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent py-16">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-5 text-center md:grid-cols-4">
          {[
            { v: 1,  s: '%', p: '', label: 'Flat fee, always' },
            { v: 0.8, s: 's', p: '', label: 'Avg settlement', dec: 1 },
            { v: 11, s: '+', p: '', label: 'Payment rails' },
            { v: 256, s: '-bit', p: '', label: 'Encryption' },
          ].map((st) => (
            <div key={st.label} className="anim-pop">
              <p className="text-4xl font-extrabold text-gradient-anim">
                <CountUp to={st.v} suffix={st.s} prefix={st.p} decimals={st.dec ?? 0} />
              </p>
              <p className="mt-1 text-sm text-slate-400">{st.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Security you can verify ──────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-24">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-slate-300">
            <Lock size={13} className="text-emerald-300" /> Security you can verify
          </p>
          <h2 className="ds-h2">Bank-grade protection, <span className="ds-text-gradient">on every payment</span></h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Trust isn&apos;t a slogan — it&apos;s engineered in. Here&apos;s what guards every shilling you move.
          </p>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Zap,         c: 'from-blue-500 to-cyan-500',    t: 'Real-time fraud screening', d: 'Every transfer is checked in under 50 milliseconds before it leaves your wallet.' },
            { icon: ShieldCheck, c: 'from-emerald-500 to-teal-500', t: 'Settled & reconciled',      d: 'Funds settle on a public ledger and are auto-reconciled — your balance always matches the chain.' },
            { icon: Lock,        c: 'from-indigo-500 to-blue-500',  t: 'End-to-end encrypted',      d: 'Your chats are encrypted on your device. Even we cannot read them.' },
            { icon: Eye,         c: 'from-cyan-500 to-emerald-500', t: 'A flat 1% — shown upfront', d: 'See the exact fee and what your recipient gets before you confirm. No surprises.' },
          ].map((f, i) => (
            <Reveal key={f.t} delay={(i + 1) as 1 | 2 | 3 | 4} className="glass rounded-3xl p-6">
              <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${f.c}`}>
                <f.icon size={20} />
              </div>
              <h3 className="mb-1.5 text-base font-semibold leading-snug">{f.t}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-5 py-24">
        <Reveal className="mb-12 text-center">
          <h2 className="ds-h2">Three taps to send</h2>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { n: '01', t: 'Top up', d: 'Deposit from M-Pesa, Airtel, MTN, or your bank — money lands in your Olomi Wallet.' },
            { n: '02', t: 'Chat', d: 'Open a conversation with anyone on OlomiPay, or invite them with a link.' },
            { n: '03', t: 'Send', d: 'Drop an amount in the chat, confirm with your PIN — done. They get it instantly.' },
          ].map((s, i) => (
            <Reveal key={s.n} delay={(i + 1) as 1 | 2 | 3} className="relative">
              <div className="glass rounded-3xl p-6">
                <p className="text-5xl font-extrabold text-white/10">{s.n}</p>
                <h3 className="-mt-4 mb-1.5 text-lg font-semibold">{s.t}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-5 pb-28">
        <Reveal className="relative overflow-hidden rounded-[2.5rem] border border-white/10 p-10 text-center md:p-16">
          <div className="anim-aurora absolute -top-1/2 left-1/4 -z-10 h-[40vmax] w-[40vmax] rounded-full bg-blue-600/40 blur-[100px]" />
          <img src="/logo.svg" alt="" className="anim-float mx-auto mb-6 h-16 w-16" />
          <h2 className="mx-auto max-w-xl text-3xl font-bold sm:text-5xl">
            The future of money is a <span className="text-gradient-anim">conversation</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-slate-300">
            Join the wallet that talks, pays, and grows your money — built for Africa, settled on-chain.
          </p>
          <Link href="/auth/register"
            className="cta-glow mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 px-10 py-4 text-base font-semibold shadow-2xl transition-transform hover:scale-105">
            Start free — it takes 60 seconds
            <ArrowRight size={18} />
          </Link>
        </Reveal>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/10 py-8 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <img src="/logo.svg" alt="" className="h-6 w-6" />
          <span className="font-semibold">OlomiPay</span>
        </div>
        <p className="text-xs text-slate-500">© 2026 OlomiPay · Building Trust Through Blockchain</p>
      </footer>
    </main>
  );
}
