import Link from 'next/link';
import { ArrowRight, Zap, Globe, Shield } from 'lucide-react';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0f172a] to-[#1a2744] text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-5 py-4 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center font-bold text-white text-sm">O</div>
          <span className="font-bold text-lg">OlomiPay</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="text-sm text-slate-300 hover:text-white transition-colors px-3 py-2">
            Sign in
          </Link>
          <Link href="/auth/register" className="btn-primary text-sm px-5 min-h-[40px]">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-5 py-16 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 text-sm mb-6">
          <Zap size={14} className="text-yellow-400" />
          <span>Now live on Stellar Testnet</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4">
          Send money<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            in seconds
          </span>
        </h1>

        <p className="text-lg text-slate-300 mb-8 max-w-md">
          Deposit TZS via M-Pesa, send USDC anywhere in the world, and cash out
          back to M-Pesa. No crypto knowledge needed.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link href="/auth/register" className="btn-primary text-base px-8 gap-2">
            Create free account
            <ArrowRight size={18} />
          </Link>
          <Link href="/auth/login" className="btn-secondary text-base px-8 bg-white/10 text-white hover:bg-white/20">
            I have an account
          </Link>
        </div>

        {/* Trust indicators */}
        <p className="text-xs text-slate-500 mt-6">
          Powered by Stellar · Secured with Soroban smart contracts
        </p>
      </section>

      {/* Features */}
      <section className="px-5 pb-16 max-w-5xl mx-auto w-full">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              icon: Globe,
              title: 'Global reach',
              desc:  'Send USDC to any Stellar address worldwide — instantly.',
            },
            {
              icon: Zap,
              title: 'M-Pesa bridge',
              desc:  'Deposit TZS via M-Pesa STK Push. Withdraw to M-Pesa anytime.',
            },
            {
              icon: Shield,
              title: '1% flat fee',
              desc:  'Transparent pricing. Fee enforced on-chain by a Soroban contract.',
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card bg-white/5 dark:bg-white/5 backdrop-blur border border-white/10">
              <Icon size={28} className="text-blue-400 mb-3" strokeWidth={1.5} />
              <h3 className="font-semibold text-white mb-1">{title}</h3>
              <p className="text-sm text-slate-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Flow diagram */}
      <section className="px-5 pb-20 max-w-2xl mx-auto w-full text-center">
        <h2 className="text-xl font-semibold mb-6 text-slate-200">How it works</h2>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {['M-Pesa TZS', '→', 'OlomiPay', '→', 'Stellar USDC', '→', 'Anywhere'].map((step, i) => (
            <span
              key={i}
              className={step === '→'
                ? 'text-slate-500 text-lg'
                : 'bg-white/10 rounded-full px-4 py-2 text-sm font-medium text-slate-200'
              }
            >
              {step}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
