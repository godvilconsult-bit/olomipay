'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Users, ShoppingBag, TrendingUp, ShieldCheck } from 'lucide-react';
import { adminApi, JikoUser } from '../../lib/api';
import { AppHeader } from '../AppHeader';
import { Card, Spinner, Money, Stat, Button } from '../ui';

export function AdminHome({ user }: { user: JikoUser }) {
  const [stats, setStats] = useState<any>(null);
  const [pending, setPending] = useState<any[]>([]);

  async function load() {
    const [s, u] = await Promise.all([adminApi.stats().catch(() => null), adminApi.users().catch(() => ({ users: [] }))]);
    setStats(s);
    setPending((u.users ?? []).filter((x: any) => x.kycStatus !== 'APPROVED'));
  }
  useEffect(() => { load(); }, []);

  async function decide(id: string, status: 'APPROVED' | 'REJECTED') {
    try { await adminApi.kyc(id, status); toast.success(status === 'APPROVED' ? 'Imethibitishwa' : 'Imekataliwa'); load(); }
    catch { toast.error('Imeshindikana'); }
  }

  if (!stats) return <Spinner />;

  return (
    <div className="min-h-screen pb-10">
      <AppHeader title="JIKO Admin" subtitle="Usimamizi wa mtandao" />
      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="GMV" value={<Money value={stats.gmv} className="text-base" />} accent />
          <Stat label="Mapato (komisheni)" value={<Money value={stats.platformRevenue} className="text-base" />} />
          <Stat label="Oda zote" value={stats.orders.total} />
          <Stat label="Zimefika" value={stats.orders.delivered} />
        </div>

        <Card>
          <div className="mb-3 flex items-center gap-2 font-bold"><Users size={18} className="text-flame" /> Watumiaji</div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div><div className="text-xl font-extrabold">{stats.users.households}</div><div className="text-xs text-ink/50">Kaya</div></div>
            <div><div className="text-xl font-extrabold">{stats.users.suppliers}</div><div className="text-xs text-ink/50">Wauzaji</div></div>
            <div><div className="text-xl font-extrabold">{stats.users.riders}</div><div className="text-xs text-ink/50">Madereva</div></div>
          </div>
        </Card>

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><ShieldCheck size={15} /> Uthibitisho unaosubiri (KYC)</h2>
          {pending.length === 0 ? <p className="py-6 text-center text-sm text-ink/50">Hakuna maombi yanayosubiri.</p> :
            <div className="space-y-2">
              {pending.map((u) => (
                <Card key={u.id} className="flex items-center justify-between !p-3">
                  <div><div className="font-semibold">{u.name ?? u.phone}</div><div className="text-xs text-ink/50">{u.role} · {u.region ?? '—'}</div></div>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="!px-3 !text-xs" onClick={() => decide(u.id, 'REJECTED')}>Kataa</Button>
                    <Button variant="leaf" className="!px-3 !text-xs" onClick={() => decide(u.id, 'APPROVED')}>Thibitisha</Button>
                  </div>
                </Card>
              ))}
            </div>
          }
        </div>
      </div>
    </div>
  );
}
