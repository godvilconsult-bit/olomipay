'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Users, ShieldCheck, Activity, Phone, Home, Store, Bike } from 'lucide-react';
import { adminApi, JikoUser } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { localPhone, timeAgo } from '../../lib/utils';
import { AppHeader } from '../AppHeader';
import { Card, Spinner, Money, Stat, Badge, Button, cn } from '../ui';

const ROLE_ICON: Record<string, any> = { HOUSEHOLD: Home, SUPPLIER: Store, RIDER: Bike, ADMIN: ShieldCheck };

export function AdminHome({ user }: { user: JikoUser }) {
  const { t } = useT();
  const [tab, setTab]     = useState<'overview' | 'users' | 'flow'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  async function load() {
    const [s, u, o] = await Promise.all([adminApi.stats().catch(() => null), adminApi.users().catch(() => ({ users: [] })), adminApi.orders().catch(() => ({ orders: [] }))]);
    setStats(s); setUsers(u.users ?? []); setOrders(o.orders ?? []);
  }
  useEffect(() => { load(); }, []);

  async function decide(id: string, status: 'APPROVED' | 'REJECTED') {
    try { await adminApi.kyc(id, status); toast.success(status === 'APPROVED' ? t('Approved', 'Imethibitishwa') : t('Rejected', 'Imekataliwa')); load(); }
    catch { toast.error(t('Failed', 'Imeshindikana')); }
  }

  if (!stats) return <Spinner />;
  const pending = users.filter((u) => u.kycStatus !== 'APPROVED' && u.role !== 'ADMIN');

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button onClick={() => setTab(id)} className={cn('flex-1 rounded-xl py-2 text-sm font-semibold transition', tab === id ? 'bg-grad-brand text-white' : 'bg-black/5 text-ink/60')}>{label}</button>
  );

  return (
    <div className="min-h-screen pb-10">
      <AppHeader title={t('JIKO Admin', 'JIKO Admin')} subtitle={t('Network control', 'Usimamizi wa mtandao')} />

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        <div className="flex gap-2">
          <TabBtn id="overview" label={t('Overview', 'Muhtasari')} />
          <TabBtn id="users" label={`${t('Users', 'Watumiaji')} (${users.length})`} />
          <TabBtn id="flow" label={`${t('Flow', 'Mtiririko')} (${orders.length})`} />
        </div>

        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label={t('GMV', 'GMV')} value={<Money value={stats.gmv} className="text-base" />} accent />
              <Stat label={t('Commission revenue', 'Mapato (komisheni)')} value={<Money value={stats.platformRevenue} className="text-base" />} />
              <Stat label={t('Total orders', 'Oda zote')} value={stats.orders.total} />
              <Stat label={t('Delivered', 'Zimefika')} value={stats.orders.delivered} />
            </div>
            <Card>
              <div className="mb-3 flex items-center gap-2 font-bold"><Users size={18} className="text-flame" /> {t('Users', 'Watumiaji')}</div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div><div className="text-xl font-extrabold">{stats.users.households}</div><div className="text-xs text-ink/50">{t('Households', 'Kaya')}</div></div>
                <div><div className="text-xl font-extrabold">{stats.users.suppliers}</div><div className="text-xs text-ink/50">{t('Suppliers', 'Wauzaji')}</div></div>
                <div><div className="text-xl font-extrabold">{stats.users.riders}</div><div className="text-xs text-ink/50">{t('Riders', 'Madereva')}</div></div>
              </div>
            </Card>
            {pending.length > 0 && (
              <div>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><ShieldCheck size={15} /> {t('Pending verification (KYC)', 'Uthibitisho unaosubiri')}</h2>
                <div className="space-y-2">
                  {pending.map((u) => (
                    <Card key={u.id} className="flex items-center justify-between !p-3">
                      <div><div className="font-semibold">{u.name ?? localPhone(u.phone)}</div><div className="text-xs text-ink/50">{u.role} · {localPhone(u.phone)}</div></div>
                      <div className="flex gap-2">
                        <Button variant="ghost" className="!px-3 !text-xs" onClick={() => decide(u.id, 'REJECTED')}>{t('Reject', 'Kataa')}</Button>
                        <Button variant="leaf" className="!px-3 !text-xs" onClick={() => decide(u.id, 'APPROVED')}>{t('Verify', 'Thibitisha')}</Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'users' && (
          <div className="space-y-2">
            <p className="text-xs text-ink/50">{t('Every registered user and their registration number.', 'Kila mtumiaji aliyesajili na namba yake.')}</p>
            {users.map((u) => {
              const Icon = ROLE_ICON[u.role] ?? Users;
              return (
                <Card key={u.id} className="flex items-center gap-3 !p-3">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-flame/10 text-flame"><Icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{u.name ?? '—'}</div>
                    <div className="flex items-center gap-1 text-xs text-ink/50"><Phone size={11} /> {localPhone(u.phone)} · {u.region ?? '—'}</div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold text-ink/60">{u.role}</span>
                    <div className="mt-1 text-[10px] text-ink/40">{timeAgo(u.createdAt)}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {tab === 'flow' && (
          <div className="space-y-2">
            <p className="text-xs text-ink/50">{t('Full service flow — every order across households, suppliers and riders.', 'Mtiririko kamili — kila oda kati ya kaya, wauzaji na madereva.')}</p>
            {orders.length === 0 ? <p className="py-8 text-center text-sm text-ink/50">{t('No orders yet.', 'Hakuna oda bado.')}</p> :
              orders.map((o) => (
                <Card key={o.id} className="!p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{o.orderNo}</span>
                    <div className="flex items-center gap-2"><Money value={o.total} className="text-sm" /><Badge status={o.status} /></div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-ink/60">
                    <div className="flex items-center gap-1.5"><Home size={12} className="text-flame" /> {o.household?.name ?? '—'} · {localPhone(o.household?.phone)}</div>
                    <div className="flex items-center gap-1.5"><Store size={12} className="text-flame" /> {o.supplier?.businessName ?? '—'} · {localPhone(o.supplier?.phone)}</div>
                    <div className="flex items-center gap-1.5"><Bike size={12} className="text-flame" /> {o.delivery?.rider?.name ? `${o.delivery.rider.name} · ${localPhone(o.delivery.rider.phone)}` : t('not assigned', 'hajapangwa')}</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-black/5 pt-2 text-[11px] text-ink/40">
                    <span>{t('Payment', 'Malipo')}: {o.payment?.status ?? '—'}</span>
                    <span>{timeAgo(o.placedAt)}</span>
                  </div>
                </Card>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
