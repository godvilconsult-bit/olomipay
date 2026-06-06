'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function JoinContent() {
  const params   = useSearchParams();
  const ref      = params.get('ref') ?? '';
  const fromName = params.get('from') ?? 'A OlomiPay user';
  const [inviter, setInviter] = useState(fromName);

  useEffect(() => {
    if (!ref) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/invite/resolve/${ref}`)
      .then(r => r.json())
      .then(r => { if (r.success) setInviter(r.data.inviterName); })
      .catch(() => {});
  }, [ref]);

  useEffect(() => {
    if (ref) localStorage.setItem('tuma_invite_ref', ref);
  }, [ref]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-blue-600 to-indigo-700 flex items-center justify-center px-5">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
        <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">T</div>
        <div className="mb-6">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">👋</div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">{inviter} invited you to OlomiPay!</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Tuma is the all-in-one app for sending money, chatting with friends, and running your business.
          </p>
        </div>
        <div className="space-y-2 mb-6 text-left">
          {[
            { icon: '💸', text: 'Send money to friends for free' },
            { icon: '💬', text: 'Chat with end-to-end encryption' },
            { icon: '🏦', text: 'Save money and earn interest' },
            { icon: '🌍', text: 'Send money internationally' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5">
              <span className="text-lg">{icon}</span>
              <span className="text-sm text-slate-600">{text}</span>
            </div>
          ))}
        </div>
        <Link href={`/auth/register${ref ? `?ref=${ref}` : ''}`}
          className="block w-full bg-primary text-white font-bold py-4 rounded-2xl text-base mb-3 hover:bg-primary/90 transition-colors">
          Join for free
        </Link>
        <Link href="/auth/login" className="block text-sm text-slate-400 hover:text-primary transition-colors">
          Already have an account? Sign in
        </Link>
        <p className="text-xs text-slate-300 mt-4">OlomiPay · Secure · Fast</p>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    }>
      <JoinContent />
    </Suspense>
  );
}
