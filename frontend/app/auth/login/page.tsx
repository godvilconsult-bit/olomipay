'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Flame } from 'lucide-react';
import { auth, setTokens, ApiError } from '../../../lib/api';
import { Button, Field } from '../../../components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pin, setPin]     = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await auth.login(phone, pin);
      setTokens(res.accessToken, res.refreshToken);
      toast.success(`Karibu, ${res.user.name ?? 'tena'}!`);
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Imeshindikana kuingia');
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

        <div className="flex flex-1 flex-col justify-center">
          <h1 className="text-2xl font-extrabold">Ingia kwenye akaunti</h1>
          <p className="mt-1 text-sm text-ink/60 dark:text-sand/60">Namba ya simu na PIN yako.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Namba ya simu" type="tel" inputMode="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <Field label="PIN" type="password" inputMode="numeric" maxLength={6} placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required />
            <Button type="submit" loading={loading} className="w-full">Ingia</Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink/60 dark:text-sand/60">
            Huna akaunti? <Link href="/auth/register" className="font-semibold text-flame">Jisajili</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
