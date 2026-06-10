'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Flame, Home, Store, Bike } from 'lucide-react';
import { auth, setTokens, ApiError, Role } from '../../../lib/api';
import { useT, LangToggle } from '../../../lib/i18n';
import { Button, Field, cn } from '../../../components/ui';

const REGIONS = ['Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma', 'Mbeya', 'Zanzibar'];

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useT();
  const [role, setRole] = useState<Role>('HOUSEHOLD');
  const [form, setForm] = useState({ name: '', phone: '', pin: '', region: 'Dar es Salaam', businessName: '', vehicleType: 'MOTORBIKE' });
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const ROLES: { value: Role; label: string; sub: string; icon: any }[] = [
    { value: 'HOUSEHOLD', label: t('Household', 'Kaya'),    sub: t('Order gas', 'Agiza gesi'),     icon: Home },
    { value: 'SUPPLIER',  label: t('Supplier', 'Muuzaji'),  sub: t('Receive orders', 'Pokea oda'), icon: Store },
    { value: 'RIDER',     label: t('Rider', 'Dereva'),      sub: t('Deliver gas', 'Sambaza'),      icon: Bike },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^0\d{9}$/.test(form.phone.replace(/\s/g, ''))) return toast.error(t('Enter phone as 0712345678', 'Weka simu kama 0712345678'));
    if (!/^\d{4}$/.test(form.pin)) return toast.error(t('PIN must be 4 digits', 'PIN lazima iwe tarakimu 4'));
    setLoading(true);
    try {
      const res = await auth.register({
        phone: form.phone, pin: form.pin, role, name: form.name, region: form.region,
        ...(role === 'SUPPLIER' && { businessName: form.businessName || form.name }),
        ...(role === 'RIDER' && { vehicleType: form.vehicleType }),
      });
      setTokens(res.accessToken, res.refreshToken);
      toast.success(t('Account created!', 'Akaunti imefunguliwa!'));
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('Sign up failed', 'Usajili umeshindikana'));
    } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-sand">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-grad-brand text-white"><Flame size={20} /></span>
            <span className="text-lg font-extrabold">JIKO CONNECT</span>
          </Link>
          <LangToggle />
        </div>

        <h1 className="mt-6 text-2xl font-extrabold">{t('Create account', 'Fungua akaunti')}</h1>
        <p className="mt-1 text-sm text-ink/60">{t('Who are you on the network?', 'Wewe ni nani kwenye mtandao?')}</p>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {ROLES.map((r) => {
            const Icon = r.icon; const active = role === r.value;
            return (
              <button key={r.value} type="button" onClick={() => setRole(r.value)} className={cn('rounded-2xl border p-3 text-center transition', active ? 'border-flame bg-flame/10' : 'border-black/10 bg-white')}>
                <div className={cn('mx-auto mb-1 grid h-10 w-10 place-items-center rounded-xl', active ? 'bg-grad-brand text-white' : 'bg-black/5 text-ink/60')}><Icon size={20} /></div>
                <div className="text-sm font-semibold">{r.label}</div>
                <div className="text-[11px] text-ink/50">{r.sub}</div>
              </button>
            );
          })}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label={t('Name', 'Jina')} placeholder={t('Your name', 'Jina lako')} value={form.name} onChange={set('name')} required />
          <Field label={t('Phone number', 'Namba ya simu')} type="tel" inputMode="numeric" maxLength={10} placeholder="0712345678" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))} required />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink/70">{t('Region', 'Mkoa')}</span>
            <select value={form.region} onChange={set('region')} className="w-full min-h-touch rounded-2xl border border-black/10 bg-white px-4 text-ink outline-none focus:border-flame">
              {REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>

          {role === 'SUPPLIER' && <Field label={t('Business name', 'Jina la biashara')} placeholder={t('e.g. Mwenge Gas Centre', 'mfano: Mwenge Gas Centre')} value={form.businessName} onChange={set('businessName')} />}
          {role === 'RIDER' && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink/70">{t('Vehicle', 'Chombo')}</span>
              <select value={form.vehicleType} onChange={set('vehicleType')} className="w-full min-h-touch rounded-2xl border border-black/10 bg-white px-4 text-ink outline-none focus:border-flame">
                <option value="MOTORBIKE">{t('Motorbike', 'Pikipiki')}</option>
                <option value="BAJAJI">{t('Bajaji', 'Bajaji')}</option>
                <option value="BICYCLE">{t('Bicycle', 'Baiskeli')}</option>
                <option value="CAR">{t('Car', 'Gari')}</option>
                <option value="TRUCK">{t('Truck', 'Lori')}</option>
              </select>
            </label>
          )}

          <Field label={t('Create a 4-digit PIN', 'Weka PIN ya tarakimu 4')} type="password" inputMode="numeric" maxLength={4} placeholder="••••" value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} required />
          <Button type="submit" loading={loading} className="w-full">{t('Create account', 'Fungua akaunti')}</Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink/60">
          {t('Have an account?', 'Una akaunti?')} <Link href="/auth/login" className="font-semibold text-flame">{t('Sign in', 'Ingia')}</Link>
        </p>
      </div>
    </main>
  );
}
