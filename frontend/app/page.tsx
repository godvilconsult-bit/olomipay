import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Zap, Globe, Shield, MessageCircle, TrendingUp } from 'lucide-react';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a1628] to-[#1a2744] text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-5 py-4 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="OlomiPay" className="w-9 h-9" />
          <div>
            <p className="font-bold text-lg leading-tight">OlomiPay</p>
            <p className="text-[9px] text-blue-300 leading-tight tracking-wide uppercase">Building Trust Through Blockchain</p>
          </div>
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
        {/* Logo big */}
        <div className="mb-6">
          <img src="/logo.svg" alt="OlomiPay" className="w-24 h-24 mx-auto mb-4 drop-shadow-2xl" />
          <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 rounded-full px-4 py-2 text-sm">
            <Zap size={14} className="text-yellow-400" />
            <span className="text-blue-200">Fast · Secure · Transparent</span>
          </div>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4">
          Send money<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400">
            in seconds
          </span>
        </h1>

        <p className="text-lg text-slate-300 mb-3 max-w-md">
          Deposit via Mobile Money, send money anywhere in the world, chat with friends, and cash out back to Mobile Money.
        </p>
        <p className="text-sm text-blue-300 mb-8 font-medium italic">
          "Building Trust Through Blockchain"
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link href="/auth/register" className="btn-primary text-base px-8 gap-2">
            Create free account
            <ArrowRight size={18} />
          </Link>
          <Link href="/auth/login" className="btn-secondary text-base px-8 bg-white/10 text-white hover:bg-white/20 border border-white/20">
            Sign in
          </Link>
        </div>

        <p className="text-xs text-slate-500 mt-6">
          Secured by OlomiPay · End-to-end encrypted
        </p>
      </section>

      {/* Features */}
      <section className="px-5 pb-12 max-w-5xl mx-auto w-full">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Globe,          title: 'Send Worldwide',    desc: 'Send money to anyone worldwide instantly — no crypto knowledge needed.' },
            { icon: Zap,            title: 'Mobile Money Bridge',     desc: 'Deposit TZS via Mobile Money. Money converts automatically to your digital wallet.' },
            { icon: Shield,         title: '1% Flat Fee',       desc: 'Transparent pricing. You always see the exact fee before confirming.' },
            { icon: MessageCircle,  title: 'Chat & Pay',        desc: 'Chat with contacts and send money directly in the conversation.' },
            { icon: TrendingUp,     title: 'Earn Interest',     desc: 'Save your money and earn daily interest on your balance.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-5">
              <Icon size={28} className="text-blue-400 mb-3" strokeWidth={1.5} />
              <h3 className="font-semibold text-white mb-1">{title}</h3>
              <p className="text-sm text-slate-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-5 pb-20 max-w-2xl mx-auto w-full text-center">
        <h2 className="text-xl font-semibold mb-6 text-slate-200">How it works</h2>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {['Mobile Money', '→', 'Olomi Wallet', '→', 'Send / Save / Chat', '→', 'Cash Out'].map((step, i) => (
            <span key={i} className={step === '→' ? 'text-slate-500 text-lg' :
              'bg-white/10 rounded-full px-4 py-2 text-sm font-medium text-slate-200'}>
              {step}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <div className="text-center pb-8 text-xs text-slate-600">
        © 2026 OlomiPay · Building Trust Through Blockchain
      </div>
    </main>
  );
}
