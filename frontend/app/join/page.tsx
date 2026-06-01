'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function JoinContent() {
  const params      = useSearchParams();
  const router      = useRouter();
  const ref         = params.get('ref') ?? '';
  const fromName    = params.get('from') ?? 'Mtumiaji wa Tuma';
  const [inviter, setInviter] = useState(fromName);

  useEffect(() => {
    if (!ref) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/invite/resolve/${ref}`)
      .then(r => r.json())
      .then(r => { if (r.success) setInviter(r.data.inviterName); })
      .catch(() => {});
  }, [ref]);

  // Save ref to sessionStorage so after register we auto-connect
  useEffect(() => {
    if (ref) sessionStorage.setItem('tuma_invite_ref', ref);
  }, [ref]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-blue-600 to-indigo-700 flex items-center justify-center px-5">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
        {/* Logo */}
        <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
          T
        </div>

        {/* Invite message */}
        <div className="mb-6">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
            👋
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">
            {inviter} anakualika Tuma!
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Tuma ni app ya kutuma pesa haraka, kuzungumza na marafiki, na kufanya biashara — yote mahali pamoja.
          </p>
        </div>

        {/* Features */}
        <div className="space-y-2 mb-6 text-left">
          {[
            { icon: '💸', text: 'Tuma pesa bure kwa marafiki' },
            { icon: '💬', text: 'Zungumza bila ya malipo' },
            { icon: '🏦', text: 'Hifadhi akiba na pata riba' },
            { icon: '🌍', text: 'Tuma pesa nje ya nchi' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5">
              <span className="text-lg">{icon}</span>
              <span className="text-sm text-slate-600">{text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Link href={`/auth/register${ref ? `?ref=${ref}` : ''}`}
          className="block w-full bg-primary text-white font-bold py-4 rounded-2xl text-base mb-3 hover:bg-primary/90 transition-colors">
          Jiunge bure sasa
        </Link>
        <Link href="/auth/login"
          className="block text-sm text-slate-400 hover:text-primary transition-colors">
          Nina akaunti tayari → Ingia
        </Link>

        <p className="text-xs text-slate-300 mt-4">
          Tuma · Salama · Haraka · Tanzania
        </p>
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
          <p>Inapakia...</p>
        </div>
      </div>
    }>
      <JoinContent />
    </Suspense>
  );
}
