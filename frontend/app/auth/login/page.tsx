'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Flame } from 'lucide-react';
import { auth, setTokens, ApiError } from '../../../lib/api';
import { useT, LangToggle } from '../../../lib/i18n';
import { Button, Field } from '../../../components/ui';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useT();
  const [phone, setPhone] = useState('');
  const [pin, setPin]     = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await auth.login(phone, pin);
      setTokens(res.accessToken, res.refreshToken);
      toast.success(`${t('Welcome', 'Karibu')}, ${res.user.name ?? ''}!`);
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('Sign in failed', 'Imeshindikana kuingia'));
    } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-sand">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-grad-brand text-white"><Flame size={20} /></span>
            <span className="text-lg font-extrabold">JIKO CONNECT</span>
          </Link>
          <LangToggle />
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <h1 className="text-2xl font-extrabold">{t('Sign in', 'Ingia')}</h1>
          <p className="mt-1 text-sm text-ink/60">{t('Your phone number and PIN.', 'Namba ya simu na PIN yako.')}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label={t('Phone number', 'Namba ya simu')} type="tel" inputMode="numeric" maxLength={10} placeholder="0712345678" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} required />
            <Field label={t('PIN', 'PIN')} type="password" inputMode="numeric" maxLength={6} placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required />
            <Button type="submit" loading={loading} className="w-full">{t('Sign in', 'Ingia')}</Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink/60">
            {t('No account?', 'Huna akaunti?')} <Link href="/auth/register" className="font-semibold text-flame">{t('Sign up', 'Jisajili')}</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
