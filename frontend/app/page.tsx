'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Flame, MapPin, Bike, Store } from 'lucide-react';
import { getAccessToken } from '../lib/api';

export default function Landing() {
  const router = useRouter();

  // Already signed in? Go straight to the app.
  useEffect(() => {
    if (getAccessToken()) router.replace('/dashboard');
  }, [router]);

  return (
    <main className="relative min-h-screen overflow-hidden text-white bg-grad-hero">
      {/* warm flame glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 h-[60vmax] w-[60vmax] rounded-full" style={{ background: 'radial-gradient(circle, rgba(241,90,36,.45), transparent 60%)', filter: 'blur(90px)' }} />
        <div className="absolute -bottom-40 -right-24 h-[55vmax] w-[55vmax] rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,177,0,.30), transparent 60%)', filter: 'blur(90px)' }} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-6 pb-10 pt-5">
        {/* top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-grad-brand shadow-ds-btn"><Flame size={20} /></span>
            <span className="text-lg font-extrabold tracking-tight">JIKO CONNECT</span>
          </div>
          <Link href="/auth/login" className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium">Ingia</Link>
        </div>

        {/* hero */}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-leaf-light" /> Tanzania · LPG delivery network
          </span>
          <h1 className="mt-5 text-[44px] font-extrabold leading-[1.03] tracking-tight">
            Gesi yako,<br />ikiletwa <span className="bg-grad-brand bg-clip-text text-transparent">mlangoni</span>.
          </h1>
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-white/70">
            Tafuta muuzaji wa gesi aliye karibu mwenye stock, agiza, na upate dereva akukuletee — ndani ya dakika.
          </p>

          {/* three sides */}
          <div className="mt-7 grid w-full grid-cols-3 gap-2.5 text-center">
            {[
              { icon: <MapPin size={18} />, label: 'Kaya' },
              { icon: <Store size={18} />,  label: 'Wauzaji' },
              { icon: <Bike size={18} />,   label: 'Madereva' },
            ].map((x) => (
              <div key={x.label} className="rounded-2xl border border-white/10 bg-white/5 py-3">
                <div className="mx-auto mb-1 grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-flame-light">{x.icon}</div>
                <div className="text-xs text-white/75">{x.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3">
          <Link href="/auth/register" className="flex w-full max-w-sm items-center justify-center gap-2 rounded-full bg-grad-brand px-7 py-4 text-base font-bold text-white shadow-ds-btn">
            Anza sasa — ni bure <ArrowRight size={18} strokeWidth={2.4} />
          </Link>
          <p className="text-xs text-white/50">Lipa kwa M-Pesa, Tigo Pesa, Airtel Money · Bei za EWURA</p>
        </div>
      </div>
    </main>
  );
}
