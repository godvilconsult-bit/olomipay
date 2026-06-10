'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Flame, Home, Store, Bike } from 'lucide-react';
import { auth, setTokens, ApiError, Role } from '../../../lib/api';
import { Button, Field, cn } from '../../../components/ui';

const ROLES: { value: Role; label: string; sub: string; icon: any }[] = [
  { value: 'HOUSEHOLD', label: 'Kaya',     sub: 'Agiza gesi',          icon: Home },
  { value: 'SUPPLIER',  label: 'Muuzaji',  sub: 'Pokea oda',           icon: Store },
  { value: 'RIDER',     label: 'Dereva',   sub: 'Sambaza gesi',        icon: Bike },
];

const REGIONS = ['Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma', 'Mbeya', 'Zanzibar'];

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('HOUSEHOLD');
  const [form, setForm] = useState({ name: '', phone: '', pin: '', region: 'Dar es Salaam', businessName: '', vehicleType: 'MOTORBIKE' });
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await auth.register({
        phone: form.phone, pin: form.pin, role, name: form.name, region: form.region,
        ...(role === 'SUPPLIER' && { businessName: form.businessName || form.name }),
        ...(role === 'RIDER' && { vehicleType: form.vehicleType }),
      });
      setTokens(res.accessToken, res.refreshToken);
      toast.success('Akaunti imefunguliwa!');
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Usajili umeshindikana');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-sand dark:bg-background-dark">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-grad-brand text-white"><Flame size={20} /></span>
          <span className="text-lg font-extrabold">JIKO CONNECT</span>
        </Link>

        <h1 className="mt-7 text-2xl font-extrabold">Fungua akaunti</h1>
        <p className="mt-1 text-sm text-ink/60 dark:text-sand/60">Wewe ni nani kwenye mtandao?</p>

        {/* role picker */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const active = role === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={cn(
                  'rounded-2xl border p-3 text-center transition',
                  active ? 'border-flame bg-flame/10' : 'border-black/10 dark:border-white/10 bg-white dark:bg-ink-2',
                )}
              >
                <div className={cn('mx-auto mb-1 grid h-10 w-10 place-items-center rounded-xl', active ? 'bg-grad-brand text-white' : 'bg-black/5 dark:bg-white/10 text-ink/60')}><Icon size={20} /></div>
                <div className="text-sm font-semibold">{r.label}</div>
                <div className="text-[11px] text-ink/50">{r.sub}</div>
              </button>
            );
          })}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="Jina" placeholder="Jina lako" value={form.name} onChange={set('name')} required />
          <Field label="Namba ya simu" type="tel" inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={set('phone')} required />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink/70 dark:text-sand/70">Mkoa</span>
            <select value={form.region} onChange={set('region')} className="w-full min-h-touch rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-ink-2 px-4 outline-none focus:border-flame">
              {REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>

          {role === 'SUPPLIER' && (
            <Field label="Jina la biashara" placeholder="mfano: Mwenge Gas Centre" value={form.businessName} onChange={set('businessName')} />
          )}
          {role === 'RIDER' && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink/70 dark:text-sand/70">Chombo cha usafiri</span>
              <select value={form.vehicleType} onChange={set('vehicleType')} className="w-full min-h-touch rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-ink-2 px-4 outline-none focus:border-flame">
                <option value="MOTORBIKE">Pikipiki</option>
                <option value="BAJAJI">Bajaji</option>
                <option value="BICYCLE">Baiskeli</option>
                <option value="CAR">Gari</option>
                <option value="TRUCK">Lori</option>
              </select>
            </label>
          )}

          <Field label="Weka PIN (tarakimu 4–6)" type="password" inputMode="numeric" maxLength={6} placeholder="••••" value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} required />
          <Button type="submit" loading={loading} className="w-full">Fungua akaunti</Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink/60 dark:text-sand/60">
          Una akaunti? <Link href="/auth/login" className="font-semibold text-flame">Ingia</Link>
        </p>
      </div>
    </main>
  );
}
